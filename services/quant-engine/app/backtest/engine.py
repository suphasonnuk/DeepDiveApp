from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field

from app.models.kalman import PriceKalmanFilter
from app.models.ou_process import OrnsteinUhlenbeck
from app.models.hmm_regime import RegimeDetector
from app.models.kelly import KellyCriterion
from app.signals.generator import SignalGenerator, suggest_leverage
from app.backtest.costs import CostModel
from app.execution.manager import ExecutionManager, PositionState, ExitReason


@dataclass
class BacktestTrade:
    symbol: str
    direction: str
    entry_day: int
    entry_price: float
    exit_day: int = -1
    exit_price: float = 0.0
    exit_reason: str = ""
    position_fraction: float = 0.0
    leverage: float = 1.0
    notional: float = 0.0
    pnl_gross: float = 0.0
    pnl_net: float = 0.0       # after costs
    costs: float = 0.0
    signal_confidence: float = 0.0
    regime: str = ""
    target_price: float = 0.0
    stop_price: float = 0.0
    half_life_days: float = 15.0


@dataclass
class BacktestResult:
    symbol: str
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0
    avg_pnl_pct: float = 0.0
    total_return_pct: float = 0.0
    sharpe_ratio: float = 0.0
    max_drawdown_pct: float = 0.0
    profit_factor: float = 0.0
    avg_hold_days: float = 0.0
    total_costs_pct: float = 0.0
    break_even_rate: float = 0.0
    trades: list[BacktestTrade] = field(default_factory=list)
    equity_curve: list[float] = field(default_factory=list)
    daily_returns: list[float] = field(default_factory=list)


class BacktestEngine:
    """
    Event-driven backtester that replays historical prices day-by-day
    through the full signal pipeline (HMM → Kalman → OU → Kelly),
    accounting for transaction costs, funding, and execution management.
    """

    def __init__(
        self,
        cost_model: CostModel | None = None,
        initial_capital: float = 10_000.0,
        avg_funding_rate: float = 0.0001,
        min_history: int = 60,
        params: dict | None = None,
    ):
        self.costs = cost_model or CostModel()
        self.initial_capital = initial_capital
        self.avg_funding_rate = avg_funding_rate
        self.min_history = min_history
        self.params = params or {}
        self.exec_mgr = ExecutionManager()

    def _build_generator(self) -> SignalGenerator:
        gen = SignalGenerator()
        p = self.params
        if "kalman_process_noise" in p or "kalman_measurement_noise" in p:
            gen.kalman = PriceKalmanFilter(
                process_noise=p.get("kalman_process_noise", 1e-4),
                measurement_noise=p.get("kalman_measurement_noise", 1e-3),
            )
        return gen

    def run(
        self,
        symbol: str,
        prices: np.ndarray,
        allow_multiple_open: bool = False,
    ) -> BacktestResult:
        n = len(prices)
        if n < self.min_history + 30:
            return BacktestResult(symbol=symbol)

        gen = self._build_generator()
        buy_thresh = self.params.get("buy_threshold", 0.10)
        sell_thresh = self.params.get("sell_threshold", -0.10)

        capital = self.initial_capital
        equity_curve = [capital]
        daily_returns = []
        trades: list[BacktestTrade] = []
        open_position: BacktestTrade | None = None
        pos_state: PositionState | None = None

        for day in range(self.min_history, n):
            window = prices[:day + 1]
            current_price = float(prices[day])
            prev_equity = equity_curve[-1]

            if open_position is not None and pos_state is not None:
                pos_state.hours_held += 24.0
                new_signal_str = None

                sig = gen.generate(symbol, window, current_price)
                if sig.get("signal") in ("BUY", "SELL"):
                    new_signal_str = sig["signal"]

                reason, exit_px = self.exec_mgr.check_exit(
                    pos_state, current_price, new_signal_str,
                )

                if reason != ExitReason.NONE:
                    trade = open_position
                    trade.exit_day = day
                    trade.exit_price = exit_px
                    trade.exit_reason = reason.value

                    if trade.direction == "LONG":
                        gross_pct = (exit_px - trade.entry_price) / trade.entry_price
                    else:
                        gross_pct = (trade.entry_price - exit_px) / trade.entry_price

                    gross_pct *= trade.leverage
                    hold_hours = (trade.exit_day - trade.entry_day) * 24.0
                    cost_abs = self.costs.total_cost(
                        trade.notional, hold_hours, self.avg_funding_rate,
                    )
                    cost_pct = cost_abs / (trade.notional / trade.leverage) if trade.notional > 0 else 0

                    trade.pnl_gross = gross_pct * trade.notional / trade.leverage
                    trade.costs = cost_abs
                    trade.pnl_net = trade.pnl_gross - cost_abs

                    capital_change = trade.pnl_net
                    capital += capital_change

                    trades.append(trade)
                    open_position = None
                    pos_state = None

            elif open_position is None:
                sig = gen.generate(symbol, window, current_price)
                score = sig.get("combined_score", 0.0)
                signal = sig.get("signal", "HOLD")

                if signal in ("BUY", "SELL") and score != 0:
                    risk = sig.get("risk", {})
                    position_info = sig.get("position", {})
                    kelly_frac = position_info.get("kelly_fraction", 0.0)
                    leverage = position_info.get("suggested_leverage", 1.0)

                    if kelly_frac <= 0:
                        equity_curve.append(capital)
                        daily_returns.append(0.0)
                        continue

                    alloc = capital * kelly_frac
                    notional = alloc * leverage
                    direction = "LONG" if signal == "BUY" else "SHORT"

                    hl = sig.get("models", {}).get("ou", {}).get("half_life_days", 15.0) or 15.0

                    trade = BacktestTrade(
                        symbol=symbol,
                        direction=direction,
                        entry_day=day,
                        entry_price=current_price,
                        position_fraction=kelly_frac,
                        leverage=leverage,
                        notional=notional,
                        signal_confidence=sig.get("confidence", 0.0),
                        regime=sig.get("regime", ""),
                        target_price=risk.get("target_price", current_price),
                        stop_price=risk.get("stop_price", current_price),
                        half_life_days=hl,
                    )

                    pos_state = PositionState(
                        symbol=symbol,
                        direction=direction,
                        entry_price=current_price,
                        current_stop=risk.get("stop_price", current_price),
                        target_price=risk.get("target_price", current_price),
                        half_life_days=hl,
                    )

                    open_position = trade

            daily_ret = (capital - prev_equity) / prev_equity if prev_equity > 0 else 0.0
            daily_returns.append(daily_ret)
            equity_curve.append(capital)

        if open_position is not None:
            trade = open_position
            trade.exit_day = n - 1
            trade.exit_price = float(prices[-1])
            trade.exit_reason = "end_of_data"

            if trade.direction == "LONG":
                gross_pct = (trade.exit_price - trade.entry_price) / trade.entry_price
            else:
                gross_pct = (trade.entry_price - trade.exit_price) / trade.entry_price
            gross_pct *= trade.leverage

            hold_hours = (trade.exit_day - trade.entry_day) * 24.0
            cost_abs = self.costs.total_cost(
                trade.notional, hold_hours, self.avg_funding_rate,
            )
            trade.pnl_gross = gross_pct * trade.notional / trade.leverage
            trade.costs = cost_abs
            trade.pnl_net = trade.pnl_gross - cost_abs
            capital += trade.pnl_net
            trades.append(trade)
            equity_curve.append(capital)

        return self._compute_metrics(symbol, trades, equity_curve, daily_returns)

    def _compute_metrics(
        self,
        symbol: str,
        trades: list[BacktestTrade],
        equity_curve: list[float],
        daily_returns: list[float],
    ) -> BacktestResult:
        if not trades:
            return BacktestResult(
                symbol=symbol,
                equity_curve=equity_curve,
                daily_returns=daily_returns,
            )

        net_pnls = [t.pnl_net for t in trades]
        net_arr = np.array(net_pnls)
        wins = net_arr > 0
        losses = net_arr <= 0

        total_costs = sum(t.costs for t in trades)
        hold_days = [(t.exit_day - t.entry_day) for t in trades if t.exit_day > 0]

        eq = np.array(equity_curve)
        peak = np.maximum.accumulate(eq)
        dd = (eq - peak) / (peak + 1e-10)
        max_dd = float(np.min(dd) * 100)

        dr = np.array(daily_returns)
        if len(dr) > 1 and np.std(dr) > 1e-10:
            sharpe = float(np.mean(dr) / np.std(dr) * np.sqrt(252))
        else:
            sharpe = 0.0

        gross_profit = float(np.sum(net_arr[wins])) if np.any(wins) else 0.0
        gross_loss = abs(float(np.sum(net_arr[losses]))) if np.any(losses) else 0.0
        pf = round(gross_profit / gross_loss, 4) if gross_loss > 0 else float("inf")

        total_return = (equity_curve[-1] - self.initial_capital) / self.initial_capital * 100

        return BacktestResult(
            symbol=symbol,
            total_trades=len(trades),
            winning_trades=int(np.sum(wins)),
            losing_trades=int(np.sum(losses)),
            win_rate=round(float(np.mean(wins) * 100), 2),
            avg_pnl_pct=round(float(np.mean(net_arr / self.initial_capital * 100)), 4),
            total_return_pct=round(total_return, 2),
            sharpe_ratio=round(sharpe, 4),
            max_drawdown_pct=round(max_dd, 4),
            profit_factor=pf,
            avg_hold_days=round(float(np.mean(hold_days)), 1) if hold_days else 0.0,
            total_costs_pct=round(total_costs / self.initial_capital * 100, 4),
            break_even_rate=round(self.costs.break_even_move_pct(
                hold_hours=float(np.mean(hold_days)) * 24 if hold_days else 0,
                avg_funding_rate=self.avg_funding_rate,
            ), 4),
            trades=trades,
            equity_curve=equity_curve,
            daily_returns=daily_returns,
        )


def aggregate_results(results: list[BacktestResult]) -> dict:
    if not results:
        return {}

    all_trades = []
    for r in results:
        all_trades.extend(r.trades)

    total = len(all_trades)
    if total == 0:
        return {"total_trades": 0}

    net_pnls = np.array([t.pnl_net for t in all_trades])
    wins = net_pnls > 0

    gross_profit = float(np.sum(net_pnls[wins])) if np.any(wins) else 0.0
    gross_loss = abs(float(np.sum(net_pnls[~wins]))) if np.any(~wins) else 0.0

    return {
        "total_trades": total,
        "total_tokens": len(results),
        "win_rate": round(float(np.mean(wins) * 100), 2),
        "avg_sharpe": round(float(np.mean([r.sharpe_ratio for r in results])), 4),
        "avg_max_drawdown": round(float(np.mean([r.max_drawdown_pct for r in results])), 4),
        "profit_factor": round(gross_profit / gross_loss, 4) if gross_loss > 0 else float("inf"),
        "total_return_pct": round(float(np.mean([r.total_return_pct for r in results])), 2),
        "avg_hold_days": round(float(np.mean([r.avg_hold_days for r in results if r.avg_hold_days > 0])), 1),
        "total_costs_pct": round(float(np.mean([r.total_costs_pct for r in results])), 4),
        "per_token": {
            r.symbol: {
                "trades": r.total_trades,
                "win_rate": r.win_rate,
                "sharpe": r.sharpe_ratio,
                "return_pct": r.total_return_pct,
                "max_dd": r.max_drawdown_pct,
            }
            for r in results
        },
    }

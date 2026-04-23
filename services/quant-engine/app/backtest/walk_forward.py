from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field

from app.backtest.engine import BacktestEngine, BacktestResult, BacktestTrade, aggregate_results
from app.backtest.costs import CostModel


@dataclass
class WalkForwardWindow:
    fold: int
    train_start: int
    train_end: int
    test_start: int
    test_end: int
    train_result: BacktestResult | None = None
    test_result: BacktestResult | None = None
    optimized_params: dict = field(default_factory=dict)


@dataclass
class WalkForwardResult:
    symbol: str
    windows: list[WalkForwardWindow]
    oos_trades: list[BacktestTrade]       # all out-of-sample trades
    oos_win_rate: float = 0.0
    oos_sharpe: float = 0.0
    oos_return_pct: float = 0.0
    oos_max_drawdown: float = 0.0
    oos_profit_factor: float = 0.0
    is_overfit: bool = False              # True if in-sample >> out-of-sample


class WalkForwardValidator:
    """
    Anchored walk-forward validation.

    Train window grows from an anchor point; test window slides forward.
    This prevents information leakage and tests whether the system
    generalises to unseen data.

    Example with anchor=0, initial_train=180, test=60, step=30:
      Fold 0: train [0..180], test [180..240]
      Fold 1: train [0..210], test [210..270]  (train grows by step)
      Fold 2: train [0..240], test [240..300]
    """

    def __init__(
        self,
        initial_train_days: int = 180,
        test_days: int = 60,
        step_days: int = 30,
        cost_model: CostModel | None = None,
        initial_capital: float = 10_000.0,
    ):
        self.initial_train = initial_train_days
        self.test_days = test_days
        self.step_days = step_days
        self.cost_model = cost_model or CostModel()
        self.initial_capital = initial_capital

    def _generate_windows(self, n: int) -> list[WalkForwardWindow]:
        windows = []
        fold = 0
        train_end = self.initial_train

        while train_end + self.test_days <= n:
            windows.append(WalkForwardWindow(
                fold=fold,
                train_start=0,
                train_end=train_end,
                test_start=train_end,
                test_end=min(train_end + self.test_days, n),
            ))
            train_end += self.step_days
            fold += 1

        return windows

    def validate(
        self,
        symbol: str,
        prices: np.ndarray,
        params: dict | None = None,
    ) -> WalkForwardResult:
        n = len(prices)
        windows = self._generate_windows(n)

        if not windows:
            return WalkForwardResult(symbol=symbol, windows=[], oos_trades=[])

        all_oos_trades: list[BacktestTrade] = []
        all_oos_daily_returns: list[float] = []

        for w in windows:
            train_prices = prices[w.train_start:w.train_end]
            test_prices = prices[w.train_start:w.test_end]

            train_engine = BacktestEngine(
                cost_model=self.cost_model,
                initial_capital=self.initial_capital,
                params=params or {},
            )
            w.train_result = train_engine.run(symbol, train_prices)

            test_engine = BacktestEngine(
                cost_model=self.cost_model,
                initial_capital=self.initial_capital,
                min_history=w.train_end - w.train_start,
                params=params or {},
            )
            w.test_result = test_engine.run(symbol, test_prices)

            for trade in w.test_result.trades:
                if trade.entry_day >= (w.train_end - w.train_start):
                    all_oos_trades.append(trade)

            all_oos_daily_returns.extend(w.test_result.daily_returns)

        return self._compile_results(symbol, windows, all_oos_trades, all_oos_daily_returns)

    def _compile_results(
        self,
        symbol: str,
        windows: list[WalkForwardWindow],
        oos_trades: list[BacktestTrade],
        oos_daily_returns: list[float],
    ) -> WalkForwardResult:
        if not oos_trades:
            return WalkForwardResult(symbol=symbol, windows=windows, oos_trades=[])

        net_pnls = np.array([t.pnl_net for t in oos_trades])
        wins = net_pnls > 0

        gross_profit = float(np.sum(net_pnls[wins])) if np.any(wins) else 0.0
        gross_loss = abs(float(np.sum(net_pnls[~wins]))) if np.any(~wins) else 0.0
        pf = round(gross_profit / gross_loss, 4) if gross_loss > 0 else float("inf")

        dr = np.array(oos_daily_returns) if oos_daily_returns else np.array([0.0])
        sharpe = float(np.mean(dr) / (np.std(dr) + 1e-10) * np.sqrt(252))

        cumulative = np.cumprod(1 + dr)
        peak = np.maximum.accumulate(cumulative)
        dd = (cumulative - peak) / (peak + 1e-10)
        max_dd = float(np.min(dd) * 100)

        total_return = (cumulative[-1] - 1.0) * 100 if len(cumulative) > 0 else 0.0

        is_sharpes = [w.train_result.sharpe_ratio for w in windows if w.train_result]
        oos_sharpes = [w.test_result.sharpe_ratio for w in windows if w.test_result]
        avg_is = float(np.mean(is_sharpes)) if is_sharpes else 0.0
        avg_oos = sharpe
        is_overfit = avg_is > 0 and avg_oos < avg_is * 0.3

        return WalkForwardResult(
            symbol=symbol,
            windows=windows,
            oos_trades=oos_trades,
            oos_win_rate=round(float(np.mean(wins) * 100), 2),
            oos_sharpe=round(sharpe, 4),
            oos_return_pct=round(total_return, 2),
            oos_max_drawdown=round(max_dd, 4),
            oos_profit_factor=pf,
            is_overfit=is_overfit,
        )


def walk_forward_portfolio(
    price_dict: dict[str, np.ndarray],
    params: dict | None = None,
    initial_train_days: int = 180,
    test_days: int = 60,
) -> dict:
    validator = WalkForwardValidator(
        initial_train_days=initial_train_days,
        test_days=test_days,
    )
    results = {}
    all_oos_trades: list[BacktestTrade] = []

    for symbol, prices in price_dict.items():
        wf = validator.validate(symbol, prices, params)
        results[symbol] = {
            "oos_win_rate": wf.oos_win_rate,
            "oos_sharpe": wf.oos_sharpe,
            "oos_return_pct": wf.oos_return_pct,
            "oos_max_drawdown": wf.oos_max_drawdown,
            "oos_profit_factor": wf.oos_profit_factor,
            "oos_trades": len(wf.oos_trades),
            "folds": len(wf.windows),
            "is_overfit": wf.is_overfit,
        }
        all_oos_trades.extend(wf.oos_trades)

    net_pnls = np.array([t.pnl_net for t in all_oos_trades]) if all_oos_trades else np.array([0.0])
    wins = net_pnls > 0

    return {
        "portfolio": {
            "total_oos_trades": len(all_oos_trades),
            "oos_win_rate": round(float(np.mean(wins) * 100), 2) if len(all_oos_trades) > 0 else 0.0,
            "total_tokens": len(results),
        },
        "per_token": results,
    }

from __future__ import annotations

import uuid
import numpy as np
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field


class PaperTrade(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    symbol: str
    signal: str                       # BUY or SELL
    entry_price: float
    position_size_fraction: float     # Kelly fraction of portfolio
    position_size_usd: Optional[float] = None   # notional USD (balance × kelly)
    leverage: float = 1.0
    margin_used: Optional[float] = None         # position_size_usd / leverage
    target_price: float
    stop_price: float
    confidence: float
    regime: str
    status: str = "open"              # open | closed_profit | closed_loss | closed_stop | closed_target
    exit_price: Optional[float] = None
    pnl_pct: Optional[float] = None
    pnl_usd: Optional[float] = None
    opened_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    closed_at: Optional[datetime] = None


class PaperTradeTracker:
    """
    In-memory paper trade store for the quant engine process lifetime.
    Next.js persists trades to the DB via API calls; this is the live state.
    """

    def __init__(self):
        self._trades: dict[str, PaperTrade] = {}

    def open_trade(
        self,
        symbol: str,
        signal: str,
        entry_price: float,
        position_size: float,
        target_price: float,
        stop_price: float,
        confidence: float,
        regime: str,
        position_size_usd: Optional[float] = None,
        leverage: float = 1.0,
    ) -> PaperTrade:
        margin = round(position_size_usd / leverage, 4) if position_size_usd else None
        trade = PaperTrade(
            symbol=symbol,
            signal=signal,
            entry_price=entry_price,
            position_size_fraction=position_size,
            position_size_usd=position_size_usd,
            leverage=leverage,
            margin_used=margin,
            target_price=target_price,
            stop_price=stop_price,
            confidence=confidence,
            regime=regime,
        )
        self._trades[trade.id] = trade
        return trade

    def close_trade(self, trade_id: str, exit_price: float) -> Optional[PaperTrade]:
        trade = self._trades.get(trade_id)
        if not trade or trade.status != "open":
            return None

        if trade.signal == "BUY":
            pnl_pct = (exit_price - trade.entry_price) / trade.entry_price * 100
        else:
            pnl_pct = (trade.entry_price - exit_price) / trade.entry_price * 100

        # Determine close reason
        if trade.signal == "BUY":
            if exit_price >= trade.target_price:
                status = "closed_target"
            elif exit_price <= trade.stop_price:
                status = "closed_stop"
            else:
                status = "closed_profit" if pnl_pct > 0 else "closed_loss"
        else:
            if exit_price <= trade.target_price:
                status = "closed_target"
            elif exit_price >= trade.stop_price:
                status = "closed_stop"
            else:
                status = "closed_profit" if pnl_pct > 0 else "closed_loss"

        trade.exit_price = exit_price
        trade.pnl_pct = round(pnl_pct, 4)
        trade.pnl_usd = round(pnl_pct / 100 * trade.position_size_usd, 4) if trade.position_size_usd else None
        trade.status = status
        trade.closed_at = datetime.now(timezone.utc)
        return trade

    def get_metrics(self) -> dict:
        closed = [t for t in self._trades.values() if t.status != "open"]
        open_trades = [t for t in self._trades.values() if t.status == "open"]

        if not closed:
            return {
                "total_trades": 0,
                "open_trades": len(open_trades),
                "win_rate": 0.0,
                "avg_pnl_pct": 0.0,
                "sharpe_ratio": 0.0,
                "max_drawdown_pct": 0.0,
                "profit_factor": 0.0,
                "equity_curve": [1.0],
            }

        pnls = np.array([t.pnl_pct for t in closed])
        wins = pnls > 0
        win_rate = float(np.mean(wins) * 100)

        # Annualised Sharpe (assume each closed trade ~ 1 day average hold)
        sharpe = float((np.mean(pnls) / (np.std(pnls) + 1e-10)) * np.sqrt(252))

        # Max drawdown on equity curve
        equity = np.cumprod(1 + pnls / 100)
        rolling_max = np.maximum.accumulate(equity)
        drawdowns = (equity - rolling_max) / (rolling_max + 1e-10)
        max_drawdown = float(np.min(drawdowns) * 100)

        gross_profit = float(np.sum(pnls[pnls > 0]))
        gross_loss = float(abs(np.sum(pnls[pnls < 0])))
        profit_factor = round(gross_profit / gross_loss, 4) if gross_loss > 0 else float("inf")

        return {
            "total_trades": len(closed),
            "open_trades": len(open_trades),
            "win_rate": round(win_rate, 2),
            "avg_pnl_pct": round(float(np.mean(pnls)), 4),
            "sharpe_ratio": round(sharpe, 4),
            "max_drawdown_pct": round(max_drawdown, 4),
            "profit_factor": profit_factor,
            "equity_curve": equity.tolist(),
        }

    def list_trades(self, status: Optional[str] = None) -> list[PaperTrade]:
        trades = list(self._trades.values())
        if status:
            trades = [t for t in trades if t.status == status]
        return sorted(trades, key=lambda t: t.opened_at, reverse=True)

    def get_trade(self, trade_id: str) -> Optional[PaperTrade]:
        return self._trades.get(trade_id)

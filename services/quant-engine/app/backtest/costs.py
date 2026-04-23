from __future__ import annotations

from dataclasses import dataclass


@dataclass
class CostModel:
    """
    Realistic transaction cost model for Binance Futures.

    Components:
      1. Trading fees (maker/taker, applied on entry AND exit)
      2. Slippage (market impact, scales with urgency)
      3. Funding rate (perpetual futures cost, every 8h)
    """

    maker_fee: float = 0.0002    # 0.02% — limit orders
    taker_fee: float = 0.0004    # 0.04% — market orders
    slippage_bps: float = 3.0    # 3 bps base slippage (conservative for top-20 tokens)

    def entry_cost(self, notional: float, is_market: bool = True) -> float:
        fee = notional * (self.taker_fee if is_market else self.maker_fee)
        slip = notional * self.slippage_bps / 10_000
        return fee + slip

    def exit_cost(self, notional: float, is_market: bool = True) -> float:
        return self.entry_cost(notional, is_market)

    def round_trip_cost(self, notional: float, is_market: bool = True) -> float:
        return self.entry_cost(notional, is_market) + self.exit_cost(notional, is_market)

    def round_trip_pct(self, is_market: bool = True) -> float:
        fee = self.taker_fee if is_market else self.maker_fee
        return (fee * 2 + self.slippage_bps / 10_000 * 2) * 100

    def funding_cost(
        self,
        notional: float,
        avg_funding_rate: float,
        hold_hours: float,
    ) -> float:
        n_payments = hold_hours / 8.0
        return abs(notional * avg_funding_rate * n_payments)

    def total_cost(
        self,
        notional: float,
        hold_hours: float = 0.0,
        avg_funding_rate: float = 0.0001,
        is_market: bool = True,
    ) -> float:
        return (
            self.round_trip_cost(notional, is_market)
            + self.funding_cost(notional, avg_funding_rate, hold_hours)
        )

    def break_even_move_pct(
        self,
        hold_hours: float = 0.0,
        avg_funding_rate: float = 0.0001,
        is_market: bool = True,
    ) -> float:
        fee = self.taker_fee if is_market else self.maker_fee
        slip = self.slippage_bps / 10_000
        funding = avg_funding_rate * (hold_hours / 8.0)
        return (fee * 2 + slip * 2 + funding) * 100

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class ExitReason(str, Enum):
    TRAILING_STOP = "trailing_stop"
    TIME_EXIT = "time_exit"
    SIGNAL_REVERSAL = "signal_reversal"
    TARGET_HIT = "target_hit"
    STOP_HIT = "stop_hit"
    NONE = "none"


@dataclass
class TrailingState:
    peak_favorable: float      # best price in trade direction
    trailing_stop: float       # current trailing stop level
    activated: bool = False    # trailing only activates after min profit


@dataclass
class PositionState:
    symbol: str
    direction: str                # "LONG" | "SHORT"
    entry_price: float
    current_stop: float
    target_price: float
    half_life_days: float
    hours_held: float = 0.0
    trailing: TrailingState | None = None


class ExecutionManager:
    """
    Manages open positions with three exit overlays:
      1. Trailing stop — locks in profits after activation threshold
      2. Time-based exit — closes stale positions past 2× half-life
      3. Signal reversal — closes when new signal contradicts position
    """

    def __init__(
        self,
        trailing_activation_pct: float = 0.5,
        trailing_distance_pct: float = 0.4,
        max_hold_multiplier: float = 2.0,
    ):
        self.trailing_activation_pct = trailing_activation_pct
        self.trailing_distance_pct = trailing_distance_pct
        self.max_hold_multiplier = max_hold_multiplier

    def init_trailing(self, position: PositionState) -> TrailingState:
        return TrailingState(
            peak_favorable=position.entry_price,
            trailing_stop=position.current_stop,
            activated=False,
        )

    def update_trailing(
        self,
        position: PositionState,
        current_price: float,
    ) -> TrailingState:
        if position.trailing is None:
            position.trailing = self.init_trailing(position)

        ts = position.trailing
        entry = position.entry_price

        if position.direction == "LONG":
            ts.peak_favorable = max(ts.peak_favorable, current_price)
            move_pct = (ts.peak_favorable - entry) / entry
            target_move = (position.target_price - entry) / entry

            if move_pct >= target_move * self.trailing_activation_pct:
                ts.activated = True

            if ts.activated:
                new_stop = ts.peak_favorable * (1 - self.trailing_distance_pct * abs(target_move))
                ts.trailing_stop = max(ts.trailing_stop, new_stop, position.current_stop)

        else:
            ts.peak_favorable = min(ts.peak_favorable, current_price)
            move_pct = (entry - ts.peak_favorable) / entry
            target_move = (entry - position.target_price) / entry

            if move_pct >= target_move * self.trailing_activation_pct:
                ts.activated = True

            if ts.activated:
                new_stop = ts.peak_favorable * (1 + self.trailing_distance_pct * abs(target_move))
                ts.trailing_stop = min(ts.trailing_stop, new_stop, position.current_stop)

        return ts

    def check_exit(
        self,
        position: PositionState,
        current_price: float,
        new_signal: str | None = None,
    ) -> tuple[ExitReason, float]:
        if position.direction == "LONG":
            if current_price >= position.target_price:
                return ExitReason.TARGET_HIT, current_price
            if current_price <= position.current_stop:
                return ExitReason.STOP_HIT, current_price
        else:
            if current_price <= position.target_price:
                return ExitReason.TARGET_HIT, current_price
            if current_price >= position.current_stop:
                return ExitReason.STOP_HIT, current_price

        self.update_trailing(position, current_price)
        if position.trailing and position.trailing.activated:
            if position.direction == "LONG" and current_price <= position.trailing.trailing_stop:
                return ExitReason.TRAILING_STOP, current_price
            if position.direction == "SHORT" and current_price >= position.trailing.trailing_stop:
                return ExitReason.TRAILING_STOP, current_price

        max_hours = position.half_life_days * 24 * self.max_hold_multiplier
        if position.hours_held >= max_hours:
            return ExitReason.TIME_EXIT, current_price

        if new_signal:
            if position.direction == "LONG" and new_signal == "SELL":
                return ExitReason.SIGNAL_REVERSAL, current_price
            if position.direction == "SHORT" and new_signal == "BUY":
                return ExitReason.SIGNAL_REVERSAL, current_price

        return ExitReason.NONE, current_price

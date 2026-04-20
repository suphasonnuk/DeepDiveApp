import numpy as np


class KellyCriterion:
    """
    Kelly Criterion for mathematically optimal position sizing.

    Full Kelly:     f* = (b·p - q) / b   where q = 1 - p
      p = P(win), b = win/loss ratio (expected_profit / expected_loss)

    We apply half-Kelly (fraction=0.5) to reduce variance while retaining
    most of the geometric growth advantage. Full Kelly maximizes long-run
    wealth but has extreme drawdowns; half-Kelly is the practitioner standard.

    Position is also capped at MAX_POSITION to prevent over-concentration.
    """

    FRACTION = 0.5       # half-Kelly
    MAX_POSITION = 0.25  # max 25% of portfolio in one position

    def _raw_kelly(self, win_probability: float, win_loss_ratio: float) -> float:
        """Unclipped Kelly fraction f*. Returns 0 if edge is non-positive."""
        if win_loss_ratio <= 0 or win_probability <= 0 or win_probability >= 1:
            return 0.0
        q = 1.0 - win_probability
        f_star = (win_loss_ratio * win_probability - q) / win_loss_ratio
        return max(float(f_star), 0.0)

    def compute(self, win_probability: float, win_loss_ratio: float) -> float:
        """Returns optimal portfolio fraction [0, MAX_POSITION] (half-Kelly, capped)."""
        return float(np.clip(
            self._raw_kelly(win_probability, win_loss_ratio) * self.FRACTION,
            0.0, self.MAX_POSITION,
        ))

    def compute_from_signal(
        self,
        win_probability: float,
        target_pct: float,
        stop_pct: float,
    ) -> dict:
        """
        Derive Kelly position from signal outputs.

        Args:
            win_probability: alignment-aware P(win) from combined signal [0.5, 1.0]
            target_pct:      expected upside (e.g. 0.05 = 5%)
            stop_pct:        expected downside (e.g. 0.03 = 3%)
        """
        if stop_pct <= 0:
            stop_pct = target_pct * 0.67  # default ~1.5:1 R/R

        win_loss_ratio = target_pct / max(stop_pct, 1e-6)

        # Compute raw f* first, then scale — never divide a clipped value
        full_kelly = self._raw_kelly(win_probability, win_loss_ratio)
        position = float(np.clip(full_kelly * self.FRACTION, 0.0, self.MAX_POSITION))

        return {
            "position_size_fraction": round(position, 4),
            "full_kelly": round(full_kelly, 4),
            "win_probability": round(win_probability, 4),
            "win_loss_ratio": round(win_loss_ratio, 4),
            "note": f"Half-Kelly: allocate {position * 100:.1f}% of portfolio",
        }

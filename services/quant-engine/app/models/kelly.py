import numpy as np

from app.calibration.kelly_calibrator import KellyCalibrator


class KellyCriterion:
    """
    Kelly Criterion for mathematically optimal position sizing.

    Full Kelly:     f* = (b·p - q) / b   where q = 1 - p
      p = P(win), b = win/loss ratio (expected_profit / expected_loss)

    We apply half-Kelly (fraction=0.5) to reduce variance while retaining
    most of the geometric growth advantage. Full Kelly maximizes long-run
    wealth but has extreme drawdowns; half-Kelly is the practitioner standard.

    Position is also capped at MAX_POSITION to prevent over-concentration.

    When a KellyCalibrator is attached, win_probability comes from empirical
    backtest data rather than the synthetic signal-alignment estimate.
    """

    FRACTION = 0.5       # half-Kelly
    MAX_POSITION = 0.25  # max 25% of portfolio in one position

    def __init__(self, calibrator: KellyCalibrator | None = None):
        self._calibrator = calibrator

    @property
    def calibrator(self) -> KellyCalibrator | None:
        return self._calibrator

    @calibrator.setter
    def calibrator(self, cal: KellyCalibrator | None) -> None:
        self._calibrator = cal

    def _raw_kelly(self, win_probability: float, win_loss_ratio: float) -> float:
        if win_loss_ratio <= 0 or win_probability <= 0 or win_probability >= 1:
            return 0.0
        q = 1.0 - win_probability
        f_star = (win_loss_ratio * win_probability - q) / win_loss_ratio
        return max(float(f_star), 0.0)

    def compute(self, win_probability: float, win_loss_ratio: float) -> float:
        return float(np.clip(
            self._raw_kelly(win_probability, win_loss_ratio) * self.FRACTION,
            0.0, self.MAX_POSITION,
        ))

    def compute_from_signal(
        self,
        win_probability: float,
        target_pct: float,
        stop_pct: float,
        confidence: float = 0.0,
        regime: str = "",
    ) -> dict:
        if stop_pct <= 0:
            stop_pct = target_pct * 0.67

        win_loss_ratio = target_pct / max(stop_pct, 1e-6)

        used_empirical = False
        if self._calibrator and self._calibrator.is_calibrated:
            emp_wp, is_emp = self._calibrator.get_win_probability(
                confidence, regime, synthetic_fallback=win_probability,
            )
            if is_emp:
                win_probability = emp_wp
                used_empirical = True

            emp_wlr = self._calibrator.get_calibrated_win_loss_ratio(confidence, regime)
            if emp_wlr is not None:
                win_loss_ratio = emp_wlr

        full_kelly = self._raw_kelly(win_probability, win_loss_ratio)
        position = float(np.clip(full_kelly * self.FRACTION, 0.0, self.MAX_POSITION))

        return {
            "position_size_fraction": round(position, 4),
            "full_kelly": round(full_kelly, 4),
            "win_probability": round(win_probability, 4),
            "win_loss_ratio": round(win_loss_ratio, 4),
            "empirical_calibration": used_empirical,
            "note": f"Half-Kelly: allocate {position * 100:.1f}% of portfolio",
        }

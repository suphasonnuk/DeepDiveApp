from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field


@dataclass
class CalibrationBucket:
    confidence_min: float
    confidence_max: float
    regime: str
    sample_count: int = 0
    empirical_win_rate: float = 0.5
    avg_win_pct: float = 0.0
    avg_loss_pct: float = 0.0


@dataclass
class CalibrationTable:
    buckets: list[CalibrationBucket] = field(default_factory=list)
    total_samples: int = 0
    calibrated: bool = False


CONFIDENCE_BINS = [(0.0, 0.25), (0.25, 0.50), (0.50, 0.75), (0.75, 1.01)]
REGIMES = ["BULL", "BEAR", "SIDEWAYS"]
MIN_SAMPLES_PER_BUCKET = 5


class KellyCalibrator:
    """
    Replaces fabricated win probabilities with empirical rates.

    Takes backtest trade results, buckets them by (confidence, regime),
    and computes the actual win rate for each bucket. At signal time,
    the calibrated win rate replaces the synthetic `0.5 + 0.5 * alignment`.

    Falls back to synthetic probability for any bucket with fewer than
    MIN_SAMPLES_PER_BUCKET observations (insufficient data to calibrate).
    """

    def __init__(self):
        self._table = CalibrationTable()

    @property
    def is_calibrated(self) -> bool:
        return self._table.calibrated

    def calibrate(self, trades: list[dict]) -> CalibrationTable:
        buckets: list[CalibrationBucket] = []

        for regime in REGIMES:
            for cmin, cmax in CONFIDENCE_BINS:
                matching = [
                    t for t in trades
                    if t.get("regime") == regime
                    and cmin <= t.get("confidence", 0.0) < cmax
                    and t.get("pnl_net") is not None
                ]

                n = len(matching)
                if n < MIN_SAMPLES_PER_BUCKET:
                    buckets.append(CalibrationBucket(
                        confidence_min=cmin,
                        confidence_max=cmax,
                        regime=regime,
                        sample_count=n,
                        empirical_win_rate=0.5,
                    ))
                    continue

                pnls = np.array([t["pnl_net"] for t in matching])
                wins = pnls > 0
                win_rate = float(np.mean(wins))

                win_pnls = pnls[wins]
                loss_pnls = pnls[~wins]

                buckets.append(CalibrationBucket(
                    confidence_min=cmin,
                    confidence_max=cmax,
                    regime=regime,
                    sample_count=n,
                    empirical_win_rate=round(win_rate, 4),
                    avg_win_pct=round(float(np.mean(win_pnls)), 4) if len(win_pnls) > 0 else 0.0,
                    avg_loss_pct=round(float(np.mean(np.abs(loss_pnls))), 4) if len(loss_pnls) > 0 else 0.0,
                ))

        self._table = CalibrationTable(
            buckets=buckets,
            total_samples=len(trades),
            calibrated=True,
        )
        return self._table

    def get_win_probability(
        self,
        confidence: float,
        regime: str,
        synthetic_fallback: float | None = None,
    ) -> tuple[float, bool]:
        if not self._table.calibrated:
            fb = synthetic_fallback if synthetic_fallback is not None else 0.5
            return fb, False

        for b in self._table.buckets:
            if b.regime == regime and b.confidence_min <= confidence < b.confidence_max:
                if b.sample_count >= MIN_SAMPLES_PER_BUCKET:
                    return b.empirical_win_rate, True
                break

        fb = synthetic_fallback if synthetic_fallback is not None else 0.5
        return fb, False

    def get_calibrated_win_loss_ratio(
        self,
        confidence: float,
        regime: str,
    ) -> float | None:
        if not self._table.calibrated:
            return None

        for b in self._table.buckets:
            if b.regime == regime and b.confidence_min <= confidence < b.confidence_max:
                if b.sample_count >= MIN_SAMPLES_PER_BUCKET and b.avg_loss_pct > 0:
                    return round(b.avg_win_pct / b.avg_loss_pct, 4)
                break

        return None

    def summary(self) -> dict:
        if not self._table.calibrated:
            return {"calibrated": False}

        active = [b for b in self._table.buckets if b.sample_count >= MIN_SAMPLES_PER_BUCKET]
        return {
            "calibrated": True,
            "total_samples": self._table.total_samples,
            "active_buckets": len(active),
            "total_buckets": len(self._table.buckets),
            "buckets": [
                {
                    "regime": b.regime,
                    "confidence_range": f"[{b.confidence_min:.2f}, {b.confidence_max:.2f})",
                    "samples": b.sample_count,
                    "win_rate": b.empirical_win_rate,
                    "avg_win": b.avg_win_pct,
                    "avg_loss": b.avg_loss_pct,
                    "sufficient": b.sample_count >= MIN_SAMPLES_PER_BUCKET,
                }
                for b in self._table.buckets
            ],
        }

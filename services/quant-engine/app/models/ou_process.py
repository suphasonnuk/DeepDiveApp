from __future__ import annotations

import numpy as np
from scipy import stats


class OrnsteinUhlenbeck:
    """
    Ornstein-Uhlenbeck mean reversion model.

    Continuous SDE:  dX = θ(μ - X)dt + σdW
    Discrete fit via OLS: X(t+1) = α + β·X(t) + ε

    Parameters derived:
      θ (mean-reversion speed) = -ln(β) / dt
      μ (long-run mean)        = α / (1 - β)
      σ (vol)                  = std(ε) · √(2θ / (1 - β²))
      half_life (days)         = ln(2) / θ

    Z-score = (X - μ) / σ_eq  where σ_eq = σ / √(2θ)
    Signals: z < -2 → BUY (oversold, expect reversion upward)
             z > +2 → SELL (overbought, expect reversion downward)
    """

    def __init__(self):
        self.theta: float | None = None
        self.mu: float | None = None
        self.sigma: float | None = None
        self.half_life: float | None = None
        self._sigma_eq: float | None = None

    def fit(self, prices: np.ndarray, dt: float = 1.0) -> "OrnsteinUhlenbeck":
        x, y = prices[:-1], prices[1:]
        slope, intercept, _, _, _ = stats.linregress(x, y)

        beta = float(np.clip(slope, 0.01, 0.9999))
        residuals = y - (slope * x + intercept)

        self.theta = -np.log(beta) / dt
        self.mu = intercept / (1.0 - beta)
        self.sigma = float(np.std(residuals)) * np.sqrt(2.0 * self.theta / (1.0 - beta**2))
        self.half_life = np.log(2.0) / self.theta
        self._sigma_eq = self.sigma / np.sqrt(2.0 * self.theta)
        return self

    @property
    def sigma_eq(self) -> float:
        return self._sigma_eq or 0.0

    def z_score(self, price: float) -> float:
        if not self.mu or not self._sigma_eq or self._sigma_eq < 1e-12:
            return 0.0
        return (price - self.mu) / self._sigma_eq

    def get_signal(self, prices: np.ndarray) -> dict:
        if len(prices) < 30:
            return {"signal": "HOLD", "confidence": 0.0, "reason": "insufficient data"}

        self.fit(prices)

        # Reject if not mean-reverting on a tradeable timescale.
        # Upper bound 60d: with 200 samples, >60d half-life has <3 full cycles in-sample.
        if self.half_life is None or self.half_life > 60 or self.half_life < 2:
            hl = self.half_life or 0.0
            return {
                "signal": "HOLD",
                "confidence": 0.1,
                "half_life_days": round(hl, 1),
                "reason": f"weak mean reversion (half-life {hl:.1f}d — outside tradeable range)",
            }

        current = float(prices[-1])
        z = self.z_score(current)

        # Confidence: stronger z-score AND shorter half-life → higher confidence.
        # magnitude_conf anchored to signal triggers: z=1 (moderate) → 0.20,
        # z=2 (strong trigger) → 0.60, z=3 → 1.0. Prevents 0.67-cap at trigger boundary.
        magnitude_conf = float(np.clip(0.2 + (abs(z) - 1.0) * 0.4, 0.0, 1.0))
        # Half-life confidence peaks at 10d (fast, clean reversion), decays to floor at 40d.
        halflife_conf = float(np.clip(1.0 - abs(self.half_life - 10.0) / 30.0, 0.1, 1.0))
        confidence = magnitude_conf * halflife_conf

        base = {
            "z_score": round(z, 4),
            "mean": round(self.mu, 6),
            "half_life_days": round(self.half_life, 1),
            "sigma_eq": round(self.sigma_eq, 6),
        }

        if z < -2.0:
            return {**base, "signal": "BUY", "confidence": round(confidence, 4),
                    "reason": f"z={z:.2f}: {abs(z):.1f}σ below OU mean, reversion in ~{self.half_life:.0f}d"}
        if z < -1.0:
            return {**base, "signal": "BUY", "confidence": round(confidence * 0.55, 4),
                    "reason": f"z={z:.2f}: moderately below mean"}
        if z > 2.0:
            return {**base, "signal": "SELL", "confidence": round(confidence, 4),
                    "reason": f"z={z:.2f}: {z:.1f}σ above OU mean, reversion in ~{self.half_life:.0f}d"}
        if z > 1.0:
            return {**base, "signal": "SELL", "confidence": round(confidence * 0.55, 4),
                    "reason": f"z={z:.2f}: moderately above mean"}
        return {**base, "signal": "HOLD", "confidence": 0.3,
                "reason": f"z={z:.2f}: within normal range, no reversion signal"}

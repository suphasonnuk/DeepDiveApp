from __future__ import annotations

import numpy as np
from scipy import stats


class OrnsteinUhlenbeck:
    """
    Ornstein-Uhlenbeck mean reversion model fitted on detrended log-prices.

    Fitting on raw prices fails for trending assets (BTC $40K→$100K): the OLS
    β approaches 1 (unit root), making half-life infinite and the signal always HOLD.

    Fix: work in log-price space, remove the linear time trend, then fit OU on
    the residuals (spread). The spread IS stationary — it measures deviation from
    the current trend line, which mean-reverts even when the raw price is trending.

    Continuous SDE:  dS = θ(μ - S)dt + σdW   where S = log(P) − trend(t)
    Discrete fit via OLS: S(t+1) = α + β·S(t) + ε

    Parameters derived:
      θ (mean-reversion speed) = -ln(β) / dt
      μ (long-run mean of spread) ≈ 0 after detrending
      σ_eq (equilibrium vol)   = σ / √(2θ)   [dimensionless, log-scale ≈ % units]
      half_life (days)         = ln(2) / θ

    Z-score = (S_current − μ) / σ_eq
    Signals: z < -2 → BUY (below trend, expect reversion upward)
             z > +2 → SELL (above trend, expect reversion downward)
    """

    def __init__(self):
        self.theta: float | None = None
        self.mu: float | None = None
        self.sigma: float | None = None
        self.half_life: float | None = None
        self._sigma_eq: float | None = None
        self._spread: np.ndarray | None = None  # detrended log-price series

    def fit(self, prices: np.ndarray, dt: float = 1.0) -> "OrnsteinUhlenbeck":
        log_p = np.log(prices + 1e-12)
        t = np.arange(len(log_p), dtype=float)

        # Remove linear time trend so the residual (spread) is stationary
        trend = np.polyfit(t, log_p, 1)
        spread = log_p - np.polyval(trend, t)

        x, y = spread[:-1], spread[1:]
        slope, intercept, _, _, _ = stats.linregress(x, y)

        beta = float(np.clip(slope, 0.01, 0.9999))
        residuals = y - (slope * x + intercept)

        self.theta = -np.log(beta) / dt
        self.mu = intercept / (1.0 - beta)          # long-run mean of spread (~0)
        self.sigma = float(np.std(residuals)) * np.sqrt(2.0 * self.theta / (1.0 - beta**2))
        self.half_life = np.log(2.0) / self.theta
        self._sigma_eq = self.sigma / np.sqrt(2.0 * self.theta)  # dimensionless (log-scale)
        self._spread = spread
        return self

    @property
    def sigma_eq(self) -> float:
        return self._sigma_eq or 0.0

    def z_score(self, price: float) -> float:
        # Uses the last spread value from fit() — price arg kept for API compat
        if self._spread is None or self._sigma_eq is None or self._sigma_eq < 1e-12:
            return 0.0
        return (float(self._spread[-1]) - (self.mu or 0.0)) / self._sigma_eq

    def get_signal(self, prices: np.ndarray, dt: float = 1.0) -> dict:
        if len(prices) < 30:
            return {"signal": "HOLD", "confidence": 0.0, "reason": "insufficient data"}

        self.fit(prices, dt=dt)

        # Reject if not mean-reverting on a tradeable timescale.
        # Upper bound 90d: detrended series reverts faster than raw prices,
        # so 90d allows capturing slower cycles without admitting random walks.
        if self.half_life is None or self.half_life > 90 or self.half_life < 2:
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

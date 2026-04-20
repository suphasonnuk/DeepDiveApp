from __future__ import annotations

import numpy as np
from app.models.kalman import PriceKalmanFilter
from app.models.ou_process import OrnsteinUhlenbeck
from app.models.hmm_regime import RegimeDetector
from app.models.kelly import KellyCriterion


# Regime-adaptive weights for combining Kalman and OU signals.
# BULL: trend is real → trust Kalman momentum more.
# BEAR: recovery after drop → OU mean-reversion more relevant.
# SIDEWAYS: pure oscillation → OU dominates.
REGIME_WEIGHTS: dict[str, dict[str, float]] = {
    "BULL":     {"kalman": 0.60, "ou": 0.40},
    "BEAR":     {"kalman": 0.40, "ou": 0.60},
    "SIDEWAYS": {"kalman": 0.20, "ou": 0.80},
}

_SIGNAL_SCORE = {"BUY": 1, "HOLD": 0, "SELL": -1}
_BUY_THRESHOLD = 0.15
_SELL_THRESHOLD = -0.15


class SignalGenerator:
    """
    Orchestrates the full quant pipeline:
      1. HMM  → market regime (BULL / BEAR / SIDEWAYS)
      2. Kalman → trend signal + fair value estimate
      3. OU     → mean-reversion signal + z-score
      4. Weighted combination by regime
      5. Kelly  → optimal position size
      6. Delta  → directional exposure for hedging guidance
    """

    def __init__(self):
        self.kalman = PriceKalmanFilter()
        self.ou = OrnsteinUhlenbeck()
        self.hmm = RegimeDetector()
        self.kelly = KellyCriterion()

    def generate(self, symbol: str, prices: np.ndarray, current_price: float) -> dict:
        if len(prices) < 30:
            return self._no_data(symbol, current_price)

        # --- 1. Regime ---
        regime_info = self.hmm.fit_predict(prices)
        regime = regime_info["regime"]
        weights = REGIME_WEIGHTS.get(regime, REGIME_WEIGHTS["SIDEWAYS"])

        # --- 2. Model signals ---
        kalman_sig = self.kalman.get_signal(prices)
        ou_sig = self.ou.get_signal(prices)

        # --- 3. Weighted score combination ---
        k_score = _SIGNAL_SCORE.get(kalman_sig["signal"], 0) * kalman_sig["confidence"]
        o_score = _SIGNAL_SCORE.get(ou_sig["signal"], 0) * ou_sig["confidence"]
        combined_score = weights["kalman"] * k_score + weights["ou"] * o_score
        combined_confidence = weights["kalman"] * kalman_sig["confidence"] + weights["ou"] * ou_sig["confidence"]

        # --- 4. Final signal ---
        if combined_score > _BUY_THRESHOLD:
            final_signal = "BUY"
        elif combined_score < _SELL_THRESHOLD:
            final_signal = "SELL"
        else:
            final_signal = "HOLD"

        # --- 5. Risk levels (derived from OU equilibrium std) ---
        ou_sigma_eq = self.ou.sigma_eq if self.ou.sigma_eq > 0 else current_price * 0.03
        z = ou_sig.get("z_score", 0.0) or 0.0
        target_pct = min(abs(z) * ou_sigma_eq / (current_price + 1e-12), 0.30) if z else 0.05
        stop_pct = ou_sigma_eq / (current_price + 1e-12) * 1.5
        target_pct = max(target_pct, 0.01)
        stop_pct = max(stop_pct, 0.005)

        if final_signal == "BUY":
            target_price = current_price * (1 + target_pct)
            stop_price = current_price * (1 - stop_pct)
        elif final_signal == "SELL":
            target_price = current_price * (1 - target_pct)
            stop_price = current_price * (1 + stop_pct)
        else:
            target_price = current_price
            stop_price = current_price

        # --- 6. Kelly position size ---
        kelly_result = self.kelly.compute_from_signal(combined_confidence, target_pct, stop_pct)

        # --- 7. Delta (spot holding delta = 1.0; used for hedge sizing) ---
        # For a BUY signal: delta = +1 (long exposure)
        # For a SELL signal: delta = -1 (reduce or short exposure)
        # To stay delta-neutral: hedge = position_fraction * |delta|
        directional_delta = 1.0 if final_signal == "BUY" else (-1.0 if final_signal == "SELL" else 0.0)
        position_fraction = kelly_result["position_size_fraction"]
        portfolio_delta_contribution = directional_delta * position_fraction

        return {
            "symbol": symbol,
            "current_price": round(current_price, 8),
            "signal": final_signal,
            "confidence": round(combined_confidence, 4),
            "combined_score": round(combined_score, 4),
            "regime": regime,
            "regime_confidence": regime_info["confidence"],
            "regime_method": regime_info.get("method", "unknown"),
            "models": {
                "kalman": kalman_sig,
                "ou": ou_sig,
                "weights": weights,
            },
            "risk": {
                "target_price": round(target_price, 8),
                "stop_price": round(stop_price, 8),
                "target_pct": round(target_pct * 100, 2),
                "stop_pct": round(stop_pct * 100, 2),
                "risk_reward_ratio": round(target_pct / stop_pct, 2) if stop_pct > 0 else None,
            },
            "position": {
                "kelly_fraction": position_fraction,
                "full_kelly": kelly_result["full_kelly"],
                "note": kelly_result["note"],
                "delta": directional_delta,
                "portfolio_delta_contribution": round(portfolio_delta_contribution, 4),
                "hedge_note": (
                    f"To be delta-neutral: short {abs(portfolio_delta_contribution)*100:.1f}% "
                    f"of portfolio in {symbol} perp"
                    if abs(portfolio_delta_contribution) > 0.01 else
                    "No hedging needed (HOLD or no position)"
                ),
            },
        }

    def _no_data(self, symbol: str, current_price: float) -> dict:
        return {
            "symbol": symbol,
            "current_price": current_price,
            "signal": "HOLD",
            "confidence": 0.0,
            "regime": "UNKNOWN",
            "reason": "insufficient price history (need 30+ data points)",
        }

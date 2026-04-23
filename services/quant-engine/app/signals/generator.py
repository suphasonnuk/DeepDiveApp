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

_STANDARD_LEVERAGES = [1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0]


def _snap_leverage(raw: float) -> float:
    """Snap a raw leverage value to the nearest standard tier."""
    return min(_STANDARD_LEVERAGES, key=lambda t: abs(t - raw))


def suggest_leverage(
    confidence: float,
    regime: str,
    kelly_fraction: float,
    sigma_eq: float,
    stop_pct: float,
    win_probability: float,
) -> float:
    """
    Volatility-bounded leverage via a five-factor risk model.

    Core constraint: leverage must stay below the level where the stop loss
    triggers before exchange liquidation (60% safety buffer on liquidation distance).
    All other factors scale within that ceiling.

    Returns one of: 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0
    """
    # 1. Hard ceiling: stop must trigger before liquidation.
    #    Liquidation at price move = 1/L. Stop at stop_pct.
    #    Require stop_pct ≤ 0.60 / L  →  L ≤ 0.60 / stop_pct.
    l_max = 0.60 / max(stop_pct, 0.005)

    # 2. Volatility scalar: normalize to 3% baseline (median top-10 crypto vol).
    #    High sigma_eq → process is noisy → more likely stopped before thesis plays out.
    vol_scale = min(0.03 / max(sigma_eq, 0.005), 1.5)

    # 3. Edge: remap win_probability [0.5, 1.0] → [0.0, 1.0].
    #    A coin-flip signal (wp=0.5) deserves no leverage; certainty gets full ceiling.
    edge = (win_probability - 0.5) * 2.0

    # 4. Regime modifier: SIDEWAYS has high whipsaw risk (OU oscillations without
    #    a confirmed trend); BEAR has directional uncertainty; BULL is Kalman-confirmed.
    regime_mod = {"BULL": 1.00, "BEAR": 0.70, "SIDEWAYS": 0.45}.get(regime, 0.70)

    # 5. Kelly dampener: large kelly_fraction already means large notional exposure.
    #    Prevent double-stacking risk: kelly=0.25 → 50%, kelly≈0 → ~100%.
    kelly_damp = 1.0 - 0.5 * min(kelly_fraction / 0.25, 1.0)

    raw = l_max * vol_scale * edge * regime_mod * kelly_damp
    return _snap_leverage(raw)

_SIGNAL_SCORE = {"BUY": 1, "HOLD": 0, "SELL": -1}
_BUY_THRESHOLD = 0.10
_SELL_THRESHOLD = -0.10


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

        # Directional alignment: how strongly models agree on direction (used for BUY/SELL confidence).
        alignment = abs(combined_score)
        win_probability = 0.5 + 0.5 * alignment         # Kelly input [0.5, 1.0]

        # Model certainty: weighted average of individual model confidences regardless of direction.
        # Used for HOLD confidence — a confident HOLD means both models are certain nothing is happening.
        model_certainty = (weights["kalman"] * kalman_sig["confidence"]
                           + weights["ou"] * ou_sig["confidence"])

        # --- 4. Final signal + confidence ---
        if combined_score > _BUY_THRESHOLD:
            final_signal = "BUY"
            combined_confidence = round(alignment, 4)
        elif combined_score < _SELL_THRESHOLD:
            final_signal = "SELL"
            combined_confidence = round(alignment, 4)
        else:
            final_signal = "HOLD"
            # HOLD confidence reflects model certainty, not directional alignment (which is always ~0 for HOLD).
            combined_confidence = round(model_certainty, 4)

        # --- 5. Risk levels ---
        # sigma_eq is now dimensionless (log-scale ≈ % units) after OU detrending fix.
        # Fallback 0.03 = 3% typical crypto vol if OU didn't fit.
        ou_sigma_eq = self.ou.sigma_eq if self.ou.sigma_eq > 0 else 0.03
        z = ou_sig.get("z_score", 0.0) or 0.0
        hl = ou_sig.get("half_life_days", 15.0) or 15.0

        # Target: regime-weighted blend of each model's natural price objective.
        # Kalman contributes its fair-value deviation; OU contributes reversion distance to trend.
        # In BULL (60/40): Kalman fair-value dominates. In SIDEWAYS (20/80): OU dominates.
        k_dev = abs(kalman_sig.get("deviation_pct", 0.0)) / 100.0
        ou_reversion = abs(z) * ou_sigma_eq if z else 0.0  # dimensionless: |z| × σ_eq
        target_pct = float(np.clip(
            weights["kalman"] * k_dev + weights["ou"] * ou_reversion,
            0.01, 0.30,
        ))

        # Stop: 1× σ_eq scaled by √(half_life/10).
        # A 10-day trade gets a 1.0× stop; a 40-day trade gets a ~2× stop.
        # Prevents shake-outs on longer mean-reversion cycles.
        hl_scale = float(np.clip(np.sqrt(hl / 10.0), 0.7, 2.0))
        stop_pct = float(np.clip(ou_sigma_eq * hl_scale, 0.005, 0.15))

        if final_signal == "BUY":
            target_price = current_price * (1 + target_pct)
            stop_price = current_price * (1 - stop_pct)
        elif final_signal == "SELL":
            target_price = current_price * (1 - target_pct)
            stop_price = current_price * (1 + stop_pct)
        else:
            target_price = current_price
            stop_price = current_price

        # --- 6. Kelly position size + leverage ---
        kelly_result = self.kelly.compute_from_signal(win_probability, target_pct, stop_pct)

        # --- 7. Delta + leverage ---
        # For a BUY signal: delta = +1 (long exposure)
        # For a SELL signal: delta = -1 (reduce or short exposure)
        # To stay delta-neutral: hedge = position_fraction * |delta|
        directional_delta = 1.0 if final_signal == "BUY" else (-1.0 if final_signal == "SELL" else 0.0)
        position_fraction = kelly_result["position_size_fraction"]
        portfolio_delta_contribution = directional_delta * position_fraction
        leverage = suggest_leverage(
            combined_confidence, regime, position_fraction,
            sigma_eq=ou_sigma_eq, stop_pct=stop_pct, win_probability=win_probability,
        )

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
                "suggested_leverage": leverage,
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

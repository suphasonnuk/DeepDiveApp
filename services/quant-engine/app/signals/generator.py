from __future__ import annotations

import numpy as np
from app.models.kalman import PriceKalmanFilter
from app.models.ou_process import OrnsteinUhlenbeck
from app.models.hmm_regime import RegimeDetector
from app.models.kelly import KellyCriterion
from app.backtest.costs import CostModel
from app.calibration.kelly_calibrator import KellyCalibrator


REGIME_WEIGHTS: dict[str, dict[str, float]] = {
    "BULL":     {"kalman": 0.60, "ou": 0.40},
    "BEAR":     {"kalman": 0.40, "ou": 0.60},
    "SIDEWAYS": {"kalman": 0.20, "ou": 0.80},
}

_STANDARD_LEVERAGES = [1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0]


def _snap_leverage(raw: float) -> float:
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
    l_max = 0.60 / max(stop_pct, 0.005)
    vol_scale = min(0.03 / max(sigma_eq, 0.005), 1.5)
    edge = (win_probability - 0.5) * 2.0
    regime_mod = {"BULL": 1.00, "BEAR": 0.70, "SIDEWAYS": 0.45}.get(regime, 0.70)
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
      5. Kelly  → optimal position size (empirically calibrated when available)
      6. Cost filter → reject signals where expected move < break-even cost
      7. Delta  → directional exposure for hedging guidance
    """

    def __init__(
        self,
        calibrator: KellyCalibrator | None = None,
        cost_model: CostModel | None = None,
    ):
        self.kalman = PriceKalmanFilter()
        self.ou = OrnsteinUhlenbeck()
        self.hmm = RegimeDetector()
        self.kelly = KellyCriterion(calibrator=calibrator)
        self.cost_model = cost_model or CostModel()
        self._avg_funding_rates: dict[str, float] = {}

    def set_funding_rate(self, symbol: str, rate: float) -> None:
        self._avg_funding_rates[symbol] = rate

    def generate(self, symbol: str, prices_4h: np.ndarray, prices_daily: np.ndarray, current_price: float) -> dict:
        if len(prices_4h) < 30 or len(prices_daily) < 30:
            return self._no_data(symbol, current_price)

        # --- 1. Regime ---
        regime_info = self.hmm.fit_predict(prices_daily, symbol=symbol)
        regime = regime_info["regime"]
        weights = REGIME_WEIGHTS.get(regime, REGIME_WEIGHTS["SIDEWAYS"])

        # --- 2. Model signals ---
        kalman_sig = self.kalman.get_signal(prices_4h)
        ou_sig = self.ou.get_signal(prices_4h, dt=4/24)

        # --- 3. Weighted score combination ---
        k_score = _SIGNAL_SCORE.get(kalman_sig["signal"], 0) * kalman_sig["confidence"]
        o_score = _SIGNAL_SCORE.get(ou_sig["signal"], 0) * ou_sig["confidence"]
        combined_score = weights["kalman"] * k_score + weights["ou"] * o_score

        alignment = abs(combined_score)
        win_probability = 0.5 + 0.5 * alignment

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
            combined_confidence = round(model_certainty, 4)

        # --- 5. Risk levels ---
        ou_sigma_eq = self.ou.sigma_eq if self.ou.sigma_eq > 0 else 0.03
        z = ou_sig.get("z_score", 0.0) or 0.0
        hl = ou_sig.get("half_life_days", 15.0) or 15.0

        k_dev = abs(kalman_sig.get("deviation_pct", 0.0)) / 100.0
        ou_reversion = abs(z) * ou_sigma_eq if z else 0.0
        target_pct = float(np.clip(
            weights["kalman"] * k_dev + weights["ou"] * ou_reversion,
            0.01, 0.30,
        ))

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

        # --- 6. Cost-adjusted viability filter ---
        avg_funding = self._avg_funding_rates.get(symbol, 0.0001)
        estimated_hold_hours = hl * 24.0
        break_even_pct = self.cost_model.break_even_move_pct(
            hold_hours=estimated_hold_hours,
            avg_funding_rate=avg_funding,
        )
        cost_viable = (target_pct * 100) > break_even_pct * 1.5

        if final_signal in ("BUY", "SELL") and not cost_viable:
            final_signal = "HOLD"
            combined_confidence = round(model_certainty * 0.5, 4)
            target_price = current_price
            stop_price = current_price

        # --- 7. Kelly position size + leverage ---
        kelly_result = self.kelly.compute_from_signal(
            win_probability, target_pct, stop_pct,
            confidence=combined_confidence, regime=regime,
        )

        # --- 8. Delta + leverage ---
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
            "costs": {
                "break_even_pct": round(break_even_pct, 4),
                "estimated_hold_hours": round(estimated_hold_hours, 1),
                "avg_funding_rate": round(avg_funding, 6),
                "cost_viable": cost_viable,
            },
            "position": {
                "kelly_fraction": position_fraction,
                "suggested_leverage": leverage,
                "full_kelly": kelly_result["full_kelly"],
                "win_probability": kelly_result["win_probability"],
                "win_loss_ratio": kelly_result["win_loss_ratio"],
                "empirical_calibration": kelly_result.get("empirical_calibration", False),
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

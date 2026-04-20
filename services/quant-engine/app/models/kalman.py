from __future__ import annotations

import numpy as np


class PriceKalmanFilter:
    """
    Two-state Kalman Filter: state = [price, velocity].

    Estimates the "true" price and trend velocity from noisy market observations.
    The Kalman gain K balances trust in the model prediction vs. the new observation —
    high measurement noise → trust the model; low noise → trust the observation.

    Process noise Q controls how much the true state can change per step.
    Measurement noise R controls how noisy the observed price is assumed to be.
    """

    def __init__(self, process_noise: float = 1e-4, measurement_noise: float = 1e-2):
        self.Q = np.diag([process_noise, process_noise * 0.1])
        self.R = np.array([[measurement_noise]])
        self.H = np.array([[1.0, 0.0]])        # we observe price only
        self.F = np.array([[1.0, 1.0], [0.0, 1.0]])  # constant-velocity model

    def _run(self, prices: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        n = len(prices)
        filtered = np.zeros(n)
        velocities = np.zeros(n)
        uncertainties = np.zeros(n)

        x = np.array([prices[0], 0.0])
        P = np.eye(2)

        for i, z in enumerate(prices):
            x_pred = self.F @ x
            P_pred = self.F @ P @ self.F.T + self.Q

            S = self.H @ P_pred @ self.H.T + self.R
            K = (P_pred @ self.H.T @ np.linalg.inv(S)).flatten()
            innovation = z - float((self.H @ x_pred)[0])

            x = x_pred + K * innovation
            P = (np.eye(2) - np.outer(K, self.H)) @ P_pred

            filtered[i] = x[0]
            velocities[i] = x[1]
            uncertainties[i] = float(np.trace(P))

        return filtered, velocities, uncertainties

    def get_signal(self, prices: np.ndarray) -> dict:
        if len(prices) < 20:
            return {"signal": "HOLD", "confidence": 0.0, "reason": "insufficient data"}

        filtered, velocities, uncertainties = self._run(prices)

        current = float(prices[-1])
        fair_value = float(filtered[-1])
        velocity = float(velocities[-1])
        uncertainty = float(uncertainties[-1])

        price_var = float(np.var(prices)) + 1e-10
        confidence = float(np.clip(1.0 - uncertainty / price_var, 0.0, 1.0))

        deviation = (current - fair_value) / (fair_value + 1e-10)
        daily_scale = float(np.mean(np.abs(np.diff(prices[-20:])))) + 1e-10
        norm_velocity = velocity / daily_scale

        if deviation < -0.02 and norm_velocity > 0.1:
            return {
                "signal": "BUY",
                "confidence": round(confidence * 0.85, 4),
                "fair_value": round(fair_value, 6),
                "velocity": round(velocity, 8),
                "deviation_pct": round(deviation * 100, 2),
                "reason": f"price {deviation*100:.1f}% below Kalman fair value with positive momentum",
            }
        if deviation > 0.02 and norm_velocity < -0.1:
            return {
                "signal": "SELL",
                "confidence": round(confidence * 0.85, 4),
                "fair_value": round(fair_value, 6),
                "velocity": round(velocity, 8),
                "deviation_pct": round(deviation * 100, 2),
                "reason": f"price {deviation*100:.1f}% above Kalman fair value with negative momentum",
            }
        if norm_velocity > 0.5:
            return {
                "signal": "BUY",
                "confidence": round(confidence * 0.6, 4),
                "fair_value": round(fair_value, 6),
                "velocity": round(velocity, 8),
                "deviation_pct": round(deviation * 100, 2),
                "reason": "strong upward velocity trend",
            }
        if norm_velocity < -0.5:
            return {
                "signal": "SELL",
                "confidence": round(confidence * 0.6, 4),
                "fair_value": round(fair_value, 6),
                "velocity": round(velocity, 8),
                "deviation_pct": round(deviation * 100, 2),
                "reason": "strong downward velocity trend",
            }
        return {
            "signal": "HOLD",
            "confidence": round(confidence * 0.4, 4),
            "fair_value": round(fair_value, 6),
            "velocity": round(velocity, 8),
            "deviation_pct": round(deviation * 100, 2),
            "reason": "price near Kalman fair value, weak trend",
        }

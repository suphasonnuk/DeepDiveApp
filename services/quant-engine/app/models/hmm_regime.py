from __future__ import annotations

import time
import numpy as np

try:
    from hmmlearn import hmm as hmmlearn_hmm
    HMM_AVAILABLE = True
except ImportError:
    HMM_AVAILABLE = False


class RegimeDetector:
    """
    Hidden Markov Model for market regime classification.

    States: BULL (positive drift, moderate vol)
            BEAR (negative drift, elevated vol)
            SIDEWAYS (near-zero drift, low vol)

    Features: [log_return, 5-day realized volatility]

    Uses Gaussian HMM with Baum-Welch EM parameter estimation.
    Falls back to a heuristic classifier if hmmlearn is unavailable.

    Model parameters are cached per symbol with a configurable TTL
    to prevent non-deterministic regime flips from EM re-initialization.
    """

    N_STATES = 3
    REGIME_NAMES = {0: "BULL", 1: "BEAR", 2: "SIDEWAYS"}

    def __init__(self, cache_ttl_seconds: float = 86400.0):
        self._cache_ttl = cache_ttl_seconds
        self._cache: dict[str, dict] = {}

    def _prepare_features(self, prices: np.ndarray) -> np.ndarray:
        log_returns = np.diff(np.log(prices + 1e-12))
        rv = np.array([
            np.std(log_returns[max(0, i - 5): i + 1])
            for i in range(len(log_returns))
        ])
        return np.column_stack([log_returns, rv])

    def _is_cache_valid(self, symbol: str) -> bool:
        if symbol not in self._cache:
            return False
        return (time.time() - self._cache[symbol]["fitted_at"]) < self._cache_ttl

    def invalidate_cache(self, symbol: str | None = None) -> None:
        if symbol:
            self._cache.pop(symbol, None)
        else:
            self._cache.clear()

    def fit_predict(self, prices: np.ndarray, symbol: str = "__default__") -> dict:
        if not HMM_AVAILABLE or len(prices) < 60:
            return self._heuristic_regime(prices)

        if self._is_cache_valid(symbol):
            cached = self._cache[symbol]
            try:
                X = self._prepare_features(prices)
                states = cached["model"].predict(X)
                current_regime_id = cached["regime_map"][int(states[-1])]
                recent_states = states[-10:]
                raw_state = int(states[-1])
                regime_consistency = float(np.mean(recent_states == raw_state))
                return {
                    "regime": self.REGIME_NAMES[current_regime_id],
                    "regime_id": current_regime_id,
                    "confidence": round(0.5 + 0.5 * regime_consistency, 4),
                    "method": "hmm_cached",
                }
            except Exception:
                self._cache.pop(symbol, None)

        try:
            X = self._prepare_features(prices)
            model = hmmlearn_hmm.GaussianHMM(
                n_components=self.N_STATES,
                covariance_type="diag",
                n_iter=200,
                random_state=42,
            )
            model.fit(X)
            states = model.predict(X)

            mean_returns = [
                float(np.mean(X[states == s, 0])) if np.any(states == s) else 0.0
                for s in range(self.N_STATES)
            ]
            sorted_by_return = np.argsort(mean_returns)[::-1]
            regime_map = {
                sorted_by_return[0]: 0,
                sorted_by_return[2]: 1,
                sorted_by_return[1]: 2,
            }

            self._cache[symbol] = {
                "model": model,
                "regime_map": regime_map,
                "fitted_at": time.time(),
            }

            current_regime_id = regime_map[int(states[-1])]
            recent_states = states[-10:]
            raw_state = int(states[-1])
            regime_consistency = float(np.mean(recent_states == raw_state))

            return {
                "regime": self.REGIME_NAMES[current_regime_id],
                "regime_id": current_regime_id,
                "confidence": round(0.5 + 0.5 * regime_consistency, 4),
                "method": "hmm",
            }
        except Exception:
            return self._heuristic_regime(prices)

    def _heuristic_regime(self, prices: np.ndarray) -> dict:
        window = prices[-30:] if len(prices) >= 30 else prices
        returns = np.diff(np.log(window + 1e-12))
        mean_r = float(np.mean(returns))
        vol = float(np.std(returns)) + 1e-10
        sharpe_proxy = mean_r / vol

        if sharpe_proxy > 0.3:
            regime, regime_id = "BULL", 0
        elif sharpe_proxy < -0.3:
            regime, regime_id = "BEAR", 1
        else:
            regime, regime_id = "SIDEWAYS", 2

        return {
            "regime": regime,
            "regime_id": regime_id,
            "confidence": 0.55,
            "method": "heuristic",
        }

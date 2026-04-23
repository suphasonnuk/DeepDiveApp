from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field


@dataclass
class PortfolioConstraints:
    max_total_exposure: float = 1.0       # 100% of capital
    max_single_position: float = 0.25     # 25% per position (matches Kelly cap)
    max_correlated_group: float = 0.40    # 40% to correlated assets (ρ > threshold)
    correlation_threshold: float = 0.60   # assets with ρ above this are "correlated"
    max_sector_concentration: float = 0.50


CRYPTO_SECTORS: dict[str, str] = {
    "BTC": "store_of_value", "BCH": "store_of_value", "LTC": "store_of_value",
    "ETH": "smart_contract", "SOL": "smart_contract", "ADA": "smart_contract",
    "AVAX": "smart_contract", "DOT": "smart_contract", "SUI": "smart_contract",
    "TON": "smart_contract", "HBAR": "smart_contract", "SKY": "smart_contract",
    "BNB": "exchange", "UNI": "defi", "LINK": "infrastructure",
    "XRP": "payments", "XLM": "payments", "TRX": "payments",
    "DOGE": "meme", "SHIB": "meme", "WLFI": "governance",
    "TAO": "ai", "ZEC": "privacy",
}


class PortfolioRiskManager:

    def __init__(self, constraints: PortfolioConstraints | None = None):
        self.constraints = constraints or PortfolioConstraints()

    def compute_correlation_matrix(
        self,
        price_dict: dict[str, np.ndarray],
        lookback: int = 90,
    ) -> tuple[list[str], np.ndarray]:
        symbols = sorted(price_dict.keys())
        min_len = min(len(price_dict[s]) for s in symbols)
        lookback = min(lookback, min_len - 1)

        returns_matrix = []
        for sym in symbols:
            prices = price_dict[sym][-lookback - 1:]
            log_ret = np.diff(np.log(prices + 1e-12))
            returns_matrix.append(log_ret[-lookback:])

        R = np.array(returns_matrix)
        corr = np.corrcoef(R)
        return symbols, corr

    def identify_correlated_groups(
        self,
        symbols: list[str],
        corr_matrix: np.ndarray,
    ) -> list[set[str]]:
        n = len(symbols)
        visited = set()
        groups: list[set[str]] = []

        for i in range(n):
            if i in visited:
                continue
            group = {symbols[i]}
            visited.add(i)
            for j in range(i + 1, n):
                if j in visited:
                    continue
                if abs(corr_matrix[i, j]) >= self.constraints.correlation_threshold:
                    group.add(symbols[j])
                    visited.add(j)
            if len(group) > 1:
                groups.append(group)

        return groups

    def apply_constraints(
        self,
        proposed_positions: dict[str, float],
        price_dict: dict[str, np.ndarray] | None = None,
    ) -> dict[str, float]:
        adjusted = dict(proposed_positions)

        for sym in adjusted:
            adjusted[sym] = min(adjusted[sym], self.constraints.max_single_position)

        if price_dict and len(price_dict) >= 2:
            available = {s for s in adjusted if s in price_dict}
            if len(available) >= 2:
                subset = {s: price_dict[s] for s in available}
                symbols, corr = self.compute_correlation_matrix(subset)
                groups = self.identify_correlated_groups(symbols, corr)

                for group in groups:
                    group_exposure = sum(adjusted.get(s, 0) for s in group)
                    if group_exposure > self.constraints.max_correlated_group:
                        scale = self.constraints.max_correlated_group / group_exposure
                        for s in group:
                            if s in adjusted:
                                adjusted[s] *= scale

        sector_exposure: dict[str, float] = {}
        for sym, frac in adjusted.items():
            sector = CRYPTO_SECTORS.get(sym, "other")
            sector_exposure[sector] = sector_exposure.get(sector, 0) + frac

        for sector, total in sector_exposure.items():
            if total > self.constraints.max_sector_concentration:
                scale = self.constraints.max_sector_concentration / total
                for sym in adjusted:
                    if CRYPTO_SECTORS.get(sym, "other") == sector:
                        adjusted[sym] *= scale

        total = sum(adjusted.values())
        if total > self.constraints.max_total_exposure:
            scale = self.constraints.max_total_exposure / total
            adjusted = {s: f * scale for s, f in adjusted.items()}

        return adjusted

    def portfolio_var(
        self,
        positions: dict[str, float],
        price_dict: dict[str, np.ndarray],
        capital: float,
        confidence: float = 0.95,
        lookback: int = 90,
    ) -> dict:
        available = [s for s in positions if s in price_dict and positions[s] > 0]
        if len(available) < 2:
            if available:
                s = available[0]
                p = price_dict[s]
                ret = np.diff(np.log(p[-lookback - 1:] + 1e-12))
                var_pct = float(np.percentile(ret, (1 - confidence) * 100))
                pos_val = positions[s] * capital
                return {"var_pct": abs(var_pct) * 100, "var_usd": abs(var_pct) * pos_val}
            return {"var_pct": 0.0, "var_usd": 0.0}

        symbols, corr = self.compute_correlation_matrix(
            {s: price_dict[s] for s in available}, lookback
        )

        min_len = min(len(price_dict[s]) for s in available)
        lb = min(lookback, min_len - 1)
        returns_matrix = []
        for s in symbols:
            ret = np.diff(np.log(price_dict[s][-lb - 1:] + 1e-12))
            returns_matrix.append(ret[-lb:])
        R = np.array(returns_matrix)

        weights = np.array([positions.get(s, 0) for s in symbols])
        cov = np.cov(R)
        port_var = float(np.sqrt(weights @ cov @ weights))

        z = {0.95: 1.645, 0.99: 2.326}.get(confidence, 1.645)
        var_pct = port_var * z * 100
        var_usd = port_var * z * capital

        return {
            "var_pct": round(var_pct, 4),
            "var_usd": round(var_usd, 2),
            "confidence": confidence,
            "correlation_matrix": {
                "symbols": symbols,
                "matrix": corr.tolist(),
            },
        }

from __future__ import annotations

import itertools
import numpy as np
from dataclasses import dataclass, field

from app.backtest.engine import BacktestEngine, BacktestResult
from app.backtest.costs import CostModel


DEFAULT_PARAM_GRID: dict[str, list[float]] = {
    "kalman_process_noise":      [5e-5, 1e-4, 5e-4],
    "kalman_measurement_noise":  [5e-4, 1e-3, 5e-3],
    "buy_threshold":             [0.05, 0.10, 0.15],
    "sell_threshold":            [-0.15, -0.10, -0.05],
}


@dataclass
class OptimizationResult:
    best_params: dict
    best_score: float
    metric: str
    total_combinations: int
    results: list[dict] = field(default_factory=list)


class ParamOptimizer:
    """
    Grid search over signal parameters, scored on a single objective
    (Sharpe, profit factor, or win rate) using in-sample data.

    Designed to be called inside a walk-forward loop: optimize on
    the train window, then test the best params on the test window.
    """

    def __init__(
        self,
        param_grid: dict[str, list[float]] | None = None,
        metric: str = "sharpe_ratio",
        cost_model: CostModel | None = None,
    ):
        self.param_grid = param_grid or DEFAULT_PARAM_GRID
        self.metric = metric
        self.cost_model = cost_model or CostModel()

    def _score(self, result: BacktestResult) -> float:
        if self.metric == "sharpe_ratio":
            return result.sharpe_ratio
        if self.metric == "profit_factor":
            return result.profit_factor if result.profit_factor != float("inf") else 10.0
        if self.metric == "win_rate":
            return result.win_rate
        if self.metric == "return":
            return result.total_return_pct
        if self.metric == "calmar":
            if result.max_drawdown_pct == 0:
                return 0.0
            return result.total_return_pct / abs(result.max_drawdown_pct)
        return result.sharpe_ratio

    def optimize(
        self,
        symbol: str,
        prices: np.ndarray,
        base_params: dict | None = None,
    ) -> OptimizationResult:
        keys = list(self.param_grid.keys())
        values = list(self.param_grid.values())
        combos = list(itertools.product(*values))

        best_score = -np.inf
        best_params: dict = {}
        all_results: list[dict] = []

        for combo in combos:
            params = dict(base_params or {})
            params.update(dict(zip(keys, combo)))

            engine = BacktestEngine(
                cost_model=self.cost_model,
                params=params,
            )
            result = engine.run(symbol, prices)
            score = self._score(result)

            entry = {
                "params": params,
                "score": round(score, 4),
                "trades": result.total_trades,
                "win_rate": result.win_rate,
                "sharpe": result.sharpe_ratio,
                "return_pct": result.total_return_pct,
                "max_dd": result.max_drawdown_pct,
            }
            all_results.append(entry)

            if score > best_score and result.total_trades >= 3:
                best_score = score
                best_params = dict(params)

        all_results.sort(key=lambda x: x["score"], reverse=True)

        return OptimizationResult(
            best_params=best_params,
            best_score=round(best_score, 4),
            metric=self.metric,
            total_combinations=len(combos),
            results=all_results[:10],
        )

    def optimize_portfolio(
        self,
        price_dict: dict[str, np.ndarray],
        base_params: dict | None = None,
    ) -> OptimizationResult:
        keys = list(self.param_grid.keys())
        values = list(self.param_grid.values())
        combos = list(itertools.product(*values))

        best_score = -np.inf
        best_params: dict = {}
        all_results: list[dict] = []

        for combo in combos:
            params = dict(base_params or {})
            params.update(dict(zip(keys, combo)))

            scores = []
            total_trades = 0

            for symbol, prices in price_dict.items():
                engine = BacktestEngine(
                    cost_model=self.cost_model,
                    params=params,
                )
                result = engine.run(symbol, prices)
                if result.total_trades >= 2:
                    scores.append(self._score(result))
                    total_trades += result.total_trades

            if not scores:
                continue

            avg_score = float(np.mean(scores))
            entry = {
                "params": params,
                "score": round(avg_score, 4),
                "total_trades": total_trades,
                "tokens_with_trades": len(scores),
            }
            all_results.append(entry)

            if avg_score > best_score:
                best_score = avg_score
                best_params = dict(params)

        all_results.sort(key=lambda x: x["score"], reverse=True)

        return OptimizationResult(
            best_params=best_params,
            best_score=round(best_score, 4),
            metric=self.metric,
            total_combinations=len(combos),
            results=all_results[:10],
        )

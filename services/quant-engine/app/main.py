import os
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv

from app.data.fetchers import fetch_prices, BINANCE_SYMBOL_MAP
from app.data.funding import avg_funding_rate
from app.signals.generator import SignalGenerator
from app.performance.tracker import PaperTradeTracker
from app.trading.binance_futures import BinanceFuturesTestnet, get_futures_symbol
from app.backtest.engine import BacktestEngine, aggregate_results
from app.backtest.costs import CostModel
from app.backtest.walk_forward import WalkForwardValidator, walk_forward_portfolio
from app.calibration.kelly_calibrator import KellyCalibrator
from app.calibration.param_optimizer import ParamOptimizer
from app.portfolio.risk import PortfolioRiskManager

load_dotenv()

def _get_binance_client() -> BinanceFuturesTestnet | None:
    key = os.getenv("BINANCE_TESTNET_API_KEY")
    secret = os.getenv("BINANCE_TESTNET_SECRET")
    if not key or not secret:
        return None
    return BinanceFuturesTestnet(key, secret)

app = FastAPI(
    title="DeepDive Quant Engine",
    description="Mathematical quant signals: Kalman Filter + Ornstein-Uhlenbeck + HMM + Kelly Criterion",
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

cost_model = CostModel()
kelly_calibrator = KellyCalibrator()
signal_generator = SignalGenerator(calibrator=kelly_calibrator, cost_model=cost_model)
paper_tracker = PaperTradeTracker()
portfolio_risk = PortfolioRiskManager()


# ── Request / Response models ──────────────────────────────────────────────

class SignalRequest(BaseModel):
    symbol: str
    coingecko_id: Optional[str] = None
    prices: Optional[list[float]] = None

class BatchSignalRequest(BaseModel):
    tokens: list[SignalRequest]

class OpenTradeRequest(BaseModel):
    symbol: str
    signal: str
    entry_price: float
    position_size_fraction: float
    position_size_usd: Optional[float] = None
    leverage: float = 1.0
    target_price: float
    stop_price: float
    confidence: float
    regime: str

class CloseTradeRequest(BaseModel):
    exit_price: float

class OpenPositionRequest(BaseModel):
    symbol: str
    direction: str
    usdt_allocation: float
    leverage: int = 3
    current_price: float
    target_price: float
    stop_price: float

class PositionStatusRequest(BaseModel):
    futures_symbol: str
    tp_order_id: str
    sl_order_id: str

class BacktestRequest(BaseModel):
    symbols: Optional[list[str]] = None
    days: int = 365
    initial_capital: float = 10_000.0

class WalkForwardRequest(BaseModel):
    symbols: Optional[list[str]] = None
    days: int = 365
    train_days: int = 180
    test_days: int = 60

class OptimizeRequest(BaseModel):
    symbols: Optional[list[str]] = None
    days: int = 365
    metric: str = "sharpe_ratio"

class CalibrateRequest(BaseModel):
    symbols: Optional[list[str]] = None
    days: int = 365


# ── Signal endpoints ──────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "name": "DeepDive Quant Engine",
        "version": "3.0.0",
        "models": ["kalman_filter", "ornstein_uhlenbeck", "hmm_regime", "kelly_criterion"],
        "features": ["backtest", "walk_forward", "param_optimization", "kelly_calibration",
                      "portfolio_risk", "cost_model", "funding_rates", "execution_management"],
        "status": "online",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/api/v1/signal")
async def generate_signal(req: SignalRequest):
    if req.prices and len(req.prices) >= 30:
        prices = np.array(req.prices, dtype=float)
        current_price = req.prices[-1]
    else:
        data = await fetch_prices(req.symbol, req.coingecko_id)
        if not data["success"]:
            raise HTTPException(status_code=422, detail=data["reason"])
        prices = data["prices"]
        current_price = data["current_price"]

    return signal_generator.generate(req.symbol, prices, float(current_price))


@app.post("/api/v1/signals/batch")
async def generate_signals_batch(req: BatchSignalRequest):
    results = []

    price_dict: dict[str, np.ndarray] = {}
    for token_req in req.tokens:
        try:
            if token_req.prices and len(token_req.prices) >= 30:
                prices = np.array(token_req.prices, dtype=float)
            else:
                data = await fetch_prices(token_req.symbol, token_req.coingecko_id)
                if not data["success"]:
                    results.append({"symbol": token_req.symbol, "error": data["reason"], "signal": "HOLD"})
                    continue
                prices = data["prices"]
            price_dict[token_req.symbol] = prices
        except Exception as e:
            results.append({"symbol": token_req.symbol, "error": str(e), "signal": "HOLD"})

    proposed_positions: dict[str, float] = {}

    for symbol, prices in price_dict.items():
        try:
            current_price = float(prices[-1])
            sig = signal_generator.generate(symbol, prices, current_price)
            kelly_frac = sig.get("position", {}).get("kelly_fraction", 0.0)
            if sig.get("signal") in ("BUY", "SELL") and kelly_frac > 0:
                proposed_positions[symbol] = kelly_frac
            results.append(sig)
        except Exception as e:
            results.append({"symbol": symbol, "error": str(e), "signal": "HOLD"})

    if len(proposed_positions) > 1 and len(price_dict) >= 2:
        adjusted = portfolio_risk.apply_constraints(proposed_positions, price_dict)
        for sig in results:
            sym = sig.get("symbol")
            if sym in adjusted and "position" in sig:
                original = sig["position"]["kelly_fraction"]
                new_frac = round(adjusted[sym], 4)
                if new_frac < original:
                    sig["position"]["kelly_fraction"] = new_frac
                    sig["position"]["note"] = (
                        f"Half-Kelly: allocate {new_frac * 100:.1f}% "
                        f"(reduced from {original * 100:.1f}% by portfolio risk constraints)"
                    )
                    sig["position"]["portfolio_constrained"] = True

    return results


# ── Paper trading endpoints ───────────────────────────────────────────────

@app.post("/api/v1/paper-trades", status_code=201)
def open_paper_trade(req: OpenTradeRequest):
    trade = paper_tracker.open_trade(
        symbol=req.symbol,
        signal=req.signal,
        entry_price=req.entry_price,
        position_size=req.position_size_fraction,
        position_size_usd=req.position_size_usd,
        leverage=req.leverage,
        target_price=req.target_price,
        stop_price=req.stop_price,
        confidence=req.confidence,
        regime=req.regime,
    )
    return trade


@app.get("/api/v1/paper-trades")
def list_paper_trades(status: Optional[str] = None):
    return paper_tracker.list_trades(status=status)


@app.get("/api/v1/paper-trades/{trade_id}")
def get_paper_trade(trade_id: str):
    trade = paper_tracker.get_trade(trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail="trade not found")
    return trade


@app.put("/api/v1/paper-trades/{trade_id}/close")
def close_paper_trade(trade_id: str, req: CloseTradeRequest):
    trade = paper_tracker.close_trade(trade_id, req.exit_price)
    if not trade:
        raise HTTPException(status_code=404, detail="trade not found or already closed")
    return trade


@app.get("/api/v1/performance")
def get_performance():
    return paper_tracker.get_metrics()


# ── Live positions ────────────────────────────────────────────────────────

@app.get("/api/v1/positions/live")
async def get_live_positions():
    client = _get_binance_client()
    if not client:
        return {}
    try:
        positions = await client.get_account_positions()
        return {p["symbol"]: p for p in positions}
    except Exception:
        return {}


@app.get("/api/v1/positions/balance")
async def get_balance():
    client = _get_binance_client()
    if not client:
        raise HTTPException(status_code=503, detail="Binance testnet not configured — set BINANCE_TESTNET_API_KEY and BINANCE_TESTNET_SECRET")
    balance = await client.get_balance()
    return {"usdt_balance": balance}


@app.post("/api/v1/positions/open")
async def open_position(req: OpenPositionRequest):
    client = _get_binance_client()
    if not client:
        raise HTTPException(status_code=503, detail="Binance testnet not configured — set BINANCE_TESTNET_API_KEY and BINANCE_TESTNET_SECRET")
    if not get_futures_symbol(req.symbol):
        raise HTTPException(status_code=422, detail=f"No futures pair for {req.symbol}")
    try:
        result = await client.open_position(
            symbol=req.symbol,
            direction=req.direction,
            usdt_allocation=req.usdt_allocation,
            leverage=req.leverage,
            current_price=req.current_price,
            target_price=req.target_price,
            stop_price=req.stop_price,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/positions/status")
async def check_position_status(req: PositionStatusRequest):
    client = _get_binance_client()
    if not client:
        raise HTTPException(status_code=503, detail="Binance testnet not configured")
    try:
        return await client.get_position_status(
            req.futures_symbol, req.tp_order_id, req.sl_order_id
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Backtest & validation endpoints ───────────────────────────────────────

async def _fetch_multi(symbols: list[str], days: int) -> dict[str, np.ndarray]:
    price_dict: dict[str, np.ndarray] = {}
    for sym in symbols:
        data = await fetch_prices(sym)
        if data["success"]:
            price_dict[sym] = data["prices"][-days:]
    return price_dict


def _default_symbols() -> list[str]:
    return [s for s in BINANCE_SYMBOL_MAP if s not in ("WETH", "WBTC")]


@app.post("/api/v1/backtest")
async def run_backtest(req: BacktestRequest):
    """Run full backtest with costs on historical data."""
    symbols = req.symbols or _default_symbols()
    price_dict = await _fetch_multi(symbols, req.days)

    if not price_dict:
        raise HTTPException(status_code=422, detail="No price data available for any symbol")

    engine = BacktestEngine(
        cost_model=cost_model,
        initial_capital=req.initial_capital,
    )

    results = []
    for symbol, prices in price_dict.items():
        result = engine.run(symbol, prices)
        results.append(result)

    agg = aggregate_results(results)
    agg["cost_model"] = {
        "maker_fee": cost_model.maker_fee,
        "taker_fee": cost_model.taker_fee,
        "slippage_bps": cost_model.slippage_bps,
    }
    return agg


@app.post("/api/v1/backtest/walk-forward")
async def run_walk_forward(req: WalkForwardRequest):
    """Anchored walk-forward validation — out-of-sample performance only."""
    symbols = req.symbols or _default_symbols()
    price_dict = await _fetch_multi(symbols, req.days)

    if not price_dict:
        raise HTTPException(status_code=422, detail="No price data available")

    return walk_forward_portfolio(
        price_dict,
        initial_train_days=req.train_days,
        test_days=req.test_days,
    )


@app.post("/api/v1/backtest/optimize")
async def run_optimization(req: OptimizeRequest):
    """Grid search over signal parameters, scored on chosen metric."""
    symbols = req.symbols or _default_symbols()
    price_dict = await _fetch_multi(symbols, req.days)

    if not price_dict:
        raise HTTPException(status_code=422, detail="No price data available")

    optimizer = ParamOptimizer(metric=req.metric, cost_model=cost_model)

    if len(price_dict) == 1:
        sym = list(price_dict.keys())[0]
        return optimizer.optimize(sym, price_dict[sym])
    return optimizer.optimize_portfolio(price_dict)


@app.post("/api/v1/calibrate")
async def run_calibration(req: CalibrateRequest):
    """Run backtest and calibrate Kelly win probabilities from empirical data."""
    symbols = req.symbols or _default_symbols()
    price_dict = await _fetch_multi(symbols, req.days)

    if not price_dict:
        raise HTTPException(status_code=422, detail="No price data available")

    engine = BacktestEngine(cost_model=cost_model)
    all_trades = []

    for symbol, prices in price_dict.items():
        result = engine.run(symbol, prices)
        for t in result.trades:
            all_trades.append({
                "confidence": t.signal_confidence,
                "regime": t.regime,
                "pnl_net": t.pnl_net,
            })

    table = kelly_calibrator.calibrate(all_trades)
    return kelly_calibrator.summary()


@app.get("/api/v1/calibration/status")
def calibration_status():
    return kelly_calibrator.summary()


@app.get("/api/v1/portfolio/risk")
async def portfolio_risk_report():
    """Compute correlation matrix and VaR for the full token universe."""
    symbols = _default_symbols()
    price_dict = await _fetch_multi(symbols, 200)

    if len(price_dict) < 2:
        raise HTTPException(status_code=422, detail="Need at least 2 tokens with price data")

    symbols_list, corr = portfolio_risk.compute_correlation_matrix(price_dict)
    groups = portfolio_risk.identify_correlated_groups(symbols_list, corr)

    return {
        "tokens": len(symbols_list),
        "correlation_matrix": {
            "symbols": symbols_list,
            "matrix": [[round(c, 4) for c in row] for row in corr.tolist()],
        },
        "correlated_groups": [list(g) for g in groups],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

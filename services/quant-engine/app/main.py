import os
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv

from app.data.fetchers import fetch_prices
from app.signals.generator import SignalGenerator
from app.performance.tracker import PaperTradeTracker
from app.trading.binance_futures import BinanceFuturesTestnet, get_futures_symbol

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
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

signal_generator = SignalGenerator()
paper_tracker = PaperTradeTracker()


# ── Request / Response models ──────────────────────────────────────────────

class SignalRequest(BaseModel):
    symbol: str
    coingecko_id: Optional[str] = None
    prices: Optional[list[float]] = None   # optional: caller can pass prices directly


class BatchSignalRequest(BaseModel):
    tokens: list[SignalRequest]


class OpenTradeRequest(BaseModel):
    symbol: str
    signal: str
    entry_price: float
    position_size_fraction: float
    target_price: float
    stop_price: float
    confidence: float
    regime: str


class CloseTradeRequest(BaseModel):
    exit_price: float


class OpenPositionRequest(BaseModel):
    symbol: str
    direction: str          # "LONG" | "SHORT"
    usdt_allocation: float
    leverage: int = 3
    current_price: float
    target_price: float
    stop_price: float


class PositionStatusRequest(BaseModel):
    futures_symbol: str
    tp_order_id: str
    sl_order_id: str


# ── Endpoints ──────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "name": "DeepDive Quant Engine",
        "version": "2.0.0",
        "models": ["kalman_filter", "ornstein_uhlenbeck", "hmm_regime", "kelly_criterion"],
        "status": "online",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/api/v1/signal")
async def generate_signal(req: SignalRequest):
    """Generate a full quant signal for a single token."""
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
    """Generate signals for multiple tokens (portfolio scan)."""
    results = []
    for token_req in req.tokens:
        try:
            signal = await generate_signal(token_req)
            results.append(signal)
        except HTTPException as e:
            results.append({"symbol": token_req.symbol, "error": e.detail, "signal": "HOLD"})
        except Exception as e:
            results.append({"symbol": token_req.symbol, "error": str(e), "signal": "HOLD"})
    return results


@app.post("/api/v1/paper-trades", status_code=201)
def open_paper_trade(req: OpenTradeRequest):
    """Record a new paper trade triggered by a signal."""
    trade = paper_tracker.open_trade(
        symbol=req.symbol,
        signal=req.signal,
        entry_price=req.entry_price,
        position_size=req.position_size_fraction,
        target_price=req.target_price,
        stop_price=req.stop_price,
        confidence=req.confidence,
        regime=req.regime,
    )
    return trade


@app.get("/api/v1/paper-trades")
def list_paper_trades(status: Optional[str] = None):
    """List all paper trades, optionally filtered by status."""
    return paper_tracker.list_trades(status=status)


@app.get("/api/v1/paper-trades/{trade_id}")
def get_paper_trade(trade_id: str):
    trade = paper_tracker.get_trade(trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail="trade not found")
    return trade


@app.put("/api/v1/paper-trades/{trade_id}/close")
def close_paper_trade(trade_id: str, req: CloseTradeRequest):
    """Close a paper trade and calculate P&L."""
    trade = paper_tracker.close_trade(trade_id, req.exit_price)
    if not trade:
        raise HTTPException(status_code=404, detail="trade not found or already closed")
    return trade


@app.get("/api/v1/performance")
def get_performance():
    """Aggregate performance metrics: win rate, Sharpe, max drawdown, equity curve."""
    return paper_tracker.get_metrics()


@app.get("/api/v1/positions/live")
async def get_live_positions():
    """Returns all open Binance Futures positions keyed by symbol, with unrealizedProfit."""
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

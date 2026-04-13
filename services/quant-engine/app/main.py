from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import os
from dotenv import load_dotenv

from app.models.whale_signals import (
    WhaleTransaction,
    WhaleSignal,
    analyze_whale_activity,
)

load_dotenv()

app = FastAPI(
    title="DeepDive Quant Engine",
    description="Quantitative analysis engine for copy trading",
    version="0.1.0",
)

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Pydantic models
class WalletAddress(BaseModel):
    address: str
    chainId: int


class WalletPerformance(BaseModel):
    address: str
    totalTrades: int
    winRate: float  # Percentage
    avgProfitPercent: float
    sharpeRatio: Optional[float] = None
    maxDrawdown: Optional[float] = None
    profitFactor: Optional[float] = None


class CopyTradeSignal(BaseModel):
    walletAddress: str
    tokenIn: str
    tokenOut: str
    amountIn: str
    confidence: float  # 0-1 score
    reasoning: str


@app.get("/")
def read_root():
    return {
        "name": "DeepDive Quant Engine",
        "status": "online",
        "version": "0.1.0",
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.post("/api/v1/analyze-wallet", response_model=WalletPerformance)
async def analyze_wallet(wallet: WalletAddress):
    """
    Analyze the historical performance of a wallet address
    Returns win rate, profit metrics, and risk-adjusted returns
    """
    # TODO: Implement wallet analysis logic
    # - Fetch historical trades from the database
    # - Calculate win rate (profitable vs unprofitable trades)
    # - Calculate Sharpe ratio, max drawdown, profit factor
    # - Return performance metrics

    # Placeholder response
    return WalletPerformance(
        address=wallet.address,
        totalTrades=0,
        winRate=0.0,
        avgProfitPercent=0.0,
        sharpeRatio=None,
        maxDrawdown=None,
        profitFactor=None,
    )


@app.post("/api/v1/signals", response_model=List[CopyTradeSignal])
async def generate_signals(wallets: List[WalletAddress]):
    """
    Generate copy trade signals based on tracked wallet activity
    Returns a list of recommended trades to copy
    """
    # TODO: Implement signal generation logic
    # - Monitor recent transactions from tracked wallets
    # - Apply filters (min confidence, min wallet performance)
    # - Rank signals by wallet performance + signal strength
    # - Return top signals

    # Placeholder response
    return []


@app.post("/api/v1/backtest")
async def backtest_strategy(
    walletAddress: str,
    startDate: str,
    endDate: str,
    initialCapital: float = 10000.0,
):
    """
    Backtest a copy trading strategy for a specific wallet
    Returns hypothetical performance if all trades were copied
    """
    # TODO: Implement backtesting logic
    # - Fetch all wallet trades in date range
    # - Simulate copying each trade with slippage/fees
    # - Calculate cumulative returns, drawdowns
    # - Return backtest results

    return {
        "wallet": walletAddress,
        "startDate": startDate,
        "endDate": endDate,
        "initialCapital": initialCapital,
        "finalValue": initialCapital,  # Placeholder
        "totalReturn": 0.0,
        "sharpeRatio": 0.0,
        "maxDrawdown": 0.0,
        "trades": 0,
    }


class WhaleActivityRequest(BaseModel):
    """Request body for whale signal analysis"""

    tokenAddress: str
    chainId: int
    buyTransactions: List[WhaleTransaction]
    sellTransactions: List[WhaleTransaction]
    timeWindowHours: int = 24


@app.post("/api/v1/whale-signals", response_model=Optional[WhaleSignal])
async def analyze_whale_signals(request: WhaleActivityRequest):
    """
    Analyze whale activity for a specific token.

    Detects accumulation/distribution patterns when multiple whales
    buy or sell the same token within a time window.

    Returns:
        WhaleSignal if significant pattern detected, None otherwise
    """
    try:
        signal = analyze_whale_activity(
            buy_transactions=request.buyTransactions,
            sell_transactions=request.sellTransactions,
            time_window_hours=request.timeWindowHours,
        )

        return signal

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Signal analysis failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)

from __future__ import annotations

import numpy as np
import httpx
from typing import Optional

BINANCE_BASE = "https://api.binance.com/api/v3"
COINGECKO_BASE = "https://api.coingecko.com/api/v3"

# Known stablecoins — no signal needed
STABLECOINS = {"USDC", "USDT", "DAI", "BUSD", "FRAX", "LUSD", "USDD"}

BINANCE_SYMBOL_MAP: dict[str, str | None] = {
    # Wrapped / aliased tokens
    "WETH": "ETHUSDT",
    "WBTC": "BTCUSDT",
    "POL":  "POLUSDT",
    # Top 20 by market cap
    "BTC":  "BTCUSDT",
    "ETH":  "ETHUSDT",
    "BNB":  "BNBUSDT",
    "SOL":  "SOLUSDT",
    "XRP":  "XRPUSDT",
    "ADA":  "ADAUSDT",
    "DOGE": "DOGEUSDT",
    "AVAX": "AVAXUSDT",
    "DOT":  "DOTUSDT",
    "MATIC":"MATICUSDT",
    "LINK": "LINKUSDT",
    "UNI":  "UNIUSDT",
    "LTC":  "LTCUSDT",
    "ATOM": "ATOMUSDT",
    "NEAR": "NEARUSDT",
    "ARB":  "ARBUSDT",
    "OP":   "OPUSDT",
    "AAVE": "AAVEUSDT",
    "MKR":  "MKRUSDT",
    "INJ":  "INJUSDT",
    # Other DeFi
    "CRV":  "CRVUSDT",
    "SNX":  "SNXUSDT",
    "COMP": "COMPUSDT",
    "LDO":  "LDOUSDT",
    "RPL":  "RPLUSDT",
}


def _binance_symbol(symbol: str) -> str | None:
    upper = symbol.upper()
    if upper in STABLECOINS:
        return None
    return BINANCE_SYMBOL_MAP.get(upper, f"{upper}USDT")


async def _fetch_binance_ohlcv(symbol: str, limit: int = 200) -> np.ndarray | None:
    binance_sym = _binance_symbol(symbol)
    if binance_sym is None:
        return None
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(
                f"{BINANCE_BASE}/klines",
                params={"symbol": binance_sym, "interval": "1d", "limit": limit},
            )
            resp.raise_for_status()
            return np.array([float(c[4]) for c in resp.json()])
        except Exception:
            return None


async def _fetch_binance_price(symbol: str) -> float | None:
    binance_sym = _binance_symbol(symbol)
    if binance_sym is None:
        return 1.0
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.get(f"{BINANCE_BASE}/ticker/price", params={"symbol": binance_sym})
            resp.raise_for_status()
            return float(resp.json()["price"])
        except Exception:
            return None


async def _fetch_coingecko_ohlcv(coingecko_id: str, days: int = 90) -> np.ndarray | None:
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(
                f"{COINGECKO_BASE}/coins/{coingecko_id}/ohlc",
                params={"vs_currency": "usd", "days": str(days)},
            )
            resp.raise_for_status()
            data = resp.json()
            if not data:
                return None
            return np.array([float(c[4]) for c in data])
        except Exception:
            return None


async def fetch_prices(symbol: str, coingecko_id: Optional[str] = None) -> dict:
    """
    Fetch price history for a token.
    Tries Binance first (faster, higher limits), falls back to CoinGecko.
    Returns: {success, prices (np.ndarray), current_price, source, data_points}
    """
    if symbol.upper() in STABLECOINS:
        return {"success": False, "reason": "stablecoin — no signal generated"}

    prices = await _fetch_binance_ohlcv(symbol)
    current_price = await _fetch_binance_price(symbol)
    source = "binance"

    if prices is None and coingecko_id:
        prices = await _fetch_coingecko_ohlcv(coingecko_id)
        source = "coingecko"

    if prices is None or len(prices) < 30:
        return {"success": False, "reason": f"insufficient price data for {symbol} (need 30+ days)"}

    if current_price is None:
        current_price = float(prices[-1])

    return {
        "success": True,
        "prices": prices,
        "current_price": current_price,
        "source": source,
        "data_points": len(prices),
    }

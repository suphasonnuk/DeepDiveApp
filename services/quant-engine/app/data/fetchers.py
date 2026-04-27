from __future__ import annotations

import numpy as np
import httpx
from typing import Optional

BINANCE_BASE = "https://api.binance.com/api/v3"
BINANCE_FUTURES_BASE = "https://fapi.binance.com/fapi/v1"
COINGECKO_BASE = "https://api.coingecko.com/api/v3"

# Known stablecoins — no signal needed
STABLECOINS = {"USDC", "USDT", "DAI", "BUSD", "FRAX", "LUSD", "USDD"}

BINANCE_SYMBOL_MAP: dict[str, str | None] = {
    # Wrapped / aliased tokens
    "WETH": "ETHUSDT",
    "WBTC": "BTCUSDT",
    # CoinMarketCap top 30 non-stablecoin (April 2026), Binance spot only.
    # Excluded (no spot pair): LEO, XMR, CC, M, CRO, MNT.
    # HYPE has no Binance spot — uses CoinGecko for OHLCV (see COINGECKO_ONLY_MAP).
    "BTC":  "BTCUSDT",
    "ETH":  "ETHUSDT",
    "XRP":  "XRPUSDT",
    "BNB":  "BNBUSDT",
    "SOL":  "SOLUSDT",
    "TRX":  "TRXUSDT",
    "DOGE": "DOGEUSDT",
    "BCH":  "BCHUSDT",
    "ADA":  "ADAUSDT",
    "LINK": "LINKUSDT",
    "XLM":  "XLMUSDT",
    "ZEC":  "ZECUSDT",
    "LTC":  "LTCUSDT",
    "AVAX": "AVAXUSDT",
    "HBAR": "HBARUSDT",
    "SUI":  "SUIUSDT",
    "SHIB": "SHIBUSDT",
    "TON":  "TONUSDT",
    "TAO":  "TAOUSDT",
    "WLFI": "WLFIUSDT",
    "UNI":  "UNIUSDT",
    "DOT":  "DOTUSDT",
    "SKY":  "SKYUSDT",
}

COINGECKO_ONLY_MAP: dict[str, str] = {
    "HYPE": "hyperliquid",
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


FUTURES_SYMBOL_MAP: dict[str, str] = {
    "HYPE": "HYPEUSDT",
}


async def _fetch_binance_futures_price(symbol: str) -> float | None:
    """Real-time price from Binance Futures (for tokens without a spot pair)."""
    futures_sym = FUTURES_SYMBOL_MAP.get(symbol.upper())
    if not futures_sym:
        return None
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.get(f"{BINANCE_FUTURES_BASE}/ticker/price", params={"symbol": futures_sym})
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


async def _fetch_coingecko_market_chart(coingecko_id: str, days: int = 200) -> tuple[np.ndarray | None, float | None]:
    """Fetch daily close prices + current price via CoinGecko market_chart endpoint."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(
                f"{COINGECKO_BASE}/coins/{coingecko_id}/market_chart",
                params={"vs_currency": "usd", "days": str(days), "interval": "daily"},
            )
            resp.raise_for_status()
            data = resp.json()
            raw_prices = data.get("prices", [])
            if not raw_prices or len(raw_prices) < 30:
                return None, None
            closes = np.array([float(p[1]) for p in raw_prices])
            current = float(raw_prices[-1][1])
            return closes, current
        except Exception:
            return None, None


async def fetch_prices(symbol: str, coingecko_id: Optional[str] = None) -> dict:
    """
    Fetch price history for a token.
    CoinGecko-only tokens (HYPE etc.) go straight to CoinGecko market_chart.
    All others try Binance first, fall back to CoinGecko OHLC.
    Returns: {success, prices (np.ndarray), current_price, source, data_points}
    """
    upper = symbol.upper()
    if upper in STABLECOINS:
        return {"success": False, "reason": "stablecoin — no signal generated"}

    cg_id = coingecko_id or COINGECKO_ONLY_MAP.get(upper)

    if upper in COINGECKO_ONLY_MAP:
        prices, cg_price = await _fetch_coingecko_market_chart(cg_id)
        if prices is None or len(prices) < 30:
            return {"success": False, "reason": f"insufficient CoinGecko data for {symbol}"}
        futures_price = await _fetch_binance_futures_price(upper)
        current_price = futures_price or cg_price
        return {
            "success": True,
            "prices": prices,
            "current_price": current_price,
            "source": "coingecko+futures" if futures_price else "coingecko",
            "data_points": len(prices),
        }

    prices = await _fetch_binance_ohlcv(symbol)
    current_price = await _fetch_binance_price(symbol)
    source = "binance"

    if prices is None and cg_id:
        prices = await _fetch_coingecko_ohlcv(cg_id)
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

from __future__ import annotations

import hashlib
import hmac
import math
import time
from typing import Optional

import httpx

TESTNET_BASE = "https://testnet.binancefutures.com"

SYMBOL_MAP: dict[str, str] = {
    # Wrapped / aliased
    "BTC": "BTCUSDT", "WBTC": "BTCUSDT",
    "ETH": "ETHUSDT", "WETH": "ETHUSDT",
    # CoinMarketCap top 20 non-stablecoin (April 2026)
    "BNB":  "BNBUSDT",
    "SOL":  "SOLUSDT",
    "XRP":  "XRPUSDT",
    "DOGE": "DOGEUSDT",
    "TON":  "TONUSDT",
    "ADA":  "ADAUSDT",
    "TRX":  "TRXUSDT",
    "AVAX": "AVAXUSDT",
    "SHIB": "SHIBUSDT",
    "LINK": "LINKUSDT",
    "BCH":  "BCHUSDT",
    "DOT":  "DOTUSDT",
    "SUI":  "SUIUSDT",
    "LTC":  "LTCUSDT",
    "NEAR": "NEARUSDT",
    "UNI":  "UNIUSDT",
    "HBAR": "HBARUSDT",
    "APT":  "APTUSDT",
    # Extended
    "ATOM": "ATOMUSDT",
    "ARB":  "ARBUSDT",
    "OP":   "OPUSDT",
    "AAVE": "AAVEUSDT",
    "MKR":  "MKRUSDT",
    "INJ":  "INJUSDT",
    "CRV":  "CRVUSDT",
    "SNX":  "SNXUSDT",
    "COMP": "COMPUSDT",
    "LDO":  "LDOUSDT",
}


def get_futures_symbol(symbol: str) -> str | None:
    return SYMBOL_MAP.get(symbol.upper())


class BinanceFuturesTestnet:
    def __init__(self, api_key: str, api_secret: str):
        self.api_key = api_key
        self.api_secret = api_secret
        self._lot_cache: dict[str, dict] = {}

    def _sign(self, query_string: str) -> str:
        return hmac.new(
            self.api_secret.encode("utf-8"),
            query_string.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    def _build_signed_url(self, path: str, params: dict) -> str:
        # Build query string in insertion order, sign it, then append signature.
        # Never let the HTTP client re-serialize params — Binance validates the
        # signature against the exact transmitted query string.
        params["timestamp"] = int(time.time() * 1000)
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{TESTNET_BASE}{path}?{qs}&signature={self._sign(qs)}"

    def _headers(self) -> dict:
        return {"X-MBX-APIKEY": self.api_key}

    async def _get(self, path: str, params: dict | None = None, signed: bool = False) -> dict | list:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if signed:
                url = self._build_signed_url(path, dict(params or {}))
                resp = await client.get(url, headers=self._headers())
            else:
                resp = await client.get(
                    f"{TESTNET_BASE}{path}", params=params or {}, headers=self._headers()
                )
            resp.raise_for_status()
            return resp.json()

    async def _post(self, path: str, params: dict) -> dict:
        url = self._build_signed_url(path, dict(params))
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=self._headers())
            resp.raise_for_status()
            return resp.json()

    async def _delete(self, path: str, params: dict) -> dict:
        url = self._build_signed_url(path, dict(params))
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.delete(url, headers=self._headers())
            resp.raise_for_status()
            return resp.json()

    async def get_balance(self) -> float:
        account = await self._get("/fapi/v2/balance", signed=True)
        for asset in account:
            if asset["asset"] == "USDT":
                return float(asset["availableBalance"])
        return 0.0

    async def get_account_positions(self) -> list[dict]:
        """Returns all positions with non-zero size from Binance Futures, including unrealized P&L."""
        positions = await self._get("/fapi/v2/positionRisk", signed=True)
        return [p for p in positions if abs(float(p.get("positionAmt", 0))) > 0]

    async def _get_lot_info(self, futures_symbol: str) -> dict:
        if futures_symbol in self._lot_cache:
            return self._lot_cache[futures_symbol]
        info = await self._get("/fapi/v1/exchangeInfo")
        for s in info["symbols"]:
            if s["symbol"] != futures_symbol:
                continue
            lot = {"min_qty": 0.001, "step_size": 0.001, "qty_precision": 3, "price_precision": 2}
            for f in s["filters"]:
                if f["filterType"] == "LOT_SIZE":
                    step = f["stepSize"]
                    lot["min_qty"] = float(f["minQty"])
                    lot["step_size"] = float(step)
                    lot["qty_precision"] = len(step.rstrip("0").split(".")[-1]) if "." in step else 0
                if f["filterType"] == "PRICE_FILTER":
                    tick = f["tickSize"]
                    lot["price_precision"] = len(tick.rstrip("0").split(".")[-1]) if "." in tick else 0
            self._lot_cache[futures_symbol] = lot
            return lot
        return {"min_qty": 0.001, "step_size": 0.001, "qty_precision": 3, "price_precision": 2}

    def _round_qty(self, qty: float, step_size: float, precision: int) -> float:
        steps = math.floor(qty / step_size)
        return round(steps * step_size, precision)

    async def set_leverage(self, futures_symbol: str, leverage: int) -> None:
        await self._post("/fapi/v1/leverage", {"symbol": futures_symbol, "leverage": leverage})

    async def open_position(
        self,
        symbol: str,
        direction: str,
        usdt_allocation: float,
        leverage: int,
        current_price: float,
        target_price: float,
        stop_price: float,
    ) -> dict:
        futures_symbol = get_futures_symbol(symbol)
        if not futures_symbol:
            raise ValueError(f"No futures pair mapped for {symbol}")

        lot = await self._get_lot_info(futures_symbol)
        price_precision = lot["price_precision"]

        notional = usdt_allocation * leverage
        raw_qty = notional / current_price
        qty = self._round_qty(raw_qty, lot["step_size"], lot["qty_precision"])
        if qty < lot["min_qty"]:
            qty = lot["min_qty"]

        side = "BUY" if direction == "LONG" else "SELL"
        close_side = "SELL" if direction == "LONG" else "BUY"
        tp_price = round(target_price, price_precision)
        sl_price = round(stop_price, price_precision)

        await self.set_leverage(futures_symbol, leverage)

        entry = await self._post("/fapi/v1/order", {
            "symbol": futures_symbol,
            "side": side,
            "type": "MARKET",
            "quantity": qty,
        })

        tp = await self._post("/fapi/v1/order", {
            "symbol": futures_symbol,
            "side": close_side,
            "type": "TAKE_PROFIT_MARKET",
            "stopPrice": tp_price,
            "closePosition": "true",
            "timeInForce": "GTE_GTC",
        })

        sl = await self._post("/fapi/v1/order", {
            "symbol": futures_symbol,
            "side": close_side,
            "type": "STOP_MARKET",
            "stopPrice": sl_price,
            "closePosition": "true",
            "timeInForce": "GTE_GTC",
        })

        return {
            "futures_symbol": futures_symbol,
            "direction": direction,
            "quantity": qty,
            "position_size_usdt": round(usdt_allocation, 2),
            "leverage": leverage,
            "entry_price": current_price,
            "target_price": tp_price,
            "stop_price": sl_price,
            "entry_order_id": str(entry["orderId"]),
            "tp_order_id": str(tp["orderId"]),
            "sl_order_id": str(sl["orderId"]),
        }

    async def get_order_status(self, futures_symbol: str, order_id: str) -> dict:
        return await self._get(
            "/fapi/v1/order",
            {"symbol": futures_symbol, "orderId": order_id},
            signed=True,
        )

    async def get_position_status(
        self, futures_symbol: str, tp_order_id: str, sl_order_id: str
    ) -> dict:
        tp = await self.get_order_status(futures_symbol, tp_order_id)
        if tp["status"] == "FILLED":
            return {"closed": True, "reason": "target_hit", "exit_price": float(tp["avgPrice"])}

        sl = await self.get_order_status(futures_symbol, sl_order_id)
        if sl["status"] == "FILLED":
            return {"closed": True, "reason": "stop_hit", "exit_price": float(sl["avgPrice"])}

        return {"closed": False, "tp_status": tp["status"], "sl_status": sl["status"]}

    async def cancel_orders(self, futures_symbol: str, *order_ids: str) -> None:
        for order_id in order_ids:
            try:
                await self._delete("/fapi/v1/order", {
                    "symbol": futures_symbol, "orderId": order_id
                })
            except Exception:
                pass

from __future__ import annotations

import numpy as np
import httpx
from datetime import datetime, timezone, timedelta

FAPI_BASE = "https://fapi.binance.com"


async def fetch_current_funding_rate(futures_symbol: str) -> float | None:
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.get(
                f"{FAPI_BASE}/fapi/v1/premiumIndex",
                params={"symbol": futures_symbol},
            )
            resp.raise_for_status()
            return float(resp.json()["lastFundingRate"])
        except Exception:
            return None


async def fetch_funding_history(
    futures_symbol: str,
    days: int = 90,
) -> list[dict]:
    start_ms = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp() * 1000)
    records: list[dict] = []

    async with httpx.AsyncClient(timeout=15.0) as client:
        cursor = start_ms
        while True:
            try:
                resp = await client.get(
                    f"{FAPI_BASE}/fapi/v1/fundingRate",
                    params={
                        "symbol": futures_symbol,
                        "startTime": cursor,
                        "limit": 1000,
                    },
                )
                resp.raise_for_status()
                batch = resp.json()
                if not batch:
                    break
                records.extend(batch)
                cursor = batch[-1]["fundingTime"] + 1
                if len(batch) < 1000:
                    break
            except Exception:
                break

    return records


async def avg_funding_rate(futures_symbol: str, days: int = 30) -> float:
    history = await fetch_funding_history(futures_symbol, days=days)
    if not history:
        return 0.0001  # default assumption: 0.01% per 8h (neutral)
    rates = [float(r["fundingRate"]) for r in history]
    return float(np.mean(np.abs(rates)))

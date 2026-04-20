import { NextResponse } from "next/server";
import { db, autoPositions, eq } from "@deepdive/db";

const QUANT_ENGINE_URL = process.env.QUANT_ENGINE_URL ?? "http://localhost:8000";

export async function POST() {
  const openPositions = await db
    .select()
    .from(autoPositions)
    .where(eq(autoPositions.status, "open"));

  // Fetch live Binance positions once — keyed by futures symbol — to get unrealized P&L.
  const liveRes = await fetch(`${QUANT_ENGINE_URL}/api/v1/positions/live`).catch(() => null);
  const liveBySymbol: Record<string, Record<string, string>> =
    liveRes?.ok ? await liveRes.json() : {};

  const closed: string[] = [];
  const liveUpdated: string[] = [];

  for (const pos of openPositions) {
    if (!pos.tpOrderId || !pos.slOrderId || !pos.futuresSymbol) continue;

    // Check whether TP or SL order has been filled on Binance.
    const statusRes = await fetch(`${QUANT_ENGINE_URL}/api/v1/positions/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        futures_symbol: pos.futuresSymbol,
        tp_order_id: pos.tpOrderId,
        sl_order_id: pos.slOrderId,
      }),
    }).catch(() => null);

    if (!statusRes?.ok) continue;

    const status = await statusRes.json();

    if (status.closed) {
      const exitPrice = status.exit_price as number;
      const priceDiff =
        pos.direction === "LONG"
          ? (exitPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - exitPrice) / pos.entryPrice;
      const pnlPct = Math.round(priceDiff * pos.leverage * 10000) / 100;
      const pnlUsdt = Math.round(priceDiff * pos.leverage * pos.positionSizeUsdt * 100) / 100;

      await db
        .update(autoPositions)
        .set({
          status: status.reason === "target_hit" ? "closed_tp" : "closed_sl",
          exitPrice,
          pnlUsdt,
          pnlPct,
          closeReason: status.reason,
          closedAt: new Date(),
          openSlot: null,  // release the unique slot so a new position can open for this coin
        })
        .where(eq(autoPositions.id, pos.id));

      closed.push(pos.symbol);
    } else {
      // Position still open — update with live unrealized P&L from Binance.
      const live = liveBySymbol[pos.futuresSymbol];
      if (live) {
        const unrealizedPnlUsdt = Math.round(parseFloat(live.unrealizedProfit) * 100) / 100;
        const unrealizedPnlPct =
          pos.positionSizeUsdt > 0
            ? Math.round((unrealizedPnlUsdt / pos.positionSizeUsdt) * 10000) / 100
            : 0;

        await db
          .update(autoPositions)
          .set({ pnlUsdt: unrealizedPnlUsdt, pnlPct: unrealizedPnlPct })
          .where(eq(autoPositions.id, pos.id));

        liveUpdated.push(pos.symbol);
      }
    }
  }

  return NextResponse.json({ synced: closed.length, closed, liveUpdated });
}

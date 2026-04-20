import { NextResponse } from "next/server";
import { db, autoPositions, eq } from "@deepdive/db";

const QUANT_ENGINE_URL = process.env.QUANT_ENGINE_URL ?? "http://localhost:8000";

export async function POST() {
  const openPositions = await db
    .select()
    .from(autoPositions)
    .where(eq(autoPositions.status, "open"));

  const updated: string[] = [];

  for (const pos of openPositions) {
    if (!pos.tpOrderId || !pos.slOrderId || !pos.futuresSymbol) continue;

    const res = await fetch(`${QUANT_ENGINE_URL}/api/v1/positions/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        futures_symbol: pos.futuresSymbol,
        tp_order_id: pos.tpOrderId,
        sl_order_id: pos.slOrderId,
      }),
    }).catch(() => null);

    if (!res?.ok) continue;

    const status = await res.json();
    if (!status.closed) continue;

    const exitPrice = status.exit_price as number;
    const priceDiff = pos.direction === "LONG"
      ? (exitPrice - pos.entryPrice) / pos.entryPrice
      : (pos.entryPrice - exitPrice) / pos.entryPrice;
    const pnlPct = Math.round(priceDiff * pos.leverage * 10000) / 100;
    const pnlUsdt = Math.round(priceDiff * pos.leverage * pos.positionSizeUsdt * 100) / 100;

    await db.update(autoPositions).set({
      status: status.reason === "target_hit" ? "closed_tp" : "closed_sl",
      exitPrice,
      pnlUsdt,
      pnlPct,
      closeReason: status.reason,
      closedAt: new Date(),
    }).where(eq(autoPositions.id, pos.id));

    updated.push(pos.symbol);
  }

  return NextResponse.json({ synced: updated.length, symbols: updated });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@deepdive/db";
import { paperTrades } from "@deepdive/db";
import { eq } from "drizzle-orm";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tradeId = parseInt(id);

  if (isNaN(tradeId)) {
    return NextResponse.json({ error: "Invalid trade ID" }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(paperTrades)
    .where(eq(paperTrades.id, tradeId))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }
  if (existing.status !== "open") {
    return NextResponse.json({ error: "Trade already closed" }, { status: 409 });
  }

  const { exitPrice } = await request.json();
  if (typeof exitPrice !== "number" || exitPrice <= 0) {
    return NextResponse.json({ error: "Valid exitPrice required" }, { status: 400 });
  }

  const pnlPct =
    existing.signal === "BUY"
      ? ((exitPrice - existing.entryPrice) / existing.entryPrice) * 100
      : ((existing.entryPrice - exitPrice) / existing.entryPrice) * 100;

  let status: string;
  if (existing.signal === "BUY") {
    if (exitPrice >= existing.targetPrice) status = "closed_target";
    else if (exitPrice <= existing.stopPrice) status = "closed_stop";
    else status = pnlPct > 0 ? "closed_profit" : "closed_loss";
  } else {
    if (exitPrice <= existing.targetPrice) status = "closed_target";
    else if (exitPrice >= existing.stopPrice) status = "closed_stop";
    else status = pnlPct > 0 ? "closed_profit" : "closed_loss";
  }

  const [updated] = await db
    .update(paperTrades)
    .set({
      exitPrice,
      pnlPct: Math.round(pnlPct * 10000) / 10000,
      status,
      closedAt: new Date(),
    })
    .where(eq(paperTrades.id, tradeId))
    .returning();

  return NextResponse.json(updated);
}

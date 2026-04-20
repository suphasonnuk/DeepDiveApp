import { NextRequest, NextResponse } from "next/server";
import { db } from "@deepdive/db";
import { paperTrades } from "@deepdive/db";
import { desc, eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);

  const rows = await db
    .select()
    .from(paperTrades)
    .where(status ? eq(paperTrades.status, status) : undefined)
    .orderBy(desc(paperTrades.openedAt))
    .limit(limit);

  return NextResponse.json({ trades: rows, total: rows.length });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const [trade] = await db
    .insert(paperTrades)
    .values({
      signalId: body.signalId ?? null,
      symbol: body.symbol,
      signal: body.signal,
      entryPrice: body.entryPrice,
      positionSizeFraction: body.positionSizeFraction,
      targetPrice: body.targetPrice,
      stopPrice: body.stopPrice,
      confidence: body.confidence,
      regime: body.regime,
      status: "open",
    })
    .returning();

  return NextResponse.json(trade, { status: 201 });
}

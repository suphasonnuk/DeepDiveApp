import { NextRequest, NextResponse } from "next/server";
import { db, portfolio, paperTrades, eq, sql } from "@deepdive/db";

const INITIAL_BALANCE = 1000;

async function getOrInitPortfolio() {
  const rows = await db.select().from(portfolio).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db.insert(portfolio).values({ balanceUsd: INITIAL_BALANCE }).returning();
  return created;
}

export async function GET() {
  const port = await getOrInitPortfolio();

  // Available balance = total balance minus margin reserved by open trades
  const openTrades = await db
    .select({ marginUsed: paperTrades.marginUsed })
    .from(paperTrades)
    .where(eq(paperTrades.status, "open"));

  const reservedMargin = openTrades.reduce((sum, t) => sum + (t.marginUsed ?? 0), 0);
  const availableUsd = Math.max(port.balanceUsd - reservedMargin, 0);

  // Unrealized P&L is computed by the trades list endpoint; we return totals here
  const closedTrades = await db
    .select({ pnlUsd: paperTrades.pnlUsd })
    .from(paperTrades)
    .where(sql`${paperTrades.status} != 'open' AND ${paperTrades.pnlUsd} IS NOT NULL`);

  const realizedPnlUsd = closedTrades.reduce((sum, t) => sum + (t.pnlUsd ?? 0), 0);

  return NextResponse.json({
    balanceUsd: port.balanceUsd,
    availableUsd: Math.round(availableUsd * 100) / 100,
    reservedMarginUsd: Math.round(reservedMargin * 100) / 100,
    realizedPnlUsd: Math.round(realizedPnlUsd * 100) / 100,
    initialBalance: INITIAL_BALANCE,
  });
}

// Reset portfolio balance (e.g., start fresh)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const newBalance = typeof body.balanceUsd === "number" && body.balanceUsd > 0
    ? body.balanceUsd
    : INITIAL_BALANCE;

  const port = await getOrInitPortfolio();
  const [updated] = await db
    .update(portfolio)
    .set({ balanceUsd: newBalance, updatedAt: new Date() })
    .where(eq(portfolio.id, port.id))
    .returning();

  return NextResponse.json({ balanceUsd: updated.balanceUsd });
}

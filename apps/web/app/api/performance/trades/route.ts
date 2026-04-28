import { NextRequest, NextResponse } from "next/server";
import { db, portfolio, paperTrades, eq, sql } from "@deepdive/db";
import { desc } from "@deepdive/db";

async function getBinanceSpotPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}USDT`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return parseFloat(data.price);
  } catch {
    return null;
  }
}

async function getPortfolioBalance(): Promise<number> {
  const rows = await db.select().from(portfolio).limit(1);
  if (rows.length > 0) return rows[0].balanceUsd;
  const [created] = await db.insert(portfolio).values({ balanceUsd: 1000 }).returning();
  return created.balanceUsd;
}

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

  // Fetch current spot prices for open trades to compute unrealized P&L
  const openRows = rows.filter((t) => t.status === "open");
  const uniqueSymbols = [...new Set(openRows.map((t) => t.symbol))];
  const priceMap: Record<string, number | null> = {};
  await Promise.all(
    uniqueSymbols.map(async (sym) => { priceMap[sym] = await getBinanceSpotPrice(sym); })
  );

  const trades = rows.map((t) => {
    if (t.status !== "open") return { ...t, currentPrice: null, unrealizedPnlPct: null, unrealizedPnlUsd: null };
    const current = priceMap[t.symbol];
    if (current == null) return { ...t, currentPrice: null, unrealizedPnlPct: null, unrealizedPnlUsd: null };
    const pct = t.signal === "BUY"
      ? ((current - t.entryPrice) / t.entryPrice) * 100
      : ((t.entryPrice - current) / t.entryPrice) * 100;
    const unrealizedPnlPct = Math.round(pct * 100) / 100;
    const unrealizedPnlUsd = t.positionSizeUsd != null
      ? Math.round((pct / 100) * t.positionSizeUsd * 100) / 100
      : null;
    return { ...t, currentPrice: current, unrealizedPnlPct, unrealizedPnlUsd };
  });

  return NextResponse.json({ trades, total: trades.length });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const balanceUsd = await getPortfolioBalance();
  const kellyFraction: number = body.positionSizeFraction || 0.02;
  const leverage: number = body.leverage ?? 1.0;
  const positionSizeUsd = Math.round(balanceUsd * kellyFraction * 100) / 100;
  const marginUsed = Math.round((positionSizeUsd / leverage) * 100) / 100;

  const [trade] = await db
    .insert(paperTrades)
    .values({
      signalId: body.signalId ?? null,
      symbol: body.symbol,
      signal: body.signal,
      entryPrice: body.entryPrice,
      positionSizeFraction: kellyFraction,
      positionSizeUsd,
      leverage,
      marginUsed,
      targetPrice: body.targetPrice,
      stopPrice: body.stopPrice,
      confidence: body.confidence,
      regime: body.regime,
      status: "open",
    })
    .returning();

  return NextResponse.json(trade, { status: 201 });
}

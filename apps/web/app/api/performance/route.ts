import { NextResponse } from "next/server";
import { db, portfolio, paperTrades, sql } from "@deepdive/db";

export async function GET() {
  const [trades, portRows] = await Promise.all([
    db.select().from(paperTrades),
    db.select().from(portfolio).limit(1),
  ]);

  const balanceUsd = portRows[0]?.balanceUsd ?? 1000;

  if (!trades.length) {
    return NextResponse.json({
      totalTrades: 0, openTrades: 0,
      winRate: 0, avgPnlPct: 0, sharpeRatio: 0, maxDrawdownPct: 0,
      profitFactor: 0, equityCurve: [1],
      realizedPnlUsd: 0, currentBalanceUsd: balanceUsd,
    });
  }

  const closed = trades.filter((t) => t.status !== "open" && t.pnlPct !== null);
  const open = trades.filter((t) => t.status === "open");

  const realizedPnlUsd = closed.reduce((sum, t) => sum + (t.pnlUsd ?? 0), 0);
  const reservedMargin = open.reduce((sum, t) => sum + (t.marginUsed ?? 0), 0);

  if (!closed.length) {
    return NextResponse.json({
      totalTrades: 0, openTrades: open.length,
      winRate: 0, avgPnlPct: 0, sharpeRatio: 0, maxDrawdownPct: 0,
      profitFactor: 0, equityCurve: [1],
      realizedPnlUsd: 0,
      currentBalanceUsd: balanceUsd,
      availableUsd: Math.max(balanceUsd - reservedMargin, 0),
    });
  }

  const pnls = closed.map((t) => t.pnlPct as number);
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);

  const winRate = (wins.length / pnls.length) * 100;
  const avgPnl = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const stdPnl = Math.sqrt(
    pnls.reduce((a, b) => a + Math.pow(b - avgPnl, 2), 0) / pnls.length
  );
  const sharpe = stdPnl > 0 ? (avgPnl / stdPnl) * Math.sqrt(252) : 0;

  const equity = pnls.reduce(
    (acc, pnl) => [...acc, acc[acc.length - 1] * (1 + pnl / 100)],
    [1]
  );
  let peak = 1;
  let maxDrawdown = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    const dd = (e - peak) / peak;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }

  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const profitFactor = grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 10000) / 10000 : null;

  return NextResponse.json({
    totalTrades: closed.length,
    openTrades: open.length,
    winRate: Math.round(winRate * 100) / 100,
    avgPnlPct: Math.round(avgPnl * 10000) / 10000,
    sharpeRatio: Math.round(sharpe * 10000) / 10000,
    maxDrawdownPct: Math.round(maxDrawdown * 100 * 100) / 100,
    profitFactor,
    equityCurve: equity,
    bySignal: {
      buy: pnls.filter((_, i) => closed[i].signal === "BUY"),
      sell: pnls.filter((_, i) => closed[i].signal === "SELL"),
    },
    realizedPnlUsd: Math.round(realizedPnlUsd * 100) / 100,
    currentBalanceUsd: balanceUsd,
    availableUsd: Math.round(Math.max(balanceUsd - reservedMargin, 0) * 100) / 100,
  });
}

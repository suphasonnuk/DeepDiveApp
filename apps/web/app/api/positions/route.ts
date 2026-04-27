import { NextRequest, NextResponse } from "next/server";
import { db, autoPositions, and, eq, desc } from "@deepdive/db";

const QUANT_ENGINE_URL = process.env.QUANT_ENGINE_URL ?? "http://localhost:8000";
const DEFAULT_LEVERAGE = parseInt(process.env.BINANCE_LEVERAGE ?? "3");

export async function GET() {
  const positions = await db
    .select()
    .from(autoPositions)
    .orderBy(desc(autoPositions.openedAt));
  return NextResponse.json({ positions });
}

export async function POST(request: NextRequest) {
  const { signalId, symbol, direction, currentPrice, targetPrice, stopPrice, kellyFraction } =
    await request.json();

  // One position per coin — check before opening
  const existing = await db
    .select()
    .from(autoPositions)
    .where(and(eq(autoPositions.symbol, symbol), eq(autoPositions.status, "open")))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ skipped: true, reason: "position_already_open", symbol });
  }

  // Get available USDT balance from Binance testnet
  const balRes = await fetch(`${QUANT_ENGINE_URL}/api/v1/positions/balance`).catch(() => null);
  const balData = balRes?.ok ? await balRes.json() : { usdt_balance: 1000 };
  const usdtAllocation = Math.max((balData.usdt_balance ?? 1000) * (kellyFraction ?? 0.05), 10);

  // Open position on Binance Futures Testnet via quant engine
  const res = await fetch(`${QUANT_ENGINE_URL}/api/v1/positions/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol,
      direction,
      usdt_allocation: usdtAllocation,
      leverage: DEFAULT_LEVERAGE,
      current_price: currentPrice,
      target_price: targetPrice,
      stop_price: stopPrice,
    }),
  }).catch(() => null);

  if (!res?.ok) {
    return NextResponse.json({ error: "failed to open position" }, { status: 503 });
  }

  const posData = await res.json();

  const [position] = await db.insert(autoPositions).values({
    signalId: signalId ?? null,
    symbol,
    futuresSymbol: posData.futures_symbol,
    direction,
    leverage: DEFAULT_LEVERAGE,
    entryPrice: posData.entry_price,
    targetPrice: posData.target_price,
    stopPrice: posData.stop_price,
    quantity: posData.quantity,
    positionSizeUsdt: posData.position_size_usdt,
    entryOrderId: posData.entry_order_id,
    tpOrderId: posData.tp_order_id,
    slOrderId: posData.sl_order_id,
    status: "open",
    openSlot: 1,  // unique per symbol — DB rejects duplicate open positions for same coin
  }).returning();

  return NextResponse.json({ position }, { status: 201 });
}

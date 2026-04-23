import { NextRequest, NextResponse } from "next/server";
import { db, autoPositions, and } from "@deepdive/db";
import { quantSignals } from "@deepdive/db";
import { desc, eq } from "@deepdive/db";

const QUANT_ENGINE_URL = process.env.QUANT_ENGINE_URL ?? "http://localhost:8000";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") !== "false";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);

  const conditions = activeOnly ? eq(quantSignals.isActive, true) : undefined;

  const signals = await db
    .select()
    .from(quantSignals)
    .where(conditions)
    .orderBy(desc(quantSignals.generatedAt))
    .limit(limit);

  return NextResponse.json({ signals, total: signals.length });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tokens } = body as {
    tokens: Array<{ symbol: string; coingeckoId?: string; prices?: number[] }>;
  };

  if (!tokens?.length) {
    return NextResponse.json({ error: "tokens array required" }, { status: 400 });
  }

  // Call quant engine batch signal generation
  const quantUrl = `${QUANT_ENGINE_URL}/api/v1/signals/batch`;
  console.log("[signals] calling quant engine:", quantUrl, "tokens:", tokens.map(t => t.symbol));

  const quantRes = await fetch(quantUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tokens: tokens.map((t) => ({
        symbol: t.symbol,
        coingecko_id: t.coingeckoId,
        prices: t.prices,
      })),
    }),
  }).catch((err) => { console.error("[signals] quant engine fetch error:", err); return null; });

  if (!quantRes?.ok) {
    const body = await quantRes?.text().catch(() => null);
    console.error("[signals] quant engine error:", quantRes?.status, body);
    return NextResponse.json({ error: "quant engine unavailable", detail: body, url: quantUrl }, { status: 503 });
  }

  const rawSignals: Record<string, unknown>[] = await quantRes.json();

  // Persist signals to DB
  const inserted = [];
  for (const s of rawSignals) {
    if (s.error) continue;

    // Deactivate previous signals for this symbol so no duplicates appear
    await db.update(quantSignals)
      .set({ isActive: false })
      .where(and(eq(quantSignals.symbol, s.symbol as string), eq(quantSignals.isActive, true)));

    const risk = s.risk as Record<string, unknown>;
    const position = s.position as Record<string, unknown>;
    const models = s.models as Record<string, unknown>;
    const ou = models?.ou as Record<string, unknown>;
    const kalman = models?.kalman as Record<string, unknown>;

    const [row] = await db
      .insert(quantSignals)
      .values({
        symbol: s.symbol as string,
        signal: s.signal as string,
        confidence: s.confidence as number,
        combinedScore: s.combined_score as number,
        regime: s.regime as string,
        priceAtSignal: s.current_price as number,
        targetPrice: risk?.target_price as number,
        stopPrice: risk?.stop_price as number,
        targetPct: risk?.target_pct as number,
        stopPct: risk?.stop_pct as number,
        riskRewardRatio: risk?.risk_reward_ratio as number,
        kellyFraction: position?.kelly_fraction as number,
        suggestedLeverage: position?.suggested_leverage as number,
        delta: position?.delta as number,
        kalmanReason: kalman?.reason as string,
        ouZScore: ou?.z_score as number,
        ouHalfLifeDays: ou?.half_life_days as number,
      })
      .returning();

    inserted.push({ ...row, models: s.models, position: s.position });
  }

  // Auto-open Binance Futures Testnet positions for BUY/SELL signals (fire and forget)
  for (const signal of inserted) {
    if (signal.signal === "HOLD" || !signal.targetPrice || !signal.stopPrice) continue;

    const existing = await db.select().from(autoPositions)
      .where(and(eq(autoPositions.symbol, signal.symbol), eq(autoPositions.status, "open")))
      .limit(1);
    if (existing.length > 0) continue;

    const direction = signal.signal === "BUY" ? "LONG" : "SHORT";
    const balRes = await fetch(`${QUANT_ENGINE_URL}/api/v1/positions/balance`).catch(() => null);
    const balData = balRes?.ok ? await balRes.json() : { usdt_balance: 1000 };
    const kelly = (signal.kellyFraction as number | null) ?? 0.05;
    const usdtAllocation = Math.max((balData.usdt_balance ?? 1000) * kelly, 10);
    const leverage = parseInt(process.env.BINANCE_LEVERAGE ?? "3");

    const posRes = await fetch(`${QUANT_ENGINE_URL}/api/v1/positions/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: signal.symbol,
        direction,
        usdt_allocation: usdtAllocation,
        leverage,
        current_price: signal.priceAtSignal,
        target_price: signal.targetPrice,
        stop_price: signal.stopPrice,
      }),
    }).catch(() => null);

    if (!posRes?.ok) {
      console.warn("[signals] auto-position skipped for", signal.symbol, posRes?.status);
      continue;
    }

    const posData = await posRes.json();
    await db.insert(autoPositions).values({
      signalId: signal.id,
      symbol: signal.symbol,
      futuresSymbol: posData.futures_symbol,
      direction,
      leverage,
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
    }).catch((err) => console.error("[signals] failed to save position:", err));
  }

  return NextResponse.json({ signals: inserted, total: inserted.length });
}

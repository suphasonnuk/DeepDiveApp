import { NextRequest, NextResponse } from "next/server";
import { db } from "@deepdive/db";
import { quantSignals } from "@deepdive/db";
import { desc, eq } from "drizzle-orm";

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
  const quantRes = await fetch(`${QUANT_ENGINE_URL}/api/v1/signals/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tokens: tokens.map((t) => ({
        symbol: t.symbol,
        coingecko_id: t.coingeckoId,
        prices: t.prices,
      })),
    }),
  }).catch(() => null);

  if (!quantRes?.ok) {
    return NextResponse.json({ error: "quant engine unavailable" }, { status: 503 });
  }

  const rawSignals: Record<string, unknown>[] = await quantRes.json();

  // Persist signals to DB
  const inserted = [];
  for (const s of rawSignals) {
    if (s.signal === "HOLD" && (s.confidence as number) < 0.3) continue;
    if (s.error) continue;

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
        delta: position?.delta as number,
        kalmanReason: kalman?.reason as string,
        ouZScore: ou?.z_score as number,
        ouHalfLifeDays: ou?.half_life_days as number,
      })
      .returning();

    inserted.push({ ...row, models: s.models, position: s.position });
  }

  return NextResponse.json({ signals: inserted, total: inserted.length });
}

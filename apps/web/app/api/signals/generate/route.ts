import { NextResponse } from "next/server";
import {
  db,
  sql,
  trackedWallets,
  walletTransactions,
  smartMoneySignals,
  type NewSmartMoneySignal,
} from "@deepdive/db";

export const runtime = "nodejs";

interface WhaleTransaction {
  walletAddress: string;
  walletRank: number;
  portfolioValue: number;
  tokenAddress: string;
  action: "buy" | "sell";
  amountUsd: number;
  timestamp: string;
}

/**
 * POST /api/signals/generate
 *
 * Generate whale accumulation/distribution signals for active tokens.
 * Analyzes recent transactions from tracked whales and detects patterns.
 */
export async function POST(request: Request) {
  try {
    const { tokenAddress, chainId = 1, hoursLookback = 24 } = await request.json();

    if (!tokenAddress) {
      return NextResponse.json(
        { error: "tokenAddress is required" },
        { status: 400 }
      );
    }

    // Calculate lookback timestamp
    const lookbackTimestamp = Math.floor(Date.now() / 1000) - hoursLookback * 3600;

    // Fetch recent transactions for this token from tracked whales
    const recentTxs = await db
      .select({
        txHash: walletTransactions.txHash,
        walletAddress: trackedWallets.address,
        walletRank: trackedWallets.rank,
        portfolioValue: trackedWallets.portfolioValueUsd,
        tokenIn: walletTransactions.tokenIn,
        tokenOut: walletTransactions.tokenOut,
        amountIn: walletTransactions.amountIn,
        amountOut: walletTransactions.amountOut,
        timestamp: walletTransactions.timestamp,
      })
      .from(walletTransactions)
      .innerJoin(
        trackedWallets,
        sql`${walletTransactions.trackedWalletId} = ${trackedWallets.id}`
      )
      .where(
        sql`(${walletTransactions.tokenIn} = ${tokenAddress.toLowerCase()} OR ${walletTransactions.tokenOut} = ${tokenAddress.toLowerCase()})
            AND ${walletTransactions.timestamp} >= ${lookbackTimestamp}
            AND ${walletTransactions.chainId} = ${chainId}
            AND ${trackedWallets.isActive} = 1`
      )
      .orderBy(walletTransactions.timestamp);

    if (recentTxs.length === 0) {
      return NextResponse.json({
        signal: null,
        message: "No recent whale activity found for this token",
      });
    }

    // Separate buy and sell transactions
    const buyTransactions: WhaleTransaction[] = [];
    const sellTransactions: WhaleTransaction[] = [];

    for (const tx of recentTxs) {
      const isBuy = tx.tokenOut.toLowerCase() === tokenAddress.toLowerCase();
      const action = isBuy ? "buy" : "sell";

      // Estimate USD value (simplified - in production, use price oracle)
      const amountUsd = parseFloat(isBuy ? tx.amountOut : tx.amountIn) || 0;

      const whaleTx: WhaleTransaction = {
        walletAddress: tx.walletAddress,
        walletRank: tx.walletRank || 999,
        portfolioValue: tx.portfolioValue || 0,
        tokenAddress: tokenAddress.toLowerCase(),
        action,
        amountUsd,
        timestamp: (tx.timestamp as Date).toISOString(),
      };

      if (isBuy) {
        buyTransactions.push(whaleTx);
      } else {
        sellTransactions.push(whaleTx);
      }
    }

    // Call Python quant engine for signal analysis
    const quantEngineUrl = process.env.QUANT_ENGINE_URL || "http://localhost:8000";
    const response = await fetch(`${quantEngineUrl}/api/v1/whale-signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenAddress: tokenAddress.toLowerCase(),
        chainId,
        buyTransactions,
        sellTransactions,
        timeWindowHours: hoursLookback,
      }),
    });

    if (!response.ok) {
      throw new Error(`Quant engine error: ${response.statusText}`);
    }

    const signal = await response.json();

    // If no signal detected, return null
    if (!signal) {
      return NextResponse.json({
        signal: null,
        message: "No significant whale pattern detected",
        activity: {
          buys: buyTransactions.length,
          sells: sellTransactions.length,
        },
      });
    }

    // Store signal in database
    const newSignal: NewSmartMoneySignal = {
      tokenAddress: signal.tokenAddress,
      chainId: signal.chainId,
      signalType: signal.signalType,
      whaleCount: signal.whaleCount,
      totalVolumeUsd: signal.totalVolumeUsd,
      avgConfidence: signal.avgConfidence,
      recommendation: signal.recommendation,
      targetPriceUsd: signal.targetPriceUsd,
      stopLossUsd: signal.stopLossUsd,
      detectedAt: new Date(signal.detectedAt),
      windowStart: new Date(signal.windowStart),
      windowEnd: new Date(signal.windowEnd),
      isActive: true,
      userDismissed: false,
    };

    await db.insert(smartMoneySignals).values(newSignal);

    return NextResponse.json({
      signal,
      reasoning: signal.reasoning,
      activity: {
        buys: buyTransactions.length,
        sells: sellTransactions.length,
      },
    });
  } catch (error: any) {
    console.error("Signal generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate signal", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/signals/generate
 *
 * Get active signals from the database
 */
export async function GET() {
  try {
    const activeSignals = await db
      .select()
      .from(smartMoneySignals)
      .where(
        sql`${smartMoneySignals.isActive} = 1 AND ${smartMoneySignals.userDismissed} = 0`
      )
      .orderBy(sql`${smartMoneySignals.detectedAt} DESC`)
      .limit(20);

    return NextResponse.json({
      signals: activeSignals,
      count: activeSignals.length,
    });
  } catch (error: any) {
    console.error("Error fetching signals:", error);
    return NextResponse.json(
      { error: "Failed to fetch signals", details: error.message },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db, walletTransactions, trackedWallets, eq, desc, and } from "@deepdive/db";

// Force Node.js runtime for database operations
export const runtime = "nodejs";

/**
 * GET /api/transactions
 * Get all detected transactions (swaps) from tracked wallets
 *
 * Query params:
 * - walletId: Filter by tracked wallet ID
 * - limit: Number of results (default 50)
 * - onlyUncopied: Only show swaps that haven't been copied yet
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const walletId = searchParams.get("walletId");
    const limit = parseInt(searchParams.get("limit") || "50");
    const onlyUncopied = searchParams.get("onlyUncopied") === "true";

    let query = db
      .select({
        transaction: walletTransactions,
        wallet: trackedWallets,
      })
      .from(walletTransactions)
      .leftJoin(
        trackedWallets,
        eq(walletTransactions.trackedWalletId, trackedWallets.id)
      )
      .orderBy(desc(walletTransactions.timestamp))
      .limit(limit);

    // Apply filters
    const conditions = [];

    if (walletId) {
      conditions.push(eq(walletTransactions.trackedWalletId, parseInt(walletId)));
    }

    if (onlyUncopied) {
      conditions.push(eq(walletTransactions.wasCopied, false));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const results = await query;

    return NextResponse.json({
      transactions: results.map((r) => ({
        ...r.transaction,
        wallet: r.wallet,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch transactions:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

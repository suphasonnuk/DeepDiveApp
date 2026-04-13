import { NextRequest, NextResponse } from "next/server";
import { db, trackedWallets, walletTransactions, type NewWalletTransaction, eq } from "@deepdive/db";
import { fetchSuccessfulTransactions } from "@/lib/monitoring/transaction-fetcher";
import { detectSwapInTransaction } from "@/lib/monitoring/swap-detector";

// Force Node.js runtime for database operations
export const runtime = "nodejs";

/**
 * POST /api/transactions/sync
 *
 * Sync transactions for all tracked wallets
 * Detects DEX swaps and stores them in the database
 *
 * This should be called by a Vercel cron job every 1-5 minutes
 */
export async function POST(request: NextRequest) {
  try {
    // Get all active tracked wallets
    const wallets = await db
      .select()
      .from(trackedWallets)
      .where(eq(trackedWallets.isActive, true));

    if (wallets.length === 0) {
      return NextResponse.json({ message: "No wallets to sync" });
    }

    let totalSwapsDetected = 0;

    // Process each wallet
    for (const wallet of wallets) {
      try {
        console.log(`[Sync] Processing wallet ${wallet.address} on chain ${wallet.chainId}`);

        // Fetch recent transactions from Etherscan
        const transactions = await fetchSuccessfulTransactions(
          wallet.address,
          wallet.chainId
        );

        console.log(`[Sync] Found ${transactions.length} transactions for ${wallet.address}`);

        // Check each transaction for swaps
        for (const tx of transactions.slice(0, 20)) {
          // Only check last 20 to avoid rate limits
          try {
            const swap = await detectSwapInTransaction(
              tx.hash as `0x${string}`,
              wallet.chainId,
              wallet.address
            );

            if (swap) {
              // Check if we already have this transaction
              const existing = await db
                .select()
                .from(walletTransactions)
                .where(eq(walletTransactions.txHash, swap.txHash))
                .limit(1);

              if (existing.length === 0) {
                // Store new swap in database
                const newSwap: NewWalletTransaction = {
                  trackedWalletId: wallet.id,
                  txHash: swap.txHash,
                  chainId: wallet.chainId,
                  blockNumber: Number(swap.blockNumber),
                  timestamp: new Date(swap.timestamp * 1000),
                  dexProtocol: swap.dexProtocol,
                  tokenIn: swap.tokenIn,
                  tokenOut: swap.tokenOut,
                  amountIn: swap.amountIn,
                  amountOut: swap.amountOut,
                  gasUsed: swap.gasUsed,
                  gasPriceGwei: swap.gasPriceGwei,
                  wasCopied: false,
                  copyTradeId: null,
                };

                await db.insert(walletTransactions).values(newSwap);
                totalSwapsDetected++;

                console.log(`[Sync] New swap detected: ${swap.txHash}`);
              }
            }
          } catch (error) {
            console.error(`[Sync] Error processing tx ${tx.hash}:`, error);
            // Continue with next transaction
          }
        }

        // Update last synced timestamp
        await db
          .update(trackedWallets)
          .set({ lastSyncedAt: new Date() })
          .where(eq(trackedWallets.id, wallet.id));

      } catch (error) {
        console.error(`[Sync] Error processing wallet ${wallet.address}:`, error);
        // Continue with next wallet
      }
    }

    return NextResponse.json({
      success: true,
      walletsProcessed: wallets.length,
      swapsDetected: totalSwapsDetected,
    });

  } catch (error) {
    console.error("[Sync] Fatal error:", error);
    return NextResponse.json(
      { error: "Sync failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/transactions/sync
 * Get sync status for all wallets
 */
export async function GET() {
  try {
    const wallets = await db
      .select({
        id: trackedWallets.id,
        address: trackedWallets.address,
        chainId: trackedWallets.chainId,
        label: trackedWallets.label,
        lastSyncedAt: trackedWallets.lastSyncedAt,
        isActive: trackedWallets.isActive,
      })
      .from(trackedWallets);

    return NextResponse.json({ wallets });
  } catch (error) {
    console.error("[Sync] Error fetching status:", error);
    return NextResponse.json(
      { error: "Failed to fetch sync status" },
      { status: 500 }
    );
  }
}

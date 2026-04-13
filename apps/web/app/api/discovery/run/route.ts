import { NextResponse } from "next/server";
import { db, sql, trackedWallets, type NewTrackedWallet } from "@deepdive/db";
import { discoverTopWallets } from "@/lib/discovery/wallet-discovery";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for discovery

/**
 * POST /api/discovery/run
 *
 * Automatically discover top 1-5% wallets by portfolio value
 * who are actively trading. Filters for $1M+ portfolio and 10+ trades/month.
 */
export async function POST(request: Request) {
  try {
    const { chainId = 1, minPortfolioValue = 1000000 } = await request.json();

    console.log(`Starting wallet discovery on chain ${chainId}...`);

    // Discover top wallets
    const discovered = await discoverTopWallets(chainId, minPortfolioValue);

    const imported = [];
    const skipped = [];
    const errors = [];

    // Import discovered wallets into database
    for (const wallet of discovered) {
      try {
        // Check if already exists
        const existing = await db
          .select()
          .from(trackedWallets)
          .where(sql`${trackedWallets.address} = ${wallet.address.toLowerCase()}`)
          .limit(1);

        if (existing.length > 0) {
          skipped.push(wallet.address);
          continue;
        }

        // Insert into database
        const newWallet: NewTrackedWallet = {
          address: wallet.address.toLowerCase(),
          chainId: wallet.chainId,
          label: `Discovered Wallet #${wallet.rank}`,
          walletType: wallet.walletType as any,
          discoverySource: wallet.discoverySource,
          portfolioValueUsd: wallet.portfolioValueUsd,
          tradesLast30Days: wallet.tradesLast30Days,
          rank: wallet.rank,
          isActive: true,
          copyEnabled: true, // Auto-enable for discovered whales
        };

        await db.insert(trackedWallets).values(newWallet);
        imported.push(wallet.address);

        // Rate limit: 1 second between inserts
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error: any) {
        console.error(`Error importing ${wallet.address}:`, error);
        errors.push({ address: wallet.address, error: error.message });
      }
    }

    return NextResponse.json({
      success: true,
      chainId,
      discovered: discovered.length,
      imported: imported.length,
      skipped: skipped.length,
      errors: errors.length,
      details: {
        imported,
        skipped,
        errors,
      },
    });
  } catch (error: any) {
    console.error("Wallet discovery error:", error);
    return NextResponse.json(
      { error: "Failed to discover wallets", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/discovery/run
 *
 * Get current discovery status and statistics
 */
export async function GET() {
  try {
    const stats = await db
      .select({
        totalWallets: sql<number>`COUNT(*)`,
        whales: sql<number>`SUM(CASE WHEN ${trackedWallets.walletType} = 'whale' THEN 1 ELSE 0 END)`,
        activeTraders: sql<number>`SUM(CASE WHEN ${trackedWallets.walletType} = 'active_trader' THEN 1 ELSE 0 END)`,
        discovered: sql<number>`SUM(CASE WHEN ${trackedWallets.discoverySource} = 'token_holders' THEN 1 ELSE 0 END)`,
        famous: sql<number>`SUM(CASE WHEN ${trackedWallets.discoverySource} IN ('public_knowledge', 'nansen', 'etherscan_label') THEN 1 ELSE 0 END)`,
        avgPortfolio: sql<number>`AVG(${trackedWallets.portfolioValueUsd})`,
        totalPortfolio: sql<number>`SUM(${trackedWallets.portfolioValueUsd})`,
      })
      .from(trackedWallets)
      .where(sql`${trackedWallets.isActive} = 1`);

    return NextResponse.json({
      statistics: stats[0] || {},
      lastUpdated: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error fetching discovery stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats", details: error.message },
      { status: 500 }
    );
  }
}

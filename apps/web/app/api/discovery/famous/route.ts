import { NextResponse } from "next/server";
import { db, sql, trackedWallets, type NewTrackedWallet } from "@deepdive/db";
import famousWallets from "@/lib/discovery/famous-wallets.json";
import { getWalletPortfolioValue, isActiveTrader } from "@/lib/discovery/wallet-discovery";

export const runtime = "nodejs";

/**
 * POST /api/discovery/famous
 *
 * Import famous wallet addresses into the tracking database
 * Fetches their current portfolio values and activity metrics
 */
export async function POST() {
  try {
    const imported = [];
    const errors = [];

    // Process Ethereum wallets
    for (const wallet of famousWallets.ethereum) {
      try {
        // Check if already exists
        const existing = await db
          .select()
          .from(trackedWallets)
          .where(sql`${trackedWallets.address} = ${wallet.address.toLowerCase()}`)
          .limit(1);

        if (existing.length > 0) {
          continue; // Skip if already tracked
        }

        // Get portfolio value
        const portfolioValue = await getWalletPortfolioValue(wallet.address, 1);

        // Get trading activity
        const { tradesLast30Days } = await isActiveTrader(wallet.address, 1);

        // Insert into database
        const newWallet: NewTrackedWallet = {
          address: wallet.address.toLowerCase(),
          chainId: 1,
          label: wallet.label,
          walletType: wallet.walletType as any,
          discoverySource: wallet.source,
          portfolioValueUsd: portfolioValue,
          tradesLast30Days,
          isActive: true,
          copyEnabled: true, // Auto-enable copying for famous wallets
        };

        await db.insert(trackedWallets).values(newWallet);
        imported.push(wallet.label);

        // Rate limit: wait 2 seconds between wallets
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error: any) {
        console.error(`Error importing ${wallet.label}:`, error);
        errors.push({ wallet: wallet.label, error: error.message });
      }
    }

    return NextResponse.json({
      success: true,
      imported: imported.length,
      skipped: famousWallets.ethereum.length - imported.length - errors.length,
      errors,
      wallets: imported,
    });
  } catch (error: any) {
    console.error("Famous wallet import error:", error);
    return NextResponse.json(
      { error: "Failed to import famous wallets", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/discovery/famous
 *
 * List available famous wallets that can be imported
 */
export async function GET() {
  return NextResponse.json({
    ethereum: famousWallets.ethereum.map((w) => ({
      address: w.address,
      label: w.label,
      walletType: w.walletType,
      source: w.source,
    })),
    arbitrum: famousWallets.arbitrum?.map((w) => ({
      address: w.address,
      label: w.label,
      walletType: w.walletType,
      source: w.source,
    })) || [],
  });
}

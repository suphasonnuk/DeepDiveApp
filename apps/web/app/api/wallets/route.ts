import { NextRequest, NextResponse } from "next/server";
import { db, trackedWallets, type NewTrackedWallet, eq } from "@deepdive/db";

// Force Node.js runtime for database operations
export const runtime = "nodejs";

/**
 * GET /api/wallets
 * List all tracked wallets
 */
export async function GET() {
  try {
    const wallets = await db.select().from(trackedWallets);
    return NextResponse.json({ wallets });
  } catch (error) {
    console.error("Failed to fetch wallets:", error);
    return NextResponse.json(
      { error: "Failed to fetch wallets" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/wallets
 * Add a new wallet to track
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { address, chainId, label, copyEnabled } = body;

    if (!address || !chainId) {
      return NextResponse.json(
        { error: "address and chainId are required" },
        { status: 400 },
      );
    }

    // Validate address format (basic check)
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { error: "Invalid Ethereum address format" },
        { status: 400 },
      );
    }

    const newWallet: NewTrackedWallet = {
      address: address.toLowerCase(),
      chainId,
      label: label || null,
      isActive: true,
      copyEnabled: copyEnabled !== false,
    };

    const [wallet] = await db
      .insert(trackedWallets)
      .values(newWallet)
      .returning();

    return NextResponse.json({ wallet }, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create wallet:", error);

    // Handle duplicate address
    if (error.message?.includes("UNIQUE")) {
      return NextResponse.json(
        { error: "Wallet already tracked" },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Failed to create wallet" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/wallets?id=123
 * Remove a tracked wallet
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Wallet ID is required" },
        { status: 400 },
      );
    }

    await db.delete(trackedWallets).where(eq(trackedWallets.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete wallet:", error);
    return NextResponse.json(
      { error: "Failed to delete wallet" },
      { status: 500 },
    );
  }
}

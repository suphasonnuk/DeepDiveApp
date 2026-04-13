import { NextRequest, NextResponse } from "next/server";
import { tradexyz } from "@/lib/dex/tradexyz";
import { hyperliquid } from "@/lib/dex/hyperliquid";
import type { SwapParams } from "@/lib/dex/types";

/**
 * GET /api/swap/quote
 *
 * Get swap quotes from both Trade.xyz and Hyperliquid
 * Returns the best quote based on output amount
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const params: SwapParams = {
      tokenIn: searchParams.get("tokenIn") || "",
      tokenOut: searchParams.get("tokenOut") || "",
      amountIn: searchParams.get("amountIn") || "",
      slippageBps: parseInt(searchParams.get("slippageBps") || "50"),
      recipient: searchParams.get("recipient") || "",
      chainId: parseInt(searchParams.get("chainId") || "1"),
    };

    // Validate parameters
    if (!params.tokenIn || !params.tokenOut || !params.amountIn || !params.recipient) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 },
      );
    }

    // Fetch quotes from both DEXs in parallel
    const [tradexyzQuote, hyperliquidQuote] = await Promise.allSettled([
      tradexyz.getQuote(params),
      hyperliquid.getQuote(params),
    ]);

    const quotes = [];

    if (tradexyzQuote.status === "fulfilled") {
      quotes.push(tradexyzQuote.value);
    }

    if (hyperliquidQuote.status === "fulfilled") {
      quotes.push(hyperliquidQuote.value);
    }

    if (quotes.length === 0) {
      return NextResponse.json(
        { error: "No quotes available from any DEX" },
        { status: 503 },
      );
    }

    // Sort by best output amount (highest)
    quotes.sort((a, b) => parseFloat(b.amountOut) - parseFloat(a.amountOut));

    return NextResponse.json({
      quotes,
      bestQuote: quotes[0],
    });
  } catch (error) {
    console.error("Swap quote error:", error);
    return NextResponse.json(
      { error: "Failed to fetch swap quotes" },
      { status: 500 },
    );
  }
}

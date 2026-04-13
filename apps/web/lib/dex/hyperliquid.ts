import type { SwapQuote, SwapParams } from "./types";

/**
 * Hyperliquid API Client
 * https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
 *
 * Hyperliquid is a perpetual futures DEX with spot trading support.
 * It operates on its own L1 chain (Hyperliquid Chain) but bridges to Arbitrum.
 */

const HYPERLIQUID_API = "https://api.hyperliquid.xyz";

export class HyperliquidClient {
  /**
   * Get current market price for a trading pair
   */
  async getPrice(symbol: string): Promise<number> {
    const response = await fetch(`${HYPERLIQUID_API}/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "l2Book",
        coin: symbol,
      }),
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid API error: ${response.statusText}`);
    }

    const data = await response.json();

    // Calculate mid price from best bid/ask
    const bestBid = data.levels[0]?.[0]?.px;
    const bestAsk = data.levels[1]?.[0]?.px;

    if (!bestBid || !bestAsk) {
      throw new Error(`No liquidity for ${symbol}`);
    }

    return (parseFloat(bestBid) + parseFloat(bestAsk)) / 2;
  }

  /**
   * Get quote for a swap (spot trade)
   */
  async getQuote(params: SwapParams): Promise<SwapQuote> {
    // Hyperliquid uses symbol-based trading (e.g., "BTC", "ETH")
    // We'll need to map token addresses to symbols
    const symbolIn = await this.getSymbolForToken(params.tokenIn);
    const symbolOut = await this.getSymbolForToken(params.tokenOut);

    const price = await this.getPrice(`${symbolOut}/${symbolIn}`);
    const amountInFloat = parseFloat(params.amountIn) / 1e18; // Assuming 18 decimals
    const amountOut = (amountInFloat * price).toString();

    // Apply slippage
    const slippageMultiplier = 1 - params.slippageBps / 10000;
    const amountOutMin = (parseFloat(amountOut) * slippageMultiplier).toString();

    return {
      dex: "hyperliquid",
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn,
      amountOut,
      amountOutMin,
      priceImpact: 0, // TODO: Calculate price impact
      route: [
        {
          protocol: "Hyperliquid",
          tokenIn: params.tokenIn,
          tokenOut: params.tokenOut,
          portion: 100,
        },
      ],
    };
  }

  /**
   * Place a spot order on Hyperliquid
   * Note: This requires signing with the user's wallet
   */
  async placeOrder(params: {
    symbol: string;
    side: "buy" | "sell";
    size: string;
    price?: string; // Omit for market order
    userAddress: string;
  }): Promise<{ orderId: string }> {
    // This is a simplified version. Real implementation needs:
    // 1. EIP-712 signature from user's wallet
    // 2. Proper order construction
    // 3. WebSocket connection for real-time updates

    throw new Error(
      "Hyperliquid order placement requires wallet signing. Use the SDK directly.",
    );
  }

  /**
   * Get user's positions and balances
   */
  async getUserState(userAddress: string): Promise<{
    balances: { coin: string; total: string }[];
    positions: { coin: string; size: string; entryPrice: string }[];
  }> {
    const response = await fetch(`${HYPERLIQUID_API}/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "clearinghouseState",
        user: userAddress,
      }),
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid API error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      balances: data.marginSummary?.accountValue || [],
      positions: data.assetPositions || [],
    };
  }

  /**
   * Map token address to Hyperliquid symbol
   * This is a placeholder - need actual token registry
   */
  private async getSymbolForToken(tokenAddress: string): Promise<string> {
    // Common token mappings (expand as needed)
    const mapping: Record<string, string> = {
      "0x0000000000000000000000000000000000000000": "ETH",
      // Add more mappings
    };

    return mapping[tokenAddress.toLowerCase()] || "UNKNOWN";
  }

  /**
   * Get all available markets
   */
  async getMarkets(): Promise<{
    name: string;
    szDecimals: number;
  }[]> {
    const response = await fetch(`${HYPERLIQUID_API}/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "meta",
      }),
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.universe || [];
  }
}

// Export a singleton instance
export const hyperliquid = new HyperliquidClient();

import type { SwapQuote, SwapParams } from "./types";

/**
 * Trade.xyz API Client
 * https://docs.trade.xyz
 *
 * Trade.xyz is a DEX aggregator that routes across multiple protocols
 * to find the best execution price.
 */

const TRADEXYZ_API = "https://api.trade.xyz";

export class TradeXyzClient {
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  /**
   * Get a swap quote from Trade.xyz
   */
  async getQuote(params: SwapParams): Promise<SwapQuote> {
    const url = new URL(`${TRADEXYZ_API}/v1/quote`);
    url.searchParams.set("chainId", params.chainId.toString());
    url.searchParams.set("sellToken", params.tokenIn);
    url.searchParams.set("buyToken", params.tokenOut);
    url.searchParams.set("sellAmount", params.amountIn);
    url.searchParams.set("slippagePercentage", (params.slippageBps / 100).toString());
    url.searchParams.set("takerAddress", params.recipient);

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      throw new Error(`Trade.xyz API error: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      dex: "tradexyz",
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn,
      amountOut: data.buyAmount,
      amountOutMin: data.guaranteedPrice,
      priceImpact: data.estimatedPriceImpact || 0,
      gasEstimate: data.estimatedGas,
      route: data.route?.map((r: any) => ({
        protocol: r.name,
        tokenIn: r.fromToken,
        tokenOut: r.toToken,
        portion: r.portion,
      })),
    };
  }

  /**
   * Get swap transaction data to submit on-chain
   */
  async getSwapTransaction(params: SwapParams): Promise<{
    to: string;
    data: string;
    value: string;
    gasLimit?: string;
  }> {
    const url = new URL(`${TRADEXYZ_API}/v1/swap`);
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({
        chainId: params.chainId,
        sellToken: params.tokenIn,
        buyToken: params.tokenOut,
        sellAmount: params.amountIn,
        slippagePercentage: params.slippageBps / 100,
        takerAddress: params.recipient,
      }),
    });

    if (!response.ok) {
      throw new Error(`Trade.xyz swap API error: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      to: data.to,
      data: data.data,
      value: data.value || "0",
      gasLimit: data.gas,
    };
  }

  /**
   * Get supported tokens on a chain
   */
  async getSupportedTokens(chainId: number): Promise<{
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoUrl?: string;
  }[]> {
    const url = new URL(`${TRADEXYZ_API}/v1/tokens`);
    url.searchParams.set("chainId", chainId.toString());

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      throw new Error(`Trade.xyz tokens API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.tokens || [];
  }
}

// Export a singleton instance
export const tradexyz = new TradeXyzClient(
  process.env.NEXT_PUBLIC_TRADEXYZ_API_KEY,
);

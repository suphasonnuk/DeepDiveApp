/**
 * Common types for DEX integrations
 */

export interface SwapQuote {
  dex: "tradexyz" | "hyperliquid";
  tokenIn: string; // Token address
  tokenOut: string;
  amountIn: string; // Wei/raw amount as string
  amountOut: string; // Expected output amount
  amountOutMin: string; // Minimum output with slippage
  priceImpact: number; // Percentage
  gasEstimate?: string;
  route?: SwapRoute[];
}

export interface SwapRoute {
  protocol: string;
  tokenIn: string;
  tokenOut: string;
  portion: number; // Percentage of total trade (0-100)
}

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippageBps: number; // Basis points (e.g., 50 = 0.5%)
  recipient: string; // User's wallet address
  chainId: number;
}

export interface ExecutedSwap {
  txHash: string;
  blockNumber?: number;
  status: "pending" | "success" | "failed";
  amountOut?: string;
  gasUsed?: string;
}

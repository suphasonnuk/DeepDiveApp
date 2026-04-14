/**
 * Token Metadata Fetcher using QuickNode RPC
 *
 * Fetches ERC-20 token information (name, symbol, decimals) via direct contract calls.
 */

import { type Address } from "viem";
import { getQuickNodeClient } from "./client";

// Standard ERC-20 ABI for metadata functions
const ERC20_ABI = [
  {
    constant: true,
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
] as const;

export interface TokenMetadata {
  address: string;
  chainId: number;
  name: string;
  symbol: string;
  decimals: number;
}

/**
 * Fetch ERC-20 token metadata from on-chain contract
 */
export async function getTokenMetadata(
  tokenAddress: Address,
  chainId: 1 | 42161 | 8453 | 137,
): Promise<TokenMetadata> {
  const client = getQuickNodeClient(chainId);

  try {
    const [name, symbol, decimals] = await Promise.all([
      client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "name",
      }) as Promise<string>,
      client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "symbol",
      }) as Promise<string>,
      client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "decimals",
      }) as Promise<number>,
    ]);

    return {
      address: tokenAddress,
      chainId,
      name,
      symbol,
      decimals,
    };
  } catch (error) {
    // Fallback for non-standard tokens or failed calls
    console.warn(`Failed to fetch metadata for ${tokenAddress} on chain ${chainId}:`, error);
    return {
      address: tokenAddress,
      chainId,
      name: "Unknown Token",
      symbol: "???",
      decimals: 18, // Default assumption
    };
  }
}

/**
 * Fetch token balance for a wallet
 */
export async function getTokenBalance(
  tokenAddress: Address,
  walletAddress: Address,
  chainId: 1 | 42161 | 8453 | 137,
): Promise<bigint> {
  const client = getQuickNodeClient(chainId);

  try {
    const balance = await client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [walletAddress],
    });

    return balance as bigint;
  } catch (error) {
    console.warn(
      `Failed to fetch balance for ${tokenAddress} on chain ${chainId}:`,
      error,
    );
    return 0n;
  }
}

/**
 * Batch fetch metadata for multiple tokens (optimized with Promise.allSettled)
 */
export async function getMultipleTokenMetadata(
  tokens: Array<{ address: Address; chainId: 1 | 42161 | 8453 | 137 }>,
): Promise<TokenMetadata[]> {
  const results = await Promise.allSettled(
    tokens.map((token) => getTokenMetadata(token.address, token.chainId)),
  );

  return results
    .filter((result): result is PromiseFulfilledResult<TokenMetadata> => result.status === "fulfilled")
    .map((result) => result.value);
}

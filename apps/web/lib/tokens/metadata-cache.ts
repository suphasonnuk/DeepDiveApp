/**
 * Token Metadata Cache
 *
 * Fetches and caches token metadata (name, symbol, decimals) using QuickNode.
 * Stores results in database to avoid redundant RPC calls.
 */

import type { Address } from "viem";
import { db, tokens, eq, and, type NewToken } from "@deepdive/db";
import { getTokenMetadata } from "../quicknode";

/**
 * Get token metadata from cache or fetch from chain
 */
export async function getOrFetchTokenMetadata(
  tokenAddress: Address,
  chainId: 1 | 42161 | 8453 | 137,
): Promise<{ symbol: string; name: string; decimals: number }> {
  try {
    // Check database cache first
    const cached = await db
      .select()
      .from(tokens)
      .where(
        and(
          eq(tokens.address, tokenAddress.toLowerCase()),
          eq(tokens.chainId, chainId),
        ),
      )
      .limit(1);

    if (cached.length > 0) {
      const token = cached[0];
      return {
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
      };
    }

    // Not in cache - fetch from chain via QuickNode
    const metadata = await getTokenMetadata(tokenAddress, chainId);

    // Store in database for future use
    const newToken: NewToken = {
      address: tokenAddress.toLowerCase(),
      chainId,
      symbol: metadata.symbol,
      name: metadata.name,
      decimals: metadata.decimals,
      logoUrl: null,
      coingeckoId: null,
    };

    try {
      await db.insert(tokens).values(newToken);
    } catch (error) {
      // Ignore duplicate key errors (race condition)
      if (!String(error).includes("UNIQUE")) {
        console.warn("Failed to cache token metadata:", error);
      }
    }

    return {
      symbol: metadata.symbol,
      name: metadata.name,
      decimals: metadata.decimals,
    };
  } catch (error) {
    console.error(
      `Failed to get token metadata for ${tokenAddress} on chain ${chainId}:`,
      error,
    );
    // Return fallback values
    return {
      symbol: "???",
      name: "Unknown Token",
      decimals: 18,
    };
  }
}

/**
 * Batch fetch metadata for multiple tokens
 */
export async function batchFetchTokenMetadata(
  tokensToFetch: Array<{ address: Address; chainId: 1 | 42161 | 8453 | 137 }>,
): Promise<Map<string, { symbol: string; name: string; decimals: number }>> {
  const results = new Map<
    string,
    { symbol: string; name: string; decimals: number }
  >();

  await Promise.all(
    tokensToFetch.map(async (token) => {
      const metadata = await getOrFetchTokenMetadata(token.address, token.chainId);
      const key = `${token.chainId}:${token.address.toLowerCase()}`;
      results.set(key, metadata);
    }),
  );

  return results;
}

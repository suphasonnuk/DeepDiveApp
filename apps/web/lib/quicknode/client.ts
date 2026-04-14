/**
 * QuickNode Enhanced API Client
 *
 * Provides on-chain data fetching using QuickNode's RPC endpoints.
 * Replaces Etherscan APIs for transaction history, token metadata, and event filtering.
 */

import { createPublicClient, http, type PublicClient, type Address, type Hash } from "viem";
import { mainnet, arbitrum, base, polygon } from "viem/chains";

const CHAIN_CONFIG = {
  1: { chain: mainnet, rpcEnv: process.env.NEXT_PUBLIC_RPC_ETHEREUM },
  42161: { chain: arbitrum, rpcEnv: process.env.NEXT_PUBLIC_RPC_ARBITRUM },
  8453: { chain: base, rpcEnv: process.env.NEXT_PUBLIC_RPC_BASE },
  137: { chain: polygon, rpcEnv: process.env.NEXT_PUBLIC_RPC_POLYGON },
} as const;

type SupportedChainId = keyof typeof CHAIN_CONFIG;

// Client cache to avoid recreating clients
const clientCache = new Map<number, any>();

/**
 * Get or create a Viem public client for a given chain
 */
export function getQuickNodeClient(chainId: SupportedChainId) {
  if (clientCache.has(chainId)) {
    return clientCache.get(chainId)!;
  }

  const config = CHAIN_CONFIG[chainId];
  if (!config) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  const client = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcEnv || undefined), // Falls back to public RPC if not set
  });

  clientCache.set(chainId, client);
  return client;
}

/**
 * Clear the client cache (useful for testing or config changes)
 */
export function clearClientCache(): void {
  clientCache.clear();
}

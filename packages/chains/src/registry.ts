import {
  createPublicClient,
  http,
  type Chain,
  type PublicClient,
  type Transport,
} from "viem";
import {
  mainnet,
  arbitrum,
  base,
  polygon,
} from "viem/chains";

export interface ChainConfig {
  chain: Chain;
  rpcUrl?: string;
  blockExplorer: string;
  /** DEX router addresses relevant for this chain */
  dex: {
    tradeXyz?: string;
    hyperliquid?: string;
  };
}

/**
 * Chain registry — config-driven, add new EVM chains by adding an entry here.
 * RPC URLs fall back to Viem's default public RPCs if not specified.
 */
export const chainRegistry: Record<number, ChainConfig> = {
  [mainnet.id]: {
    chain: mainnet,
    rpcUrl: process.env.NEXT_PUBLIC_RPC_ETHEREUM,
    blockExplorer: "https://etherscan.io",
    dex: {
      tradeXyz: undefined, // set when Trade.xyz router address is known
    },
  },
  [arbitrum.id]: {
    chain: arbitrum,
    rpcUrl: process.env.NEXT_PUBLIC_RPC_ARBITRUM,
    blockExplorer: "https://arbiscan.io",
    dex: {
      tradeXyz: undefined,
      hyperliquid: undefined,
    },
  },
  [base.id]: {
    chain: base,
    rpcUrl: process.env.NEXT_PUBLIC_RPC_BASE,
    blockExplorer: "https://basescan.org",
    dex: {
      tradeXyz: undefined,
    },
  },
  [polygon.id]: {
    chain: polygon,
    rpcUrl: process.env.NEXT_PUBLIC_RPC_POLYGON,
    blockExplorer: "https://polygonscan.com",
    dex: {
      tradeXyz: undefined,
    },
  },
};

/** Supported chain IDs */
export const supportedChainIds = Object.keys(chainRegistry).map(Number);

/** Client cache — one client per chain, created lazily */
const clientCache = new Map<number, PublicClient>();

/** Get or create a Viem public client for a given chain */
export function getChainClient(chainId: number): PublicClient {
  const existing = clientCache.get(chainId);
  if (existing) return existing;

  const config = chainRegistry[chainId];
  if (!config) {
    throw new Error(`Unsupported chain: ${chainId}`);
  }

  const client = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl) as Transport,
  });

  clientCache.set(chainId, client);
  return client;
}

/** Get chain config by chain ID */
export function getChainConfig(chainId: number): ChainConfig {
  const config = chainRegistry[chainId];
  if (!config) {
    throw new Error(`Unsupported chain: ${chainId}`);
  }
  return config;
}

/** Get all supported chains */
export function getSupportedChains(): ChainConfig[] {
  return Object.values(chainRegistry);
}

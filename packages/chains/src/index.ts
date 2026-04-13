export {
  getChainClient,
  getChainConfig,
  getSupportedChains,
  supportedChainIds,
  chainRegistry,
} from "./registry";
export type { ChainConfig } from "./registry";

// Re-export commonly used chain objects for convenience
export { mainnet, arbitrum, base, polygon } from "viem/chains";

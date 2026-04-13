import { getChainClient } from "@deepdive/chains";
import type { Hash, Log } from "viem";
import { decodeEventLog, parseAbiItem } from "viem";

/**
 * Swap event signatures for common DEX protocols
 */
const SWAP_EVENT_SIGNATURES = {
  // Uniswap V2/V3, SushiSwap, etc.
  uniswapV2: parseAbiItem(
    "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)"
  ),
  uniswapV3: parseAbiItem(
    "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"
  ),
};

export interface DetectedSwap {
  txHash: Hash;
  blockNumber: bigint;
  timestamp: number;
  walletAddress: string;
  dexProtocol: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  gasUsed: string;
  gasPriceGwei: string;
}

/**
 * Detect if a transaction contains a DEX swap
 */
export async function detectSwapInTransaction(
  txHash: Hash,
  chainId: number,
  walletAddress: string
): Promise<DetectedSwap | null> {
  const client = getChainClient(chainId);

  // Fetch transaction receipt
  const receipt = await client.getTransactionReceipt({ hash: txHash });

  if (!receipt || receipt.status !== "success") {
    return null;
  }

  // Fetch transaction details for gas info
  const tx = await client.getTransaction({ hash: txHash });
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });

  // Parse logs for swap events
  for (const log of receipt.logs) {
    try {
      // Try Uniswap V2 format
      const v2Event = decodeEventLog({
        abi: [SWAP_EVENT_SIGNATURES.uniswapV2],
        data: log.data,
        topics: log.topics,
      });

      if (v2Event.eventName === "Swap") {
        const args = v2Event.args as any;

        // Determine which token is in and which is out based on amounts
        const isToken0In = BigInt(args.amount0In) > 0n;
        const tokenIn = isToken0In ? log.address : "0x0"; // TODO: Get actual token addresses
        const tokenOut = isToken0In ? "0x0" : log.address;
        const amountIn = isToken0In ? args.amount0In.toString() : args.amount1In.toString();
        const amountOut = isToken0In ? args.amount1Out.toString() : args.amount0Out.toString();

        return {
          txHash,
          blockNumber: receipt.blockNumber,
          timestamp: Number(block.timestamp),
          walletAddress: walletAddress.toLowerCase(),
          dexProtocol: "uniswap-v2",
          tokenIn,
          tokenOut,
          amountIn,
          amountOut,
          gasUsed: receipt.gasUsed.toString(),
          gasPriceGwei: (Number(tx.gasPrice) / 1e9).toString(),
        };
      }
    } catch {
      // Not a V2 swap, try V3
      try {
        const v3Event = decodeEventLog({
          abi: [SWAP_EVENT_SIGNATURES.uniswapV3],
          data: log.data,
          topics: log.topics,
        });

        if (v3Event.eventName === "Swap") {
          const args = v3Event.args as any;

          const isToken0In = BigInt(args.amount0) > 0n;
          const tokenIn = isToken0In ? log.address : "0x0";
          const tokenOut = isToken0In ? "0x0" : log.address;
          const amountIn = isToken0In ? args.amount0.toString() : args.amount1.toString();
          const amountOut = isToken0In ? args.amount1.toString() : args.amount0.toString();

          return {
            txHash,
            blockNumber: receipt.blockNumber,
            timestamp: Number(block.timestamp),
            walletAddress: walletAddress.toLowerCase(),
            dexProtocol: "uniswap-v3",
            tokenIn,
            tokenOut,
            amountIn: amountIn.replace("-", ""),
            amountOut: amountOut.replace("-", ""),
            gasUsed: receipt.gasUsed.toString(),
            gasPriceGwei: (Number(tx.gasPrice) / 1e9).toString(),
          };
        }
      } catch {
        // Not a recognized swap event
        continue;
      }
    }
  }

  return null;
}

/**
 * Get recent transactions for a wallet address
 */
export async function getRecentTransactions(
  walletAddress: string,
  chainId: number,
  fromBlock?: bigint
): Promise<Hash[]> {
  const client = getChainClient(chainId);

  const currentBlock = await client.getBlockNumber();
  const startBlock = fromBlock || currentBlock - 1000n; // Last ~1000 blocks (~3.5 hours)

  // Get transactions where wallet is the sender
  // Note: This requires a provider with trace/debug APIs or using a block explorer API
  // For now, we'll use a simplified approach

  // TODO: Integrate with block explorer API (Etherscan, Arbiscan, etc.)
  // or use Alchemy's enhanced APIs for transaction history

  return [];
}

/**
 * Monitor a wallet for new transactions (polling-based)
 * Returns a cleanup function to stop monitoring
 */
export async function monitorWallet(
  walletAddress: string,
  chainId: number,
  onSwapDetected: (swap: DetectedSwap) => void
): Promise<() => void> {
  const client = getChainClient(chainId);

  let lastCheckedBlock = await client.getBlockNumber();

  // Poll every 12 seconds (1 block on Ethereum)
  const interval = setInterval(async () => {
    try {
      const currentBlock = await client.getBlockNumber();

      if (currentBlock > lastCheckedBlock) {
        // Fetch transactions in new blocks
        // TODO: Implement proper transaction fetching
        // This requires either:
        // 1. Block explorer API (Etherscan, etc.)
        // 2. Alchemy/Infura enhanced APIs
        // 3. Running your own archive node

        lastCheckedBlock = currentBlock;
      }
    } catch (error) {
      console.error("Error monitoring wallet:", error);
    }
  }, 12000);

  // Return cleanup function
  return () => clearInterval(interval);
}

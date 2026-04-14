/**
 * Transaction Fetcher using QuickNode RPC
 *
 * Fetches wallet transaction history using eth_getLogs and eth_getBlockByNumber.
 * Replaces Etherscan API dependency.
 */

import { type Address, type Hash, type Log } from "viem";
import { getQuickNodeClient } from "./client";

export interface WalletTransaction {
  hash: Hash;
  blockNumber: bigint;
  timestamp: number;
  from: Address;
  to: Address | null;
  value: bigint;
  gasUsed: bigint | null;
  gasPrice: bigint | null;
  status: "success" | "failed";
  input: string;
}

export interface TokenTransfer {
  hash: Hash;
  blockNumber: bigint;
  timestamp: number;
  from: Address;
  to: Address;
  token: Address;
  value: bigint;
  logIndex: number;
}

// ERC-20 Transfer event signature
const TRANSFER_EVENT_SIGNATURE =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/**
 * Fetch recent transactions for a wallet address
 *
 * Uses eth_getLogs to find all transactions involving the address
 */
export async function fetchWalletTransactions(
  address: Address,
  chainId: 1 | 42161 | 8453 | 137,
  options?: {
    fromBlock?: bigint;
    toBlock?: bigint;
    limit?: number;
  },
): Promise<WalletTransaction[]> {
  const client = getQuickNodeClient(chainId);
  const limit = options?.limit || 100;

  try {
    // Get current block if not specified
    const currentBlock = options?.toBlock || (await client.getBlockNumber());
    const fromBlock = options?.fromBlock || currentBlock - 10000n; // Last ~10K blocks

    // Fetch all blocks where this address was involved in a transaction
    // We'll use eth_getLogs with null address to get all logs, then filter
    // This is more efficient than calling eth_getBlockByNumber for every block

    const logs = await client.getLogs({
      address: undefined, // Get all contract interactions
      fromBlock,
      toBlock: currentBlock,
    });

    // Get unique transaction hashes from logs involving our address
    const txHashes = new Set<Hash>();
    for (const log of logs) {
      // Check if our address is in the topics (indexed parameters)
      if (
        log.topics.some((topic: `0x${string}` | null) =>
          topic?.toLowerCase().includes(address.toLowerCase().slice(2)),
        )
      ) {
        txHashes.add(log.transactionHash);
      }
    }

    // Fetch transaction receipts and blocks for these hashes
    const transactions: WalletTransaction[] = [];
    const hashArray = Array.from(txHashes).slice(0, limit);

    for (const hash of hashArray) {
      try {
        const [tx, receipt] = await Promise.all([
          client.getTransaction({ hash }),
          client.getTransactionReceipt({ hash }),
        ]);

        // Get block timestamp
        const block = await client.getBlock({ blockNumber: receipt.blockNumber });

        transactions.push({
          hash: tx.hash,
          blockNumber: receipt.blockNumber,
          timestamp: Number(block.timestamp),
          from: tx.from,
          to: tx.to,
          value: tx.value,
          gasUsed: receipt.gasUsed || null,
          gasPrice: tx.gasPrice || null,
          status: receipt.status === "success" ? "success" : "failed",
          input: tx.input,
        });
      } catch (error) {
        console.warn(`Failed to fetch details for tx ${hash}:`, error);
      }
    }

    return transactions.sort((a, b) => Number(b.blockNumber - a.blockNumber));
  } catch (error) {
    console.error("Failed to fetch wallet transactions:", error);
    return [];
  }
}

/**
 * Fetch ERC-20 token transfers for a wallet
 *
 * More efficient than full transaction history when you only need token movements
 */
export async function fetchTokenTransfers(
  address: Address,
  chainId: 1 | 42161 | 8453 | 137,
  options?: {
    tokenAddress?: Address; // Filter by specific token
    fromBlock?: bigint;
    toBlock?: bigint;
    limit?: number;
  },
): Promise<TokenTransfer[]> {
  const client = getQuickNodeClient(chainId);
  const limit = options?.limit || 100;

  try {
    const currentBlock = options?.toBlock || (await client.getBlockNumber());
    const fromBlock = options?.fromBlock || currentBlock - 10000n;

    // Fetch Transfer events where address is sender or receiver
    // Transfer(address indexed from, address indexed to, uint256 value)
    const logs = await client.getLogs({
      address: options?.tokenAddress, // Filter by token if specified
      event: {
        type: "event",
        name: "Transfer",
        inputs: [
          { indexed: true, name: "from", type: "address" },
          { indexed: true, name: "to", type: "address" },
          { indexed: false, name: "value", type: "uint256" },
        ],
      },
      args: {
        // Match if address is either sender or receiver
        from: address,
        to: undefined,
      },
      fromBlock,
      toBlock: currentBlock,
    });

    // Also get transfers where address is receiver
    const logsAsReceiver = await client.getLogs({
      address: options?.tokenAddress,
      event: {
        type: "event",
        name: "Transfer",
        inputs: [
          { indexed: true, name: "from", type: "address" },
          { indexed: true, name: "to", type: "address" },
          { indexed: false, name: "value", type: "uint256" },
        ],
      },
      args: {
        from: undefined,
        to: address,
      },
      fromBlock,
      toBlock: currentBlock,
    });

    const allLogs = [...logs, ...logsAsReceiver];

    // Fetch block timestamps for these transfers
    const transfers: TokenTransfer[] = [];
    const blockCache = new Map<bigint, number>();

    for (const log of allLogs.slice(0, limit)) {
      try {
        // Get timestamp (with caching to avoid redundant calls)
        let timestamp = blockCache.get(log.blockNumber);
        if (!timestamp) {
          const block = await client.getBlock({ blockNumber: log.blockNumber });
          timestamp = Number(block.timestamp);
          blockCache.set(log.blockNumber, timestamp);
        }

        // Decode Transfer event
        const from = `0x${log.topics[1]!.slice(26)}` as Address;
        const to = `0x${log.topics[2]!.slice(26)}` as Address;
        const value = BigInt(log.data);

        transfers.push({
          hash: log.transactionHash,
          blockNumber: log.blockNumber,
          timestamp,
          from,
          to,
          token: log.address,
          value,
          logIndex: log.logIndex || 0,
        });
      } catch (error) {
        console.warn(`Failed to decode transfer log:`, error);
      }
    }

    return transfers.sort((a, b) => Number(b.blockNumber - a.blockNumber));
  } catch (error) {
    console.error("Failed to fetch token transfers:", error);
    return [];
  }
}

/**
 * Fetch only successful transactions (status === "success")
 */
export async function fetchSuccessfulTransactions(
  address: Address,
  chainId: 1 | 42161 | 8453 | 137,
  options?: Parameters<typeof fetchWalletTransactions>[2],
): Promise<WalletTransaction[]> {
  const allTxs = await fetchWalletTransactions(address, chainId, options);
  return allTxs.filter((tx) => tx.status === "success");
}

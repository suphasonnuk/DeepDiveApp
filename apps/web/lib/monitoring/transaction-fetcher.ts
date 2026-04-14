/**
 * Transaction Fetcher - now powered by QuickNode
 *
 * Fetches wallet transaction history using QuickNode RPC instead of Etherscan API.
 * Maintains backward-compatible interface with existing code.
 */

import type { Hash, Address } from "viem";
import {
  fetchWalletTransactions as fetchFromQuickNode,
  fetchTokenTransfers as fetchTokenTransfersFromQuickNode,
} from "../quicknode";

export interface Transaction {
  hash: Hash;
  blockNumber: string;
  timestamp: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  isError: string;
  txreceipt_status: string;
}

/**
 * Fetch transaction history for a wallet address using QuickNode
 */
export async function fetchWalletTransactions(
  walletAddress: string,
  chainId: number,
  startBlock: number = 0,
  endBlock: number = 99999999,
): Promise<Transaction[]> {
  if (![1, 42161, 8453, 137].includes(chainId)) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  try {
    const quickNodeTxs = await fetchFromQuickNode(
      walletAddress as Address,
      chainId as 1 | 42161 | 8453 | 137,
      {
        fromBlock: BigInt(startBlock),
        toBlock: endBlock === 99999999 ? undefined : BigInt(endBlock),
        limit: 100,
      },
    );

    // Adapt QuickNode format to Etherscan-compatible format
    return quickNodeTxs.map((tx) => ({
      hash: tx.hash,
      blockNumber: tx.blockNumber.toString(),
      timestamp: tx.timestamp.toString(),
      from: tx.from,
      to: tx.to || "",
      value: tx.value.toString(),
      gas: tx.gasUsed?.toString() || "0",
      gasPrice: tx.gasPrice?.toString() || "0",
      isError: tx.status === "failed" ? "1" : "0",
      txreceipt_status: tx.status === "success" ? "1" : "0",
    }));
  } catch (error) {
    console.error("Failed to fetch transactions from QuickNode:", error);
    return [];
  }
}

/**
 * Fetch only successful transactions (exclude failed ones)
 */
export async function fetchSuccessfulTransactions(
  walletAddress: string,
  chainId: number,
): Promise<Transaction[]> {
  const transactions = await fetchWalletTransactions(walletAddress, chainId);

  return transactions.filter(
    (tx) => tx.isError === "0" && tx.txreceipt_status === "1",
  );
}

/**
 * Fetch internal transactions (contract interactions)
 *
 * Note: QuickNode doesn't have a direct equivalent to Etherscan's txlistinternal.
 * This would require trace APIs which are available via QuickNode add-ons.
 * For now, returns empty array. Can be implemented with trace_transaction if needed.
 */
export async function fetchInternalTransactions(
  walletAddress: string,
  chainId: number,
): Promise<any[]> {
  console.warn(
    "Internal transactions not yet implemented with QuickNode (requires trace APIs)",
  );
  return [];
}

/**
 * Fetch ERC-20 token transfers for a wallet using QuickNode
 */
export async function fetchTokenTransfers(
  walletAddress: string,
  chainId: number,
): Promise<any[]> {
  if (![1, 42161, 8453, 137].includes(chainId)) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  try {
    const transfers = await fetchTokenTransfersFromQuickNode(
      walletAddress as Address,
      chainId as 1 | 42161 | 8453 | 137,
      {
        limit: 100,
      },
    );

    // Adapt to Etherscan-compatible format
    return transfers.map((transfer) => ({
      hash: transfer.hash,
      blockNumber: transfer.blockNumber.toString(),
      timeStamp: transfer.timestamp.toString(),
      from: transfer.from,
      to: transfer.to,
      tokenAddress: transfer.token,
      value: transfer.value.toString(),
      tokenName: "", // Would need separate call to get metadata
      tokenSymbol: "",
      tokenDecimal: "18", // Default assumption
    }));
  } catch (error) {
    console.error("Failed to fetch token transfers from QuickNode:", error);
    return [];
  }
}

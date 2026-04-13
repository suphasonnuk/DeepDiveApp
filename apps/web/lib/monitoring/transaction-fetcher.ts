import type { Hash } from "viem";

/**
 * Fetch recent transactions for a wallet address using Etherscan API
 * This works for Ethereum, Arbitrum, Base, Polygon (all have Etherscan-compatible APIs)
 */

const ETHERSCAN_APIS = {
  1: "https://api.etherscan.io/api", // Ethereum
  42161: "https://api.arbiscan.io/api", // Arbitrum
  8453: "https://api.basescan.org/api", // Base
  137: "https://api.polygonscan.com/api", // Polygon
};

const ETHERSCAN_API_KEYS = {
  1: process.env.ETHERSCAN_API_KEY,
  42161: process.env.ARBISCAN_API_KEY,
  8453: process.env.BASESCAN_API_KEY,
  137: process.env.POLYGONSCAN_API_KEY,
};

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
 * Fetch transaction history for a wallet address
 */
export async function fetchWalletTransactions(
  walletAddress: string,
  chainId: number,
  startBlock: number = 0,
  endBlock: number = 99999999
): Promise<Transaction[]> {
  const apiUrl = ETHERSCAN_APIS[chainId as keyof typeof ETHERSCAN_APIS];
  const apiKey = ETHERSCAN_API_KEYS[chainId as keyof typeof ETHERSCAN_API_KEYS];

  if (!apiUrl) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  const url = new URL(apiUrl);
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "txlist");
  url.searchParams.set("address", walletAddress);
  url.searchParams.set("startblock", startBlock.toString());
  url.searchParams.set("endblock", endBlock.toString());
  url.searchParams.set("sort", "desc"); // Most recent first
  url.searchParams.set("page", "1");
  url.searchParams.set("offset", "100"); // Last 100 transactions

  if (apiKey) {
    url.searchParams.set("apikey", apiKey);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Etherscan API error: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status !== "1") {
    throw new Error(`Etherscan API error: ${data.message}`);
  }

  return data.result;
}

/**
 * Fetch only successful transactions (exclude failed ones)
 */
export async function fetchSuccessfulTransactions(
  walletAddress: string,
  chainId: number
): Promise<Transaction[]> {
  const transactions = await fetchWalletTransactions(walletAddress, chainId);

  return transactions.filter(
    (tx) => tx.isError === "0" && tx.txreceipt_status === "1"
  );
}

/**
 * Fetch internal transactions (contract interactions)
 */
export async function fetchInternalTransactions(
  walletAddress: string,
  chainId: number
): Promise<any[]> {
  const apiUrl = ETHERSCAN_APIS[chainId as keyof typeof ETHERSCAN_APIS];
  const apiKey = ETHERSCAN_API_KEYS[chainId as keyof typeof ETHERSCAN_API_KEYS];

  if (!apiUrl) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  const url = new URL(apiUrl);
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "txlistinternal");
  url.searchParams.set("address", walletAddress);
  url.searchParams.set("sort", "desc");
  url.searchParams.set("page", "1");
  url.searchParams.set("offset", "100");

  if (apiKey) {
    url.searchParams.set("apikey", apiKey);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Etherscan API error: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status !== "1") {
    return []; // No internal transactions
  }

  return data.result;
}

/**
 * Fetch ERC-20 token transfers for a wallet
 */
export async function fetchTokenTransfers(
  walletAddress: string,
  chainId: number
): Promise<any[]> {
  const apiUrl = ETHERSCAN_APIS[chainId as keyof typeof ETHERSCAN_APIS];
  const apiKey = ETHERSCAN_API_KEYS[chainId as keyof typeof ETHERSCAN_API_KEYS];

  if (!apiUrl) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  const url = new URL(apiUrl);
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "tokentx");
  url.searchParams.set("address", walletAddress);
  url.searchParams.set("sort", "desc");
  url.searchParams.set("page", "1");
  url.searchParams.set("offset", "100");

  if (apiKey) {
    url.searchParams.set("apikey", apiKey);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Etherscan API error: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status !== "1") {
    return []; // No token transfers
  }

  return data.result;
}

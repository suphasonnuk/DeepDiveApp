/**
 * Wallet Discovery Service
 *
 * Automatically discovers top wallets (1-5% by portfolio value)
 * and filters for active traders.
 *
 * Data sources:
 * - Moralis API: Portfolio values, token balances
 * - Covalent API: Transaction history
 * - Etherscan API: Rich list data
 */

export interface WalletDiscoveryResult {
  address: string;
  chainId: number;
  portfolioValueUsd: number;
  tradesLast30Days: number;
  rank: number; // 1 = highest portfolio value
  walletType: "whale" | "active_trader" | "discovered";
  discoverySource: string;
}

/**
 * Discover top wallets using Moralis Portfolio API
 * https://docs.moralis.io/web3-data-api/evm/reference/wallet-api/get-wallet-net-worth
 */
export async function discoverTopWalletsMoralis(
  chainId: number,
  limit: number = 100
): Promise<WalletDiscoveryResult[]> {
  const apiKey = process.env.MORALIS_API_KEY;

  if (!apiKey) {
    console.warn("MORALIS_API_KEY not set");
    return [];
  }

  // Moralis doesn't have a "top wallets" endpoint
  // You need to provide addresses to check their net worth
  // This would typically come from:
  // 1. Token holder lists (top holders of major tokens like ETH, USDC)
  // 2. DEX trading volume leaderboards
  // 3. Scraped lists from blockchain explorers

  // For now, return empty - we'll implement the actual discovery logic
  return [];
}

/**
 * Get top token holders for a specific token
 * This is how we find whales - they're usually top holders of major tokens
 */
export async function getTopTokenHolders(
  tokenAddress: string,
  chainId: number,
  limit: number = 100
): Promise<{ address: string; balance: string; percentage: number }[]> {
  const apiKey = process.env.COVALENT_API_KEY;

  if (!apiKey) {
    console.warn("COVALENT_API_KEY not set");
    return [];
  }

  try {
    const response = await fetch(
      `https://api.covalenthq.com/v1/${chainId}/tokens/${tokenAddress}/token_holders_v2/?page-size=${limit}&key=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`Covalent API error: ${response.statusText}`);
    }

    const data = await response.json();

    return data.data.items.map((item: any) => ({
      address: item.address,
      balance: item.balance,
      percentage: parseFloat(item.total_supply_percentage) || 0,
    }));
  } catch (error) {
    console.error("Error fetching top holders:", error);
    return [];
  }
}

/**
 * Check if a wallet is actively trading
 * Active = more than 10 transactions in last 30 days
 */
export async function isActiveTrader(
  walletAddress: string,
  chainId: number
): Promise<{ isActive: boolean; tradesLast30Days: number }> {
  const apiKey = process.env.MORALIS_API_KEY;

  if (!apiKey) {
    return { isActive: false, tradesLast30Days: 0 };
  }

  try {
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

    const response = await fetch(
      `https://deep-index.moralis.io/api/v2.2/${walletAddress}?chain=0x${chainId.toString(16)}&from_date=${thirtyDaysAgo}`,
      {
        headers: {
          "X-API-Key": apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Moralis API error: ${response.statusText}`);
    }

    const data = await response.json();
    const tradesLast30Days = data.result?.length || 0;

    return {
      isActive: tradesLast30Days >= 10, // At least 10 trades in 30 days
      tradesLast30Days,
    };
  } catch (error) {
    console.error("Error checking wallet activity:", error);
    return { isActive: false, tradesLast30Days: 0 };
  }
}

/**
 * Get wallet portfolio value using Moralis
 */
export async function getWalletPortfolioValue(
  walletAddress: string,
  chainId: number
): Promise<number> {
  const apiKey = process.env.MORALIS_API_KEY;

  if (!apiKey) {
    return 0;
  }

  try {
    const response = await fetch(
      `https://deep-index.moralis.io/api/v2.2/wallets/${walletAddress}/net-worth?chains=0x${chainId.toString(16)}`,
      {
        headers: {
          "X-API-Key": apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Moralis API error: ${response.statusText}`);
    }

    const data = await response.json();
    return parseFloat(data.total_networth_usd) || 0;
  } catch (error) {
    console.error("Error fetching portfolio value:", error);
    return 0;
  }
}

/**
 * Discover top wallets by finding top holders of major tokens
 * This is the main entry point for wallet discovery
 */
export async function discoverTopWallets(
  chainId: number,
  minPortfolioValue: number = 1000000 // $1M minimum
): Promise<WalletDiscoveryResult[]> {
  const discovered: Map<string, WalletDiscoveryResult> = new Map();

  // List of major tokens to check top holders for
  const majorTokens = {
    1: [
      // Ethereum
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
      "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
    ],
    42161: [
      // Arbitrum
      "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
      "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC
    ],
  };

  const tokens = majorTokens[chainId as keyof typeof majorTokens] || [];

  for (const tokenAddress of tokens) {
    try {
      const holders = await getTopTokenHolders(tokenAddress, chainId, 50);

      for (const holder of holders.slice(0, 20)) {
        // Skip if already discovered
        if (discovered.has(holder.address)) continue;

        // Get portfolio value
        const portfolioValue = await getWalletPortfolioValue(
          holder.address,
          chainId
        );

        if (portfolioValue < minPortfolioValue) continue;

        // Check if actively trading
        const { isActive, tradesLast30Days } = await isActiveTrader(
          holder.address,
          chainId
        );

        // Only add if active trader
        if (isActive) {
          discovered.set(holder.address, {
            address: holder.address,
            chainId,
            portfolioValueUsd: portfolioValue,
            tradesLast30Days,
            rank: 0, // Will be set after sorting
            walletType: portfolioValue > 10000000 ? "whale" : "active_trader",
            discoverySource: "token_holders",
          });
        }
      }

      // Rate limit: wait 1 second between token checks
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error discovering wallets for token ${tokenAddress}:`, error);
    }
  }

  // Sort by portfolio value and assign ranks
  const results = Array.from(discovered.values()).sort(
    (a, b) => b.portfolioValueUsd - a.portfolioValueUsd
  );

  results.forEach((wallet, index) => {
    wallet.rank = index + 1;
  });

  return results;
}

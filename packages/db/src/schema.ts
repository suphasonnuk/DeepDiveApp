import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, real, index } from "drizzle-orm/sqlite-core";

/**
 * Tracked Wallets — Smart money addresses we're monitoring
 */
export const trackedWallets = sqliteTable("tracked_wallets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  address: text("address").notNull().unique(),
  chainId: integer("chain_id").notNull(),

  // Identification
  label: text("label"), // e.g., "Vitalik Buterin", "a16z Wallet #3"
  walletType: text("wallet_type"), // "whale", "influencer", "vc", "protocol", "discovered"
  discoverySource: text("discovery_source"), // "nansen", "etherscan", "twitter", "api", "manual"

  // Smart money metrics
  portfolioValueUsd: real("portfolio_value_usd"), // Total portfolio value in USD
  tradesLast30Days: integer("trades_last_30_days").default(0), // Trading activity
  winRatePercent: real("win_rate_percent"), // % of profitable trades
  rank: integer("rank"), // Ranking by portfolio value (1 = highest)

  // Status
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  copyEnabled: integer("copy_enabled", { mode: "boolean" }).notNull().default(true),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
  lastActivityAt: integer("last_activity_at", { mode: "timestamp" }),
}, (table) => ({
  addressChainIdx: index("idx_tracked_wallets_address_chain").on(table.address, table.chainId),
  rankIdx: index("idx_tracked_wallets_rank").on(table.rank),
  walletTypeIdx: index("idx_tracked_wallets_type").on(table.walletType),
  portfolioIdx: index("idx_tracked_wallets_portfolio").on(table.portfolioValueUsd),
}));

/**
 * Wallet Transactions — On-chain DEX swaps detected from tracked wallets
 */
export const walletTransactions = sqliteTable("wallet_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  trackedWalletId: integer("tracked_wallet_id").notNull().references(() => trackedWallets.id),

  // Transaction details
  txHash: text("tx_hash").notNull(),
  chainId: integer("chain_id").notNull(),
  blockNumber: integer("block_number").notNull(),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),

  // DEX swap details
  dexProtocol: text("dex_protocol"), // "uniswap", "tradexyz", "hyperliquid", etc.
  tokenIn: text("token_in").notNull(), // Token address being sold
  tokenOut: text("token_out").notNull(), // Token address being bought
  amountIn: text("amount_in").notNull(), // String to handle big numbers
  amountOut: text("amount_out").notNull(),

  // Metadata
  gasUsed: text("gas_used"),
  gasPriceGwei: text("gas_price_gwei"),

  // Copy trade status
  wasCopied: integer("was_copied", { mode: "boolean" }).notNull().default(false),
  copyTradeId: integer("copy_trade_id"),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  txHashIdx: index("idx_wallet_txs_hash").on(table.txHash),
  walletIdx: index("idx_wallet_txs_wallet").on(table.trackedWalletId),
  timestampIdx: index("idx_wallet_txs_timestamp").on(table.timestamp),
  tokenInIdx: index("idx_wallet_txs_token_in").on(table.tokenIn),
  tokenOutIdx: index("idx_wallet_txs_token_out").on(table.tokenOut),
}));

/**
 * Tokens — ERC-20 token metadata
 */
export const tokens = sqliteTable("tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  address: text("address").notNull(),
  chainId: integer("chain_id").notNull(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  decimals: integer("decimals").notNull(),
  logoUrl: text("logo_url"),
  coingeckoId: text("coingecko_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  addressChainIdx: index("idx_tokens_address_chain").on(table.address, table.chainId),
  symbolIdx: index("idx_tokens_symbol").on(table.symbol),
}));

/**
 * Token Prices — Historical price data
 */
export const tokenPrices = sqliteTable("token_prices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tokenId: integer("token_id").notNull().references(() => tokens.id),
  priceUsd: real("price_usd").notNull(),
  volume24h: real("volume_24h"),
  marketCap: real("market_cap"),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
}, (table) => ({
  tokenTimestampIdx: index("idx_token_prices_token_timestamp").on(table.tokenId, table.timestamp),
}));

/**
 * Copy Trades — Our executed copies of tracked wallet trades
 */
export const copyTrades = sqliteTable("copy_trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  originalTxId: integer("original_tx_id").notNull().references(() => walletTransactions.id),

  // Our transaction details
  ourTxHash: text("our_tx_hash").notNull(),
  ourAddress: text("our_address").notNull(), // Our connected wallet
  chainId: integer("chain_id").notNull(),

  // Trade details (may differ from original due to slippage/scaling)
  tokenIn: text("token_in").notNull(),
  tokenOut: text("token_out").notNull(),
  amountIn: text("amount_in").notNull(),
  amountOut: text("amount_out").notNull(),

  // Execution metadata
  status: text("status").notNull().default("pending"), // pending, executed, failed
  executedAt: integer("executed_at", { mode: "timestamp" }),
  failureReason: text("failure_reason"),
  gasUsed: text("gas_used"),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  originalTxIdx: index("idx_copy_trades_original").on(table.originalTxId),
  statusIdx: index("idx_copy_trades_status").on(table.status),
}));

/**
 * Smart Money Signals — Aggregated signals from whale activity
 */
export const smartMoneySignals = sqliteTable("smart_money_signals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tokenAddress: text("token_address").notNull(),
  chainId: integer("chain_id").notNull(),

  // Signal details
  signalType: text("signal_type").notNull(), // "accumulation", "distribution", "whale_buy", "whale_sell"
  whaleCount: integer("whale_count").notNull(), // Number of top wallets involved
  totalVolumeUsd: real("total_volume_usd"), // Total volume across all whales
  avgConfidence: real("avg_confidence"), // 0-1 confidence score from quant model

  // Time window
  detectedAt: integer("detected_at", { mode: "timestamp" }).notNull(),
  windowStart: integer("window_start", { mode: "timestamp" }).notNull(), // Signal time window start
  windowEnd: integer("window_end", { mode: "timestamp" }).notNull(), // Signal time window end

  // Recommendation
  recommendation: text("recommendation").notNull(), // "strong_buy", "buy", "hold", "sell", "strong_sell"
  targetPriceUsd: real("target_price_usd"),
  stopLossUsd: real("stop_loss_usd"),

  // Status
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  userDismissed: integer("user_dismissed", { mode: "boolean" }).notNull().default(false),
}, (table) => ({
  tokenIdx: index("idx_signals_token").on(table.tokenAddress, table.chainId),
  detectedIdx: index("idx_signals_detected").on(table.detectedAt),
  recommendationIdx: index("idx_signals_recommendation").on(table.recommendation),
  activeIdx: index("idx_signals_active").on(table.isActive),
}));

// Export types for TypeScript
export type TrackedWallet = typeof trackedWallets.$inferSelect;
export type NewTrackedWallet = typeof trackedWallets.$inferInsert;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type NewWalletTransaction = typeof walletTransactions.$inferInsert;
export type Token = typeof tokens.$inferSelect;
export type NewToken = typeof tokens.$inferInsert;
export type TokenPrice = typeof tokenPrices.$inferSelect;
export type NewTokenPrice = typeof tokenPrices.$inferInsert;
export type CopyTrade = typeof copyTrades.$inferSelect;
export type NewCopyTrade = typeof copyTrades.$inferInsert;
export type SmartMoneySignal = typeof smartMoneySignals.$inferSelect;
export type NewSmartMoneySignal = typeof smartMoneySignals.$inferInsert;

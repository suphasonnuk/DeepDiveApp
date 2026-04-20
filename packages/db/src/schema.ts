import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, real, index } from "drizzle-orm/sqlite-core";

/**
 * Tokens — ERC-20 token metadata for the connected wallet
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
 * Token Prices — Historical price snapshots (Tier 1 cloud data)
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
 * Quant Signals — Mathematical signals from Kalman + OU + HMM + Kelly pipeline
 */
export const quantSignals = sqliteTable("quant_signals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),
  tokenAddress: text("token_address"),
  chainId: integer("chain_id"),

  // Signal output
  signal: text("signal").notNull(),            // "BUY" | "SELL" | "HOLD"
  confidence: real("confidence").notNull(),     // 0-1 combined model confidence
  combinedScore: real("combined_score"),        // raw weighted score pre-threshold
  regime: text("regime").notNull(),             // "BULL" | "BEAR" | "SIDEWAYS"

  // Price at signal time
  priceAtSignal: real("price_at_signal").notNull(),
  targetPrice: real("target_price"),
  stopPrice: real("stop_price"),
  targetPct: real("target_pct"),
  stopPct: real("stop_pct"),
  riskRewardRatio: real("risk_reward_ratio"),

  // Position sizing (Kelly)
  kellyFraction: real("kelly_fraction"),        // recommended portfolio fraction
  delta: real("delta"),                         // directional delta (+1 long, -1 short)

  // Model details (JSON)
  kalmanReason: text("kalman_reason"),
  ouZScore: real("ou_z_score"),
  ouHalfLifeDays: real("ou_half_life_days"),

  // Lifecycle
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  userDismissed: integer("user_dismissed", { mode: "boolean" }).notNull().default(false),
  generatedAt: integer("generated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  symbolIdx: index("idx_quant_signals_symbol").on(table.symbol),
  signalIdx: index("idx_quant_signals_signal").on(table.signal),
  activeIdx: index("idx_quant_signals_active").on(table.isActive),
  generatedIdx: index("idx_quant_signals_generated").on(table.generatedAt),
}));

/**
 * Paper Trades — Simulated trades based on quant signals (for performance validation)
 */
export const paperTrades = sqliteTable("paper_trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  signalId: integer("signal_id").references(() => quantSignals.id),

  symbol: text("symbol").notNull(),
  signal: text("signal").notNull(),            // "BUY" | "SELL"

  // Execution
  entryPrice: real("entry_price").notNull(),
  exitPrice: real("exit_price"),
  positionSizeFraction: real("position_size_fraction").notNull(),  // Kelly fraction used
  targetPrice: real("target_price").notNull(),
  stopPrice: real("stop_price").notNull(),
  confidence: real("confidence").notNull(),
  regime: text("regime").notNull(),

  // Outcome
  status: text("status").notNull().default("open"),  // open | closed_profit | closed_loss | closed_target | closed_stop
  pnlPct: real("pnl_pct"),                           // % P&L when closed

  openedAt: integer("opened_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  closedAt: integer("closed_at", { mode: "timestamp" }),
}, (table) => ({
  symbolIdx: index("idx_paper_trades_symbol").on(table.symbol),
  statusIdx: index("idx_paper_trades_status").on(table.status),
  openedIdx: index("idx_paper_trades_opened").on(table.openedAt),
}));

// TypeScript types
export type Token = typeof tokens.$inferSelect;
export type NewToken = typeof tokens.$inferInsert;
export type TokenPrice = typeof tokenPrices.$inferSelect;
export type NewTokenPrice = typeof tokenPrices.$inferInsert;
export type QuantSignal = typeof quantSignals.$inferSelect;
export type NewQuantSignal = typeof quantSignals.$inferInsert;
export type PaperTrade = typeof paperTrades.$inferSelect;
export type NewPaperTrade = typeof paperTrades.$inferInsert;

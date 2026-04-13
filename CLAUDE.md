# DeepDiveApp

**Copy trading platform** — Track profitable wallet addresses on-chain and replicate their trades automatically with your approval.

## Project Structure

Turborepo monorepo with pnpm workspaces:

```
apps/web/          → Next.js 15 (App Router) — the web application
packages/crypto/   → Client-side encryption (Web Crypto API vault)
packages/chains/   → Multi-chain EVM registry (Viem)
packages/db/       → Cloud database layer (Turso + Drizzle) [future]
packages/stores/   → Zustand state management [future]
packages/ui/       → Shared design system components [future]
services/quant-engine/ → Python FastAPI quant engine [future]
```

## Commands

- `pnpm dev` — Start all dev servers
- `pnpm build` — Build all packages and apps
- `pnpm lint` — Lint all packages
- `pnpm --filter @deepdive/web dev` — Start only the web app

## Architecture Pillars

1. **Security**: Single-user app. All sensitive data (wallet keys, holdings, strategies) encrypted in browser IndexedDB via AES-256-GCM. Server never stores sensitive data.
2. **Stability**: Real-time price feeds via SSE. Zustand for reactive state. Middleware-enforced auth.
3. **Lightweight Cloud**: Next.js on Vercel (edge). Turso (SQLite) for public data. No heavy infrastructure.

## Data Classification

- **Tier 1 (Cloud OK)**: Token prices, on-chain data, market metadata, news, quant signals
- **Tier 2 (Local only, encrypted)**: Wallet keys, portfolio holdings, strategy params, trade history
- **Tier 3 (In-memory only)**: Portfolio valuations, P&L, personalized signals

The cloud never learns which tokens the user holds.

## Security Rules

- Sensitive data flows through `@deepdive/crypto` vault — never store raw secrets
- All routes gated by `middleware.ts` JWT verification
- API keys for exchanges: N/A (DEX-only — Trade.xyz + Hyperliquid)
- Wallet signing happens entirely client-side
- PBKDF2 key derivation: 600,000 iterations minimum

## DEX Platforms

- **Trade.xyz** (app.trade.xyz) — Multi-chain DEX aggregator
- **Hyperliquid** — Perpetual futures DEX

## Chains

EVM only: Ethereum, Arbitrum, Base, Polygon. All use Viem via `@deepdive/chains` registry.

## Wallet Connection

Uses wagmi v2 (built on Viem) for wallet management:
- **MetaMask** & browser wallets via injected connector
- **Hardware wallets** (Ledger, Trezor) via WalletConnect
- Mobile wallets via WalletConnect
- All signing happens in wallet — private keys never leave device
- Configuration in `apps/web/lib/wagmi/config.ts`
- UI component in Settings tab

## UI Framework

Mobile-first design following `.claude/UI-FRAMEWORK.md`:
- 4-tab bottom navigation: Dashboard, Markets, Trades, Settings
- Card-based progressive disclosure
- Dark theme with accent color (#6366f1)

## Copy Trading Workflow

1. **Add Target Wallets** — Track profitable traders by their wallet address + chain
2. **Monitor On-Chain** — Watch for DEX swaps from tracked addresses (Viem event logs)
3. **Detect Trades** — Store detected swaps in Turso database
4. **Analyze Performance** — Quant engine calculates win rate, Sharpe ratio for each wallet
5. **Generate Signals** — High-confidence trades appear in your Trades tab
6. **User Approves** — Review trade details (token, amount, slippage) before execution
7. **Execute Copy** — Your connected wallet signs the same swap via Trade.xyz or Hyperliquid
8. **Track Results** — Store your executed copy trades with P&L

## Conventions

- TypeScript strict mode everywhere
- Tailwind CSS for styling (no CSS modules)
- Server components by default, `"use client"` only when needed
- Zustand for client-side state
- Drizzle ORM for database queries
- `@deepdive/*` workspace imports for shared packages

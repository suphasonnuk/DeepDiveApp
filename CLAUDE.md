# DeepDiveApp

**Wallet dashboard + quant trading signal platform** — Shows your connected wallet's portfolio (tokens + LP positions), generates buy/sell/hold signals using pure mathematical quant models (Kalman Filter, Ornstein-Uhlenbeck, HMM, Kelly Criterion), and tracks paper trading performance.

## Project Structure

Turborepo monorepo with pnpm workspaces:

```
apps/web/              → Next.js 15 (App Router) — the web application
packages/crypto/       → Client-side encryption (Web Crypto API vault)
packages/chains/       → Multi-chain EVM registry (Viem)
packages/db/           → Cloud database layer (Turso + Drizzle)
packages/stores/       → Zustand state management [future]
packages/ui/           → Shared design system components [future]
services/quant-engine/ → Python FastAPI quant engine (Kalman + OU + HMM + Kelly)
```

## Commands

- `pnpm dev` — Start all dev servers
- `pnpm build` — Build all packages and apps
- `pnpm lint` — Lint all packages
- `pnpm --filter @deepdive/web dev` — Start only the web app

## Architecture Pillars

1. **Security**: Single-user app. All sensitive data encrypted in browser IndexedDB via AES-256-GCM. Server never stores sensitive data.
2. **Mathematical Quant**: Signals derived from rigorous mathematical models — not popular indicators. Delta-neutral awareness built in.
3. **Lightweight Cloud**: Next.js on Vercel (edge). Turso (SQLite) for signal + paper trade history. No heavy infrastructure.

## Data Classification

- **Tier 1 (Cloud OK)**: Token prices, quant signals, paper trade history, performance metrics
- **Tier 2 (Local only, encrypted)**: Wallet keys, portfolio holdings
- **Tier 3 (In-memory only)**: Portfolio valuations, live P&L

The cloud never stores which tokens the user holds.

## Security Rules

- Sensitive data flows through `@deepdive/crypto` vault — never store raw secrets
- All routes gated by `middleware.ts` JWT verification
- Wallet signing happens entirely client-side
- PBKDF2 key derivation: 600,000 iterations minimum

## UI Pages

- `/dashboard` (Portfolio tab) — Connected wallet token balances + LP positions + total USD value
- `/markets` (Signals tab) — Quant buy/sell/hold signals with confidence, R/R ratio, delta, Kelly fraction
- `/trades` (Performance tab) — Paper trade history, equity curve, Sharpe ratio, win rate, max drawdown
- `/settings` — Wallet connect, info about models + security

## Quant Engine (services/quant-engine/)

**Stack**: Python FastAPI + numpy + scipy + hmmlearn

**Models**:
- `app/models/kalman.py` — Kalman Filter: state=[price, velocity], estimates fair value + trend
- `app/models/ou_process.py` — Ornstein-Uhlenbeck: mean-reversion SDE, z-score entry/exit
- `app/models/hmm_regime.py` — HMM: 3-state regime detection (BULL/BEAR/SIDEWAYS)
- `app/models/kelly.py` — Kelly Criterion: optimal position sizing (half-Kelly, max 25%)
- `app/signals/generator.py` — Orchestrates all models with regime-adaptive weights
- `app/data/fetchers.py` — Binance public API (primary) + CoinGecko (fallback)
- `app/performance/tracker.py` — In-memory paper trade store + metrics

**Endpoints**:
- `POST /api/v1/signal` — Single token signal
- `POST /api/v1/signals/batch` — Batch portfolio scan
- `POST /api/v1/paper-trades` — Open paper trade
- `PUT /api/v1/paper-trades/{id}/close` — Close with P&L
- `GET /api/v1/performance` — Sharpe, drawdown, win rate, equity curve

## Regime-Adaptive Signal Weighting

| Regime   | Kalman | OU   | Logic |
|----------|--------|------|-------|
| BULL     | 60%    | 40%  | Momentum dominates |
| BEAR     | 40%    | 60%  | Mean-reversion after drop |
| SIDEWAYS | 20%    | 80%  | Pure OU mean-reversion |

## API Routes (apps/web/app/api/)

- `/api/portfolio` — GET: wallet tokens + LP positions (QuickNode RPC + Covalent + Binance prices)
- `/api/signals` — GET: list signals | POST: scan portfolio → quant engine → persist
- `/api/performance` — GET: aggregate metrics
- `/api/performance/trades` — GET/POST: paper trades
- `/api/performance/trades/[id]` — PUT: close trade
- `/api/auth/login` — POST: passphrase → JWT session
- `/api/auth/logout` — POST: clear session

## DB Schema (packages/db/src/schema.ts)

- `tokens` — ERC-20 metadata
- `token_prices` — Historical price snapshots
- `quant_signals` — Signal history (symbol, signal, confidence, regime, risk levels, delta)
- `paper_trades` — Paper trade records (entry/exit, P&L, status)

## External Data Sources (Free)

- **Binance public API** — OHLCV, current price (no auth needed)
- **CoinGecko free tier** — Fallback OHLCV for tokens not on Binance
- **Covalent API** — ERC-20 token balances (free API key needed: `COVALENT_API_KEY`)
- **QuickNode** — Native balance via RPC (`QUICKNODE_URL` already configured)

## Env Vars Needed

- `COVALENT_API_KEY` — Free at covalenthq.com — enables ERC-20 balance discovery
- `QUICKNODE_URL` — Already set
- `JWT_SECRET` — Session signing
- `QUANT_ENGINE_URL` — Python FastAPI URL (default: http://localhost:8000)
- `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` — DB connection
- `FRONTEND_URL` — For quant engine CORS (default: http://localhost:3000)

## Chains

EVM only: Ethereum (1), Arbitrum (42161), Base (8453), Polygon (137).

## Wallet Connection

wagmi v2: MetaMask/injected + WalletConnect for hardware/mobile. Config in `apps/web/lib/wagmi/config.ts`.

## Conventions

- TypeScript strict mode everywhere
- Tailwind CSS for styling (no CSS modules)
- Server components by default, `"use client"` only when needed
- Drizzle ORM for database queries
- `@deepdive/*` workspace imports for shared packages

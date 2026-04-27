# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Wallet dashboard + quant trading signal platform** — Shows your connected wallet's portfolio (tokens + LP positions), generates buy/sell/hold signals using pure mathematical quant models (Kalman Filter, Ornstein-Uhlenbeck, HMM, Kelly Criterion), and tracks paper trading performance.

## Project Structure

Turborepo monorepo with pnpm workspaces:

```
apps/web/              → Next.js 15 (App Router) — the web application
packages/crypto/       → Client-side encryption (Web Crypto API vault)
packages/chains/       → Multi-chain EVM registry (Viem)
packages/db/           → Cloud database layer (Turso + Drizzle)
services/quant-engine/ → Python FastAPI quant engine (Kalman + OU + HMM + Kelly)
```

## Commands

**Monorepo (pnpm + Turborepo)**:
- `pnpm dev` — Start all dev servers
- `pnpm build` — Build all packages and apps
- `pnpm lint` — Lint all packages (ESLint via Next.js defaults; ESLint errors are ignored during `next build`)
- `pnpm typecheck` — Type check all packages
- `pnpm clean` — Clean all build artifacts
- `pnpm --filter @deepdive/web dev` — Start only the web app

**Database** (run from `packages/db/`):
- `pnpm db:push` — Push Drizzle schema to Turso
- `pnpm db:studio` — Open Drizzle Studio UI

**Quant engine** (run from `services/quant-engine/`):
```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Environment Setup

Each part of the monorepo has its own env file — they are not shared:

| Location | File | Purpose |
|---|---|---|
| `apps/web/` | `.env.local` | Web app (Next.js) — all `NEXT_PUBLIC_*` + server vars |
| `packages/db/` | `.env` | Drizzle kit only — `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` |
| `services/quant-engine/` | `.env` | Python backend — `FRONTEND_URL`, Binance testnet keys |

Key vars for `apps/web/.env.local`:
- `JWT_SECRET` — **Mandatory.** Session signing. App throws at startup if missing. Generate with `openssl rand -hex 32`
- `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` — DB connection
- `QUICKNODE_URL` — Ethereum RPC for native balance
- `NEXT_PUBLIC_RPC_*` — Per-chain public RPC URLs for wagmi
- `COVALENT_API_KEY` — ERC-20 token discovery (free at covalenthq.com)
- `QUANT_ENGINE_URL` — Python FastAPI URL (default: `http://localhost:8000`)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — Mobile wallet support (optional)

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

- `JWT_SECRET` must be set — no fallback defaults. App crashes on startup without it
- Security headers applied via middleware: HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy
- `poweredByHeader: false` in Next.js config — no server version leakage
- Sensitive data flows through `@deepdive/crypto` vault — never store raw secrets
- All routes gated by `middleware.ts` JWT verification (public paths: `/login`, `/api/auth/`)
- Wallet signing happens entirely client-side
- PBKDF2 key derivation: 600,000 iterations minimum
- API error responses never expose internal details (URLs, status codes, stack traces)

## UI Pages

- `/dashboard` (Portfolio tab) — Connected wallet token balances + LP positions + total USD value
- `/markets` (Signals tab) — Quant buy/sell/hold signals with confidence, R/R ratio, delta, Kelly fraction
- `/trades` (Performance tab) — Paper trade history, equity curve, Sharpe ratio, win rate, max drawdown
- `/settings` — Wallet connect, info about models + security

App Router uses route groups: `(auth)/login` for unauthenticated pages and `(app)/` for the authenticated shell layout.

## Quant Engine (services/quant-engine/)

**Stack**: Python FastAPI + numpy + scipy + hmmlearn

**Models**:
- `app/models/kalman.py` — Kalman Filter: state=[price, velocity], estimates fair value + trend
- `app/models/ou_process.py` — Ornstein-Uhlenbeck: mean-reversion SDE, z-score entry/exit
- `app/models/hmm_regime.py` — HMM: 3-state regime detection (BULL/BEAR/SIDEWAYS)
- `app/models/kelly.py` — Kelly Criterion: optimal position sizing (half-Kelly, max 25%)
- `app/signals/generator.py` — Orchestrates all models with regime-adaptive weights
- `app/data/fetchers.py` — Binance public API (primary) + CoinGecko (fallback)
- `app/data/funding.py` — Binance funding rate calculations
- `app/performance/tracker.py` — In-memory paper trade store + metrics

**Extended modules**:
- `app/backtest/engine.py` + `walk_forward.py` + `costs.py` — Historical backtesting with transaction cost modeling and walk-forward validation
- `app/calibration/kelly_calibrator.py` + `param_optimizer.py` — Dynamic Kelly tuning and signal parameter optimization
- `app/portfolio/risk.py` — Portfolio-level risk management
- `app/trading/binance_futures.py` — Binance Futures Testnet integration
- `app/execution/manager.py` — Trade execution orchestration

**Endpoints** (all prefixed `/api/v1/`):
- `POST /signal` — Single token signal
- `POST /signals/batch` — Batch portfolio scan
- `POST /paper-trades` — Open paper trade
- `PUT /paper-trades/{id}/close` — Close with P&L
- `GET /performance` — Sharpe, drawdown, win rate, equity curve

## Regime-Adaptive Signal Weighting

| Regime   | Kalman | OU   | Logic |
|----------|--------|------|-------|
| BULL     | 60%    | 40%  | Momentum dominates |
| BEAR     | 40%    | 60%  | Mean-reversion after drop |
| SIDEWAYS | 20%    | 80%  | Pure OU mean-reversion |

## API Routes (apps/web/app/api/)

- `/api/portfolio` — GET: wallet tokens + LP positions (QuickNode RPC + Covalent + Binance prices)
- `/api/portfolio/balance` — GET: native balance only
- `/api/signals` — GET: list signals | POST: scan portfolio → quant engine → persist
- `/api/positions` — GET: positions | POST sync: sync from quant engine
- `/api/performance` — GET: aggregate metrics
- `/api/performance/trades` — GET/POST: paper trades
- `/api/performance/trades/[id]` — PUT: close trade
- `/api/auth/login` — POST: passphrase → JWT session
- `/api/auth/logout` — POST: clear session

## DB Schema (packages/db/src/schema.ts)

- `tokens` — ERC-20 metadata
- `quant_signals` — Signal history (symbol, signal, confidence, regime, risk levels, delta, Kelly fraction)
- `paper_trades` — Paper trade records (entry/exit, P&L, status)
- `portfolio` — Single-row simulated portfolio balance (starts at $1000 USD)
- `auto_positions` — Binance Futures Testnet positions (direction, leverage, order IDs, P&L)

## External Data Sources (Free)

- **Binance public API** — OHLCV, current price, funding rates (no auth needed)
- **CoinGecko free tier** — Fallback OHLCV for tokens not on Binance
- **Covalent API** — ERC-20 token balances (`COVALENT_API_KEY`)
- **QuickNode** — Native balance via RPC (`QUICKNODE_URL`)

## Chains

EVM only: Ethereum (1), Arbitrum (42161), Base (8453), Polygon (137).

## Wallet Connection

wagmi v2: MetaMask/injected + WalletConnect for hardware/mobile. Config in `apps/web/lib/wagmi/config.ts`.

## Conventions

- TypeScript strict mode everywhere
- Tailwind CSS v4 for styling (no `tailwind.config.*` file — v4 uses CSS-first config in `globals.css`)
- Server components by default, `"use client"` only when needed
- Drizzle ORM for database queries
- `@deepdive/*` workspace imports for shared packages
- Next.js `output: "standalone"` configured for Docker/serverless deployments
- No test framework is configured — there are no test files in the repo

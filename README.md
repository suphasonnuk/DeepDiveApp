# DeepDive — Wallet Dashboard + Quant Signal Platform

Personal single-user app that shows your connected wallet's portfolio (tokens + LP positions), generates buy/sell/hold signals using pure mathematical quant models, and tracks paper trading performance.

See [DEPLOY.md](DEPLOY.md) for the full step-by-step deployment guide.

## What It Does

- **Dashboard** — Connected wallet token balances + LP positions + total USD value
- **Signals** — Quant buy/sell/hold signals with confidence, R/R ratio, Kelly fraction, delta
- **Performance** — Paper trade history, equity curve, Sharpe ratio, win rate, max drawdown
- **Settings** — Wallet connect, model info, security details

## Quant Models

Signals are derived from rigorous mathematical models — not popular indicators:

| Model | Purpose |
|-------|---------|
| Kalman Filter | State estimation: fair value + price velocity |
| Ornstein-Uhlenbeck | Mean-reversion SDE, z-score entry/exit |
| HMM (3-state) | Regime detection: BULL / BEAR / SIDEWAYS |
| Kelly Criterion | Optimal position sizing (half-Kelly, max 25%) |

Regime-adaptive weighting: BULL favors Kalman (momentum), SIDEWAYS favors OU (mean-reversion).

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Up Environment Variables

Two separate env files are needed — Next.js and drizzle-kit each look in different directories.

**For the web app** — create `apps/web/.env.local`:
```
JWT_SECRET=your_64_char_hex
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your_token
QUICKNODE_URL=https://your-endpoint.quiknode.pro/xxx/
COVALENT_API_KEY=your_key
QUANT_ENGINE_URL=http://localhost:8000
NEXT_PUBLIC_RPC_ETHEREUM=https://your-endpoint.quiknode.pro/xxx/
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_id
```

**For database push only** — create `packages/db/.env`:
```
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your_token
```

> `apps/web/.env.local` is gitignored — each machine keeps its own copy. Next.js only reads env files from the app directory, not the repo root.

### 3. Push Database Schema

```bash
cd packages/db
pnpm db:push
```

You should see these tables created: `tokens`, `token_prices`, `quant_signals`, `paper_trades`

### 4. Start Dev Server

```bash
pnpm dev
```

App runs at http://localhost:3000

### 5. Start Quant Engine (for signal generation)

```bash
cd services/quant-engine
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Engine runs at http://localhost:8000 (docs at `/docs`)

## Architecture

```
apps/web/              → Next.js 15 (App Router)
  ├── app/
  │   ├── (auth)/login/       → Passphrase login
  │   ├── (app)/              → Authenticated shell
  │   │   ├── dashboard/      → Portfolio: tokens + LP positions
  │   │   ├── markets/        → Quant signals
  │   │   ├── trades/         → Paper trade history + performance
  │   │   └── settings/       → Wallet connect + info
  │   ├── api/
  │   │   ├── auth/           → Login/logout (JWT)
  │   │   ├── portfolio/      → Wallet balances via QuickNode + Covalent
  │   │   ├── signals/        → Signal list + portfolio scan
  │   │   └── performance/    → Metrics + paper trades
  │   └── middleware.ts       → JWT auth gate

packages/
  ├── crypto/          → Web Crypto API encryption vault (AES-256-GCM)
  ├── chains/          → Viem multi-chain registry (ETH, ARB, Base, Polygon)
  └── db/              → Turso + Drizzle ORM schema

services/quant-engine/ → Python FastAPI
  ├── app/models/      → kalman.py, ou_process.py, hmm_regime.py, kelly.py
  ├── app/signals/     → generator.py (orchestrates all models)
  ├── app/data/        → fetchers.py (Binance primary, CoinGecko fallback)
  └── app/performance/ → tracker.py (paper trades + metrics)
```

## Data Flow

1. **Wallet connected** → QuickNode RPC fetches native balance; Covalent fetches ERC-20s
2. **Scan Portfolio** → tokens sent to quant engine batch endpoint
3. **Quant engine** → Kalman + OU + HMM + Kelly → regime-weighted signal per token
4. **Signal persisted** → stored in `quant_signals` table in Turso
5. **Open Paper Trade** → entry recorded in `paper_trades` table
6. **Performance tab** → Sharpe ratio, win rate, max drawdown, equity curve

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js 15 + React 19 + Tailwind CSS 4 |
| Wallet | wagmi v2 + Viem (MetaMask, WalletConnect) |
| Database | Turso (edge SQLite) + Drizzle ORM |
| Blockchain data | QuickNode RPC + Covalent API |
| Price data | Binance public API + CoinGecko (fallback) |
| Quant engine | Python FastAPI + numpy + scipy + hmmlearn |
| Hosting | Vercel (web) or GCP Cloud Run |

## Security

- **Passphrase auth** — PBKDF2 (600k iterations) derives AES-256-GCM encryption key
- **Local encryption** — All sensitive data encrypted in browser IndexedDB via `@deepdive/crypto`
- **Wallet signing** — Private keys never leave your wallet device
- **Server isolation** — Cloud never stores which tokens you hold (Tier 2 data stays local)

## Data Classification

- **Cloud OK**: Token prices, quant signals, paper trade history, performance metrics
- **Local only (encrypted)**: Wallet keys, portfolio holdings
- **In-memory only**: Portfolio valuations, live P&L

## Deployment

See [DEPLOY.md](DEPLOY.md) for the full Windows/PowerShell guide including GCP Cloud Run setup.

## License

Private use only.

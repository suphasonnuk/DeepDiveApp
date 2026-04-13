# DeepDive — Copy Trading Platform

Track profitable wallet addresses on-chain and replicate their trades with your approval.

**🚀 Cloud Run Ready** — Deploy to GCP in 15 minutes.  
📖 [QUICKSTART.md](QUICKSTART.md) | 📚 [Full Deployment Guide](DEPLOYMENT.md)

## What's Built

### ✅ Phase 1: Foundation (Complete)
- **Turborepo monorepo** with pnpm workspaces
- **Next.js 15 web app** with 4-tab mobile-first UI
- **Passphrase authentication** with Web Crypto API encryption
- **Wallet connection** (MetaMask, Ledger, Trezor via wagmi)
- **Multi-chain support** (ETH, Arbitrum, Base, Polygon)

### ✅ Phase 2: Copy Trading Infrastructure (Complete)
- **Turso database** with Drizzle ORM for tracking:
  - Tracked wallet addresses
  - On-chain transactions detected
  - Token metadata & prices
  - Your executed copy trades
- **Trade.xyz integration** — DEX aggregator API client
- **Hyperliquid integration** — Perpetual futures DEX client  
- **Python quant engine** (FastAPI) for wallet performance analysis

### 🚧 Phase 3: Next Steps
- On-chain transaction monitoring service (watch wallets for new trades)
- Wallet performance analytics (win rate, Sharpe ratio)
- Copy trade signal generation
- Trade execution UI in Trades tab

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Up Environment Variables

Copy `.env.example` to `.env.local` in `apps/web`:

```bash
cp .env.example apps/web/.env.local
```

**Required:**
- `JWT_SECRET` — Generate with `openssl rand -hex 32`
- `TURSO_DATABASE_URL` — Create at [turso.tech](https://turso.tech)
- `TURSO_AUTH_TOKEN` — From Turso dashboard

**Optional:**
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — From [cloud.walletconnect.com](https://cloud.walletconnect.com)
- `NEXT_PUBLIC_RPC_*` — Alchemy/Infura RPC endpoints (or use public RPCs)
- `NEXT_PUBLIC_TRADEXYZ_API_KEY` — From Trade.xyz

### 3. Push Database Schema

```bash
cd packages/db
pnpm db:push
```

### 4. Start Dev Server

```bash
pnpm dev
```

App runs at http://localhost:3000

### 5. Start Quant Engine (Optional)

```bash
cd services/quant-engine
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Engine runs at http://localhost:8000 (docs at `/docs`)

## Usage

### Add Wallets to Track

```bash
curl -X POST http://localhost:3000/api/wallets \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0x...",
    "chainId": 1,
    "label": "Smart Money Wallet #1",
    "copyEnabled": true
  }'
```

### Get Swap Quotes

```bash
curl "http://localhost:3000/api/swap/quote?\
tokenIn=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2&\
tokenOut=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48&\
amountIn=1000000000000000000&\
recipient=0x...&\
chainId=1&\
slippageBps=50"
```

Returns quotes from both Trade.xyz and Hyperliquid with the best route.

## Architecture

```
apps/web/              → Next.js frontend + API routes
  ├── app/
  │   ├── (auth)/login/       → Passphrase login
  │   ├── (app)/              → Authenticated shell
  │   │   ├── dashboard/      → Portfolio overview
  │   │   ├── markets/        → Token prices & charts
  │   │   ├── trades/         → Copy trade signals & history
  │   │   └── settings/       → Wallet connection, tracked addresses
  │   ├── api/
  │   │   ├── auth/           → Login/logout
  │   │   ├── wallets/        → Manage tracked wallets
  │   │   └── swap/           → DEX quotes & execution
  │   └── middleware.ts       → Auth gate

packages/
  ├── crypto/          → Web Crypto API encryption vault
  ├── chains/          → Viem multi-chain registry
  └── db/              → Turso + Drizzle schema

services/quant-engine/ → Python FastAPI analytics
  └── app/main.py      → Wallet performance & signals
```

## Data Flow

1. **User adds wallet** → Stored in `tracked_wallets` table
2. **Monitor on-chain** (TODO) → Detect DEX swaps via event logs
3. **Store trades** → `wallet_transactions` table
4. **Quant engine analyzes** → Win rate, Sharpe ratio, signals
5. **Signal appears in Trades tab** → User reviews & approves
6. **Execute swap** → wagmi signs tx, submitted on-chain
7. **Record result** → Stored in `copy_trades` table

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js 15 + React 19 + Tailwind CSS |
| Wallet | wagmi v2 (Viem-based) |
| Database | Turso (edge SQLite) + Drizzle ORM |
| Blockchain | Viem (EVM chains) |
| DEXs | Trade.xyz + Hyperliquid APIs |
| Analytics | Python FastAPI + pandas/numpy |
| Hosting | GCP Cloud Run (web + quant engine) |

## Security

- **Passphrase-based auth** — PBKDF2 (600k iterations) derives encryption key
- **Local encryption** — AES-256-GCM for all sensitive data in IndexedDB
- **Wallet signing** — Private keys never leave your wallet device
- **Server isolation** — Cloud only stores public data (prices, on-chain txs)

## Deployment

### GCP Cloud Run (Recommended)

See [DEPLOYMENT.md](DEPLOYMENT.md) for full instructions.

Quick deploy:
```bash
gcloud builds submit --config=cloudbuild.yaml
```

Estimated cost: **$15-25/month** (pay only for actual usage)

### Known Issues

Local production builds fail due to libSQL native dependency bundling. This does not affect:
- Development mode (`pnpm dev`) — **works perfectly**
- Cloud deployments (GCP, Vercel) — **work correctly**

See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for details.

## Contributing

This is a personal single-user app. The architecture enforces one user only (no multi-tenancy).

## License

Private use only.

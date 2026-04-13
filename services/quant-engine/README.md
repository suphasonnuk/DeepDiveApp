# DeepDive Quant Engine

Python FastAPI service for analyzing copy trading opportunities.

## Features

- **Wallet Performance Analysis**: Calculate win rate, Sharpe ratio, profit metrics for tracked wallets
- **Signal Generation**: Generate copy trade signals from monitored wallet activity
- **Backtesting**: Test historical performance of copying specific wallets

## Setup

### Local Development

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy `.env.example` to `.env` and configure:
   ```bash
   cp .env.example .env
   ```

4. Run the server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

5. API docs available at: http://localhost:8000/docs

### Docker

```bash
docker-compose up
```

## API Endpoints

### `POST /api/v1/analyze-wallet`
Analyze historical performance of a wallet address.

**Request:**
```json
{
  "address": "0x...",
  "chainId": 1
}
```

**Response:**
```json
{
  "address": "0x...",
  "totalTrades": 150,
  "winRate": 68.5,
  "avgProfitPercent": 12.3,
  "sharpeRatio": 1.8,
  "maxDrawdown": -15.2,
  "profitFactor": 2.4
}
```

### `POST /api/v1/signals`
Get copy trade signals from tracked wallets.

**Request:**
```json
{
  "wallets": [
    {"address": "0x...", "chainId": 1},
    {"address": "0x...", "chainId": 42161}
  ]
}
```

**Response:**
```json
[
  {
    "walletAddress": "0x...",
    "tokenIn": "0x...",
    "tokenOut": "0x...",
    "amountIn": "1000000000000000000",
    "confidence": 0.85,
    "reasoning": "High-performing wallet (72% win rate) buying ETH"
  }
]
```

### `POST /api/v1/backtest`
Backtest a copy trading strategy.

**Request:**
```json
{
  "walletAddress": "0x...",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "initialCapital": 10000
}
```

## Deployment

Deploy to Railway, Fly.io, or any container platform:

```bash
# Railway
railway up

# Fly.io
fly deploy
```

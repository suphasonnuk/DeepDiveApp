# DeepDiveApp — Deployment Guide

Follow these steps **top to bottom**. Each step must complete before the next.

**Time to deploy:** ~20 minutes  
**Cost:** ~$12–23/month (pay-per-request, free tier covers most personal use)

---

## Checklist of What You'll Need

- [ ] Google Cloud account with billing enabled → https://console.cloud.google.com
- [ ] `gcloud` CLI installed → https://cloud.google.com/sdk/docs/install
- [ ] `turso` CLI (installed in Step 1)
- [ ] Moralis account (free) → https://admin.moralis.io/register
- [ ] Covalent account (free) → https://www.covalenthq.com/platform/auth/register/

---

## Step 1 — Get All Credentials

Keep a text file open to paste values as you go. You need them in Step 3.

### 1A. Turso Database (5 min)

Turso is the SQLite cloud database that stores wallets, transactions, and signals.

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Log in (opens browser)
turso auth login

# Create your database
turso db create deepdive-db

# Get the database URL — copy this
turso db show deepdive-db --url
# Example output: libsql://deepdive-db-yourname.turso.io

# Generate an auth token — copy this
turso db tokens create deepdive-db
# Example output: eyJhbGci...
```

Save:
- `TURSO_DATABASE_URL` = the URL from `--url`
- `TURSO_AUTH_TOKEN` = the token from `tokens create`

---

### 1B. Moralis API Key (3 min)

Moralis provides portfolio value and trading activity data for smart money discovery.

1. Sign up: https://admin.moralis.io/register
2. Create a new project (any name)
3. Go to the project → copy the **API Key**

Save: `MORALIS_API_KEY`

---

### 1C. Covalent API Key (3 min)

Covalent provides top token holder data for whale discovery.

1. Sign up: https://www.covalenthq.com/platform/auth/register/
2. Go to **API Keys** in the dashboard
3. Copy your key

Save: `COVALENT_API_KEY`

---

### 1D. JWT Secret (1 min)

This is used to sign authentication tokens. Generate it locally — never share it.

```bash
openssl rand -hex 32
```

Save: `JWT_SECRET` = the output string

---

### 1E. Block Explorer API Keys (Optional, 5 min)

These enable transaction monitoring per chain. Skip and add later if you want.

| Chain | Sign up | Save as |
|-------|---------|---------|
| Ethereum | https://etherscan.io/register → API-KEYs | `ETHERSCAN_API_KEY` |
| Arbitrum | https://arbiscan.io/register → API-KEYs | `ARBISCAN_API_KEY` |
| Base | https://basescan.org/register → API-KEYs | `BASESCAN_API_KEY` |
| Polygon | https://polygonscan.com/register → API-KEYs | `POLYGONSCAN_API_KEY` |

---

### 1F. WalletConnect Project ID (Optional, 3 min)

Required only for mobile wallet support (MetaMask mobile, Trust Wallet, etc.).

1. Sign up: https://cloud.walletconnect.com
2. Create a new project (any name)
3. Copy the **Project ID**

Save: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

---

## Step 2 — Set Up Google Cloud Project

```bash
# Verify gcloud is installed
gcloud --version

# Log in to GCP (opens browser)
gcloud auth login

# Create a new project
gcloud projects create deepdive-app --name="DeepDive App"

# Set it as the active project
gcloud config set project deepdive-app

# Enable the required GCP services
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  containerregistry.googleapis.com
```

> If `deepdive-app` is taken as a project ID, try `deepdive-app-yourname` and use that ID everywhere below.

---

## Step 3 — Store Secrets in GCP Secret Manager

Replace each `YOUR_*` with the actual values you saved in Step 1.

**Required secrets (do these first):**

```bash
echo -n "YOUR_TURSO_DATABASE_URL" | gcloud secrets create TURSO_DATABASE_URL --data-file=-
echo -n "YOUR_TURSO_AUTH_TOKEN"   | gcloud secrets create TURSO_AUTH_TOKEN   --data-file=-
echo -n "YOUR_JWT_SECRET"         | gcloud secrets create JWT_SECRET          --data-file=-
echo -n "YOUR_MORALIS_API_KEY"    | gcloud secrets create MORALIS_API_KEY     --data-file=-
echo -n "YOUR_COVALENT_API_KEY"   | gcloud secrets create COVALENT_API_KEY    --data-file=-
```

**Optional secrets (skip if you don't have them yet):**

```bash
echo -n "YOUR_ETHERSCAN_API_KEY"   | gcloud secrets create ETHERSCAN_API_KEY   --data-file=-
echo -n "YOUR_ARBISCAN_API_KEY"    | gcloud secrets create ARBISCAN_API_KEY    --data-file=-
echo -n "YOUR_BASESCAN_API_KEY"    | gcloud secrets create BASESCAN_API_KEY    --data-file=-
echo -n "YOUR_POLYGONSCAN_API_KEY" | gcloud secrets create POLYGONSCAN_API_KEY --data-file=-
echo -n "YOUR_WALLETCONNECT_ID"    | gcloud secrets create WALLETCONNECT_PROJECT_ID --data-file=-
```

**Grant Cloud Run permission to read secrets:**

```bash
PROJECT_NUMBER=$(gcloud projects describe deepdive-app --format="value(projectNumber)")

gcloud projects add-iam-policy-binding deepdive-app \
  --member=serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

---

## Step 4 — Push Database Schema to Turso

This creates the tables in your Turso database. Run from the project root:

```bash
cd packages/db
pnpm db:push
```

Expected output:
```
✓ Applying migrations...
✓ 5 tables created
```

Tables created: `copy_trades`, `smart_money_signals`, `token_prices`, `tokens`, `tracked_wallets`, `wallet_transactions`

> If `pnpm db:push` fails, verify `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set correctly in `packages/db/.env`.

---

## Step 5 — Deploy the Web App

From the project root (`/home/user/DeepDiveApp`):

```bash
gcloud builds submit --config=cloudbuild.yaml
```

This builds a Docker image, pushes it to GCP Container Registry, and deploys to Cloud Run. **Wait 5–10 minutes.**

Watch the build:
```bash
gcloud builds list --limit=3
```

**If Cloud Build fails** — deploy manually instead:

```bash
# Authenticate Docker with GCP
gcloud auth configure-docker

# Build and push image
docker build -t gcr.io/deepdive-app/deepdive-web:latest .
docker push gcr.io/deepdive-app/deepdive-web:latest

# Deploy to Cloud Run (required secrets only)
gcloud run deploy deepdive-web \
  --image=gcr.io/deepdive-app/deepdive-web:latest \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --set-secrets=TURSO_DATABASE_URL=TURSO_DATABASE_URL:latest,TURSO_AUTH_TOKEN=TURSO_AUTH_TOKEN:latest,JWT_SECRET=JWT_SECRET:latest,MORALIS_API_KEY=MORALIS_API_KEY:latest,COVALENT_API_KEY=COVALENT_API_KEY:latest \
  --memory=2Gi \
  --cpu=2 \
  --timeout=300 \
  --max-instances=10 \
  --min-instances=0 \
  --port=8080
```

---

## Step 6 — Deploy the Quant Engine (Optional)

The quant engine analyzes wallet performance and generates trade signals. Skip this on first deploy — the web app works without it.

```bash
cd services/quant-engine

gcloud run deploy deepdive-quant-engine \
  --source=. \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=2 \
  --timeout=600 \
  --max-instances=5 \
  --min-instances=0
```

Then wire it up to the web app:

```bash
# Get quant engine URL
QUANT_URL=$(gcloud run services describe deepdive-quant-engine \
  --region=us-central1 --format='value(status.url)')

# Store it as a secret
echo -n "$QUANT_URL" | gcloud secrets create QUANT_ENGINE_URL --data-file=-

# Update web app to use it
gcloud run services update deepdive-web \
  --region=us-central1 \
  --update-secrets=QUANT_ENGINE_URL=QUANT_ENGINE_URL:latest
```

---

## Step 7 — Get Your App URL

```bash
gcloud run services describe deepdive-web \
  --region=us-central1 \
  --format='value(status.url)'
```

Output looks like: `https://deepdive-web-abc123-uc.a.run.app`

Open that URL in your browser.

---

## Step 8 — First Login

1. Open your app URL
2. **Create a passphrase** — this encrypts all your sensitive data locally (AES-256-GCM). Don't forget it.
3. Go to **Settings** → connect your MetaMask wallet
4. Click **Import Famous Wallets** to seed tracked wallets
5. Click **Discover (ETH)** or **Discover (ARB)** to find top traders
6. Check **Dashboard** for signals

---

## Updating the App

After making code changes locally:

```bash
git add -A
git commit -m "your changes"
git push origin main

# Redeploy
gcloud builds submit --config=cloudbuild.yaml
```

**Or set up auto-deploy on every push to main:**

```bash
gcloud builds triggers create github \
  --repo-name=DeepDiveApp \
  --repo-owner=suphasonnuk \
  --branch-pattern=^main$ \
  --build-config=cloudbuild.yaml
```

---

## Adding Optional Secrets Later

After creating the secrets in Step 1E/1F, add them to the running service:

```bash
gcloud run services update deepdive-web \
  --region=us-central1 \
  --update-secrets=ETHERSCAN_API_KEY=ETHERSCAN_API_KEY:latest
```

Repeat for each key you want to add.

---

## Troubleshooting

### Build fails with timeout
```bash
# Check what went wrong
gcloud builds list --limit=5
gcloud builds log BUILD_ID
```
Fix: edit `cloudbuild.yaml`, set `machineType: 'E2_HIGHCPU_8'` and `timeout: '1800s'`.

### "Secret does not exist" error
You tried to mount a secret that wasn't created. Only mount secrets you've actually created. Use the minimal `--set-secrets` list in the manual deploy command (Step 5).

### Service won't start (code 137 = out of memory)
```bash
gcloud run services update deepdive-web --region=us-central1 --memory=4Gi
```

### Permission denied accessing secrets
```bash
PROJECT_NUMBER=$(gcloud projects describe deepdive-app --format="value(projectNumber)")
gcloud projects add-iam-policy-binding deepdive-app \
  --member=serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

### Database connection error
```bash
# Test your Turso connection
turso db shell deepdive-db
.tables
# Should show: copy_trades, smart_money_signals, token_prices, tokens, tracked_wallets, wallet_transactions
```

### Local `pnpm build` fails (libSQL webpack error)
This is a known non-blocking issue. The local production build fails because webpack tries to bundle README/LICENSE files from the libSQL native package. This does **not** affect Cloud Run deployments — GCP handles native dependencies correctly. Use `pnpm dev` for local testing.

### View live logs
```bash
gcloud run services logs tail deepdive-web --region=us-central1
```

---

## Useful Commands

```bash
# View all deployed services
gcloud run services list

# Check service status
gcloud run services describe deepdive-web --region=us-central1

# View recent logs
gcloud run services logs read deepdive-web --region=us-central1 --limit=100

# Update a secret value
echo -n "NEW_VALUE" | gcloud secrets versions add SECRET_NAME --data-file=-

# Scale to zero (pause billing)
gcloud run services update deepdive-web --region=us-central1 --min-instances=0

# Force a restart (new revision)
gcloud run services update deepdive-web --region=us-central1 --revision-suffix=$(date +%s)

# Delete service
gcloud run services delete deepdive-web --region=us-central1
```

---

## Cost Estimate

| Service | Est. Cost/Month |
|---------|----------------|
| Web App (Cloud Run) | $5–10 |
| Quant Engine (Cloud Run) | $5–10 |
| Container Registry | $1–2 |
| Secret Manager (10 secrets) | $0.60 |
| Turso (free tier) | $0 |
| API keys (free tiers) | $0 |
| **Total** | **$12–23** |

GCP free tier: 2M requests/month, 360K GB-seconds compute — personal use is often free.

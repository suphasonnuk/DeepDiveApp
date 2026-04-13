# DeepDiveApp - GCP Cloud Run Deployment Guide

**This app is Cloud Run ready.** Follow these steps to deploy.

---

## Prerequisites Checklist

- [ ] Google Cloud Platform account with billing enabled
- [ ] `gcloud` CLI installed ([Install Guide](https://cloud.google.com/sdk/docs/install))
- [ ] GitHub account (already have: suphasonnuk)
- [ ] Turso account ([turso.tech](https://turso.tech))

---

## Part 1: Setup Required Accounts & API Keys

### 1.1 Create Turso Database (5 minutes)

**Why:** SQLite database for storing tracked wallets, transactions, and signals

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Login to Turso
turso auth login

# Create database
turso db create deepdive-db

# Get database URL
turso db show deepdive-db --url

# Get auth token
turso db tokens create deepdive-db
```

**Save these values:**
- `TURSO_DATABASE_URL`: libsql://deepdive-db-[your-org].turso.io
- `TURSO_AUTH_TOKEN`: eyJhbGci...

---

### 1.2 Get Moralis API Key (3 minutes)

**Why:** Portfolio value & trading activity data for smart money discovery

1. Go to: https://admin.moralis.io/register
2. Sign up (free tier: 40,000 requests/month)
3. Create new project
4. Copy your API key

**Save:** `MORALIS_API_KEY`

---

### 1.3 Get Covalent API Key (3 minutes)

**Why:** Top token holders data for whale discovery

1. Go to: https://www.covalenthq.com/platform/auth/register/
2. Sign up (free tier: 100,000 credits/month)
3. Go to API Keys section
4. Copy your API key

**Save:** `COVALENT_API_KEY`

---

### 1.4 Get Block Explorer API Keys (Optional, 5 minutes)

**Why:** Transaction monitoring for tracked wallets

- **Etherscan**: https://etherscan.io/register → API-KEYs
- **Arbiscan**: https://arbiscan.io/register → API-KEYs  
- **Basescan**: https://basescan.org/register → API-KEYs
- **Polygonscan**: https://polygonscan.com/register → API-KEYs

**Save:** `ETHERSCAN_API_KEY`, `ARBISCAN_API_KEY`, `BASESCAN_API_KEY`, `POLYGONSCAN_API_KEY`

---

### 1.5 Generate JWT Secret (1 minute)

**Why:** Authentication encryption

```bash
openssl rand -hex 32
```

**Save:** `JWT_SECRET`

---

### 1.6 Get WalletConnect Project ID (Optional, 3 minutes)

**Why:** Mobile wallet support (MetaMask, Trust Wallet, etc.)

1. Go to: https://cloud.walletconnect.com
2. Sign up
3. Create new project
4. Copy Project ID

**Save:** `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

---

## Part 2: Setup Google Cloud Platform

### 2.1 Install & Configure gcloud CLI

```bash
# Check if gcloud is installed
gcloud --version

# If not installed, install it:
# Mac: brew install google-cloud-sdk
# Ubuntu: sudo snap install google-cloud-sdk --classic
# Windows: https://cloud.google.com/sdk/docs/install

# Login to GCP
gcloud auth login

# Set your project (or create new one)
gcloud projects create deepdive-app --name="DeepDive App"
gcloud config set project deepdive-app

# Enable required APIs
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  containerregistry.googleapis.com
```

---

### 2.2 Store Secrets in Secret Manager

**REQUIRED SECRETS:**

```bash
# Turso Database
echo -n "YOUR_TURSO_DATABASE_URL" | gcloud secrets create TURSO_DATABASE_URL --data-file=-
echo -n "YOUR_TURSO_AUTH_TOKEN" | gcloud secrets create TURSO_AUTH_TOKEN --data-file=-

# Smart Money Discovery
echo -n "YOUR_MORALIS_API_KEY" | gcloud secrets create MORALIS_API_KEY --data-file=-
echo -n "YOUR_COVALENT_API_KEY" | gcloud secrets create COVALENT_API_KEY --data-file=-

# Authentication
echo -n "YOUR_JWT_SECRET" | gcloud secrets create JWT_SECRET --data-file=-
```

**OPTIONAL SECRETS (but recommended):**

```bash
# Block Explorers
echo -n "YOUR_ETHERSCAN_API_KEY" | gcloud secrets create ETHERSCAN_API_KEY --data-file=-
echo -n "YOUR_ARBISCAN_API_KEY" | gcloud secrets create ARBISCAN_API_KEY --data-file=-
echo -n "YOUR_BASESCAN_API_KEY" | gcloud secrets create BASESCAN_API_KEY --data-file=-
echo -n "YOUR_POLYGONSCAN_API_KEY" | gcloud secrets create POLYGONSCAN_API_KEY --data-file=-

# WalletConnect
echo -n "YOUR_WALLETCONNECT_PROJECT_ID" | gcloud secrets create WALLETCONNECT_PROJECT_ID --data-file=-
```

---

### 2.3 Grant Cloud Run Access to Secrets

```bash
# Get your project number
PROJECT_NUMBER=$(gcloud projects describe deepdive-app --format="value(projectNumber)")

# Grant Secret Manager access to Cloud Run
gcloud projects add-iam-policy-binding deepdive-app \
  --member=serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

---

## Part 3: Push Database Schema to Turso

**Before deploying, create the database tables:**

```bash
# In your local DeepDiveApp directory
cd packages/db

# Push schema to Turso
pnpm db:push
```

**Expected output:**
```
✓ Applying migrations...
✓ 5 tables created
```

---

## Part 4: Deploy Web App to Cloud Run

### Option A: Deploy via Cloud Build (Recommended)

```bash
# From DeepDiveApp root directory
gcloud builds submit --config=cloudbuild.yaml
```

**Wait 3-5 minutes for build to complete.**

---

### Option B: Deploy Manually

```bash
# Build and push Docker image
docker build -t gcr.io/deepdive-app/deepdive-web:latest .
docker push gcr.io/deepdive-app/deepdive-web:latest

# Deploy to Cloud Run
gcloud run deploy deepdive-web \
  --image=gcr.io/deepdive-app/deepdive-web:latest \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --set-secrets=TURSO_DATABASE_URL=TURSO_DATABASE_URL:latest,TURSO_AUTH_TOKEN=TURSO_AUTH_TOKEN:latest,JWT_SECRET=JWT_SECRET:latest,MORALIS_API_KEY=MORALIS_API_KEY:latest,COVALENT_API_KEY=COVALENT_API_KEY:latest,ETHERSCAN_API_KEY=ETHERSCAN_API_KEY:latest,ARBISCAN_API_KEY=ARBISCAN_API_KEY:latest,BASESCAN_API_KEY=BASESCAN_API_KEY:latest,POLYGONSCAN_API_KEY=POLYGONSCAN_API_KEY:latest,NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=WALLETCONNECT_PROJECT_ID:latest \
  --memory=1Gi \
  --cpu=1 \
  --timeout=300 \
  --max-instances=10 \
  --min-instances=0
```

---

## Part 5: Deploy Python Quant Engine (Optional)

**The quant engine analyzes whale signals. Deploy this for signal generation:**

```bash
cd services/quant-engine

# Deploy to Cloud Run
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

**Get the quant engine URL:**
```bash
gcloud run services describe deepdive-quant-engine \
  --region=us-central1 \
  --format='value(status.url)'
```

**Then add it to web app secrets:**
```bash
echo -n "https://deepdive-quant-engine-xxx.run.app" | gcloud secrets create QUANT_ENGINE_URL --data-file=-

# Redeploy web app with quant engine URL
gcloud run services update deepdive-web \
  --region=us-central1 \
  --set-secrets=QUANT_ENGINE_URL=QUANT_ENGINE_URL:latest
```

---

## Part 6: Get Your App URL & Test

```bash
# Get your deployed app URL
gcloud run services describe deepdive-web \
  --region=us-central1 \
  --format='value(status.url)'
```

**Example output:**
```
https://deepdive-web-abc123-uc.a.run.app
```

**Open this URL in your browser!**

---

## Part 7: First Login & Setup

1. **Open your app URL**
2. **Create your passphrase** (this encrypts all your sensitive data)
3. **Go to Settings tab**
4. **Connect your MetaMask wallet**
5. **Import famous wallets:** Click "Import Famous Wallets"
6. **Discover top wallets:** Click "Discover (ETH)" or "Discover (ARB)"

---

## Cost Estimate

Cloud Run charges **only for actual usage** (pay-per-request):

| Service | Usage | Cost/Month |
|---------|-------|------------|
| **Web App** | Low traffic (~100 req/day) | $5-10 |
| **Quant Engine** | On-demand (signals only) | $5-10 |
| **Container Registry** | Image storage | $1-2 |
| **Secret Manager** | 10 secrets | $0.60 |
| **Turso Database** | Free tier | $0 |
| **API Keys** | Free tiers | $0 |
| **TOTAL** | | **$12-23/month** |

**Free tier includes:**
- 2 million requests/month
- 360,000 GB-seconds compute
- First 180,000 vCPU-seconds free

---

## Monitoring & Logs

**View logs:**
```bash
gcloud run services logs read deepdive-web --region=us-central1 --limit=100
```

**View in GCP Console:**
```
https://console.cloud.google.com/run?project=deepdive-app
```

---

## CI/CD: Automatic Deployments on Git Push

**Setup automatic deployment when you push to GitHub:**

```bash
# Connect GitHub repository
gcloud builds triggers create github \
  --repo-name=DeepDiveApp \
  --repo-owner=suphasonnuk \
  --branch-pattern=^main$ \
  --build-config=cloudbuild.yaml
```

**Now every push to `main` branch automatically deploys to Cloud Run!**

---

## Troubleshooting

### Build Fails

**Check build logs:**
```bash
gcloud builds list --limit=5
gcloud builds log [BUILD_ID]
```

### Service Won't Start

**Check service logs:**
```bash
gcloud run services logs read deepdive-web --region=us-central1
```

### Secrets Not Loading

**Verify secrets exist:**
```bash
gcloud secrets list
```

**Verify service account has access:**
```bash
gcloud projects get-iam-policy deepdive-app \
  --flatten="bindings[].members" \
  --filter="bindings.members:*compute@developer.gserviceaccount.com"
```

### Database Connection Error

**Test Turso connection:**
```bash
turso db shell deepdive-db
```

**Verify schema is pushed:**
```sql
.tables
```

Should show: `copy_trades`, `smart_money_signals`, `token_prices`, `tokens`, `tracked_wallets`, `wallet_transactions`

---

## Update Your App

**Make code changes locally, then:**

```bash
# Commit changes
git add -A
git commit -m "your changes"
git push origin main

# If CI/CD is setup, it auto-deploys
# Otherwise, manually deploy:
gcloud builds submit --config=cloudbuild.yaml
```

---

## Useful Commands

```bash
# View all Cloud Run services
gcloud run services list

# Delete a service
gcloud run services delete deepdive-web --region=us-central1

# Update environment variables
gcloud run services update deepdive-web \
  --region=us-central1 \
  --set-env-vars=KEY=value

# Scale to zero (pause service)
gcloud run services update deepdive-web \
  --region=us-central1 \
  --min-instances=0

# View container logs live
gcloud run services logs tail deepdive-web --region=us-central1
```

---

## Security Notes

1. **Never commit `.env` files** - Already in `.gitignore`
2. **All secrets stored in Secret Manager** - Encrypted at rest
3. **HTTPS only** - Cloud Run enforces TLS
4. **Authentication required** - Passphrase-based login
5. **Wallet keys never touch server** - Client-side signing only

---

## Next Steps After Deployment

1. **Test smart money discovery** - Import famous wallets and discover new ones
2. **Add your own wallets to track** - Settings → Tracked Wallets → Add
3. **Monitor whale activity** - Dashboard will show signals
4. **Connect your trading wallet** - Execute copy trades when signals appear
5. **Set up API rate limits** - Monitor Moralis/Covalent usage in their dashboards

---

## Support

- **GCP Documentation**: https://cloud.google.com/run/docs
- **Turso Docs**: https://docs.turso.tech
- **GitHub Repo**: https://github.com/suphasonnuk/DeepDiveApp

**Your app is production-ready. Deploy and start tracking smart money! 🚀**

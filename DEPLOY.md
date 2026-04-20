# DeepDiveApp — Deployment Guide (Windows / PowerShell)

Follow these steps **top to bottom**. Each step must complete before the next.  
All commands are written for **PowerShell** on Windows.

**Time to deploy:** ~20 minutes  
**Cost:** ~$12–23/month (pay-per-request, free tier covers most personal use)

---

## Checklist of What You'll Need

- [ ] Google Cloud account with billing enabled → https://console.cloud.google.com
- [ ] `gcloud` CLI installed → https://cloud.google.com/sdk/docs/install
- [ ] QuickNode account (free tier) → https://quicknode.com
- [ ] Turso database (web dashboard, no CLI) → https://app.turso.tech
- [ ] Covalent account (free) → https://www.covalenthq.com/platform/auth/register/

---

## Step 1 — Get All Credentials

Keep a text file open to paste values as you go. You need them in Step 3.

### 1A. Turso Database (5 min)

Turso is the SQLite cloud database that stores quant signals and paper trade history.

**Use the web dashboard (no CLI needed):**

1. Sign up at https://app.turso.tech
2. Click **Create Database** → name it `deepdive-db`, pick any region
3. Click the database → find the **URL** (starts with `libsql://...`)
4. Click **Generate Token** → copy the token

Save:
- `TURSO_DATABASE_URL` = the `libsql://...` URL
- `TURSO_AUTH_TOKEN` = the generated token

---

### 1B. QuickNode RPC Endpoint (5 min)

QuickNode provides fast RPC for reading wallet balances and on-chain data.

**Free tier:** 300M requests/month — more than enough for personal use.

1. Sign up at https://quicknode.com
2. Click **Create Endpoint**
3. Select **Ethereum** → **Mainnet** → Create
4. Copy the **HTTP Provider** URL (looks like `https://your-name.quiknode.pro/xxx/`)
5. Repeat for **Arbitrum**, **Base**, and **Polygon** if needed

Save:
- `QUICKNODE_URL` = Your primary Ethereum endpoint URL
- `NEXT_PUBLIC_RPC_ETHEREUM` = Same URL (used client-side by wagmi)
- `NEXT_PUBLIC_RPC_ARBITRUM` = Your Arbitrum endpoint URL
- `NEXT_PUBLIC_RPC_BASE` = Your Base endpoint URL
- `NEXT_PUBLIC_RPC_POLYGON` = Your Polygon endpoint URL

---

### 1C. Covalent API Key (3 min)

Covalent provides ERC-20 token balance discovery for the portfolio dashboard.

1. Sign up: https://www.covalenthq.com/platform/auth/register/
2. Go to **API Keys** in the dashboard
3. Copy your key

Save: `COVALENT_API_KEY`

---

### 1D. JWT Secret (1 min)

Used to sign authentication tokens. Generate locally — never share it.

```powershell
# Run in PowerShell — outputs a 64-character hex string
[System.BitConverter]::ToString(
    [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
).Replace('-','').ToLower()
```

Save: `JWT_SECRET` = the output string

---

### 1E. WalletConnect Project ID (Optional, 3 min)

Required only for mobile wallet support (MetaMask mobile, Trust Wallet, etc.).

1. Sign up: https://cloud.walletconnect.com
2. Create a new project (any name)
3. Copy the **Project ID**

Save: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

---

## Step 2 — Set Up Google Cloud Project

```powershell
# Verify gcloud is installed
gcloud --version

# Log in to GCP (opens browser)
gcloud auth login

# Create a new project
gcloud projects create deepdive-app --name="DeepDive App"

# Set it as the active project
gcloud config set project deepdive-app

# Enable the required GCP services (backtick ` is PowerShell's line continuation)
gcloud services enable `
  cloudbuild.googleapis.com `
  run.googleapis.com `
  secretmanager.googleapis.com `
  containerregistry.googleapis.com
```

> If `deepdive-app` is already taken as a project ID, try `deepdive-app-yourname` and use that ID everywhere below.

---

## Step 3 — Store Secrets in GCP Secret Manager

**First, paste this helper function into PowerShell** (run once per session):

```powershell
function Set-GcpSecret($Name, $Value) {
    $tmp = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($tmp, $Value)
    gcloud secrets create $Name --data-file=$tmp
    Remove-Item $tmp
}
```

**Required secrets — replace each `YOUR_*` with your actual values:**

```powershell
Set-GcpSecret "TURSO_DATABASE_URL"    "YOUR_TURSO_DATABASE_URL"
Set-GcpSecret "TURSO_AUTH_TOKEN"      "YOUR_TURSO_AUTH_TOKEN"
Set-GcpSecret "JWT_SECRET"            "YOUR_JWT_SECRET"
Set-GcpSecret "QUICKNODE_URL"         "YOUR_QUICKNODE_URL"
Set-GcpSecret "COVALENT_API_KEY"      "YOUR_COVALENT_API_KEY"

# QuickNode RPC endpoints (used client-side by wagmi)
Set-GcpSecret "NEXT_PUBLIC_RPC_ETHEREUM"  "YOUR_QUICKNODE_ETHEREUM_URL"
Set-GcpSecret "NEXT_PUBLIC_RPC_ARBITRUM"  "YOUR_QUICKNODE_ARBITRUM_URL"
Set-GcpSecret "NEXT_PUBLIC_RPC_BASE"      "YOUR_QUICKNODE_BASE_URL"
Set-GcpSecret "NEXT_PUBLIC_RPC_POLYGON"   "YOUR_QUICKNODE_POLYGON_URL"
```

**Optional secrets:**

```powershell
Set-GcpSecret "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID" "YOUR_WALLETCONNECT_ID"
Set-GcpSecret "QUANT_ENGINE_URL"                     "YOUR_QUANT_ENGINE_URL"
```

**Grant Cloud Run permission to read secrets:**

```powershell
$PROJECT_NUMBER = gcloud projects describe deepdive-app --format="value(projectNumber)"

gcloud projects add-iam-policy-binding deepdive-app `
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" `
  --role=roles/secretmanager.secretAccessor
```

---

## Step 4 — Push Database Schema to Turso

**4a. Install dependencies (from project root):**

```powershell
pnpm install
```

**4b. Create `packages\db\.env` with your Turso credentials:**

Create the file `packages\db\.env` (NOT `.env.example`) and paste:

```
TURSO_DATABASE_URL=libsql://your-db-url-here
TURSO_AUTH_TOKEN=your-token-here
```

Replace with the actual values from Step 1A.

**4c. Push the schema:**

```powershell
cd packages\db
pnpm db:push
```

Expected output — you should see tables being created:
```
[✓] Changes applied
  Created table tokens
  Created table token_prices
  Created table quant_signals
  Created table paper_trades
```

> If it says "No changes detected", the tables already exist — that's fine.

---

## Step 5 — Deploy the Web App

From the project root:

```powershell
gcloud builds submit --config=cloudbuild.yaml
```

This builds a Docker image, pushes it to GCP Container Registry, and deploys to Cloud Run. **Wait 5–10 minutes.**

Watch the build:
```powershell
gcloud builds list --limit=3
```

**If Cloud Build fails** — deploy manually instead:

```powershell
# Authenticate Docker with GCP
gcloud auth configure-docker

# Build and push image
docker build -t gcr.io/deepdive-app/deepdive-web:latest .
docker push gcr.io/deepdive-app/deepdive-web:latest

# Deploy to Cloud Run
gcloud run deploy deepdive-web `
  --image=gcr.io/deepdive-app/deepdive-web:latest `
  --region=us-central1 `
  --platform=managed `
  --allow-unauthenticated `
  --set-secrets=TURSO_DATABASE_URL=TURSO_DATABASE_URL:latest,TURSO_AUTH_TOKEN=TURSO_AUTH_TOKEN:latest,JWT_SECRET=JWT_SECRET:latest,QUICKNODE_URL=QUICKNODE_URL:latest,COVALENT_API_KEY=COVALENT_API_KEY:latest,NEXT_PUBLIC_RPC_ETHEREUM=NEXT_PUBLIC_RPC_ETHEREUM:latest,NEXT_PUBLIC_RPC_ARBITRUM=NEXT_PUBLIC_RPC_ARBITRUM:latest,NEXT_PUBLIC_RPC_BASE=NEXT_PUBLIC_RPC_BASE:latest,NEXT_PUBLIC_RPC_POLYGON=NEXT_PUBLIC_RPC_POLYGON:latest `
  --memory=2Gi `
  --cpu=2 `
  --timeout=300 `
  --max-instances=10 `
  --min-instances=0 `
  --port=8080
```

---

## Step 6 — Deploy the Quant Engine (Required for Signals)

The quant engine runs Kalman Filter, Ornstein-Uhlenbeck, HMM, and Kelly Criterion models to generate buy/sell/hold signals. Without it, the Signals tab will show empty.

```powershell
cd services\quant-engine

gcloud run deploy deepdive-quant-engine `
  --source=. `
  --region=us-central1 `
  --platform=managed `
  --allow-unauthenticated `
  --memory=1Gi `
  --cpu=2 `
  --timeout=600 `
  --max-instances=5 `
  --min-instances=0
```

Then wire it up to the web app:

```powershell
# Get quant engine URL
$QUANT_URL = gcloud run services describe deepdive-quant-engine `
  --region=us-central1 --format="value(status.url)"

# Store it as a secret (reuse the helper from Step 3)
Set-GcpSecret "QUANT_ENGINE_URL" $QUANT_URL

# Update web app to use it
gcloud run services update deepdive-web `
  --region=us-central1 `
  --update-secrets=QUANT_ENGINE_URL=QUANT_ENGINE_URL:latest
```

---

## Step 7 — Get Your App URL

```powershell
gcloud run services describe deepdive-web `
  --region=us-central1 `
  --format="value(status.url)"
```

Output looks like: `https://deepdive-web-abc123-uc.a.run.app`

---

## Step 8 — First Login

1. Open your app URL
2. **Type any passphrase** — this becomes your login. It also derives an AES-256-GCM encryption key that protects sensitive data in your browser. **Remember it** — a different passphrase won't decrypt your local data.
3. Go to **Settings** → connect your MetaMask wallet
4. Go to **Dashboard** → your token balances will appear
5. Go to **Signals** → click **Scan Portfolio** to generate quant signals
6. Go to **Performance** → paper trades and metrics appear after opening trades from the Signals tab

---

## Updating the App

After making code changes locally:

```powershell
git add -A
git commit -m "your changes"
git push origin main

# Redeploy
gcloud builds submit --config=cloudbuild.yaml
```

**Or set up auto-deploy on every push to main:**

```powershell
gcloud builds triggers create github `
  --repo-name=DeepDiveApp `
  --repo-owner=suphasonnuk `
  --branch-pattern=^main$ `
  --build-config=cloudbuild.yaml
```

---

## Adding Optional Secrets Later

```powershell
function Update-GcpSecret($Name, $Value) {
    $tmp = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($tmp, $Value)
    gcloud secrets versions add $Name --data-file=$tmp
    Remove-Item $tmp
}

Update-GcpSecret "SECRET_NAME" "NEW_VALUE"

# Apply to running service
gcloud run services update deepdive-web `
  --region=us-central1 `
  --update-secrets=SECRET_NAME=SECRET_NAME:latest
```

---

## Troubleshooting

### Build fails with timeout
```powershell
gcloud builds list --limit=5
gcloud builds log BUILD_ID
```
Fix: edit `cloudbuild.yaml`, set `machineType: 'E2_HIGHCPU_8'` and `timeout: '1800s'`.

### "Secret does not exist" error
You tried to mount a secret that wasn't created. Only mount secrets you've actually created in Step 3.

### Service won't start (exit code 137 = out of memory)
```powershell
gcloud run services update deepdive-web --region=us-central1 --memory=4Gi
```

### Permission denied accessing secrets
```powershell
$PROJECT_NUMBER = gcloud projects describe deepdive-app --format="value(projectNumber)"

gcloud projects add-iam-policy-binding deepdive-app `
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" `
  --role=roles/secretmanager.secretAccessor
```

### Database connection error — verify tables exist
```powershell
# Install Turso CLI if needed: winget install turso
turso db shell deepdive-db
.tables
# Should show: tokens, token_prices, quant_signals, paper_trades
```

### Signals tab is empty after Scan Portfolio
- Confirm the quant engine is deployed and `QUANT_ENGINE_URL` secret is set
- Check quant engine logs: `gcloud run services logs tail deepdive-quant-engine --region=us-central1`
- The engine fetches price data from Binance public API — no API key needed, but it must be reachable

### Local `pnpm build` fails (libSQL webpack error)
Known non-blocking issue. Webpack tries to bundle native libSQL files. This does **not** affect Cloud Run. Use `pnpm dev` for local testing.

### View live logs
```powershell
gcloud run services logs tail deepdive-web --region=us-central1
```

---

## Useful Commands

```powershell
# View all deployed services
gcloud run services list

# Check service status
gcloud run services describe deepdive-web --region=us-central1

# View recent logs
gcloud run services logs read deepdive-web --region=us-central1 --limit=100

# Scale to zero (pause billing)
gcloud run services update deepdive-web --region=us-central1 --min-instances=0

# Force a restart (new revision)
gcloud run services update deepdive-web `
  --region=us-central1 `
  --revision-suffix=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())

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
| Secret Manager (~10 secrets) | $0.60 |
| Turso (free tier) | $0 |
| QuickNode (free tier) | $0 |
| Covalent (free tier) | $0 |
| **Total** | **$12–23** |

GCP free tier: 2M requests/month, 360K GB-seconds compute — personal use is often free.

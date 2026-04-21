# Deploy to Google Cloud Run

**Assumes:** GCP project created, billing enabled, `gcloud` installed and authenticated, all credentials ready.  
**Time:** ~15 minutes.

---

## 1 — Push Secrets to GCP Secret Manager

Open PowerShell. Paste this helper once:

```powershell
function Set-Secret($Name, $Value) {
    $tmp = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($tmp, $Value)
    gcloud secrets create $Name --data-file=$tmp 2>$null
    if ($LASTEXITCODE -ne 0) {
        gcloud secrets versions add $Name --data-file=$tmp
    }
    Remove-Item $tmp
}
```

Then run these — replace each value with yours:

```powershell
Set-Secret "TURSO_DATABASE_URL"        "libsql://deepdivetest-suphasonnuk.aws-ap-northeast-1.turso.io"
Set-Secret "TURSO_AUTH_TOKEN"          "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzY3MDQxNDksImlkIjoiMDE5ZGFiZDEtYWQwMS03NGU2LWI4ZmUtYzZmMzBjZWI3ZGVkIiwicmlkIjoiZDQyODgwYTYtZWRkNS00ZTRjLWE0ZWMtZTVhZTBmNzQ2NWY2In0.n1e-S5UxjVCVB1stngfpZpoP4_5kl-TKR8kshXnZolU9wH4idn79esrAzVrztNZjaP0yIHHDVezxAyH_nObvAw"
Set-Secret "JWT_SECRET"                "cca4de2d71d177450f6696484681738f4bab7564c5283fd2063cca403e4168f0"
Set-Secret "QUICKNODE_URL"             "https://quaint-greatest-emerald.quiknode.pro/7b61a7f78e6631df623608cea49a4b0b3aebc294"
Set-Secret "COVALENT_API_KEY"          "cqt_rQ6RFFmyh7wHJp4Qdc6MPYMHRWDv"
Set-Secret "BINANCE_TESTNET_API_KEY"   "8WlSXO1AG0RgYEHx8yl2B6UAKIs83GvJpK94ATxHd4GMz8Jbk2nv5PMcQrgFrENe"
Set-Secret "BINANCE_TESTNET_SECRET"    "YtSsYaSDYIJlbbYU19Gd3c8gZeCPUdQuAGOpG4IEN06vET1cRipaJiApFIe4yq4z"
```

> **Binance Testnet keys:** Get them at https://testnet.binancefutures.com → log in with GitHub → API Management → Create

---

## 2 — Grant Cloud Build Permission to Access Secrets

```powershell
$PROJECT_ID = gcloud config get-value project
$PROJECT_NUMBER = gcloud projects describe $PROJECT_ID --format="value(projectNumber)"

gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:$PROJECT_NUMBER@cloudbuild.gserviceaccount.com" `
  --role=roles/secretmanager.secretAccessor

gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:$PROJECT_NUMBER@cloudbuild.gserviceaccount.com" `
  --role=roles/run.admin

gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" `
  --role=roles/secretmanager.secretAccessor

gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:$PROJECT_NUMBER@cloudbuild.gserviceaccount.com" `
  --role=roles/iam.serviceAccountUser
```

> If you've deployed before and permissions are already set, skip this step.

---

## 3 — Push Database Schema

From the project root:

```powershell
pnpm --filter @deepdive/db db:push
```

This creates all tables in Turso including the latest `auto_positions` table. Run this every time the schema changes.

> Requires `packages\db\.env` to exist with `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

---

## 4 — Deploy (First Time)

From the project root, run Cloud Build with your RPC URLs and WalletConnect ID:

```powershell
gcloud builds submit --config=cloudbuild.yaml `
  --substitutions=`
  _WALLETCONNECT_PROJECT_ID="",`
  _RPC_ETHEREUM="",`
  _RPC_ARBITRUM="",`
  _RPC_BASE="",`
  _RPC_POLYGON="",`
  _WEB_SERVICE_HASH=""
```

This builds and deploys both services in order: quant engine first, then the web app.  
**Takes ~15 minutes.** Watch progress at: https://console.cloud.google.com/cloud-build/builds

---

## 5 — Wire Up the Quant Engine URL (Second Deploy)

After the first deploy completes, get the web app URL:

```powershell
gcloud run services describe deepdive-web-sph --region=asia-southeast3  --format="value(status.url)"
```

It looks like: `https://deepdive-web-abc123xyz-uc.a.run.app`

Copy the hash part (`abc123xyz`) and redeploy with it:

```powershell
gcloud builds submit --config=cloudbuild.yaml `
  --substitutions=`
  _WALLETCONNECT_PROJECT_ID="your-walletconnect-project-id",`
  _RPC_ETHEREUM="https://your-eth.quiknode.pro/key/",`
  _RPC_ARBITRUM="https://your-arb.quiknode.pro/key/",`
  _RPC_BASE="https://your-base.quiknode.pro/key/",`
  _RPC_POLYGON="https://your-polygon.quiknode.pro/key/",`
  _WEB_SERVICE_HASH="abc123xyz"
```

This sets `FRONTEND_URL` on the quant engine so server-to-server communication works correctly.

---

## 6 — Open the App

```powershell
gcloud run services describe deepdive-web --region=us-central1 --format="value(status.url)"
```

Open that URL in your browser. Log in with any passphrase (this becomes your permanent session key — remember it).

---

## Redeploy After Code Changes

```powershell
git push origin main

gcloud builds submit --config=cloudbuild.yaml `
  --substitutions=`
  _WALLETCONNECT_PROJECT_ID="your-walletconnect-project-id",`
  _RPC_ETHEREUM="https://your-eth.quiknode.pro/key/",`
  _RPC_ARBITRUM="https://your-arb.quiknode.pro/key/",`
  _RPC_BASE="https://your-base.quiknode.pro/key/",`
  _RPC_POLYGON="https://your-polygon.quiknode.pro/key/",`
  _WEB_SERVICE_HASH="abc123xyz"
```

> **Tip:** Save this command (with your actual values filled in) to a file called `deploy.ps1` so you don't have to retype it.

---

## Auto-Deploy on Every Git Push (Optional)

Set up a Cloud Build trigger so every push to `main` deploys automatically:

```powershell
gcloud builds triggers create github `
  --repo-name="DeepDiveApp" `
  --repo-owner="suphasonnuk" `
  --branch-pattern="^main$" `
  --build-config="cloudbuild.yaml" `
  --substitutions=`
  _WALLETCONNECT_PROJECT_ID="your-walletconnect-project-id",`
  _RPC_ETHEREUM="https://your-eth.quiknode.pro/key/",`
  _RPC_ARBITRUM="https://your-arb.quiknode.pro/key/",`
  _RPC_BASE="https://your-base.quiknode.pro/key/",`
  _RPC_POLYGON="https://your-polygon.quiknode.pro/key/",`
  _WEB_SERVICE_HASH="abc123xyz"
```

---

## Troubleshooting

**Build failed — see what went wrong:**
```powershell
gcloud builds list --limit=3
gcloud builds log THE_BUILD_ID
```

**Secret not found error:**  
The secret name in the error doesn't exist in Secret Manager. Run `Set-Secret` for that name (Step 1).

**Permission denied accessing secrets:**  
Re-run Step 2.

**DB connection error:**  
Check `packages\db\.env` has correct values, then re-run Step 3.

**Signals tab empty after scan:**  
Check the quant engine is running:
```powershell
gcloud run services describe deepdive-quant --region=us-central1 --format="value(status.url)"
gcloud run services logs tail deepdive-quant --region=us-central1
```

**View live app logs:**
```powershell
gcloud run services logs tail deepdive-web --region=us-central1
```

**Update a secret value:**
```powershell
# Re-run Set-Secret (the helper handles both create and update)
Set-Secret "SECRET_NAME" "new-value"

# Then restart the service to pick it up
gcloud run services update deepdive-web --region=us-central1 --update-secrets=SECRET_NAME=SECRET_NAME:latest
```

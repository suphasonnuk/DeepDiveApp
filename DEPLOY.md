# Deploy to Google Cloud Run

**Assumes:** GCP project created, billing enabled, `gcloud` installed, authenticated, and project set.  
**Time:** ~15 minutes for a full build.

---

## Step 1 — Create Local DB Config (needed for Step 3)

Create the file `packages\db\.env` (not `.env.example`) with your Turso credentials:

```
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-turso-token
```

This file is only used locally by the DB migration tool — it is never committed or deployed.

---

## Step 2 — Push Secrets to GCP Secret Manager

Open PowerShell. Paste this helper once per session:

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

Then run these with your real values:

```powershell
Set-Secret "TURSO_DATABASE_URL"        "libsql://deepdivetest-suphasonnuk.aws-ap-northeast-1.turso.io"
Set-Secret "TURSO_AUTH_TOKEN"          "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzY3MDQxNDksImlkIjoiMDE5ZGFiZDEtYWQwMS03NGU2LWI4ZmUtYzZmMzBjZWI3ZGVkIiwicmlkIjoiZDQyODgwYTYtZWRkNS00ZTRjLWE0ZWMtZTVhZTBmNzQ2NWY2In0.n1e-S5UxjVCVB1stngfpZpoP4_5kl-TKR8kshXnZolU9wH4idn79esrAzVrztNZjaP0yIHHDVezxAyH_nObvAw"
Set-Secret "JWT_SECRET"                "cca4de2d71d177450f6696484681738f4bab7564c5283fd2063cca403e4168f0"
Set-Secret "QUICKNODE_URL"             "https://quaint-greatest-emerald.quiknode.pro/7b61a7f78e6631df623608cea49a4b0b3aebc294"
Set-Secret "COVALENT_API_KEY"          "cqt_rQ6RFFmyh7wHJp4Qdc6MPYMHRWDv"
Set-Secret "BINANCE_TESTNET_API_KEY"   "8WlSXO1AG0RgYEHx8yl2B6UAKIs83GvJpK94ATxHd4GMz8Jbk2nv5PMcQrgFrENe"
Set-Secret "BINANCE_TESTNET_SECRET"    "YtSsYaSDYIJlbbYU19Gd3c8gZeCPUdQuAGOpG4IEN06vET1cRipaJiApFIe4yq4z"

```

> **Binance Testnet keys:** https://testnet.binancefutures.com → log in with GitHub → API Management → Create API Key

---

## Step 3 — Push Database Schema

From the project root:

```powershell
pnpm --filter @deepdive/db db:push
```

Expected output: tables created (`quant_signals`, `paper_trades`, `auto_positions`, etc.).  
If it says "No changes detected" — tables already exist, that's fine.

---

## Step 4 — Grant Cloud Build Permissions (first time only)

Skip this step if you have deployed before.

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
  --member="serviceAccount:$PROJECT_NUMBER@cloudbuild.gserviceaccount.com" `
  --role=roles/iam.serviceAccountUser

gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" `
  --role=roles/secretmanager.secretAccessor
```

---

## Step 5 — Deploy Both Services

From the project root:

```powershell
gcloud builds submit --config=cloudbuild.yaml --substitutions=_WEB_SERVICE_HASH=""
```

This automatically:
1. Builds and deploys the **quant engine** (Python FastAPI)
2. Captures the quant engine's Cloud Run URL
3. Builds and deploys the **web app** (Next.js) with `QUANT_ENGINE_URL` set to that URL

**Takes ~15 minutes.** Watch live at: https://console.cloud.google.com/cloud-build/builds

---

## Step 6 — Verify the Quant Engine URL

After the build completes, confirm the web app knows how to reach the quant engine:

```powershell
<<<<<<< HEAD
gcloud builds submit --config=cloudbuild.yaml `
  --substitutions=`
  _WALLETCONNECT_PROJECT_ID="",`
  _RPC_ETHEREUM="",`
  _RPC_ARBITRUM="",`
  _RPC_BASE="",`
  _RPC_POLYGON="",`
  _WEB_SERVICE_HASH=""
=======
$QUANT_URL = gcloud run services describe deepdive-quant --region=asia-southeast3  --format="value(status.url)"
echo $QUANT_URL
>>>>>>> 0c5bbf458e700f052aa2f674bf32df50613029ae
```

You should see a URL like `https://deepdive-quant-xxxx-uc.a.run.app`.

If the Signals tab shows "quant engine unavailable" in the app, set the URL manually (no rebuild needed):

```powershell
gcloud run services update deepdive-web `
  --region=us-central1 `
  --set-env-vars="QUANT_ENGINE_URL=$QUANT_URL,BINANCE_LEVERAGE=3"
```

---

## Step 7 — Open the App

```powershell
gcloud run services describe deepdive-web-sph --region=asia-southeast3  --format="value(status.url)"
```

Open that URL. Log in with any passphrase — this becomes your permanent session key, so remember it.

Then: **Signals tab → Quick Scan** to generate your first signals and open Binance positions.

---

## Redeploy After Code Changes

```powershell
git push origin main
gcloud builds submit --config=cloudbuild.yaml --substitutions=_WEB_SERVICE_HASH=""
```

---

## Auto-Deploy on Every Git Push (Optional)

Run once to connect your GitHub repo to Cloud Build:

```powershell
gcloud builds triggers create github `
  --repo-name="DeepDiveApp" `
  --repo-owner="suphasonnuk" `
  --branch-pattern="^main$" `
  --build-config="cloudbuild.yaml" `
  --substitutions=_WEB_SERVICE_HASH=""
```

After this, every `git push origin main` triggers a deploy automatically.

---

## Troubleshooting

**See why a build failed:**
```powershell
gcloud builds list --limit=5
gcloud builds log THE_BUILD_ID
```

**Secret not found during build:**  
The secret wasn't created. Re-run `Set-Secret` for that name (Step 2).

**Permission denied accessing secrets:**  
Re-run Step 4.

**DB tables missing / connection error:**  
Verify `packages\db\.env` has correct values, then re-run Step 3.

**Signals tab empty — quant engine unreachable:**  
Run Step 6 manually to point the web app at the correct quant engine URL.

**View live logs:**
```powershell
gcloud run services logs tail deepdive-web --region=us-central1
gcloud run services logs tail deepdive-quant --region=us-central1
```

**Update a secret after deploy:**
```powershell
Set-Secret "SECRET_NAME" "new-value"
gcloud run services update deepdive-web --region=us-central1 --update-secrets=SECRET_NAME=SECRET_NAME:latest
```

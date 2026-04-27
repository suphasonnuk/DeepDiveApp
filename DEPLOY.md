# Deploy to Google Cloud Run

**Assumes:** GCP project created, billing enabled, `gcloud` installed, authenticated, and project set.  
**Time:** ~15 minutes for a full build.

---

## Step 1 — Create Local DB Config (needed for Step 3)

Create the file `packages/db/.env` (not `.env.example`) with your Turso credentials:

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

Then run these with **your real values** (do not commit actual secrets to git):

```powershell
Set-Secret "TURSO_DATABASE_URL"        "libsql://your-db.turso.io"
Set-Secret "TURSO_AUTH_TOKEN"          "your-turso-auth-token"
Set-Secret "JWT_SECRET"                "$(openssl rand -hex 32)"
Set-Secret "QUICKNODE_URL"             "https://your-endpoint.quiknode.pro/your-token/"
Set-Secret "COVALENT_API_KEY"          "your-covalent-api-key"
Set-Secret "BINANCE_TESTNET_API_KEY"   "your-binance-testnet-api-key"
Set-Secret "BINANCE_TESTNET_SECRET"    "your-binance-testnet-secret"
```

> **Generate JWT_SECRET:** `openssl rand -hex 32` (or PowerShell: `[System.BitConverter]::ToString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).Replace('-','').ToLower()`)  
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
$QUANT_URL = gcloud run services describe deepdive-quant --region=asia-southeast3 --format="value(status.url)"
echo $QUANT_URL
```

You should see a URL like `https://deepdive-quant-xxxx-uc.a.run.app`.

If the Signals tab shows "quant engine unavailable" in the app, set the URL manually (no rebuild needed):

```powershell
gcloud run services update deepdive-web `
  --region=asia-southeast3 `
  --set-env-vars="QUANT_ENGINE_URL=$QUANT_URL,BINANCE_LEVERAGE=3"
```

---

## Step 7 — Open the App

```powershell
gcloud run services describe deepdive-web-sph --region=asia-southeast3 --format="value(status.url)"
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

## Security Notes

- **JWT_SECRET is mandatory** — the app will refuse to start without it. Generate with `openssl rand -hex 32`.
- **Never commit secrets** to git. Use GCP Secret Manager (Step 2) for all sensitive values.
- **Rotate secrets** periodically: update the secret in GCP, then redeploy.
- **Security headers** (HSTS, X-Frame-Options, CSP-adjacent) are applied automatically by the middleware.
- **Session cookies** are httpOnly, secure (production), sameSite=strict.

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
Verify `packages/db/.env` has correct values, then re-run Step 3.

**Signals tab empty — quant engine unreachable:**  
Run Step 6 manually to point the web app at the correct quant engine URL.

**View live logs:**
```powershell
gcloud run services logs tail deepdive-web --region=asia-southeast3
gcloud run services logs tail deepdive-quant --region=asia-southeast3
```

**Update a secret after deploy:**
```powershell
Set-Secret "SECRET_NAME" "new-value"
gcloud run services update deepdive-web --region=asia-southeast3 --update-secrets=SECRET_NAME=SECRET_NAME:latest
```

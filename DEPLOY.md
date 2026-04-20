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
Set-Secret "TURSO_DATABASE_URL"        "libsql://your-db.turso.io"
Set-Secret "TURSO_AUTH_TOKEN"          "your-turso-token"
Set-Secret "JWT_SECRET"                "your-64-char-random-string"
Set-Secret "QUICKNODE_URL"             "https://your-endpoint.quiknode.pro/key/"
Set-Secret "COVALENT_API_KEY"          "your-covalent-key"
Set-Secret "BINANCE_TESTNET_API_KEY"   "your-binance-testnet-api-key"
Set-Secret "BINANCE_TESTNET_SECRET"    "your-binance-testnet-secret"
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

From the project root:

```powershell
gcloud builds submit --config=cloudbuild.yaml --substitutions=_WEB_SERVICE_HASH=""
```

This builds and deploys both services in order: quant engine first, then the web app.  
**Takes ~15 minutes.** Watch progress at: https://console.cloud.google.com/cloud-build/builds

---

## 5 — Wire Up the Quant Engine URL (Second Deploy)

After the first deploy completes, get the web app URL:

```powershell
gcloud run services describe deepdive-web --region=us-central1 --format="value(status.url)"
```

It looks like: `https://deepdive-web-abc123xyz-uc.a.run.app`

Copy the hash part (`abc123xyz`) and redeploy with it:

```powershell
gcloud builds submit --config=cloudbuild.yaml --substitutions=_WEB_SERVICE_HASH="abc123xyz"
```

This sets `FRONTEND_URL` on the quant engine so it knows where the web app lives.

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
gcloud builds submit --config=cloudbuild.yaml --substitutions=_WEB_SERVICE_HASH="abc123xyz"
```

Replace `abc123xyz` with your actual hash from Step 5.

---

## Auto-Deploy on Every Git Push (Optional)

```powershell
gcloud builds triggers create github `
  --repo-name="DeepDiveApp" `
  --repo-owner="suphasonnuk" `
  --branch-pattern="^main$" `
  --build-config="cloudbuild.yaml" `
  --substitutions=_WEB_SERVICE_HASH="abc123xyz"
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

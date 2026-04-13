# DeepDiveApp - Quick Start (15 Minutes)

## What You Need

1. **Google Cloud account** with billing enabled
2. **Turso account** (free) - Database
3. **Moralis account** (free) - Portfolio data
4. **Covalent account** (free) - Token holder data

---

## Step 1: Get API Keys (10 minutes)

### Turso Database
```bash
# Install CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Login & create database
turso auth login
turso db create deepdive-db

# Save these:
turso db show deepdive-db --url        # → TURSO_DATABASE_URL
turso db tokens create deepdive-db     # → TURSO_AUTH_TOKEN
```

### Moralis API
1. Sign up: https://admin.moralis.io/register
2. Create project → Copy API key → Save as `MORALIS_API_KEY`

### Covalent API
1. Sign up: https://www.covalenthq.com/platform/auth/register/
2. API Keys → Copy key → Save as `COVALENT_API_KEY`

### JWT Secret
```bash
openssl rand -hex 32  # → Save as JWT_SECRET
```

---

## Step 2: Setup GCP (3 minutes)

```bash
# Login
gcloud auth login

# Create or select project
gcloud config set project YOUR_PROJECT_ID

# Enable APIs
gcloud services enable cloudbuild.googleapis.com run.googleapis.com secretmanager.googleapis.com
```

---

## Step 3: Store Secrets (2 minutes)

```bash
# Replace YOUR_* with actual values
echo -n "YOUR_TURSO_DATABASE_URL" | gcloud secrets create TURSO_DATABASE_URL --data-file=-
echo -n "YOUR_TURSO_AUTH_TOKEN" | gcloud secrets create TURSO_AUTH_TOKEN --data-file=-
echo -n "YOUR_JWT_SECRET" | gcloud secrets create JWT_SECRET --data-file=-
echo -n "YOUR_MORALIS_API_KEY" | gcloud secrets create MORALIS_API_KEY --data-file=-
echo -n "YOUR_COVALENT_API_KEY" | gcloud secrets create COVALENT_API_KEY --data-file=-

# Grant access
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member=serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

---

## Step 4: Push Database Schema (1 minute)

```bash
cd packages/db
pnpm db:push
```

---

## Step 5: Deploy to Cloud Run (3 minutes)

**Option A: Use deployment script (easiest)**

```bash
# Linux/Mac
cd /home/user/DeepDiveApp
./deploy.sh YOUR_PROJECT_ID
```

```powershell
# Windows PowerShell
cd C:\Users\YourUsername\DeepDiveApp
.\deploy.ps1 YOUR_PROJECT_ID
```

**Option B: Cloud Build**

```bash
cd /home/user/DeepDiveApp
gcloud builds submit --config=cloudbuild.yaml
```

**Wait for build to complete (~5-10 minutes)**

**Having issues?** See [DEPLOY_TROUBLESHOOTING.md](DEPLOY_TROUBLESHOOTING.md)

---

## Step 6: Get Your App URL

```bash
gcloud run services describe deepdive-web --region=us-central1 --format='value(status.url)'
```

**Open the URL in your browser!**

---

## First Use

1. **Create passphrase** (encrypts your data)
2. **Go to Settings** → Connect MetaMask
3. **Import famous wallets** → "Import Famous Wallets" button
4. **Discover top traders** → "Discover (ETH)" button
5. **View signals** → Dashboard tab

---

## Cost

**~$12-23/month** (pay only when used)

Free tier covers most personal use.

---

## Need More Details?

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete documentation.

---

**You're ready to track smart money! 🚀**

# Deployment Guide

## GCP Cloud Run Deployment

### Prerequisites

1. GCP project with billing enabled
2. `gcloud` CLI installed and authenticated
3. APIs enabled:
   - Cloud Run API
   - Cloud Build API
   - Container Registry API
   - Secret Manager API

### Setup Secrets

```bash
# Store API keys in Secret Manager
echo -n "your_moralis_api_key" | gcloud secrets create MORALIS_API_KEY --data-file=-
echo -n "your_covalent_api_key" | gcloud secrets create COVALENT_API_KEY --data-file=-

# Grant Cloud Run access to secrets
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member=serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

### Environment Variables

Set these in `cloudbuild.yaml` substitutions or Cloud Run configuration:

```bash
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-turso-token
QUANT_ENGINE_URL=https://your-quant-engine.run.app  # Python service URL
```

### Deploy via Cloud Build (Automated)

1. Connect your GitHub repository to Cloud Build:
   ```bash
   gcloud builds submit --config=cloudbuild.yaml
   ```

2. Set up automatic deployments on push:
   ```bash
   gcloud builds triggers create github \
     --repo-name=DeepDiveApp \
     --repo-owner=YOUR_GITHUB_USERNAME \
     --branch-pattern=^main$ \
     --build-config=cloudbuild.yaml
   ```

### Deploy Manually

```bash
# Build and push image
docker build -t gcr.io/YOUR_PROJECT_ID/deepdive-web:latest .
docker push gcr.io/YOUR_PROJECT_ID/deepdive-web:latest

# Deploy to Cloud Run
gcloud run deploy deepdive-web \
  --image=gcr.io/YOUR_PROJECT_ID/deepdive-web:latest \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars=TURSO_DATABASE_URL=libsql://your-db.turso.io,TURSO_AUTH_TOKEN=your-token \
  --set-secrets=MORALIS_API_KEY=MORALIS_API_KEY:latest \
  --memory=512Mi \
  --cpu=1 \
  --timeout=300 \
  --max-instances=10
```

### Deploy Python Quant Engine

```bash
cd services/quant-engine

# Build and deploy
gcloud run deploy deepdive-quant-engine \
  --source=. \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=2 \
  --timeout=600
```

### Monitoring

```bash
# View logs
gcloud run services logs read deepdive-web --region=us-central1 --limit=50

# Get service URL
gcloud run services describe deepdive-web --region=us-central1 --format='value(status.url)'
```

### Cost Optimization

Cloud Run charges only for actual usage:
- **Web app**: ~$5-10/month for moderate traffic
- **Quant engine**: ~$10-15/month (only runs when analyzing signals)
- **Total estimated cost**: $15-25/month

### Automatic Scaling

Cloud Run automatically scales:
- **Min instances**: 0 (scales to zero when idle)
- **Max instances**: 10
- **Concurrency**: 80 requests per instance

### CI/CD Pipeline

Push to `main` branch triggers:
1. Cloud Build builds Docker image
2. Runs tests (if configured)
3. Pushes to Container Registry
4. Deploys to Cloud Run
5. Health check verification

---

## Alternative: GCP App Engine

If you prefer App Engine Standard:

```yaml
# app.yaml
runtime: nodejs20
env: standard
instance_class: F2

automatic_scaling:
  min_instances: 0
  max_instances: 10
  target_cpu_utilization: 0.6

env_variables:
  NODE_ENV: "production"
  TURSO_DATABASE_URL: "libsql://your-db.turso.io"
  TURSO_AUTH_TOKEN: "your-token"
```

Deploy:
```bash
gcloud app deploy
```

**Note**: App Engine has longer cold starts than Cloud Run. Cloud Run is recommended.

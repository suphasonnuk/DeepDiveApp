# Cloud Run Deployment Troubleshooting

## Common Issues & Solutions

### Issue 1: "Secret does not exist" Error

**Error:**
```
ERROR: (gcloud.run.deploy) Secret 'ETHERSCAN_API_KEY' does not exist
```

**Solution:** Deploy with minimal secrets first, add optional ones later.

**Minimal deployment (REQUIRED secrets only):**
```bash
gcloud run deploy deepdive-web \
  --image=gcr.io/YOUR_PROJECT_ID/deepdive-web:latest \
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

**Add optional secrets later:**
```bash
# After creating the secrets
gcloud run services update deepdive-web \
  --region=us-central1 \
  --update-secrets=ETHERSCAN_API_KEY=ETHERSCAN_API_KEY:latest
```

---

### Issue 2: Build Timeout

**Error:**
```
ERROR: build step 0 exceeded timeout
```

**Solutions:**

1. **Increase build timeout:**
   - Edit `cloudbuild.yaml`
   - Add `timeout: '1800s'` to the build step

2. **Use faster machine:**
   - Edit `cloudbuild.yaml`
   - Change `machineType: 'E2_HIGHCPU_8'`

3. **Build locally and push:**
   ```bash
   # Build image locally
   docker build -t gcr.io/YOUR_PROJECT_ID/deepdive-web:latest .
   
   # Push to registry
   docker push gcr.io/YOUR_PROJECT_ID/deepdive-web:latest
   
   # Deploy
   gcloud run deploy deepdive-web \
     --image=gcr.io/YOUR_PROJECT_ID/deepdive-web:latest \
     --region=us-central1
   ```

---

### Issue 3: Docker Build Fails

**Error:**
```
ERROR: failed to solve: process "/bin/sh -c pnpm install" did not complete
```

**Solutions:**

1. **Add .dockerignore:**
   - Make sure `.dockerignore` exists in project root
   - Should exclude `node_modules`, `.next`, etc.

2. **Increase build resources:**
   ```yaml
   # In cloudbuild.yaml
   options:
     machineType: 'E2_HIGHCPU_8'
     diskSizeGb: 100
   ```

3. **Clear Docker cache:**
   ```bash
   docker system prune -a
   ```

---

### Issue 4: Service Won't Start

**Error:**
```
Service 'deepdive-web' is not ready and cannot serve traffic
```

**Solutions:**

1. **Check logs:**
   ```bash
   gcloud run services logs read deepdive-web --region=us-central1 --limit=100
   ```

2. **Common startup issues:**
   - Missing environment variables
   - Database connection failure
   - Port mismatch (should be 8080)

3. **Test locally first:**
   ```bash
   # Build image
   docker build -t deepdive-test .
   
   # Run locally
   docker run -p 8080:8080 \
     -e TURSO_DATABASE_URL=your-url \
     -e TURSO_AUTH_TOKEN=your-token \
     -e JWT_SECRET=your-secret \
     deepdive-test
   
   # Test at http://localhost:8080
   ```

---

### Issue 5: Out of Memory

**Error:**
```
Container instance ... has unexpectedly exited with code 137
```

**Solution:**
```bash
# Increase memory to 2Gi or 4Gi
gcloud run services update deepdive-web \
  --region=us-central1 \
  --memory=4Gi
```

---

### Issue 6: Permission Denied

**Error:**
```
Permission denied while accessing Secret Manager
```

**Solution:**
```bash
# Get project number
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")

# Grant access
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member=serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

---

## Manual Deployment Steps (If Cloud Build Fails)

### Step 1: Build Docker Image Locally

```bash
cd DeepDiveApp

# Build
docker build -t gcr.io/YOUR_PROJECT_ID/deepdive-web:latest .
```

### Step 2: Push to Container Registry

```bash
# Configure Docker for GCP
gcloud auth configure-docker

# Push image
docker push gcr.io/YOUR_PROJECT_ID/deepdive-web:latest
```

### Step 3: Deploy to Cloud Run

```bash
gcloud run deploy deepdive-web \
  --image=gcr.io/YOUR_PROJECT_ID/deepdive-web:latest \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --set-secrets=TURSO_DATABASE_URL=TURSO_DATABASE_URL:latest,TURSO_AUTH_TOKEN=TURSO_AUTH_TOKEN:latest,JWT_SECRET=JWT_SECRET:latest,MORALIS_API_KEY=MORALIS_API_KEY:latest,COVALENT_API_KEY=COVALENT_API_KEY:latest \
  --memory=2Gi \
  --cpu=2 \
  --port=8080
```

---

## Verify Deployment

### Check Service Status

```bash
gcloud run services describe deepdive-web --region=us-central1
```

### View Logs

```bash
# Latest logs
gcloud run services logs read deepdive-web --region=us-central1 --limit=50

# Follow logs (real-time)
gcloud run services logs tail deepdive-web --region=us-central1
```

### Test the URL

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe deepdive-web --region=us-central1 --format='value(status.url)')

# Test
curl $SERVICE_URL
```

---

## Quick Fixes

### Fix 1: Redeploy with New Image

```bash
gcloud run services update deepdive-web \
  --region=us-central1 \
  --image=gcr.io/YOUR_PROJECT_ID/deepdive-web:latest
```

### Fix 2: Update Environment Variables

```bash
gcloud run services update deepdive-web \
  --region=us-central1 \
  --update-secrets=KEY=SECRET_NAME:latest
```

### Fix 3: Scale Resources

```bash
gcloud run services update deepdive-web \
  --region=us-central1 \
  --memory=4Gi \
  --cpu=4
```

### Fix 4: Restart Service

```bash
# Update with --revision-suffix to force new revision
gcloud run services update deepdive-web \
  --region=us-central1 \
  --revision-suffix=$(date +%s)
```

---

## Still Having Issues?

1. **Check build logs:**
   ```bash
   gcloud builds list --limit=5
   gcloud builds log BUILD_ID
   ```

2. **Check service events:**
   ```bash
   gcloud run services describe deepdive-web \
     --region=us-central1 \
     --format='value(status.conditions)'
   ```

3. **Verify secrets exist:**
   ```bash
   gcloud secrets list
   ```

4. **Test Docker image locally before deploying**

5. **Check GCP quotas:**
   - https://console.cloud.google.com/iam-admin/quotas

---

## Contact Info

- **Cloud Run Docs:** https://cloud.google.com/run/docs
- **GitHub Issues:** https://github.com/suphasonnuk/DeepDiveApp/issues

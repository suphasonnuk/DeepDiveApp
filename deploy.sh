#!/usr/bin/env bash
# DeepDiveApp — Cloud Run deployment for both services
#
# ONE-TIME SETUP (run once, then never again):
#   gcloud artifacts repositories create deepdive \
#     --repository-format=docker \
#     --location=$REGION \
#     --description="DeepDiveApp images"
#
#   gcloud secrets create TURSO_DATABASE_URL --replication-policy=automatic
#   gcloud secrets create TURSO_AUTH_TOKEN   --replication-policy=automatic
#   gcloud secrets create JWT_SECRET         --replication-policy=automatic
#   gcloud secrets create COVALENT_API_KEY   --replication-policy=automatic
#   # Then add secret values:
#   echo -n "libsql://..." | gcloud secrets versions add TURSO_DATABASE_URL --data-file=-
#   echo -n "eyJ..."       | gcloud secrets versions add TURSO_AUTH_TOKEN   --data-file=-
#   echo -n "$(openssl rand -hex 32)" | gcloud secrets versions add JWT_SECRET --data-file=-
#   echo -n "cov_..."      | gcloud secrets versions add COVALENT_API_KEY   --data-file=-
#
# USAGE:
#   GCP_PROJECT=my-project ./deploy.sh
#   GCP_PROJECT=my-project REGION=us-east1 ./deploy.sh
#
# NEXT_PUBLIC_* BUILD ARGS (optional — baked into Next.js bundle at build time):
#   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=abc123 GCP_PROJECT=my-project ./deploy.sh
#
# After deploy, run once to apply the schema:
#   pnpm --filter @deepdive/db db:push

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
GCP_PROJECT="${GCP_PROJECT:?Set GCP_PROJECT env var (e.g. GCP_PROJECT=my-project ./deploy.sh)}"
REGION="${REGION:-us-central1}"
REGISTRY="$REGION-docker.pkg.dev/$GCP_PROJECT/deepdive"
WEB_SERVICE="deepdive-web"
QUANT_SERVICE="deepdive-quant"

# Optional NEXT_PUBLIC_* vars baked into the JS bundle at build time
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID="${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:-}"
NEXT_PUBLIC_RPC_ETHEREUM="${NEXT_PUBLIC_RPC_ETHEREUM:-}"
NEXT_PUBLIC_RPC_ARBITRUM="${NEXT_PUBLIC_RPC_ARBITRUM:-}"
NEXT_PUBLIC_RPC_BASE="${NEXT_PUBLIC_RPC_BASE:-}"
NEXT_PUBLIC_RPC_POLYGON="${NEXT_PUBLIC_RPC_POLYGON:-}"

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo ""; echo "▶ $*"; }
ok()   { echo "  ✓ $*"; }
warn() { echo "  ⚠ $*"; }

# ── Preflight ─────────────────────────────────────────────────────────────────
log "Preflight checks"
command -v gcloud >/dev/null 2>&1 || { echo "gcloud CLI not found. Install from https://cloud.google.com/sdk"; exit 1; }
command -v docker  >/dev/null 2>&1 || { echo "docker not found. Install Docker Desktop or Docker Engine."; exit 1; }

gcloud config set project "$GCP_PROJECT" --quiet
ok "GCP project: $GCP_PROJECT"
ok "Region: $REGION"
ok "Registry: $REGISTRY"

log "Configuring Docker for Artifact Registry"
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
ok "Docker authenticated"

# ── 1. Build + Deploy Quant Engine ───────────────────────────────────────────
log "Building quant engine image"
docker build \
  --platform linux/amd64 \
  --tag "$REGISTRY/$QUANT_SERVICE:latest" \
  services/quant-engine/
ok "Quant engine image built"

log "Pushing quant engine image"
docker push "$REGISTRY/$QUANT_SERVICE:latest"
ok "Quant engine image pushed"

log "Deploying quant engine to Cloud Run"
gcloud run deploy "$QUANT_SERVICE" \
  --image="$REGISTRY/$QUANT_SERVICE:latest" \
  --region="$REGION" \
  --platform=managed \
  --no-allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --timeout=120 \
  --max-instances=3 \
  --min-instances=1 \
  --port=8080 \
  --quiet
ok "Quant engine deployed (min-instances=1 keeps it warm — avoids numpy/scipy cold start)"

QUANT_URL=$(gcloud run services describe "$QUANT_SERVICE" \
  --region="$REGION" \
  --format="value(status.url)")
ok "Quant engine URL: $QUANT_URL"

# ── 2. Build + Deploy Web App ─────────────────────────────────────────────────
log "Building web app image (Next.js standalone)"
docker build \
  --platform linux/amd64 \
  --file Dockerfile.web \
  --tag "$REGISTRY/$WEB_SERVICE:latest" \
  --build-arg "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=$NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID" \
  --build-arg "NEXT_PUBLIC_RPC_ETHEREUM=$NEXT_PUBLIC_RPC_ETHEREUM" \
  --build-arg "NEXT_PUBLIC_RPC_ARBITRUM=$NEXT_PUBLIC_RPC_ARBITRUM" \
  --build-arg "NEXT_PUBLIC_RPC_BASE=$NEXT_PUBLIC_RPC_BASE" \
  --build-arg "NEXT_PUBLIC_RPC_POLYGON=$NEXT_PUBLIC_RPC_POLYGON" \
  .
ok "Web app image built"

log "Pushing web app image"
docker push "$REGISTRY/$WEB_SERVICE:latest"
ok "Web app image pushed"

log "Deploying web app to Cloud Run"
gcloud run deploy "$WEB_SERVICE" \
  --image="$REGISTRY/$WEB_SERVICE:latest" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --timeout=60 \
  --max-instances=10 \
  --min-instances=0 \
  --port=8080 \
  --set-env-vars="QUANT_ENGINE_URL=$QUANT_URL" \
  --set-secrets="TURSO_DATABASE_URL=TURSO_DATABASE_URL:latest" \
  --set-secrets="TURSO_AUTH_TOKEN=TURSO_AUTH_TOKEN:latest" \
  --set-secrets="JWT_SECRET=JWT_SECRET:latest" \
  --set-secrets="COVALENT_API_KEY=COVALENT_API_KEY:latest" \
  --quiet
ok "Web app deployed"

WEB_URL=$(gcloud run services describe "$WEB_SERVICE" \
  --region="$REGION" \
  --format="value(status.url)")
ok "Web app URL: $WEB_URL"

# ── 3. Update Quant Engine CORS ───────────────────────────────────────────────
log "Updating quant engine CORS to allow web app origin"
gcloud run services update "$QUANT_SERVICE" \
  --region="$REGION" \
  --set-env-vars="ALLOWED_ORIGIN=$WEB_URL" \
  --quiet
ok "Quant engine CORS updated"

# ── 4. Grant web app identity access to quant engine ─────────────────────────
log "Granting web app Cloud Run invoker role on quant engine"
WEB_SA=$(gcloud run services describe "$WEB_SERVICE" \
  --region="$REGION" \
  --format="value(spec.template.spec.serviceAccountName)")

if [ -n "$WEB_SA" ]; then
  gcloud run services add-iam-policy-binding "$QUANT_SERVICE" \
    --region="$REGION" \
    --member="serviceAccount:$WEB_SA" \
    --role="roles/run.invoker" \
    --quiet
  ok "IAM binding added: $WEB_SA → $QUANT_SERVICE"
else
  warn "Could not determine web app service account. Grant invoker manually:"
  warn "  gcloud run services add-iam-policy-binding $QUANT_SERVICE \\"
  warn "    --region=$REGION \\"
  warn "    --member=serviceAccount:<web-sa>@$GCP_PROJECT.iam.gserviceaccount.com \\"
  warn "    --role=roles/run.invoker"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo "  DeepDiveApp deployed successfully"
echo "═══════════════════════════════════════════════════"
echo "  Web app:      $WEB_URL"
echo "  Quant engine: $QUANT_URL (private)"
echo ""
echo "  Next step — apply DB schema (run once locally):"
echo "    pnpm --filter @deepdive/db db:push"
echo ""
echo "  View logs:"
echo "    gcloud run services logs read $WEB_SERVICE   --region=$REGION --limit=50"
echo "    gcloud run services logs read $QUANT_SERVICE --region=$REGION --limit=50"
echo "═══════════════════════════════════════════════════"

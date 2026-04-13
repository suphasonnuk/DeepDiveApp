# DeepDiveApp - Simple Deployment Script for GCP Cloud Run (Windows PowerShell)
# Usage: .\deploy.ps1 YOUR_PROJECT_ID

param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectId
)

$ErrorActionPreference = "Stop"

$Region = "us-central1"
$ServiceName = "deepdive-web"

Write-Host "🚀 Deploying DeepDiveApp to Cloud Run..." -ForegroundColor Green
Write-Host "Project: $ProjectId"
Write-Host "Region: $Region"
Write-Host ""

# Set project
Write-Host "📋 Setting GCP project..." -ForegroundColor Cyan
gcloud config set project $ProjectId

# Build Docker image
Write-Host "🔨 Building Docker image..." -ForegroundColor Cyan
docker build -t "gcr.io/$ProjectId/$ServiceName`:latest" .

# Configure Docker for GCP
Write-Host "🔑 Configuring Docker authentication..." -ForegroundColor Cyan
gcloud auth configure-docker --quiet

# Push image
Write-Host "📤 Pushing image to Container Registry..." -ForegroundColor Cyan
docker push "gcr.io/$ProjectId/$ServiceName`:latest"

# Deploy to Cloud Run
Write-Host "☁️  Deploying to Cloud Run..." -ForegroundColor Cyan
gcloud run deploy $ServiceName `
  --image="gcr.io/$ProjectId/$ServiceName`:latest" `
  --region=$Region `
  --platform=managed `
  --allow-unauthenticated `
  --set-secrets=TURSO_DATABASE_URL=TURSO_DATABASE_URL:latest,TURSO_AUTH_TOKEN=TURSO_AUTH_TOKEN:latest,JWT_SECRET=JWT_SECRET:latest,MORALIS_API_KEY=MORALIS_API_KEY:latest,COVALENT_API_KEY=COVALENT_API_KEY:latest `
  --memory=2Gi `
  --cpu=2 `
  --timeout=300 `
  --max-instances=10 `
  --min-instances=0 `
  --port=8080 `
  --quiet

# Get service URL
$ServiceUrl = gcloud run services describe $ServiceName --region=$Region --format='value(status.url)'

Write-Host ""
Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host "🌐 Your app is live at: $ServiceUrl" -ForegroundColor Yellow
Write-Host ""
Write-Host "📊 View logs:"
Write-Host "   gcloud run services logs read $ServiceName --region=$Region"
Write-Host ""

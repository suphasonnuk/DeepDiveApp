#!/bin/bash

# DeepDiveApp - Simple Deployment Script for GCP Cloud Run
# Usage: ./deploy.sh YOUR_PROJECT_ID

set -e

if [ -z "$1" ]; then
  echo "Error: Project ID required"
  echo "Usage: ./deploy.sh YOUR_PROJECT_ID"
  exit 1
fi

PROJECT_ID=$1
REGION="us-central1"
SERVICE_NAME="deepdive-web"

echo "🚀 Deploying DeepDiveApp to Cloud Run..."
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# Set project
echo "📋 Setting GCP project..."
gcloud config set project $PROJECT_ID

# Build Docker image
echo "🔨 Building Docker image..."
docker build -t gcr.io/$PROJECT_ID/$SERVICE_NAME:latest .

# Configure Docker for GCP
echo "🔑 Configuring Docker authentication..."
gcloud auth configure-docker --quiet

# Push image
echo "📤 Pushing image to Container Registry..."
docker push gcr.io/$PROJECT_ID/$SERVICE_NAME:latest

# Deploy to Cloud Run
echo "☁️  Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image=gcr.io/$PROJECT_ID/$SERVICE_NAME:latest \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --set-secrets=TURSO_DATABASE_URL=TURSO_DATABASE_URL:latest,TURSO_AUTH_TOKEN=TURSO_AUTH_TOKEN:latest,JWT_SECRET=JWT_SECRET:latest,MORALIS_API_KEY=MORALIS_API_KEY:latest,COVALENT_API_KEY=COVALENT_API_KEY:latest \
  --memory=2Gi \
  --cpu=2 \
  --timeout=300 \
  --max-instances=10 \
  --min-instances=0 \
  --port=8080 \
  --quiet

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)')

echo ""
echo "✅ Deployment complete!"
echo "🌐 Your app is live at: $SERVICE_URL"
echo ""
echo "📊 View logs:"
echo "   gcloud run services logs read $SERVICE_NAME --region=$REGION"
echo ""

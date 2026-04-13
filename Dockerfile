# Dockerfile for GCP Cloud Run deployment
# Uses development mode to avoid libSQL bundling issues

FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy all files
COPY . .

# Install all dependencies
RUN pnpm install

# Set environment variables
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start in development mode (works around libSQL build issue)
CMD ["pnpm", "--filter", "@deepdive/web", "dev", "--hostname", "0.0.0.0", "--port", "8080"]

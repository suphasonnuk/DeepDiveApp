# Multi-stage build for GCP Cloud Run deployment

# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@latest

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/crypto/package.json ./packages/crypto/
COPY packages/chains/package.json ./packages/chains/
COPY apps/web/package.json ./apps/web/
COPY turbo.json ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@latest

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Copy all source code
COPY . .

# Install dependencies again to get workspace links
RUN pnpm install --offline

# Set build environment
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Stage 3: Runner (development mode to avoid libSQL bundling issues)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Install pnpm
RUN npm install -g pnpm@latest

# Copy necessary files
COPY --from=builder --chown=nextjs:nodejs /app ./

USER nextjs

EXPOSE 8080

# Start in development mode (works around libSQL webpack bundling issue)
CMD ["pnpm", "--filter", "@deepdive/web", "dev", "--hostname", "0.0.0.0", "--port", "8080"]

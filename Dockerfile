# ── Stage 1: Install dependencies ─────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
RUN npm install -g pnpm@10

# Copy manifests only (for layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/db/package.json       ./packages/db/
COPY packages/crypto/package.json   ./packages/crypto/
COPY packages/chains/package.json   ./packages/chains/
COPY apps/web/package.json          ./apps/web/

RUN pnpm install --no-frozen-lockfile --ignore-scripts

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
RUN npm install -g pnpm@10

COPY --from=deps /app ./

# Copy all source
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# NEXT_PUBLIC_* vars are baked in at build time
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=""
ARG NEXT_PUBLIC_RPC_ETHEREUM=""
ARG NEXT_PUBLIC_RPC_ARBITRUM=""
ARG NEXT_PUBLIC_RPC_BASE=""
ARG NEXT_PUBLIC_RPC_POLYGON=""

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN pnpm --filter @deepdive/web build

# ── Stage 3: Production runner ────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Standalone output already contains all required node_modules and packages
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./

# Static assets and public dir must be copied separately (not included in standalone)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public        ./apps/web/public

# Install native db packages explicitly — standalone tracer skips serverExternalPackages
RUN npm install --no-save @libsql/client libsql drizzle-orm

USER nextjs
EXPOSE 8080

# server.js is the standalone entry point — never use `next start` in standalone mode
CMD ["node", "apps/web/server.js"]

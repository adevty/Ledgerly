# syntax=docker/dockerfile:1
# -----------------------------------------------------------------------------
# Ledgerly - Multi-Stage Non-Root Production Dockerfile
#
# Constraints & Guarantees:
# - Node.js >= 22.13 (uses Node 24 for built-in node:sqlite).
# - Non-root container execution (`nextjs` user UID 1001).
# - Persistent volume mount at `/data` for SQLite database & WAL files.
# - Production environment with background worker intervals enabled.
# -----------------------------------------------------------------------------

FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 1. Dependencies Stage
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# 2. Builder Stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# 3. Production Runner Stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV LEDGERLY_DB_PATH="/data/ledgerly.sqlite"

# Create non-root system group and user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Create persistent storage volume directory owned by nextjs
RUN mkdir -p /data && chown -R nextjs:nodejs /data
VOLUME ["/data"]

# Copy application assets and production build with non-root ownership
COPY --chown=nextjs:nodejs --from=builder /app/package.json ./package.json
COPY --chown=nextjs:nodejs --from=builder /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs --from=builder /app/.next ./.next
COPY --chown=nextjs:nodejs --from=builder /app/public ./public
COPY --chown=nextjs:nodejs --from=builder /app/scripts ./scripts
COPY --chown=nextjs:nodejs --from=builder /app/src ./src

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["npm", "start"]

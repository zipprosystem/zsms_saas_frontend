# syntax=docker/dockerfile:1

# ---- Stage 1: deps ----
# Install dependencies in isolation so this layer is cached independently
# of source changes.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Stage 2: builder ----
# Build the Next.js production output (requires next.config.mjs
# `output: "standalone"` to produce .next/standalone).
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# No backend is wired yet (Phase 0 mock-data shell). When real API URLs
# are introduced, pass them here as build ARGs / ENV as needed by
# next.config / next-intl. Nothing required for this deploy.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Stage 3: runner ----
# Minimal production image: standalone server + static assets + public/,
# run as a non-root user.
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone output ships a minimal node_modules + server.js.
COPY --from=builder /app/.next/standalone ./
# Static assets are not included in standalone output and must be copied
# separately, landing at .next/static.
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]

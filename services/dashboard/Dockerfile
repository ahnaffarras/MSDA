# ─────────────────────────────────────────────
# Stage 1: deps — install production deps only
# ─────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ─────────────────────────────────────────────
# Stage 2: builder — compile Next.js
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Dummy env agar build tidak error karena MONGODB_URI belum di-set
ENV MONGODB_URI=mongodb://placeholder:27017/sata
ENV NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Tujuan proxy /api-proxy/* (rewrites di next.config.ts) DIKUNCI saat `next build`,
# bukan dibaca saat container berjalan. Tanpa ARG ini nilainya jatuh ke
# http://localhost:8080 yang di dalam container dashboard tidak ada -> 500.
ARG NEXT_PUBLIC_API_URL=http://backend:8080
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ─────────────────────────────────────────────
# Stage 3: runner — minimal production image
# ─────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Jalankan sebagai user non-root
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# next build --output standalone menghasilkan .next/standalone
COPY --from=builder /app/public             ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]

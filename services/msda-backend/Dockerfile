# ─────────────────────────────────────────────────────
# Stage 1: builder
# ─────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install git (needed by go mod for some packages)
RUN apk add --no-cache git

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o msda-backend ./cmd/api/main.go

# ─────────────────────────────────────────────────────
# Stage 2: runner
# ─────────────────────────────────────────────────────
FROM alpine:3.20 AS runner

WORKDIR /app

# ca-certificates for TLS calls (Gemini API, etc.)
RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /app/msda-backend .

RUN addgroup -S msda && adduser -S msda -G msda
USER msda

EXPOSE 8080

# Cek kesehatan memakai wget bawaan busybox (alpine)
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/api/v1/health >/dev/null || exit 1

CMD ["./msda-backend"]

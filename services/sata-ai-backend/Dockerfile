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
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o sata-backend ./cmd/api/main.go

# ─────────────────────────────────────────────────────
# Stage 2: runner
# ─────────────────────────────────────────────────────
FROM alpine:3.20 AS runner

WORKDIR /app

# ca-certificates for TLS calls (Gemini API, etc.)
RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /app/sata-backend .
COPY --from=builder /app/.env.example .env

RUN addgroup -S sata && adduser -S sata -G sata
USER sata

EXPOSE 8080
CMD ["./sata-backend"]

#!/usr/bin/env bash
# MSDA — konfigurasi awal AdGuard Home (reproduktif & idempoten).
#
# Jalankan SEKALI setelah:  docker compose --profile enforcement up -d
# Aman dijalankan ulang: bila AdGuard sudah diinisialisasi, hanya menerapkan ulang pengaturan.
#
# Yang dilakukan:
#   1. Wizard instalasi lewat API (admin user/password dari .env) bila belum diinisialisasi.
#   2. Upstream DNS (bukan MikroTik), blocking mode, bootstrap DNS.
#   3. Menghapus SEMUA daftar filter bawaan (hanya aturan MSDA yang berlaku).
#   4. Retensi query log & statistik pendek (default 24 jam).
#   5. Batasi klien yang boleh bertanya (MikroTik + jaringan Docker).
#
# Kebutuhan: bash, curl, jq. Membaca ../docker/.env (atau lewat variabel lingkungan).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$HERE/../docker/.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a; # shellcheck disable=SC1090
  source "$ENV_FILE"; set +a
fi

command -v curl >/dev/null || { echo "curl is required" >&2; exit 1; }
command -v jq   >/dev/null || { echo "jq is required"   >&2; exit 1; }

: "${ADGUARD_USER:?Set ADGUARD_USER in .env}"
: "${ADGUARD_PASSWORD:?Set ADGUARD_PASSWORD in .env}"
: "${MIKROTIK_IP:?Set MIKROTIK_IP in .env (the IP AdGuard sees MikroTik with)}"
if [[ ${#ADGUARD_PASSWORD} -lt 12 ]]; then echo "ADGUARD_PASSWORD must be at least 12 characters" >&2; exit 1; fi

UI_PORT="${ADGUARD_UI_PORT:-3000}"
BASE="http://127.0.0.1:${UI_PORT}"
MODE="${ADGUARD_BLOCKING_MODE:-null_ip}"
UPSTREAMS="${ADGUARD_UPSTREAM_DNS:-9.9.9.9 1.1.1.1}"
ALLOWED="${ADGUARD_ALLOWED_CLIENTS:-172.16.0.0/12,127.0.0.1}"
RETENTION_MS="${ADGUARD_RETENTION_MS:-86400000}"   # 24 jam. Nilai sah AGH: 3600000 (1h), 21600000 (6h), 86400000 (24h), 259200000 (72h), ...

case "$MODE" in null_ip|nxdomain) ;; *) echo "ADGUARD_BLOCKING_MODE must be null_ip or nxdomain (not '$MODE')" >&2; exit 1;; esac

auth=(-u "${ADGUARD_USER}:${ADGUARD_PASSWORD}")
j() { jq -cn "$@"; }   # bangun JSON dengan escaping benar (password aman)

echo "→ Waiting for AdGuard Home at $BASE ..."
for i in $(seq 1 60); do
  curl -fsS -o /dev/null "$BASE/" && break
  sleep 2
  [[ $i -eq 60 ]] && { echo "AdGuard Home did not become reachable on $BASE" >&2; exit 1; }
done

# 1) Wizard: bila /control/status menjawab 200 dengan kredensial kita → sudah diinisialisasi.
if curl -fsS "${auth[@]}" -o /dev/null "$BASE/control/status" 2>/dev/null; then
  echo "→ Already initialised; re-applying settings."
else
  echo "→ Running the install wizard via API ..."
  curl -fsS -X POST "$BASE/control/install/configure" -H 'Content-Type: application/json' \
    -d "$(j --arg u "$ADGUARD_USER" --arg p "$ADGUARD_PASSWORD" \
      '{web:{ip:"0.0.0.0",port:3000},dns:{ip:"0.0.0.0",port:53},username:$u,password:$p}')" >/dev/null
  for i in $(seq 1 30); do
    curl -fsS "${auth[@]}" -o /dev/null "$BASE/control/status" 2>/dev/null && break
    sleep 2
    [[ $i -eq 30 ]] && { echo "Login after wizard failed; check ADGUARD_USER/PASSWORD" >&2; exit 1; }
  done
fi

post() { curl -fsS "${auth[@]}" -X POST "$BASE$1" -H 'Content-Type: application/json' -d "$2" >/dev/null; }

# 2) Upstream + blocking mode (bootstrap DNS untuk upstream bernama host).
UP_JSON="$(printf '%s\n' ${UPSTREAMS//,/ } | jq -R . | jq -cs .)"
echo "→ Upstream DNS: $UPSTREAMS · blocking mode: $MODE"
post /control/dns_config "$(j --argjson up "$UP_JSON" --arg m "$MODE" \
  '{upstream_dns:$up, bootstrap_dns:["9.9.9.10","1.1.1.1"], blocking_mode:$m}')"

# 3) Hapus semua daftar filter bawaan (hanya aturan MSDA yang berlaku).
echo "→ Removing default filter lists ..."
curl -fsS "${auth[@]}" "$BASE/control/filtering/status" \
  | jq -r '(.filters // [])[].url' \
  | while read -r url; do
      [[ -n "$url" ]] && post /control/filtering/remove_url "$(j --arg u "$url" '{url:$u,whitelist:false}')"
    done
post /control/filtering/config '{"enabled":true,"interval":0}'

# 4) Retensi pendek.
echo "→ Query log & statistics retention: ${RETENTION_MS} ms"
post /control/querylog/config "$(j --argjson i "$RETENTION_MS" '{enabled:true,interval:$i,anonymize_client_ip:false}')"
post /control/stats/config    "$(j --argjson i "$RETENTION_MS" '{enabled:true,interval:$i}')"

# 5) Klien yang diizinkan: MikroTik + jaringan Docker (+ loopback). Selain itu ditolak.
CL_JSON="$(printf '%s\n' "$MIKROTIK_IP" ${ALLOWED//,/ } | jq -R . | jq -cs 'unique')"
echo "→ Allowed clients: $CL_JSON"
post /control/access/set "$(j --argjson a "$CL_JSON" '{allowed_clients:$a,disallowed_clients:[],blocked_hosts:["version.bind","id.server","hostname.bind"]}')"

echo "✓ AdGuard Home is configured. Next: set MSDA_ENFORCEMENT_ENABLED=true, restart the backend,"
echo "  then run infrastructure/mikrotik/mikrotik-adguard.rsc on the router."

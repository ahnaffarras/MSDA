#!/bin/bash
# MSDA — backup MongoDB terjadwal (jalan di dalam container mongo:4.4, memakai mongodump).
#
#   BACKUP_INTERVAL_HOURS  jarak antar backup, default 24
#   BACKUP_RETENTION_DAYS  backup lebih tua dari ini dihapus, default 14
#   MONGODB_URI            wajib (diisi docker-compose; tidak pernah dicetak ke log)
#   BACKUP_DIR             default /backups
#
# Keamanan: file ditulis ke *.partial lalu di-rename setelah lolos `gzip -t`, jadi backup
# yang gagal/terpotong tidak pernah tampak seperti backup yang valid. Penghapusan backup
# lama HANYA dijalankan setelah backup baru berhasil, sehingga kegagalan berulang tidak
# pernah menghabiskan semua salinan lama.
#
#   backup.sh                 jalankan loop terjadwal
#   backup.sh --once          satu kali backup lalu keluar
#   backup.sh --healthcheck   exit 0 bila backup sukses terakhir masih cukup baru

set -u
DIR="${BACKUP_DIR:-/backups}"
INTERVAL_H="${BACKUP_INTERVAL_HOURS:-24}"
RETENTION_D="${BACKUP_RETENTION_DAYS:-14}"
STATUS="$DIR/.status"

is_pos_int() { [[ "$1" =~ ^[1-9][0-9]*$ ]]; }
if ! is_pos_int "$INTERVAL_H" || ! is_pos_int "$RETENTION_D"; then
  echo "[backup] BACKUP_INTERVAL_HOURS and BACKUP_RETENTION_DAYS must be positive whole numbers" >&2
  exit 2
fi

healthcheck() {
  [ -f "$STATUS" ] || exit 1
  # shellcheck disable=SC1090
  . "$STATUS"
  now=$(date +%s)
  # sehat bila backup sukses terakhir lebih baru dari 2 interval + 1 jam
  [ $((now - last_ok)) -lt $((2 * interval_s + 3600)) ]
  exit $?
}

run_once() {
  : "${MONGODB_URI:?MONGODB_URI is required}"
  mkdir -p "$DIR"
  local ts tmp final
  ts=$(date -u +%Y%m%d-%H%M%S)
  tmp="$DIR/.msda-$ts.archive.gz.partial"
  final="$DIR/msda-$ts.archive.gz"

  if ! mongodump --uri="$MONGODB_URI" --archive="$tmp" --gzip --quiet; then
    echo "[backup] FAILED: mongodump returned an error ($ts)" >&2
    rm -f "$tmp"
    return 1
  fi
  if ! gzip -t "$tmp" 2>/dev/null || [ ! -s "$tmp" ]; then
    echo "[backup] FAILED: the archive is empty or corrupt ($ts)" >&2
    rm -f "$tmp"
    return 1
  fi
  mv "$tmp" "$final"
  echo "[backup] ok $final ($(du -h "$final" | cut -f1))"
  printf 'last_ok=%s\ninterval_s=%s\n' "$(date +%s)" "$((INTERVAL_H * 3600))" > "$STATUS"

  # Retensi: hanya setelah backup baru berhasil
  find "$DIR" -maxdepth 1 -type f -name 'msda-*.archive.gz' -mtime +"$RETENTION_D" -print -delete \
    | sed 's/^/[backup] pruned /'
  return 0
}

case "${1:-}" in
  --healthcheck) healthcheck ;;
  --once) run_once; exit $? ;;
esac

echo "[backup] every ${INTERVAL_H}h, keeping ${RETENTION_D} days, into ${DIR}"
while true; do
  run_once
  sleep "$((INTERVAL_H * 3600))" &
  wait $!
done

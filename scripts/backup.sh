#!/usr/bin/env bash
# Logical backup of the election database (custom format, compressed).
#   BACKUP_DATABASE_URL=postgres://owner@host/db npm run db:backup -- [output-dir]
# Store backups encrypted and off-site. They contain personal data (students)
# and the anonymous ballot table; treat them with the same care as the database.
set -euo pipefail
URL="${BACKUP_DATABASE_URL:-${MIGRATION_DATABASE_URL:-}}"
[ -n "$URL" ] || { echo "Set BACKUP_DATABASE_URL (owner connection)"; exit 1; }
OUT_DIR="${1:-backups}"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/techtitans28-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --compress=9 --no-owner --no-privileges --file="$FILE" "$URL"
sha256sum "$FILE" > "$FILE.sha256"
echo "$FILE"

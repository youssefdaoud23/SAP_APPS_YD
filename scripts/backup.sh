#!/usr/bin/env sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-./backups}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-invarture}"
POSTGRES_DB="${POSTGRES_DB:-invarture}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/invarture-app-studio-$STAMP.dump"
META="$BACKUP_DIR/invarture-app-studio-$STAMP.meta.json"

if ! docker compose ps --status running "$POSTGRES_SERVICE" >/dev/null 2>&1; then
  echo "PostgreSQL service '$POSTGRES_SERVICE' is not running." >&2
  exit 1
fi

echo "Creating PostgreSQL backup: $FILE"
docker compose exec -T "$POSTGRES_SERVICE" pg_dump \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --format=custom \
  --no-owner \
  --no-privileges > "$FILE"

if [ ! -s "$FILE" ]; then
  echo "Backup file is empty." >&2
  rm -f "$FILE"
  exit 1
fi

SHA="$(sha256sum "$FILE" | awk '{print $1}')"
SIZE="$(wc -c < "$FILE" | tr -d ' ')"
VERSION="$(curl -fsS http://127.0.0.1:8081/api/version 2>/dev/null | tr -d '\n' || true)"
printf '{\n  "createdAt": "%s",\n  "database": "%s",\n  "bytes": %s,\n  "sha256": "%s",\n  "runtime": %s\n}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$POSTGRES_DB" "$SIZE" "$SHA" "${VERSION:-null}" > "$META"

chmod 600 "$FILE" "$META" 2>/dev/null || true
echo "Backup complete."
echo "  dump: $FILE"
echo "  metadata: $META"
echo "  sha256: $SHA"

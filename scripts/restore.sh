#!/usr/bin/env sh
set -eu

FILE="${1:-}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
APP_SERVICE="${APP_SERVICE:-invarture-app-studio}"
POSTGRES_USER="${POSTGRES_USER:-invarture}"
POSTGRES_DB="${POSTGRES_DB:-invarture}"

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: RESTORE_CONFIRM=YES sh scripts/restore.sh backups/<backup>.dump" >&2
  exit 2
fi

if [ "${RESTORE_CONFIRM:-}" != "YES" ]; then
  echo "Restore replaces the current platform database." >&2
  echo "Re-run with RESTORE_CONFIRM=YES after verifying the backup path." >&2
  exit 3
fi

if ! docker compose ps --status running "$POSTGRES_SERVICE" >/dev/null 2>&1; then
  echo "PostgreSQL service '$POSTGRES_SERVICE' is not running." >&2
  exit 1
fi

EXPECTED_META="${FILE%.dump}.meta.json"
if [ -f "$EXPECTED_META" ]; then
  EXPECTED_SHA="$(sed -n 's/.*"sha256": "\([0-9a-f]*\)".*/\1/p' "$EXPECTED_META" | head -1)"
  if [ -n "$EXPECTED_SHA" ]; then
    ACTUAL_SHA="$(sha256sum "$FILE" | awk '{print $1}')"
    if [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then
      echo "Backup checksum does not match metadata. Restore aborted." >&2
      echo "Expected: $EXPECTED_SHA" >&2
      echo "Actual:   $ACTUAL_SHA" >&2
      exit 4
    fi
  fi
fi

WAS_RUNNING=0
if docker compose ps --status running "$APP_SERVICE" 2>/dev/null | grep -q "$APP_SERVICE"; then
  WAS_RUNNING=1
  echo "Stopping App Studio before database restore..."
  docker compose stop "$APP_SERVICE"
fi

cleanup() {
  if [ "$WAS_RUNNING" = "1" ]; then
    echo "Starting App Studio..."
    docker compose start "$APP_SERVICE" >/dev/null
  fi
}
trap cleanup EXIT INT TERM

echo "Terminating other sessions on database $POSTGRES_DB..."
docker compose exec -T "$POSTGRES_SERVICE" psql \
  --username="$POSTGRES_USER" \
  --dbname=postgres \
  --set=ON_ERROR_STOP=1 \
  --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();" >/dev/null

echo "Restoring $FILE..."
cat "$FILE" | docker compose exec -T "$POSTGRES_SERVICE" pg_restore \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error

echo "Restore completed successfully."

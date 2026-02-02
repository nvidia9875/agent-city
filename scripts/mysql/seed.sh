#!/bin/bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
SEED_FILE="$SCRIPT_DIR/seed.sql"
ENV_FILE="$SCRIPT_DIR/../../.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -n "${DATABASE_URL:-}" && ( -z "${DB_HOST:-}" || -z "${DB_USER:-}" || -z "${DB_NAME:-}" ) ]]; then
  read -r DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME < <(
    node -e "const u=new URL(process.env.DATABASE_URL);console.log([u.hostname,u.port||'3306',decodeURIComponent(u.username),decodeURIComponent(u.password),u.pathname.replace(/^\\//,'')].join(' '));"
  )
fi

: "${DB_HOST:?DB_HOST is required}"
: "${DB_USER:?DB_USER is required}"
: "${DB_NAME:?DB_NAME is required}"

DB_PORT=${DB_PORT:-3306}

MYSQL_PWD="${DB_PASSWORD:-}" \
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" < "$SEED_FILE"

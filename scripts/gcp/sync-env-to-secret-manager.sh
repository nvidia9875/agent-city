#!/usr/bin/env bash

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE=".env"
DEFAULTS_FILE="${SCRIPT_DIR}/cloud-run-defaults.env"
KEYS_FILE="${SCRIPT_DIR}/cloud-run-env.keys"
PROJECT_ID=""
SECRET_PREFIX=""
DRY_RUN="false"

usage() {
  cat <<USAGE
Usage:
  ${SCRIPT_NAME} --project PROJECT_ID [--env-file FILE] [--defaults-file FILE] [--keys-file FILE] [--secret-prefix PREFIX] [--dry-run]

Description:
  Sync all KEY=VALUE entries from a dotenv-style file to Google Secret Manager.
  Each key is stored as a secret named "<prefix><KEY>", and a new secret version
  is added for every sync. If --defaults-file exists, missing keys are backfilled
  from that file.

Examples:
  ${SCRIPT_NAME} --project my-project --env-file .env
  ${SCRIPT_NAME} --project my-project --env-file .env --keys-file scripts/gcp/cloud-run-env.keys
  ${SCRIPT_NAME} --project my-project --env-file .env --secret-prefix prod-
  ${SCRIPT_NAME} --project my-project --env-file .env --dry-run
USAGE
}

fail() {
  echo "Error: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      [[ $# -ge 2 ]] || fail "--project requires a value"
      PROJECT_ID="$2"
      shift 2
      ;;
    --env-file)
      [[ $# -ge 2 ]] || fail "--env-file requires a value"
      ENV_FILE="$2"
      shift 2
      ;;
    --defaults-file)
      [[ $# -ge 2 ]] || fail "--defaults-file requires a value"
      DEFAULTS_FILE="$2"
      shift 2
      ;;
    --keys-file)
      [[ $# -ge 2 ]] || fail "--keys-file requires a value"
      KEYS_FILE="$2"
      shift 2
      ;;
    --secret-prefix)
      [[ $# -ge 2 ]] || fail "--secret-prefix requires a value"
      SECRET_PREFIX="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

[[ -f "${ENV_FILE}" ]] || fail "File not found: ${ENV_FILE}"
[[ -n "${PROJECT_ID}" ]] || fail "--project is required"

if [[ "${DRY_RUN}" != "true" ]]; then
  require_cmd gcloud
fi

processed=0
created=0
updated=0
line_no=0
defaults_backfilled=0

upsert_secret() {
  local key="$1"
  local value="$2"
  local secret_name="${SECRET_PREFIX}${key}"

  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "[dry-run] upsert secret ${secret_name}"
  else
    if ! gcloud secrets describe "${secret_name}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
      gcloud secrets create "${secret_name}" \
        --project "${PROJECT_ID}" \
        --replication-policy="automatic" \
        --labels="managed_by=agent_city" \
        >/dev/null
      created=$((created + 1))
      echo "Created secret ${secret_name}"
    fi

    printf '%s' "${value}" | gcloud secrets versions add "${secret_name}" \
      --project "${PROJECT_ID}" \
      --data-file=- \
      >/dev/null
  fi

  processed=$((processed + 1))
  updated=$((updated + 1))
}

while IFS= read -r line || [[ -n "${line}" ]]; do
  line_no=$((line_no + 1))

  [[ "${line}" =~ ^[[:space:]]*$ ]] && continue
  [[ "${line}" =~ ^[[:space:]]*# ]] && continue

  if [[ ! "${line}" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
    fail "Unsupported format in ${ENV_FILE}:${line_no}"
  fi

  key="${BASH_REMATCH[1]}"
  value="${BASH_REMATCH[2]}"
  value="${value%$'\r'}"
  upsert_secret "${key}" "${value}"
done < "${ENV_FILE}"

if [[ -f "${DEFAULTS_FILE}" ]]; then
  defaults_line_no=0
  while IFS= read -r line || [[ -n "${line}" ]]; do
    defaults_line_no=$((defaults_line_no + 1))

    [[ "${line}" =~ ^[[:space:]]*$ ]] && continue
    [[ "${line}" =~ ^[[:space:]]*# ]] && continue

    if [[ ! "${line}" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      fail "Unsupported format in ${DEFAULTS_FILE}:${defaults_line_no}"
    fi

    key="${BASH_REMATCH[1]}"
    if grep -Eq "^[[:space:]]*${key}=" "${ENV_FILE}"; then
      continue
    fi

    value="${BASH_REMATCH[2]}"
    value="${value%$'\r'}"
    upsert_secret "${key}" "${value}"
    defaults_backfilled=$((defaults_backfilled + 1))
  done < "${DEFAULTS_FILE}"
fi

[[ "${processed}" -gt 0 ]] || fail "No environment variables found in ${ENV_FILE}"

echo "Synced ${updated} variables from ${ENV_FILE}."
if [[ "${DRY_RUN}" != "true" ]]; then
  echo "Newly created secrets: ${created}"
fi
if [[ -f "${DEFAULTS_FILE}" ]]; then
  echo "Backfilled ${defaults_backfilled} missing keys from ${DEFAULTS_FILE}."
fi

MAPPING="$(${SCRIPT_DIR}/render-cloud-run-secrets.sh --keys-file "${KEYS_FILE}" --secret-prefix "${SECRET_PREFIX}")"
echo "Cloud Run --set-secrets value:"
echo "${MAPPING}"

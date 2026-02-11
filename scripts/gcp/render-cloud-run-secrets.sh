#!/usr/bin/env bash

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYS_FILE="${SCRIPT_DIR}/cloud-run-env.keys"
SECRET_PREFIX=""
SECRET_VERSION="latest"

usage() {
  cat <<USAGE
Usage:
  ${SCRIPT_NAME} [--keys-file FILE] [--secret-prefix PREFIX] [--version VERSION]

Description:
  Reads environment variable keys from a dotenv-style file (KEY=...) or
  key-list file (KEY per line) and prints a Cloud Run --set-secrets mapping
  string.

Examples:
  ${SCRIPT_NAME} --keys-file scripts/gcp/cloud-run-env.keys
  ${SCRIPT_NAME} --keys-file .env --secret-prefix prod- --version latest
USAGE
}

fail() {
  echo "Error: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
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
    --version)
      [[ $# -ge 2 ]] || fail "--version requires a value"
      SECRET_VERSION="$2"
      shift 2
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

[[ -f "${KEYS_FILE}" ]] || fail "File not found: ${KEYS_FILE}"

mappings=()
line_no=0

while IFS= read -r line || [[ -n "${line}" ]]; do
  line_no=$((line_no + 1))

  [[ "${line}" =~ ^[[:space:]]*$ ]] && continue
  [[ "${line}" =~ ^[[:space:]]*# ]] && continue

  if [[ "${line}" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)([[:space:]]*=.*)?$ ]]; then
    key="${BASH_REMATCH[1]}"
    mappings+=("${key}=${SECRET_PREFIX}${key}:${SECRET_VERSION}")
    continue
  fi

  fail "Unsupported format in ${KEYS_FILE}:${line_no}"
done < "${KEYS_FILE}"

[[ ${#mappings[@]} -gt 0 ]] || fail "No environment variable keys found in ${KEYS_FILE}"

printf '%s' "${mappings[0]}"
for ((i = 1; i < ${#mappings[@]}; i++)); do
  printf ',%s' "${mappings[$i]}"
done
printf '\n'

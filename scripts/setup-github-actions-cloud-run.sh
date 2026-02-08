#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="${ROOT_DIR}/infra"

print_usage() {
  cat <<'EOF'
Usage:
  scripts/setup-github-actions-cloud-run.sh [--repo owner/repo] [--dry-run]

Description:
  Reads Terraform outputs from infra/ and configures GitHub Secrets/Variables
  required by .github/workflows/cloud-run-deploy.yml.

Options:
  --repo     Target GitHub repository (owner/repo). If omitted, detect from git remote.
  --dry-run  Print values without writing to GitHub.
  -h, --help Show this help.
EOF
}

fail() {
  echo "Error: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

detect_repo() {
  local remote
  remote="$(git -C "${ROOT_DIR}" config --get remote.origin.url || true)"
  [[ -n "${remote}" ]] || fail "Could not detect git remote. Use --repo owner/repo."

  if [[ "${remote}" =~ ^https://github\.com/([^/]+)/([^/.]+)(\.git)?$ ]]; then
    echo "${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
    return 0
  fi

  if [[ "${remote}" =~ ^git@github\.com:([^/]+)/([^/.]+)(\.git)?$ ]]; then
    echo "${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
    return 0
  fi

  fail "Unsupported remote format: ${remote}. Use --repo owner/repo."
}

tf_output_raw() {
  local key="$1"
  terraform -chdir="${INFRA_DIR}" output -raw "${key}" 2>/dev/null || true
}

set_secret() {
  local repo="$1"
  local name="$2"
  local value="$3"
  local dry_run="$4"

  [[ -n "${value}" ]] || fail "Terraform output for secret ${name} is empty."

  if [[ "${dry_run}" == "true" ]]; then
    echo "[dry-run] gh secret set ${name} --repo ${repo} --body <hidden>"
  else
    gh secret set "${name}" --repo "${repo}" --body "${value}"
    echo "Set secret: ${name}"
  fi
}

set_variable() {
  local repo="$1"
  local name="$2"
  local value="$3"
  local dry_run="$4"

  [[ -n "${value}" ]] || fail "Terraform output for variable ${name} is empty."

  if [[ "${dry_run}" == "true" ]]; then
    echo "[dry-run] gh variable set ${name} --repo ${repo} --body ${value}"
  else
    gh variable set "${name}" --repo "${repo}" --body "${value}"
    echo "Set variable: ${name}=${value}"
  fi
}

REPO=""
DRY_RUN="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      [[ $# -ge 2 ]] || fail "--repo requires owner/repo"
      REPO="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

require_cmd terraform

if [[ "${DRY_RUN}" != "true" ]]; then
  require_cmd gh
fi

if [[ ! -d "${INFRA_DIR}" ]]; then
  fail "infra directory not found: ${INFRA_DIR}"
fi

if [[ "${DRY_RUN}" != "true" ]]; then
  gh auth status >/dev/null 2>&1 || fail "gh is not authenticated. Run: gh auth login"
fi

if [[ -z "${REPO}" ]]; then
  REPO="$(detect_repo)"
fi

PROJECT_ID="$(tf_output_raw "project_id")"
REGION="$(tf_output_raw "region")"
WORKLOAD_IDENTITY_PROVIDER="$(tf_output_raw "github_workload_identity_provider")"
GITHUB_SERVICE_ACCOUNT="$(tf_output_raw "github_actions_service_account_email")"
ARTIFACT_REPO="$(tf_output_raw "artifact_registry_repository")"
WEB_SERVICE="$(tf_output_raw "cloud_run_web_service_name")"
WS_SERVICE="$(tf_output_raw "cloud_run_ws_service_name")"
RUNTIME_SA="$(tf_output_raw "service_account_email")"

[[ -n "${PROJECT_ID}" ]] || fail "Missing Terraform output 'project_id'. Run terraform apply in infra/ first."
[[ -n "${WORKLOAD_IDENTITY_PROVIDER}" ]] || fail "Missing Terraform output 'github_workload_identity_provider'. Run terraform apply in infra/ first."
[[ -n "${GITHUB_SERVICE_ACCOUNT}" ]] || fail "Missing Terraform output 'github_actions_service_account_email'. Run terraform apply in infra/ first."

echo "Target GitHub repository: ${REPO}"
echo "Using project: ${PROJECT_ID}"

set_secret "${REPO}" "GCP_PROJECT_ID" "${PROJECT_ID}" "${DRY_RUN}"
set_secret "${REPO}" "GCP_WORKLOAD_IDENTITY_PROVIDER" "${WORKLOAD_IDENTITY_PROVIDER}" "${DRY_RUN}"
set_secret "${REPO}" "GCP_SERVICE_ACCOUNT" "${GITHUB_SERVICE_ACCOUNT}" "${DRY_RUN}"

set_variable "${REPO}" "GCP_REGION" "${REGION}" "${DRY_RUN}"
set_variable "${REPO}" "ARTIFACT_REPO" "${ARTIFACT_REPO}" "${DRY_RUN}"
set_variable "${REPO}" "CLOUD_RUN_WEB_SERVICE" "${WEB_SERVICE}" "${DRY_RUN}"
set_variable "${REPO}" "CLOUD_RUN_WS_SERVICE" "${WS_SERVICE}" "${DRY_RUN}"
set_variable "${REPO}" "CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT" "${RUNTIME_SA}" "${DRY_RUN}"

if [[ "${DRY_RUN}" == "true" ]]; then
  echo "Dry run completed."
else
  echo "GitHub Secrets/Variables setup completed."
  echo "Trigger '.github/workflows/cloud-run-deploy.yml' via push to main or workflow_dispatch."
fi

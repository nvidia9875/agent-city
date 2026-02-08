import base64
import json
import logging
import os
import time
from typing import Any

from google.auth import default
from google.auth.transport.requests import Request
from googleapiclient.discovery import build


def _to_bool(value: str | None) -> bool:
    if value is None:
        return False
    return value.lower() in {"1", "true", "yes", "on"}


def _parse_payload(cloud_event: Any) -> dict[str, Any]:
    message = (cloud_event.data or {}).get("message", {})
    encoded = message.get("data", "")
    if not encoded:
        return {}
    decoded = base64.b64decode(encoded).decode("utf-8")
    return json.loads(decoded)


def _wait_operation(ops_api: Any, operation_name: str, timeout_seconds: int = 120) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        operation = ops_api.get(name=operation_name).execute()
        if operation.get("done"):
            if operation.get("error"):
                raise RuntimeError(f"operation failed: {operation['error']}")
            return
        time.sleep(2)
    raise TimeoutError(f"operation timeout: {operation_name}")


def _drop_public_invoker(services_api: Any, service_name: str, dry_run: bool) -> bool:
    policy = services_api.getIamPolicy(resource=service_name).execute()
    bindings = policy.get("bindings", [])
    updated_bindings = []
    removed = False

    for binding in bindings:
        role = binding.get("role")
        members = binding.get("members", [])
        if role != "roles/run.invoker":
            updated_bindings.append(binding)
            continue

        filtered_members = [member for member in members if member != "allUsers"]
        if len(filtered_members) != len(members):
            removed = True
        if filtered_members:
            copied = dict(binding)
            copied["members"] = filtered_members
            updated_bindings.append(copied)

    if not removed:
        return False

    if dry_run:
        logging.info("[dry-run] would remove allUsers run.invoker from %s", service_name)
        return True

    policy["bindings"] = updated_bindings
    services_api.setIamPolicy(resource=service_name, body={"policy": policy}).execute()
    return True


def _restrict_ingress(services_api: Any, ops_api: Any, service_name: str, dry_run: bool) -> None:
    if dry_run:
        logging.info("[dry-run] would set ingress internal-only for %s", service_name)
        return

    operation = services_api.patch(
        name=service_name,
        updateMask="ingress",
        body={"ingress": "INGRESS_TRAFFIC_INTERNAL_ONLY"},
    ).execute()
    operation_name = operation.get("name")
    if operation_name:
        _wait_operation(ops_api, operation_name)


def handle_budget_alert(cloud_event: Any) -> None:
    payload = _parse_payload(cloud_event)
    if not payload:
        logging.warning("budget payload is empty")
        return

    cost_amount = float(payload.get("costAmount", 0))
    budget_amount = float(payload.get("budgetAmount", 0))
    threshold = float(os.getenv("BUDGET_STOP_THRESHOLD", "1.0"))
    dry_run = _to_bool(os.getenv("BUDGET_GUARD_DRY_RUN"))

    if budget_amount <= 0:
        logging.warning("invalid budget amount: %s", budget_amount)
        return

    ratio = cost_amount / budget_amount
    logging.info(
        "budget update: cost=%s budget=%s ratio=%.4f displayName=%s",
        cost_amount,
        budget_amount,
        ratio,
        payload.get("budgetDisplayName"),
    )

    if ratio < threshold:
        logging.info("ratio %.4f < threshold %.4f, skip guard", ratio, threshold)
        return

    project_id = os.getenv("GCP_PROJECT_ID")
    region = os.getenv("CLOUD_RUN_REGION", "us-central1")
    services_raw = os.getenv("CLOUD_RUN_SERVICES", "")
    services = [service.strip() for service in services_raw.split(",") if service.strip()]

    if not project_id or not services:
        logging.error("missing required env: GCP_PROJECT_ID or CLOUD_RUN_SERVICES")
        return

    credentials, _ = default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    credentials.refresh(Request())
    run_api = build("run", "v2", credentials=credentials, cache_discovery=False)
    services_api = run_api.projects().locations().services()
    ops_api = run_api.projects().locations().operations()

    for service in services:
        service_name = f"projects/{project_id}/locations/{region}/services/{service}"
        logging.info("restricting public access for %s", service_name)
        _drop_public_invoker(services_api, service_name, dry_run=dry_run)
        _restrict_ingress(services_api, ops_api, service_name, dry_run=dry_run)

    logging.info("budget guard finished for %d service(s)", len(services))

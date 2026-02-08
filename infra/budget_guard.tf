locals {
  budget_controls_enabled = var.enable_budget_controls

  billing_account_id_normalized = trimprefix(trimspace(var.billing_account_id), "billingAccounts/")

  budget_guard_services = join(",", [
    var.cloud_run_web_service_name,
    var.cloud_run_ws_service_name,
  ])

  budget_guard_project_roles = toset([
    "roles/eventarc.eventReceiver",
    "roles/logging.logWriter",
    "roles/run.admin",
  ])
}

resource "google_project_service" "billingbudgets" {
  count = local.budget_controls_enabled ? 1 : 0

  service            = "billingbudgets.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "monitoring" {
  count = local.budget_controls_enabled ? 1 : 0

  service            = "monitoring.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "pubsub" {
  count = local.budget_controls_enabled ? 1 : 0

  service            = "pubsub.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudfunctions" {
  count = local.budget_controls_enabled ? 1 : 0

  service            = "cloudfunctions.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "eventarc" {
  count = local.budget_controls_enabled ? 1 : 0

  service            = "eventarc.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudbuild" {
  count = local.budget_controls_enabled ? 1 : 0

  service            = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}

resource "google_pubsub_topic" "budget_alerts" {
  count = local.budget_controls_enabled ? 1 : 0

  name = var.budget_alert_topic_name

  depends_on = [google_project_service.pubsub]
}

resource "google_monitoring_notification_channel" "budget_email" {
  count = local.budget_controls_enabled ? 1 : 0

  display_name = "AgentTown Budget Alert Email"
  type         = "email"
  labels = {
    email_address = var.budget_alert_email
  }

  depends_on = [google_project_service.monitoring]
}

resource "google_billing_budget" "monthly" {
  count = local.budget_controls_enabled ? 1 : 0

  billing_account = local.billing_account_id_normalized
  display_name    = var.budget_display_name

  budget_filter {
    projects = ["projects/${data.google_project.current.number}"]
  }

  amount {
    specified_amount {
      currency_code = var.budget_currency_code
      units         = tostring(var.budget_amount)
    }
  }

  dynamic "threshold_rules" {
    for_each = var.budget_thresholds
    content {
      threshold_percent = threshold_rules.value
    }
  }

  all_updates_rule {
    pubsub_topic   = google_pubsub_topic.budget_alerts[0].id
    schema_version = "1.0"
    monitoring_notification_channels = [
      google_monitoring_notification_channel.budget_email[0].name,
    ]
  }

  depends_on = [
    google_project_service.billingbudgets,
    google_pubsub_topic.budget_alerts,
    google_monitoring_notification_channel.budget_email,
  ]
}

resource "google_service_account" "budget_guard" {
  count = local.budget_controls_enabled ? 1 : 0

  account_id   = "agenttown-budget-guard"
  display_name = "AgentTown budget guard"
}

resource "google_project_iam_member" "budget_guard_project_roles" {
  for_each = local.budget_controls_enabled ? local.budget_guard_project_roles : toset([])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.budget_guard[0].email}"
}

resource "google_pubsub_topic_iam_member" "budget_guard_subscriber" {
  count = local.budget_controls_enabled ? 1 : 0

  topic  = google_pubsub_topic.budget_alerts[0].name
  role   = "roles/pubsub.subscriber"
  member = "serviceAccount:${google_service_account.budget_guard[0].email}"
}

resource "random_id" "budget_guard_bucket_suffix" {
  count = local.budget_controls_enabled ? 1 : 0

  byte_length = 4
}

resource "google_storage_bucket" "budget_guard_source" {
  count = local.budget_controls_enabled ? 1 : 0

  name                        = "${var.project_id}-budget-guard-${random_id.budget_guard_bucket_suffix[0].hex}"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true
}

data "archive_file" "budget_guard_zip" {
  count = local.budget_controls_enabled ? 1 : 0

  type        = "zip"
  source_dir  = "${path.module}/functions/budget_guard"
  output_path = "${path.module}/.terraform/budget-guard.zip"
}

resource "google_storage_bucket_object" "budget_guard_zip" {
  count = local.budget_controls_enabled ? 1 : 0

  name   = "budget-guard-${data.archive_file.budget_guard_zip[0].output_md5}.zip"
  bucket = google_storage_bucket.budget_guard_source[0].name
  source = data.archive_file.budget_guard_zip[0].output_path
}

resource "google_cloudfunctions2_function" "budget_guard" {
  count = local.budget_controls_enabled ? 1 : 0

  name     = var.budget_guard_function_name
  location = var.region

  build_config {
    runtime     = "python311"
    entry_point = "handle_budget_alert"

    source {
      storage_source {
        bucket = google_storage_bucket.budget_guard_source[0].name
        object = google_storage_bucket_object.budget_guard_zip[0].name
      }
    }
  }

  service_config {
    max_instance_count    = 1
    available_memory      = "256M"
    timeout_seconds       = 120
    service_account_email = google_service_account.budget_guard[0].email

    environment_variables = {
      GCP_PROJECT_ID        = var.project_id
      CLOUD_RUN_REGION      = var.region
      CLOUD_RUN_SERVICES    = local.budget_guard_services
      BUDGET_STOP_THRESHOLD = tostring(var.budget_auto_stop_threshold)
      BUDGET_GUARD_DRY_RUN  = tostring(var.budget_guard_dry_run)
    }
  }

  event_trigger {
    trigger_region        = var.region
    event_type            = "google.cloud.pubsub.topic.v1.messagePublished"
    pubsub_topic          = google_pubsub_topic.budget_alerts[0].id
    retry_policy          = "RETRY_POLICY_RETRY"
    service_account_email = google_service_account.budget_guard[0].email
  }

  depends_on = [
    google_project_service.cloudfunctions,
    google_project_service.eventarc,
    google_project_service.cloudbuild,
    google_project_service.pubsub,
    google_project_service.run,
    google_project_service.artifactregistry,
    google_project_iam_member.budget_guard_project_roles,
    google_pubsub_topic_iam_member.budget_guard_subscriber,
  ]
}

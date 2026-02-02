provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_project_service" "vertex" {
  service            = "aiplatform.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "sqladmin" {
  service            = "sqladmin.googleapis.com"
  disable_on_destroy = false
}

resource "random_password" "db" {
  length  = 20
  special = true
}

resource "google_sql_database_instance" "primary" {
  name             = var.db_instance_name
  database_version = "MYSQL_8_0"
  region           = var.region

  settings {
    tier      = var.db_tier
    disk_size = var.db_disk_size

    ip_configuration {
      ipv4_enabled = var.db_ipv4_enabled
    }
  }

  depends_on = [google_project_service.sqladmin]
}

resource "google_sql_database" "app" {
  name     = var.db_name
  instance = google_sql_database_instance.primary.name
}

resource "google_sql_user" "app" {
  name     = var.db_user
  instance = google_sql_database_instance.primary.name
  password = random_password.db.result
}

resource "google_service_account" "app" {
  account_id   = var.service_account_name
  display_name = "AgentTown app service account"
}

resource "google_project_iam_member" "vertex_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.app.email}"
}

resource "google_project_iam_member" "cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.app.email}"
}

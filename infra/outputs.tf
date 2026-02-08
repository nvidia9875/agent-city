output "project_id" {
  value       = var.project_id
  description = "GCP project id"
}

output "region" {
  value       = var.region
  description = "Primary GCP region"
}

output "service_account_email" {
  value       = google_service_account.app.email
  description = "Runtime service account email for Cloud Run services"
}

output "github_actions_service_account_email" {
  value       = google_service_account.github_deployer.email
  description = "Service account email for GitHub Actions deploys"
}

output "github_workload_identity_provider" {
  value       = google_iam_workload_identity_pool_provider.github.name
  description = "Workload Identity Provider resource name for GitHub Actions auth"
}

output "artifact_registry_repository" {
  value       = google_artifact_registry_repository.images.repository_id
  description = "Artifact Registry repository id for container images"
}

output "artifact_registry_hostname" {
  value       = "${var.region}-docker.pkg.dev"
  description = "Artifact Registry Docker hostname"
}

output "artifact_registry_path" {
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
  description = "Artifact Registry path prefix for images"
}

output "cloud_run_web_service_name" {
  value       = var.cloud_run_web_service_name
  description = "Cloud Run web service name"
}

output "cloud_run_ws_service_name" {
  value       = var.cloud_run_ws_service_name
  description = "Cloud Run websocket service name"
}

output "db_instance_connection_name" {
  value       = google_sql_database_instance.primary.connection_name
  description = "Cloud SQL connection name"
}

output "db_name" {
  value       = google_sql_database.app.name
  description = "Database name"
}

output "db_user" {
  value       = google_sql_user.app.name
  description = "Database user"
}

output "db_password" {
  value       = random_password.db.result
  description = "Database password"
  sensitive   = true
}

output "vector_index_id" {
  value       = google_vertex_ai_index.vector_index.id
  description = "Vertex AI Vector Search index resource id"
}

output "vector_index_display_name" {
  value       = google_vertex_ai_index.vector_index.display_name
  description = "Vertex AI Vector Search index display name"
}

output "vector_index_region" {
  value       = google_vertex_ai_index.vector_index.region
  description = "Vertex AI Vector Search index region"
}

output "vector_index_endpoint_id" {
  value       = google_vertex_ai_index_endpoint.vector_endpoint.id
  description = "Vertex AI Vector Search index endpoint id"
}

output "vector_deployed_index_id" {
  value       = google_vertex_ai_index_endpoint_deployed_index.vector_deployed.deployed_index_id
  description = "Vertex AI Vector Search deployed index id"
}

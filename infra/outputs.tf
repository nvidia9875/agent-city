output "service_account_email" {
  value       = google_service_account.app.email
  description = "Service account email for the app"
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

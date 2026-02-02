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

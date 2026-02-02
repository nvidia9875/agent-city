variable "project_id" {
  type        = string
  description = "GCP project id"
}

variable "region" {
  type        = string
  description = "Primary region"
  default     = "us-central1"
}

variable "service_account_name" {
  type        = string
  description = "Service account id (without domain)"
  default     = "agenttown-app"
}

variable "db_instance_name" {
  type        = string
  description = "Cloud SQL instance name"
  default     = "agenttown-db"
}

variable "db_name" {
  type        = string
  description = "Database name"
  default     = "agenttown"
}

variable "db_user" {
  type        = string
  description = "Database user name"
  default     = "agenttown"
}

variable "db_tier" {
  type        = string
  description = "Cloud SQL machine tier"
  default     = "db-f1-micro"
}

variable "db_disk_size" {
  type        = number
  description = "Cloud SQL disk size (GB)"
  default     = 10
}

variable "db_ipv4_enabled" {
  type        = bool
  description = "Enable public IPv4 (use Cloud SQL Auth Proxy for local access)"
  default     = true
}

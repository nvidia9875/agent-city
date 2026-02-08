variable "project_id" {
  type        = string
  description = "GCP project id"
}

variable "region" {
  type        = string
  description = "Primary region"
  default     = "us-central1"
}

variable "artifact_repo" {
  type        = string
  description = "Artifact Registry repository id for container images"
  default     = "agenttown"
}

variable "cloud_run_web_service_name" {
  type        = string
  description = "Cloud Run service name for web app"
  default     = "agenttown-web"
}

variable "cloud_run_ws_service_name" {
  type        = string
  description = "Cloud Run service name for websocket server"
  default     = "agenttown-ws"
}

variable "service_account_name" {
  type        = string
  description = "Service account id (without domain)"
  default     = "agenttown-app"
}

variable "github_owner" {
  type        = string
  description = "GitHub organization or user name that owns this repository"
}

variable "github_repo" {
  type        = string
  description = "GitHub repository name (without owner)"
}

variable "github_workload_identity_pool_id" {
  type        = string
  description = "Workload Identity Pool id for GitHub Actions"
  default     = "github-pool"
}

variable "github_workload_identity_provider_id" {
  type        = string
  description = "Workload Identity Provider id for GitHub Actions"
  default     = "github-provider"
}

variable "github_deployer_service_account_name" {
  type        = string
  description = "Service account id used by GitHub Actions to deploy"
  default     = "agenttown-deployer"
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

variable "vector_region" {
  type        = string
  description = "Vertex AI Vector Search region"
  default     = "us-central1"
}

variable "vector_index_display_name" {
  type        = string
  description = "Vector Search index display name"
  default     = "agenttown-memory-index"
}

variable "vector_index_description" {
  type        = string
  description = "Vector Search index description"
  default     = "AgentTown memory embeddings (streaming)"
}

variable "vector_endpoint_display_name" {
  type        = string
  description = "Vector Search index endpoint display name"
  default     = "agenttown-vector-endpoint"
}

variable "vector_deployed_index_id" {
  type        = string
  description = "Deployed index id (short name) for the endpoint"
  default     = "agenttown_deployed"
}

variable "vector_dimensions" {
  type        = number
  description = "Embedding vector dimensions"
  default     = 768
}

variable "vector_distance_measure_type" {
  type        = string
  description = "Vector Search distance measure type"
  default     = "DOT_PRODUCT_DISTANCE"
}

variable "vector_approximate_neighbors_count" {
  type        = number
  description = "Approximate neighbors count for tree-AH"
  default     = 150
}

variable "vector_leaf_node_embedding_count" {
  type        = number
  description = "Leaf node embedding count for tree-AH"
  default     = 500
}

variable "vector_leaf_nodes_to_search_percent" {
  type        = number
  description = "Leaf nodes to search percent for tree-AH"
  default     = 7
}

variable "vector_min_replicas" {
  type        = number
  description = "Minimum replica count for index endpoint (cost sensitive)"
  default     = 1
}

variable "vector_max_replicas" {
  type        = number
  description = "Maximum replica count for index endpoint (cost sensitive)"
  default     = 1
}

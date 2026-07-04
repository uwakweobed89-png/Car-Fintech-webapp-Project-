# modules/app/variables.tf

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefix for this app's own resources (RDS, secrets, ECS task/service, ALB)"
  type        = string
  default     = "car-fintech"
}

variable "environment" {
  description = "dev | staging | prod"
  type        = string
  default     = "dev"
}

# ── Existing shared infra to deploy into (from CLOUD-OPS-project) ──

variable "vpc_name" {
  description = "Name tag of the existing shared VPC to deploy into"
  type        = string
  default     = "myapp-vpc"
}

variable "vpc_name_prefix" {
  description = "Name-tag prefix used by the existing VPC's subnets (e.g. myapp-public-az1)"
  type        = string
  default     = "myapp"
}

variable "alb_sg_name" {
  description = "Name tag of the existing shared ALB security group"
  type        = string
  default     = "myapp-alb-sg"
}

variable "app_sg_name" {
  description = "Name tag of the existing shared app-tier security group"
  type        = string
  default     = "myapp-app-sg"
}

variable "rds_sg_name" {
  description = "Name tag of the existing shared RDS-tier security group"
  type        = string
  default     = "myapp-rds-sg"
}

variable "ecs_cluster_name" {
  description = "Name of the existing ECS cluster to deploy this app's service into"
  type        = string
  default     = "cloudops-cluster"
}

variable "ecr_repository_name" {
  description = "Name of the existing ECR repository already provisioned for this app"
  type        = string
  default     = "fintech-payment-api"
}

# ── This app's own resources ──

variable "db_password" {
  description = "RDS master password for this app's own database"
  type        = string
  sensitive   = true
}

variable "admin_api_key" {
  description = "Shared secret for admin-only API endpoints (sent as X-Admin-Key)"
  type        = string
  sensitive   = true
}

variable "container_image_tag" {
  description = "Image tag to deploy from the existing ECR repository"
  type        = string
  default     = "latest"
}

variable "desired_count" {
  description = "Number of ECS tasks to run"
  type        = number
  default     = 1
}

variable "allowed_origins" {
  description = "Comma-separated origins allowed by CORS (e.g. the CloudFront frontend URL). Empty = permissive."
  type        = string
  default     = ""
}

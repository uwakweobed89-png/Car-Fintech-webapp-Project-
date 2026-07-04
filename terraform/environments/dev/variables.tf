# environments/dev/variables.tf

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "project_name" {
  type    = string
  default = "car-fintech"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "admin_api_key" {
  type      = string
  sensitive = true
}

variable "container_image_tag" {
  type    = string
  default = "latest"
}

variable "desired_count" {
  type    = number
  default = 1
}

# ── Existing shared infra (CLOUD-OPS-project) ──

variable "vpc_name" {
  type    = string
  default = "myapp-vpc"
}

variable "vpc_name_prefix" {
  type    = string
  default = "myapp"
}

variable "alb_sg_name" {
  type    = string
  default = "myapp-alb-sg"
}

variable "app_sg_name" {
  type    = string
  default = "myapp-app-sg"
}

variable "rds_sg_name" {
  type    = string
  default = "myapp-rds-sg"
}

variable "ecs_cluster_name" {
  type    = string
  default = "cloudops-cluster"
}

variable "ecr_repository_name" {
  type    = string
  default = "fintech-payment-api"
}

# CloudFront's domain is only known after the frontend module's first apply.
# Referencing module.frontend's output from module.app would create a
# circular module dependency (frontend already depends on app.alb_dns_name),
# so this is a plain variable — update it if the distribution is ever
# destroyed and recreated with a new domain.
variable "frontend_origin" {
  type    = string
  default = "https://d250nbw3be12j4.cloudfront.net"
}

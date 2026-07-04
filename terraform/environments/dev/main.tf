# environments/dev/main.tf
#
# Deploys car-fintech-marketplace's backend into the existing shared
# CLOUD-OPS-project AWS infrastructure (myapp-vpc, cloudops-cluster) — no
# new VPC/subnets/NAT/ECS cluster are created by this stack.

terraform {
  # Local state for now. Point this at the same S3 bucket CLOUD-OPS-project
  # uses (with its own state key) once you're ready to share a backend.
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

module "frontend" {
  source = "../../modules/frontend"

  project_name   = var.project_name
  aws_account_id = data.aws_caller_identity.current.account_id
  alb_dns_name   = module.app.alb_dns_name
}

module "app" {
  source = "../../modules/app"

  project_name         = var.project_name
  environment          = var.environment
  aws_region           = var.aws_region
  db_password          = var.db_password
  admin_api_key        = var.admin_api_key
  container_image_tag  = var.container_image_tag
  desired_count        = var.desired_count

  vpc_name             = var.vpc_name
  vpc_name_prefix      = var.vpc_name_prefix
  alb_sg_name          = var.alb_sg_name
  app_sg_name          = var.app_sg_name
  rds_sg_name          = var.rds_sg_name
  ecs_cluster_name     = var.ecs_cluster_name
  ecr_repository_name  = var.ecr_repository_name
  allowed_origins      = var.frontend_origin
}

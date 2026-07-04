# environments/dev-eks/main.tf
#
# Separate Terraform state from environments/dev on purpose: this stack's
# terraform destroy must never be able to affect the live ECS/RDS/frontend
# deployment. This is the ephemeral EKS practice environment only.

terraform {
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

module "eks" {
  source = "../../modules/eks"

  cluster_name        = var.cluster_name
  kubernetes_version   = var.kubernetes_version
  vpc_name             = var.vpc_name
  vpc_name_prefix       = var.vpc_name_prefix
}

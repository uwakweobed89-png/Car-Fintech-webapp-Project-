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

# The backend pod (Task 7) needs to reach the existing RDS instance, whose
# security group (myapp-rds-sg) only allowed ECS's task security group until
# now — Fargate pods use the EKS cluster security group instead, so without
# this rule initDB()'s pool.query() hangs forever (SG drops the SYN silently)
# and the pod never becomes ready.
data "aws_vpc" "existing" {
  filter {
    name   = "tag:Name"
    values = [var.vpc_name]
  }
}

data "aws_security_group" "rds" {
  filter {
    name   = "tag:Name"
    values = ["myapp-rds-sg"]
  }
  vpc_id = data.aws_vpc.existing.id
}

resource "aws_security_group_rule" "eks_to_rds" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = module.eks.cluster_primary_security_group_id
  security_group_id        = data.aws_security_group.rds.id
  description               = "Allow EKS Fargate pods (backend, monitoring practice env) to reach RDS Postgres"
}

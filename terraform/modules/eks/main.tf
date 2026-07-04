# modules/eks/main.tf
#
# EKS cluster + Fargate profile for the session-scoped monitoring/GitOps
# practice environment. Deploys into the EXISTING shared VPC (myapp-vpc) —
# no new VPC/subnets/NAT, same pattern as modules/app.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

data "aws_vpc" "existing" {
  filter {
    name   = "tag:Name"
    values = [var.vpc_name]
  }
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.existing.id]
  }
  filter {
    name   = "tag:Name"
    values = ["${var.vpc_name_prefix}-private-*"]
  }
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = var.cluster_name
  cluster_version = var.kubernetes_version

  vpc_id     = data.aws_vpc.existing.id
  subnet_ids = data.aws_subnets.private.ids

  cluster_endpoint_public_access = true

  fargate_profiles = {
    default = {
      name = "default"
      selectors = [
        for ns in var.fargate_namespaces : { namespace = ns }
      ]
    }
  }

  enable_cluster_creator_admin_permissions = true

  tags = {
    Project = "car-fintech"
    Purpose = "eks-monitoring-practice"
  }
}

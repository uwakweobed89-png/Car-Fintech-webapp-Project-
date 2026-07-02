# modules/app/main.tf
#
# This module does NOT create a VPC, subnets, NAT, or an ECS cluster —
# it deploys into the existing shared infrastructure from CLOUD-OPS-project
# (myapp-vpc / cloudops-cluster), looked up here by tag/name.

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

data "aws_subnets" "public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.existing.id]
  }
  filter {
    name   = "tag:Name"
    values = ["${var.vpc_name_prefix}-public-*"]
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

data "aws_security_group" "alb" {
  filter {
    name   = "tag:Name"
    values = [var.alb_sg_name]
  }
  vpc_id = data.aws_vpc.existing.id
}

data "aws_security_group" "app" {
  filter {
    name   = "tag:Name"
    values = [var.app_sg_name]
  }
  vpc_id = data.aws_vpc.existing.id
}

data "aws_security_group" "rds" {
  filter {
    name   = "tag:Name"
    values = [var.rds_sg_name]
  }
  vpc_id = data.aws_vpc.existing.id
}

data "aws_ecs_cluster" "existing" {
  cluster_name = var.ecs_cluster_name
}

data "aws_ecr_repository" "app" {
  name = var.ecr_repository_name
}

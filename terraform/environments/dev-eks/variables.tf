# environments/dev-eks/variables.tf

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "cluster_name" {
  type    = string
  default = "car-fintech-eks"
}

variable "kubernetes_version" {
  type    = string
  default = "1.30"
}

variable "vpc_name" {
  type    = string
  default = "myapp-vpc"
}

variable "vpc_name_prefix" {
  type    = string
  default = "myapp"
}

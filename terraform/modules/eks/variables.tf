# modules/eks/variables.tf

variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  default     = "car-fintech-eks"
}

variable "kubernetes_version" {
  description = "EKS Kubernetes version"
  type        = string
  default     = "1.30"
}

variable "vpc_name" {
  description = "Name tag of the existing shared VPC to deploy into"
  type        = string
  default     = "myapp-vpc"
}

variable "vpc_name_prefix" {
  description = "Name-tag prefix used by the existing VPC's subnets"
  type        = string
  default     = "myapp"
}

variable "fargate_namespaces" {
  description = "Kubernetes namespaces scheduled onto Fargate"
  type        = list(string)
  default     = ["argocd", "backend", "monitoring", "kube-system"]
}

# environments/dev-eks/outputs.tf

output "cluster_name" {
  value = module.eks.cluster_name
}

output "backend_irsa_role_arn" {
  value = module.eks.backend_irsa_role_arn
}

# environments/dev/outputs.tf

output "alb_dns_name" {
  value = module.app.alb_dns_name
}

output "rds_endpoint" {
  value = module.app.rds_endpoint
}

output "rds_secret_arn" {
  value = module.app.rds_secret_arn
}

output "ecr_repository_url" {
  value = module.app.ecr_repository_url
}

output "ecs_service_name" {
  value = module.app.ecs_service_name
}

output "frontend_bucket_name" {
  value = module.frontend.bucket_name
}

output "frontend_url" {
  value = "https://${module.frontend.cloudfront_domain_name}"
}

output "frontend_cloudfront_distribution_id" {
  value = module.frontend.cloudfront_distribution_id
}

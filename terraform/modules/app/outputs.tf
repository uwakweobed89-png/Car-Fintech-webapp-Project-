# modules/app/outputs.tf

output "vpc_id" {
  value = data.aws_vpc.existing.id
}

output "rds_endpoint" {
  value = aws_db_instance.main.endpoint
}

output "rds_secret_arn" {
  value = aws_secretsmanager_secret.rds_credentials.arn
}

output "ecr_repository_url" {
  value = data.aws_ecr_repository.app.repository_url
}

output "ecs_cluster_name" {
  value = data.aws_ecs_cluster.existing.cluster_name
}

output "ecs_service_name" {
  value = aws_ecs_service.app.name
}

output "alb_dns_name" {
  description = "Point your DNS / test curl requests here"
  value       = aws_lb.app.dns_name
}

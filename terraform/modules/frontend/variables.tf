# modules/frontend/variables.tf

variable "project_name" {
  type    = string
  default = "car-fintech"
}

variable "aws_account_id" {
  description = "AWS account ID, used to make the S3 bucket name globally unique"
  type        = string
}

variable "alb_dns_name" {
  description = "DNS name of the backend ALB, proxied through this distribution at /api/* and /health"
  type        = string
}

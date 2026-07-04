# modules/eks/irsa.tf
#
# IRSA (IAM Roles for Service Accounts) role for the backend pod running on
# Fargate — the Fargate-compatible equivalent of car-fintech's existing ECS
# task role (terraform/modules/app/secrets.tf), granting read access to the
# SAME two Secrets Manager secrets ECS already uses. No new secrets created.

data "aws_secretsmanager_secret" "rds_credentials" {
  name = "car-fintech/rds/credentials"
}

data "aws_secretsmanager_secret" "admin_api_key" {
  name = "car-fintech/admin-api-key"
}

module "backend_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name = "car-fintech-eks-backend-irsa"

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["backend:backend"]
    }
  }

  role_policy_arns = {
    read_secrets = aws_iam_policy.backend_read_secrets.arn
  }
}

resource "aws_iam_policy" "backend_read_secrets" {
  name        = "car-fintech-eks-backend-read-secrets"
  description = "Allows the EKS-hosted backend pod to read the same secrets ECS uses"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
        Resource = [
          data.aws_secretsmanager_secret.rds_credentials.arn,
          data.aws_secretsmanager_secret.admin_api_key.arn,
        ]
      }
    ]
  })
}

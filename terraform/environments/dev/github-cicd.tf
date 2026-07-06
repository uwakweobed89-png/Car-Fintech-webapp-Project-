# github-cicd.tf
#
# OIDC role that lets the GitHub Actions CI/CD workflow deploy the frontend
# (S3 sync + CloudFront invalidation) with short-lived credentials — no
# long-lived AWS access keys stored in GitHub.
#
# The account already has the token.actions.githubusercontent.com OIDC
# provider (shared with other repos). Unlike the pre-existing account-wide
# GitHubActionsRole (which trusts repo:uwakweobed89-png/*:* — every repo),
# this role is scoped to ONE repo and ONE branch, and grants only the three
# actions a frontend deploy needs.

locals {
  cicd_github_repo  = "uwakweobed89-png/Car-Fintech-webapp-Project-"
  cicd_account_id   = "326709068429"
  cicd_bucket_arn   = "arn:aws:s3:::${module.frontend.bucket_name}"
  cicd_cf_dist_arn  = "arn:aws:cloudfront::${local.cicd_account_id}:distribution/${module.frontend.cloudfront_distribution_id}"
  cicd_oidc_arn     = "arn:aws:iam::${local.cicd_account_id}:oidc-provider/token.actions.githubusercontent.com"
}

resource "aws_iam_role" "github_frontend_deploy" {
  name = "car-fintech-github-frontend-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.cicd_oidc_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          # Exact match: only pushes to master of this repo can assume the role.
          "token.actions.githubusercontent.com:sub" = "repo:${local.cicd_github_repo}:ref:refs/heads/master"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_frontend_deploy" {
  name = "frontend-deploy"
  role = aws_iam_role.github_frontend_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ListFrontendBucket"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = local.cicd_bucket_arn
      },
      {
        Sid      = "WriteFrontendObjects"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:DeleteObject"]
        Resource = "${local.cicd_bucket_arn}/*"
      },
      {
        Sid      = "InvalidateCdn"
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation"]
        Resource = local.cicd_cf_dist_arn
      },
    ]
  })
}

output "github_frontend_deploy_role_arn" {
  value = aws_iam_role.github_frontend_deploy.arn
}

# modules/app/secrets.tf

resource "aws_secretsmanager_secret" "rds_credentials" {
  name                    = "${var.project_name}/rds/credentials"
  description             = "RDS PostgreSQL credentials for ${var.project_name}"
  kms_key_id              = aws_kms_key.rds.arn
  recovery_window_in_days = 7

  tags = {
    Name    = "${var.project_name}-rds-credentials"
    Project = var.project_name
  }
}

# Matches the JSON shape backend/src/index.js's initDB() expects.
resource "aws_secretsmanager_secret_version" "rds_credentials" {
  secret_id = aws_secretsmanager_secret.rds_credentials.id
  secret_string = jsonencode({
    username = "carfintech_admin"
    password = var.db_password
    host     = aws_db_instance.main.address
    port     = 5432
    dbname   = "carfintechdb"
  })
}

resource "aws_iam_policy" "read_rds_secret" {
  name        = "${var.project_name}-read-rds-secret"
  description = "Allows reading the ${var.project_name} RDS credentials from Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
        Resource = aws_secretsmanager_secret.rds_credentials.arn
      },
      {
        Effect   = "Allow"
        Action   = "kms:Decrypt"
        Resource = aws_kms_key.rds.arn
      }
    ]
  })
}

resource "aws_iam_role" "ecs_task_role" {
  name        = "${var.project_name}-ecs-task-role"
  description = "Role assumed by the running ${var.project_name} container to call AWS services"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "ecs-tasks.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name    = "${var.project_name}-ecs-task-role"
    Project = var.project_name
  }
}

resource "aws_iam_role_policy_attachment" "ecs_read_rds_secret" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = aws_iam_policy.read_rds_secret.arn
}

# Admin API key — injected as a container env var by ECS itself (via the
# execution role, resolved before the container starts), unlike
# DB_SECRET_ARN which the app resolves at runtime via the task role. That's
# why the read permission below attaches to ecs_execution_role, not
# ecs_task_role.
resource "aws_secretsmanager_secret" "admin_api_key" {
  name                    = "${var.project_name}/admin-api-key"
  description             = "Shared secret for admin-only API endpoints (X-Admin-Key header) on ${var.project_name}"
  recovery_window_in_days = 7

  tags = {
    Name    = "${var.project_name}-admin-api-key"
    Project = var.project_name
  }
}

resource "aws_secretsmanager_secret_version" "admin_api_key" {
  secret_id     = aws_secretsmanager_secret.admin_api_key.id
  secret_string = var.admin_api_key
}

resource "aws_iam_policy" "read_admin_api_key_secret" {
  name        = "${var.project_name}-read-admin-api-key-secret"
  description = "Allows the ECS execution role to inject the ${var.project_name} admin API key at task startup"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
        Resource = aws_secretsmanager_secret.admin_api_key.arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_read_admin_api_key_secret" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = aws_iam_policy.read_admin_api_key_secret.arn
}

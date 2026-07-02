# modules/app/rds.tf
#
# A dedicated small RDS instance for this app's own schema (cars/purchases) —
# kept separate from cloudops-postgres since it's a different app's data,
# but placed in the existing VPC's private subnets and reuses the existing
# myapp-rds-sg rather than creating new networking.

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = data.aws_subnets.private.ids

  tags = {
    Name    = "${var.project_name}-db-subnet-group"
    Project = var.project_name
  }
}

resource "aws_kms_key" "rds" {
  description             = "KMS key for ${var.project_name} RDS encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = {
    Name    = "${var.project_name}-rds-kms"
    Project = var.project_name
  }
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${var.project_name}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

resource "aws_db_instance" "main" {
  identifier        = "${var.project_name}-postgres"
  engine            = "postgres"
  engine_version    = "16.3"
  instance_class    = "db.t3.micro"
  allocated_storage = 20
  storage_type      = "gp2"
  storage_encrypted = true
  kms_key_id        = aws_kms_key.rds.arn

  db_name  = "carfintechdb"
  username = "carfintech_admin"
  password = var.db_password

  multi_az               = false # free-tier does not support multi-AZ
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [data.aws_security_group.rds.id]

  backup_retention_period = var.environment == "prod" ? 7 : 0
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  deletion_protection       = var.environment == "prod"
  skip_final_snapshot       = var.environment != "prod"
  final_snapshot_identifier = "${var.project_name}-postgres-final-snapshot"

  tags = {
    Name    = "${var.project_name}-postgres"
    Project = var.project_name
  }
}

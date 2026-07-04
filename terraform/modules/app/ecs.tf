# modules/app/ecs.tf
#
# New task definition + service registered into the EXISTING cloudops-cluster
# and the EXISTING fintech-payment-api ECR repo — no new cluster or repo.

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.project_name}-api"
  retention_in_days = 14
}

resource "aws_iam_role" "ecs_execution_role" {
  name = "${var.project_name}-ecs-execution-role"

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
    Name    = "${var.project_name}-ecs-execution-role"
    Project = var.project_name
  }
}

resource "aws_iam_role_policy_attachment" "ecs_execution_role_policy" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_ecs_task_definition" "app" {
  family                   = "${var.project_name}-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "${var.project_name}-api"
      image     = "${data.aws_ecr_repository.app.repository_url}:${var.container_image_tag}"
      essential = true
      portMappings = [
        {
          containerPort = 8080
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "DB_SECRET_ARN", value = aws_secretsmanager_secret.rds_credentials.arn },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "ALLOWED_ORIGINS", value = var.allowed_origins }
      ]
      secrets = [
        { name = "ADMIN_API_KEY", valueFrom = aws_secretsmanager_secret.admin_api_key.arn }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
      healthCheck = {
        command     = ["CMD-SHELL", "node -e \"require('http').get('http://localhost:8080/health',(r)=>{process.exit(r.statusCode===200?0:1)})\""]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name    = "${var.project_name}-api"
    Project = var.project_name
  }
}

resource "aws_ecs_service" "app" {
  name            = "${var.project_name}-api-service"
  cluster         = data.aws_ecs_cluster.existing.arn
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.private.ids
    security_groups  = [data.aws_security_group.app.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name    = "${var.project_name}-api"
    container_port    = 8080
  }

  depends_on = [aws_lb_listener.http]

  tags = {
    Name    = "${var.project_name}-api-service"
    Project = var.project_name
  }
}

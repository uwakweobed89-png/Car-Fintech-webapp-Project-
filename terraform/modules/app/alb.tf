# modules/app/alb.tf
#
# No existing ALB was found in the account to attach to, so this app gets its
# own — but it reuses the existing shared myapp-alb-sg rather than a new SG.

resource "aws_lb" "app" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [data.aws_security_group.alb.id]
  subnets            = data.aws_subnets.public.ids

  tags = {
    Name    = "${var.project_name}-alb"
    Project = var.project_name
  }
}

resource "aws_lb_target_group" "app" {
  name        = "${var.project_name}-tg"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.existing.id
  target_type = "ip"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
    matcher             = "200"
  }

  tags = {
    Name    = "${var.project_name}-tg"
    Project = var.project_name
  }
}

# HTTP only for now — attach an ACM cert and add a 443 listener before real prod traffic.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
  port               = 80
  protocol           = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

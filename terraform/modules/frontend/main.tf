# modules/frontend/main.tf
#
# Static frontend hosting: private S3 bucket + CloudFront (OAC, no public
# bucket access). Not VPC-scoped, so this doesn't touch the shared
# networking infra at all — it's its own thing in the same AWS account.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

resource "aws_s3_bucket" "frontend" {
  bucket = "${var.project_name}-frontend-${var.aws_account_id}"

  tags = {
    Name    = "${var.project_name}-frontend"
    Project = var.project_name
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project_name}-frontend-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  comment             = "${var.project_name} frontend"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-${aws_s3_bucket.frontend.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # Proxy API calls to the backend ALB through the same HTTPS distribution.
  # The browser only ever talks to CloudFront over HTTPS (same-origin, no
  # CORS, no mixed-content) — CloudFront talks to the ALB over plain HTTP
  # internally, which is fine since that's a server-to-server hop.
  origin {
    domain_name = var.alb_dns_name
    origin_id    = "alb-backend"

    custom_origin_config {
      http_port              = 80
      https_port              = 443
      origin_protocol_policy  = "http-only"
      origin_ssl_protocols    = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods          = ["GET", "HEAD"]
    target_origin_id        = "s3-${aws_s3_bucket.frontend.id}"
    viewer_protocol_policy  = "redirect-to-https"
    compress                = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  ordered_cache_behavior {
    path_pattern            = "/api/*"
    allowed_methods         = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = "alb-backend"
    viewer_protocol_policy   = "redirect-to-https"
    min_ttl                  = 0
    default_ttl               = 0
    max_ttl                   = 0
    compress                  = true

    forwarded_values {
      query_string = true
      headers      = ["*"]
      cookies {
        forward = "all"
      }
    }
  }

  ordered_cache_behavior {
    path_pattern            = "/health"
    allowed_methods         = ["GET", "HEAD"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = "alb-backend"
    viewer_protocol_policy   = "redirect-to-https"
    min_ttl                  = 0
    default_ttl               = 0
    max_ttl                   = 0

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  # No SPA-fallback custom_error_response: the app uses HashRouter, so the
  # server only ever sees "/" — and a distribution-wide 404 rewrite would
  # otherwise also clobber genuine API 404s from the /api/* behavior above.

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name    = "${var.project_name}-frontend"
    Project = var.project_name
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontOAC"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })
}

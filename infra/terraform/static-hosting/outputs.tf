output "bucket_name" {
  description = "Private S3 origin bucket for static deploys."
  value       = aws_s3_bucket.site.bucket
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID for deploy invalidations."
  value       = aws_cloudfront_distribution.site.id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name."
  value       = aws_cloudfront_distribution.site.domain_name
}

output "site_aliases" {
  description = "Route 53 aliases attached to the CloudFront distribution."
  value       = local.aliases
}

output "github_actions_variables" {
  description = "Repository variables consumed by .github/workflows/static-deploy.yml. The OIDC role is owned by shared infra."
  value = {
    AWS_REGION                 = var.aws_region
    CLOUDFRONT_DISTRIBUTION_ID = aws_cloudfront_distribution.site.id
    SITE_URL                   = "https://${var.site_domain}"
    STATIC_SITE_BUCKET         = aws_s3_bucket.site.bucket
  }
}

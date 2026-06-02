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

output "github_actions_public_variables" {
  description = "Public repository variables consumed by .github/workflows/static-deploy.yml."
  value = {
    AWS_REGION = var.aws_region
    SITE_URL   = "https://${var.site_domain}"
  }
}

output "github_actions_secrets" {
  description = "Sensitive Actions secret values consumed by .github/workflows/static-deploy.yml. The OIDC role secret is supplied separately."
  sensitive   = true
  value = {
    CLOUDFRONT_DISTRIBUTION_ID = aws_cloudfront_distribution.site.id
    STATIC_SITE_BUCKET         = aws_s3_bucket.site.bucket
  }
}

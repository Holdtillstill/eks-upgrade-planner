variable "project_name" {
  description = "Name prefix for app-specific AWS resources."
  type        = string
  default     = "eks-upgrade-planner"
}

variable "aws_region" {
  description = "AWS region for the private S3 origin bucket."
  type        = string
  default     = "us-east-1"
}

variable "site_domain" {
  description = "Primary public hostname, for example planner.example.com."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]+[a-z0-9]$", var.site_domain))
    error_message = "site_domain must be a lowercase DNS hostname."
  }
}

variable "additional_aliases" {
  description = "Additional CloudFront aliases, such as www.planner.example.com."
  type        = list(string)
  default     = []
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone ID owned by the shared infra repo."
  type        = string
}

variable "bucket_name" {
  description = "Optional globally unique S3 bucket name. Defaults to a name derived from site_domain."
  type        = string
  default     = ""
}

variable "price_class" {
  description = "CloudFront price class."
  type        = string
  default     = "PriceClass_100"
}

variable "force_destroy_bucket" {
  description = "Allow Terraform to delete the S3 bucket even when it contains objects. Keep false for production."
  type        = bool
  default     = false
}

variable "cloudfront_wait_for_deployment" {
  description = "Wait for CloudFront deployment to finish during terraform apply."
  type        = bool
  default     = true
}

variable "web_acl_id" {
  description = "Optional AWS WAF web ACL ARN to attach to the CloudFront distribution."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Common tags for app-specific AWS resources."
  type        = map(string)
  default     = {}
}

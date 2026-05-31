# Static Hosting Terraform

This directory plans the app-specific AWS resources for the public static
production host:

- private S3 origin bucket
- CloudFront distribution
- CloudFront Origin Access Control
- ACM certificate in `us-east-1`
- Route 53 `A`/`AAAA` alias records
- strict security response headers
- clean URL rewrite for prerendered routes such as `/eks/versions`
- `403`/`404` mapping to the generated `404.html` noindex page

It intentionally does **not** create the shared Terraform backend, GitHub OIDC
provider, deploy IAM role, hosted zone, EKS cluster, shared ingress, budgets, or
TTL cleanup. Those belong in the shared infra repo.

## Plan Only

Copy `terraform.tfvars.example` to a local `terraform.tfvars`, set the real
domain and hosted zone ID, then plan:

```bash
terraform init
terraform plan
```

Do not run `terraform apply` until the shared infra bootstrap exists and the
domain/cost plan has been approved.

## GitHub Actions Outputs

After apply, set these app repository variables from the `github_actions_variables`
output:

- `AWS_REGION`
- `AWS_ROLE_TO_ASSUME` from the shared infra OIDC deploy role
- `CLOUDFRONT_DISTRIBUTION_ID`
- `SITE_URL`
- `STATIC_SITE_BUCKET`

The static deploy workflow builds with `SITE_URL`, syncs `dist/` to S3, and
invalidates CloudFront.

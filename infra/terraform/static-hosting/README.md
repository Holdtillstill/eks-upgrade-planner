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

It intentionally does **not** create the Terraform backend, GitHub OIDC
provider, deploy IAM role, hosted zone, EKS cluster, ingress, budgets, or TTL
cleanup. Those prerequisites are handled outside this app-specific plan.

## Plan Only

Copy `terraform.tfvars.example` to a local `terraform.tfvars`, set the real
domain and hosted zone ID, then plan:

```bash
terraform init
terraform plan
```

Do not run `terraform apply` until DNS ownership, GitHub OIDC, and cost limits
are ready.

## GitHub Actions Outputs

After apply, set public app repository variables from the
`github_actions_public_variables` output:

- `AWS_REGION`
- `SITE_URL`

Set Actions secrets from the sensitive `github_actions_secrets` output:

- `CLOUDFRONT_DISTRIBUTION_ID`
- `STATIC_SITE_BUCKET`

Also set the `AWS_ROLE_TO_ASSUME` Actions secret from the GitHub OIDC deploy
role created by the shared/bootstrap infrastructure.

The static deploy workflow builds with `SITE_URL`, syncs `dist/` to S3, and
invalidates CloudFront.

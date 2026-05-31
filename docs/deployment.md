# Deployment Model

## Recommended Shape

Use S3 and CloudFront as the primary public production surface. Keep EKS for
on-demand demos/previews, and use Cloudflare Pages as an optional mirror or
learning path.

```text
Route 53
  ├─ planner.example.com -> CloudFront + private S3
  ├─ demo.example.com    -> shared EKS ingress when preview is active
  └─ cf.example.com      -> Cloudflare Pages mirror
```

This app has no database, no user accounts, and no server-side AWS account
access. The cheapest credible production path is static edge hosting, not an
always-on dedicated EKS stack.

## Repository Ownership

Hybrid split:

- This app repo owns product code, static-hosting Terraform, Docker image build,
  Helm chart, app deploy workflows, and EKS preview workflow.
- The shared infra repo owns Route 53 hosted zone, Terraform backend, GitHub
  OIDC provider/roles, shared EKS, ingress/ALB, budgets, and preview TTL
  cleanup.

Keep Terraform state for shared/platform primitives in the shared infra repo.
Keep the app-specific S3/CloudFront/ACM/Route53 records with this app unless
the infra repo later standardizes a reusable static-site module.

## First AWS Phase

Bootstrap only:

1. Budget alerts.
2. Terraform backend.
3. GitHub OIDC provider and narrow deploy roles.
4. Route 53 hosted zone ownership and DNS conventions.

Do not create EKS resources for this app in phase one.

## Static Production Deploy

Create/plan app-specific resources in `infra/terraform/static-hosting`:

- private S3 origin bucket
- CloudFront distribution
- Origin Access Control
- ACM certificate in `us-east-1`
- Route 53 aliases
- CloudFront response headers policy matching `server/security.js`
- CloudFront Function clean URL rewrite
- custom error mapping to `/404.html`

The deploy workflow expects these repository variables:

- `AWS_ROLE_TO_ASSUME`
- `AWS_REGION`
- `STATIC_SITE_BUCKET`
- `CLOUDFRONT_DISTRIBUTION_ID`
- `SITE_URL`

Use GitHub OIDC. Do not create long-lived AWS access keys.

## EKS Preview

The app repo can build a preview image and deploy the Helm chart to a shared EKS
cluster with `.github/workflows/eks-preview.yml`. Required repository variables:

- `EKS_PREVIEW_AWS_ROLE_TO_ASSUME`
- `EKS_CLUSTER_NAME`
- `AWS_REGION`

The workflow annotates the namespace with
`preview.eks-upgrade-planner.io/expires-at`. Cleanup should be owned by shared
infra automation so previews do not become permanent monthly spend.

## Cloudflare Mirror

The Cloudflare Pages workflow is optional and manual. It expects:

- repository variable `CLOUDFLARE_PAGES_PROJECT`
- secret `CLOUDFLARE_ACCOUNT_ID`
- secret `CLOUDFLARE_API_TOKEN`
- optional repository variable `CLOUDFLARE_SITE_URL`

Keep Route 53 authoritative unless there is a deliberate decision to move DNS.
Cloudflare is cleanest as a subdomain mirror such as `cf.example.com`.

## Cost Posture

Expected incremental cost is lowest when production is S3/CloudFront and EKS is
only a shared, on-demand preview target. A dedicated EKS cluster or dedicated
ALB for this app would cost more than the app justifies.

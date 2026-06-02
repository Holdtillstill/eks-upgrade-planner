# Deployment Model

## Recommended Shape

Use S3 and CloudFront as the primary public production surface. Keep EKS for
on-demand demos/previews only, and use Cloudflare Pages as an optional mirror or
learning path.

```text
Route 53
  ├─ eks-upgrade-planner.bozhi.dev -> CloudFront + private S3
  ├─ preview host                 -> EKS ingress only while requested
  └─ optional mirror              -> Cloudflare Pages
```

This app has no database, no user accounts, and no server-side AWS account
access. The cheapest credible production path is static edge hosting, not an
always-on dedicated EKS stack.

## Repository Ownership

Ownership split:

- This app repo owns product code, static-hosting Terraform, Docker image build,
  Helm chart, app deploy workflows, and EKS preview workflow.
- Platform infrastructure owns Route 53 hosted zone, Terraform backend, GitHub
  OIDC provider/roles, optional shared EKS preview capacity, ingress, budgets,
  and preview TTL cleanup.

Keep app-specific S3/CloudFront/ACM/Route53 records with this app unless a
shared static-site module becomes the standard.

## First AWS Phase

Bootstrap only:

1. Budget alerts.
2. Terraform backend.
3. GitHub OIDC provider and narrow deploy roles.
4. Route 53 hosted zone ownership and DNS conventions.

Do not create always-on EKS resources for this app.

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

Run `npm run validate:edge-security` after changing `server/security.js`,
`infra/cloudfront/clean-url-rewrite.js`, or static-hosting Terraform. If the
CloudFront Function or response headers policy changes, run Terraform plan/apply
for `infra/terraform/static-hosting` and then redeploy or invalidate the static
site so edge behavior matches the repo.

The deploy workflow expects these repository variables:

- `AWS_ROLE_TO_ASSUME`
- `AWS_REGION`
- `STATIC_SITE_BUCKET`
- `CLOUDFRONT_DISTRIBUTION_ID`
- `SITE_URL`

Use GitHub OIDC. Do not create long-lived AWS access keys.

## EKS Preview

The app repo can build a preview image and deploy the Helm chart to shared EKS
capacity with `.github/workflows/eks-preview.yml`. This path is for explicit
demo/review requests, not normal public serving. Required repository variables:

- `EKS_PREVIEW_AWS_ROLE_TO_ASSUME`
- `EKS_CLUSTER_NAME`
- `AWS_REGION`

The workflow annotates the namespace with
`preview.eks-upgrade-planner.io/expires-at`. Cleanup automation should remove
expired previews so they do not become permanent monthly spend.

Preview images are tagged `preview-<run id>-<attempt>` and labeled with their
expiry timestamp. Namespace TTL cleanup does not delete registry layers by
itself. `.github/workflows/ghcr-preview-cleanup.yml` removes old GHCR package
versions that have only `preview-*` tags, while preserving release tags and
long-lived `main`/SHA images. Parent demo ECR repositories should keep their
own lifecycle policy.

## Cloudflare Mirror

The Cloudflare Pages workflow is optional and manual. It expects:

- repository variable `CLOUDFLARE_PAGES_PROJECT`
- secret `CLOUDFLARE_ACCOUNT_ID`
- secret `CLOUDFLARE_API_TOKEN`
- optional repository variable `CLOUDFLARE_SITE_URL`

Keep Route 53 authoritative unless there is a deliberate decision to move DNS.
Use Cloudflare as an optional mirror only after the CloudFront production path
is working.

## Cost Posture

Expected incremental cost is lowest when production is S3/CloudFront and EKS is
only a shared, on-demand preview target. A dedicated EKS cluster or dedicated
ALB for this app would cost more than the app justifies.

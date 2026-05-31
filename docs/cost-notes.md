# Cost Notes

The intended public production shape is S3 plus CloudFront. EKS is an
on-demand/shared preview surface, not the always-on production host for this
static-heavy app.

## Expected Incremental Cost

For a low-traffic portfolio/product launch, expect the app itself to stay near
the low single-dollar range when it uses:

- one private S3 bucket for static assets and prerendered HTML
- one CloudFront distribution
- Route 53 DNS records in an existing hosted zone
- ACM public certificate
- GitHub Actions OIDC deploy role

The largest fixed cost is usually the hosted zone/domain side, not the app
files. CloudFront, S3 storage, S3 requests, DNS queries, and invalidations scale
with traffic and deploy frequency.

## Costs To Avoid

- Dedicated EKS cluster for this app.
- Dedicated ALB for this app if a shared ingress/ALB already exists.
- Warm Kubernetes preview environments without TTL cleanup.
- NAT gateways or private subnets just to serve this static product.
- Cross-region or multi-CDN failover before the primary path has real traffic.

## Cost Sources To Recheck Before Apply

- Amazon S3 pricing: https://aws.amazon.com/s3/pricing/
- Amazon CloudFront pricing: https://aws.amazon.com/cloudfront/pricing/
- Amazon Route 53 pricing: https://aws.amazon.com/route53/pricing/
- Amazon EKS pricing: https://aws.amazon.com/eks/pricing/

Use AWS Budgets in the shared infra bootstrap before applying any production
infrastructure.

# Smoke-Test Checklist

Run this checklist before promoting a static or Kubernetes release.

## Local Production Server

```bash
SITE_URL_ALLOW_LOCALHOST=true npm run build
PORT=8080 NODE_ENV=production METRICS_ALLOW_UNAUTHENTICATED=true npm start
SMOKE_BASE_URL=http://127.0.0.1:8080 npm run smoke:local
```

Verify:

- `/healthz` returns `200`.
- `/readyz` returns `200`.
- `/metrics` is protected in production unless the local/demo opt-out is set.
- `/eks/1-35-upgrade-guide` returns prerendered HTML.
- `/unknown-extensionless-route` returns a real `404`, not the app shell.
- Browser HTML 404 responses include `noindex,nofollow`.
- Security headers include CSP with `style-src 'self'`, the visitor telemetry
  origin exception, and no `unsafe-inline`.

## Static Hosting Output

```bash
SITE_URL=https://eks-upgrade-planner.bozhi.dev npm run build
npm run validate:static-hosting
WEB_BASE=https://eks-upgrade-planner.bozhi.dev npm run smoke:static-host
```

Verify:

- Every route in `scripts/public-routes.js` has a `dist/**/index.html` file.
- CloudFront clean-URL rewrites map extensionless routes to nested
  `index.html` files.
- `dist/404.html` includes noindex metadata.
- `dist/_headers` carries the static-host CSP for Cloudflare Pages, including
  the visitor telemetry origin exception.
- `dist/sitemap.xml` includes every public route.
- The deployed static host returns every public route with prerender metadata,
  the visitor telemetry tag, CloudFront security headers, and a real 404 for
  unknown or fake API paths.

## Browser Smoke

Open:

- `/app`
- `/eks/versions`
- `/eks/extended-support-cost-calculator`
- `/eks/upgrade-planner`
- `/eks/evidence-pack`

Check:

- Fleet Scope rows fit without horizontal page scrolling.
- Cost defaults to fleet aggregate and single-version what-if remains explicit.
- Unknown routes show a 404 page.
- Lifecycle, cost, planner, scanner, add-on, and evidence sections have visible
  source links.
- Mobile viewport has no clipped dropdown text or overlapping controls.
- Browser smoke fails on console/page errors, unexpected same-origin API calls,
  missing visitor telemetry, privacy-signal regressions, horizontal overflow,
  and serious/critical axe accessibility violations.

## Kubernetes Preview

When an on-demand EKS preview is requested:

- Deploy with `.github/workflows/eks-preview.yml`.
- Confirm namespace TTL annotation `preview.eks-upgrade-planner.io/expires-at`.
- Confirm rollout status.
- Confirm ingress host, `/healthz`, `/readyz`, and public planner routes.
- Confirm `/metrics` is blocked from public ingress and scraped only through
  the configured private path.

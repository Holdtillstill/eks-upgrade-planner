# Production Readiness

## Architecture

The product remains a React/Vite single-page app. Production adds only a small
Node server in `server/` that serves `dist/` and exposes operational endpoints.
There is no database and no backend product feature surface.

Request flow:

1. Build assets with `SITE_URL=https://planner.example.com npm run build`.
2. `prebuild` writes `public/robots.txt` and `public/sitemap.xml`.
3. Vite writes the client bundle to `dist/`.
4. `postbuild` prerenders the public route list to `dist/**/index.html`.
5. Start `node server/index.js`.
6. Serve immutable hashed Vite assets from `/assets/*`.
7. Serve prerendered public route HTML with `no-cache`, then let the React app
   mount normally in the browser.
8. Return `404` for unknown extensionless routes instead of serving the app
   shell as a soft 404.

Vite now builds with `base: "/"` because relative asset URLs break on public
deep links like `/eks/versions`.

## Runtime Endpoints

- `/healthz`: liveness and process uptime.
- `/readyz`: readiness check for readable `dist/index.html`.
- `/metrics`: Prometheus metrics.
- Static files from `dist/`.
- Prerendered public route HTML from route directory `index.html` files.
- SPA fallback for known app/prerendered extensionless `GET` and `HEAD`
  requests when a route file is not present.
- Unknown extensionless routes return `404` with `noindex` HTML for browser
  requests or JSON for API-style requests.

## Security and HTTP Behavior

The server sets request IDs, security headers, gzip compression for text assets,
ETags, cache headers, and conservative request timeouts.

Headers include:

- `X-Request-Id`
- `Content-Security-Policy`
- `X-Content-Type-Options`
- `X-Frame-Options`
- `Referrer-Policy`
- `Permissions-Policy`
- `Strict-Transport-Security` unless `ENABLE_HSTS=false`

The Content Security Policy uses self-only network sources for scripts, styles,
fonts, images, and connections. `style-src` is kept at `'self'` with no
`'unsafe-inline'`; tests guard against inline style attributes and `<style>`
tags in source HTML, TSX, and SVG assets. The app does not import Google Fonts
or call an external font host.

## Configuration

Common environment variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `HOST` | Bind address | `0.0.0.0` |
| `PORT` | HTTP port | `8080` |
| `DIST_DIR` | Built Vite asset directory | `dist` |
| `SITE_URL` / `VITE_SITE_URL` | Public origin used for canonical, OpenGraph, sitemap, and robots metadata. Required for production builds. | local dev defaults to `http://localhost:8080` |
| `SITE_URL_ALLOW_LOCALHOST` | Permit localhost/127 loopback `SITE_URL` during production build/prerender for local/demo builds only | unset |
| `APP_VERSION` | Build info metric label | `package.json` version |
| `SOURCE_VERSION` / `GIT_SHA` / `COMMIT_SHA` | Build commit label | `unknown` |
| `BUILD_TIME` | Build timestamp label | `unknown` |
| `ENABLE_HSTS` | Disable HSTS when set to `false` | enabled |
| `ENABLE_DESIGN_EXPLORATIONS` | Server-side route gate for `/1` through `/10`; production disables them regardless | disabled in production |
| `VITE_ENABLE_DESIGN_EXPLORATIONS` | Build-time client route/UI gate for `/1` through `/10` in development builds | enabled outside production |
| `METRICS_BEARER_TOKEN` | Bearer token required for `/metrics` when `NODE_ENV=production` | unset |
| `METRICS_ALLOW_UNAUTHENTICATED` | Explicit opt-out for unauthenticated `/metrics` in local/demo production runs | unset |
| `OTEL_SERVICE_NAME` | OpenTelemetry service name | `eks-upgrade-planner` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/HTTP collector base URL | unset |
| `OTEL_LOGS_EXPORTER` | Set `otlp` to emit OTLP logs | unset |

## SEO

`index.html` has a managed metadata block for title, description, OpenGraph,
Twitter card, theme color, manifest, and canonical metadata. `npm run
generate:public-metadata` uses `SITE_URL` to write `public/robots.txt` and
`public/sitemap.xml` for the primary app routes, EKS version pages, and add-on
compatibility pages. `npm run build` runs that generator automatically, then
`npm run prerender` writes route-specific static HTML files for the same public
route list. Production build and prerender steps reject `localhost`, `127.0.0.1`,
and `[::1]` `SITE_URL` values unless `SITE_URL_ALLOW_LOCALHOST=true` is set for
a local/demo build.

The prerendered files include route-specific canonical, OpenGraph, Twitter, and
description tags plus crawlable body copy for `/`, `/app`, `/eks/versions`,
`/eks/extended-support-cost-calculator`, `/eks/upgrade-planner`,
`/eks/deprecated-api-scanner`, `/eks/addons`, `/eks/evidence-pack`, every
`/eks/<version>-upgrade-guide`, and every
`/addons/<slug>/eks-compatibility`. The public route list lives in
`scripts/public-routes.js`; update it whenever a new SEO-critical route should
enter the sitemap and prerender output. Set `SITE_URL` during every production
build before launch.

## Container and Kubernetes

The Dockerfile uses a multi-stage build and a non-root runtime image. The Helm
chart in `deploy/helm/eks-upgrade-planner` exposes port `8080` in the container
and port `80` in the Service. It includes probes, resources, NetworkPolicy,
ServiceMonitor, optional Ingress, optional HPA, PDB, and Grafana dashboard
ConfigMap.

Set `IMAGE_REPOSITORY` and pass it to Helm with
`--set image.repository="${IMAGE_REPOSITORY}"`; the chart default is
`localhost/eks-upgrade-planner` so a public registry is never implied. The chart
can pass release provenance through `env.appVersion`, `env.sourceVersion`, and
`env.buildTime`; these populate `/metrics` build info and startup logs.

For public ingress, keep `/metrics` off the public host and require token auth
unless scraping is strictly private. Direct Node and Docker production runs fail
fast without `METRICS_BEARER_TOKEN` unless
`METRICS_ALLOW_UNAUTHENTICATED=true` is set for local/demo use. The chart
defaults to `ingress.blockMetricsPath=true` and `metrics.auth.enabled=true`; provide
`metrics.auth.existingSecret` for a stable production token. If no existing
secret or explicit token is set, the chart creates a generated metrics token for
the release. If your ingress controller does not support nginx snippets, use an
ingress/WAF rule or keep bearer-token auth enabled before exposing the app
publicly.

## Privacy and Logging

Planner inputs and pasted manifests are processed in the browser and are not
uploaded or stored by the product. The server does not store AWS account data,
cluster credentials, product account records, or manifests. Operational request
logs may include request path, normalized route, status, duration, request ID,
trace ID, IP address, and user agent for operations, debugging, and abuse
prevention.

No cloud resources are deployed by this repo.

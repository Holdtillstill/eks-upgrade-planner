# Production Readiness

## Architecture

The product remains a React/Vite single-page app. Production adds only a small
Node server in `server/` that serves `dist/` and exposes operational endpoints.
There is no database and no backend product feature surface.

Request flow:

1. Build assets with `SITE_URL=https://planner.example.com npm run build`.
2. Start `node server/index.js`.
3. Serve immutable hashed Vite assets from `/assets/*`.
4. Serve `index.html` with `no-cache`.
5. Return `index.html` for SPA deep links such as `/eks/1-35-upgrade-guide`.

Vite now builds with `base: "/"` because relative asset URLs break on public
deep links like `/eks/versions`.

## Runtime Endpoints

- `/healthz`: liveness and process uptime.
- `/readyz`: readiness check for readable `dist/index.html`.
- `/metrics`: Prometheus metrics.
- Static files from `dist/`.
- SPA fallback for extensionless `GET` and `HEAD` requests.

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
fonts, images, and connections. The app does not import Google Fonts or call an
external font host.

## Configuration

Common environment variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `HOST` | Bind address | `0.0.0.0` |
| `PORT` | HTTP port | `8080` |
| `DIST_DIR` | Built Vite asset directory | `dist` |
| `SITE_URL` / `VITE_SITE_URL` | Public origin used for canonical, OpenGraph, sitemap, and robots metadata | `http://localhost:8080` |
| `APP_VERSION` | Build info metric label | `package.json` version |
| `SOURCE_VERSION` / `GIT_SHA` / `COMMIT_SHA` | Build commit label | `unknown` |
| `BUILD_TIME` | Build timestamp label | `unknown` |
| `ENABLE_HSTS` | Disable HSTS when set to `false` | enabled |
| `ENABLE_DESIGN_EXPLORATIONS` | Server-side route gate for `/1` through `/10`; production disables them regardless | disabled in production |
| `VITE_ENABLE_DESIGN_EXPLORATIONS` | Build-time client route/UI gate for `/1` through `/10` in development builds | enabled outside production |
| `METRICS_BEARER_TOKEN` | Optional bearer token required for `/metrics` | unset |
| `OTEL_SERVICE_NAME` | OpenTelemetry service name | `eks-upgrade-planner` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/HTTP collector base URL | unset |
| `OTEL_LOGS_EXPORTER` | Set `otlp` to emit OTLP logs | unset |

## SEO

`index.html` now has default title, description, OpenGraph, Twitter card,
theme color, manifest, and canonical metadata. `npm run generate:public-metadata`
uses `SITE_URL` to write `public/robots.txt` and `public/sitemap.xml` for the
primary app routes, EKS version pages, and add-on compatibility pages. `npm run
build` runs that generator automatically.

This is still a SPA. Crawlers that do not execute JavaScript will only see the
default HTML shell. Route-specific HTML, titles, descriptions, and social cards
should be handled by prerendering or static generation if SEO becomes a primary
acquisition channel. Set `SITE_URL` during every production build before launch.

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
unless scraping is strictly private. The chart defaults to
`ingress.blockMetricsPath=true` and `metrics.auth.enabled=true`; provide
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

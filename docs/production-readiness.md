# Production Readiness

## Architecture

The product remains a React/Vite single-page app. Production adds only a small
Node server in `server/` that serves `dist/` and exposes operational endpoints.
There is no database and no backend product feature surface.

Request flow:

1. Build assets with `npm run build`.
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

## Configuration

Common environment variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `HOST` | Bind address | `0.0.0.0` |
| `PORT` | HTTP port | `8080` |
| `DIST_DIR` | Built Vite asset directory | `dist` |
| `APP_VERSION` | Build info metric label | `package.json` version |
| `SOURCE_VERSION` / `GIT_SHA` / `COMMIT_SHA` | Build commit label | `unknown` |
| `BUILD_TIME` | Build timestamp label | `unknown` |
| `ENABLE_HSTS` | Disable HSTS when set to `false` | enabled |
| `METRICS_BEARER_TOKEN` | Optional bearer token required for `/metrics` | unset |
| `OTEL_SERVICE_NAME` | OpenTelemetry service name | `eks-upgrade-planner` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/HTTP collector base URL | unset |
| `OTEL_LOGS_EXPORTER` | Set `otlp` to emit OTLP logs | unset |

## SEO

`index.html` now has default title, description, OpenGraph, Twitter card,
theme color, manifest, and canonical metadata. `public/robots.txt`,
`public/sitemap.xml`, and `public/manifest.webmanifest` cover the primary app
routes, EKS version pages, and add-on compatibility pages.

This is still a SPA. Crawlers that do not execute JavaScript will only see the
default HTML shell. Route-specific HTML, titles, descriptions, and social cards
should be handled by prerendering or static generation if SEO becomes a primary
acquisition channel. Replace `https://eks-upgrade-planner.example.com` before
launch.

## Container and Kubernetes

The Dockerfile uses a multi-stage build and a non-root runtime image. The Helm
chart in `deploy/helm/eks-upgrade-planner` exposes port `8080` in the container
and port `80` in the Service. It includes probes, resources, NetworkPolicy,
ServiceMonitor, optional Ingress, optional HPA, PDB, and Grafana dashboard
ConfigMap.

For public ingress, keep `/metrics` off the public host. The chart adds an
nginx-ingress deny snippet for `/metrics` when `ingress.blockMetricsPath=true`,
and it can also protect `/metrics` with `METRICS_BEARER_TOKEN` via
`metrics.auth.enabled` plus `metrics.auth.existingSecret`. If your ingress
controller does not support nginx snippets, use an ingress/WAF rule or enable
the bearer-token path before exposing the app publicly.

No cloud resources are deployed by this repo.

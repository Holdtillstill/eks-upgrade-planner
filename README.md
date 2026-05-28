# EKS Upgrade Planner

A public, static-heavy web tool for planning Amazon EKS upgrades before they
become extended-support bills or risky change windows.

## What it includes

- EKS lifecycle table with cited static data.
- Extended support cost calculator using EKS control-plane support-tier rates.
- Multi-hop upgrade planner with copyable Markdown/Jira ticket output.
- Managed/platform addon checklist with source links and diagnostic commands.
- Local-only deprecated Kubernetes API scanner for pasted YAML/text.
- A minimal production Node server for the built Vite app with structured logs,
  `/healthz`, `/readyz`, `/metrics`, request IDs, security headers, static asset
  caching, SPA deep-link fallback, and optional OTLP traces/logs.

## Local development

```bash
npm install --include=dev
npm run dev -- --host 127.0.0.1
```

Open: http://127.0.0.1:5173/

## Production server

Build the Vite app and serve it with the production server:

```bash
npm run build
PORT=8080 NODE_ENV=production npm start
```

Open: http://127.0.0.1:8080/app

Operational endpoints:

- `GET /healthz` - process liveness.
- `GET /readyz` - verifies `dist/index.html` is readable.
- `GET /metrics` - Prometheus text metrics for process/runtime and HTTP traffic.
- Deep links such as `/eks/1-35-upgrade-guide` fall back to `dist/index.html`.

The server logs JSON to stdout/stderr for container log collection. Set
`OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318` to emit OTLP/HTTP traces.
Set `OTEL_LOGS_EXPORTER=otlp` as well to emit application logs through the
OpenTelemetry Collector to Loki. If exposing the app publicly, keep `/metrics`
internal or set `METRICS_BEARER_TOKEN` and configure Prometheus to send the
bearer token.

## Docker

```bash
docker build -t eks-upgrade-planner:local .
docker run --rm -p 8080:8080 eks-upgrade-planner:local
```

## Kubernetes and Helm

The chart is in `deploy/helm/eks-upgrade-planner` and does not deploy cloud
resources:

```bash
helm upgrade --install eks-upgrade-planner deploy/helm/eks-upgrade-planner \
  --namespace eks-upgrade-planner \
  --create-namespace \
  --set image.repository=ghcr.io/your-org/eks-upgrade-planner \
  --set image.tag=0.0.0
```

It includes Deployment, Service, optional Ingress, ServiceMonitor,
NetworkPolicy, optional HPA, PDB, and a Grafana dashboard ConfigMap.

## Observability

Recommended stack for Kubernetes:

- Prometheus and Grafana from `kube-prometheus-stack`.
- Loki for OTLP application logs, or stdout/container logs when paired with a
  node log collector such as Grafana Alloy, Promtail, or Fluent Bit.
- Tempo for request traces.
- OpenTelemetry Collector for OTLP fan-out.

Local/demo values live in `deploy/observability`. See
`docs/observability.md` for install and verification commands.

## Verification

```bash
npm test
npm run build
npm run lint
npm run smoke:local
```

Run `npm run smoke:local` while the production server is already listening on
`http://127.0.0.1:8080`, or set `SMOKE_BASE_URL`.

## Data and trust model

This MVP uses static source-linked data in `src/data/`. It does **not** call AWS APIs, store user data, or upload manifests. Scanner results are computed in the browser. Verify all lifecycle/pricing/addon guidance against AWS and upstream project docs before approving production upgrades.

## Known limitations

- The scanner is regex/text based, not a full Kubernetes schema validator.
- Addon compatibility is intentionally framed as a verification checklist, not an authoritative compatibility guarantee.
- Cost calculations cover EKS control-plane support-tier pricing only; worker nodes, Fargate, EBS, IPv4, data transfer, and workload costs are excluded.
- SEO metadata is best-effort for a single-page app. Route-specific titles,
  descriptions, and crawlable per-route HTML require prerendering or static
  generation later.

More production notes are in `docs/production-readiness.md`.

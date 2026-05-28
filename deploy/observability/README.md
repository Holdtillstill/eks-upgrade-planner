# Local Observability Stack

These are small values files for a local kind or demo cluster. They install the
same shape recommended for this public SPA product: Prometheus, Grafana, Loki,
Tempo, and the OpenTelemetry Collector. They do not vendor upstream charts and
do not create cloud resources.

## Install Sketch

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts
helm repo update

kubectl create namespace observability --dry-run=client -o yaml | kubectl apply -f -

helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace observability \
  -f deploy/observability/kube-prometheus-stack-values.yaml

helm upgrade --install loki grafana/loki \
  --namespace observability \
  -f deploy/observability/loki-values.yaml

helm upgrade --install tempo grafana/tempo \
  --namespace observability \
  -f deploy/observability/tempo-values.yaml

helm upgrade --install otel-collector open-telemetry/opentelemetry-collector \
  --namespace observability \
  -f deploy/observability/opentelemetry-collector-values.yaml
```

Install the app chart after the Prometheus Operator CRDs are present:

```bash
kubectl create namespace eks-upgrade-planner --dry-run=client -o yaml | kubectl apply -f -

helm upgrade --install eks-upgrade-planner deploy/helm/eks-upgrade-planner \
  --namespace eks-upgrade-planner \
  --set image.repository=localhost/eks-upgrade-planner \
  --set image.tag=local \
  --set serviceMonitor.enabled=true \
  --set otel.endpoint=http://otel-collector-opentelemetry-collector.observability.svc.cluster.local:4318
```

## Local Access

```bash
kubectl -n observability port-forward svc/kube-prometheus-stack-grafana 3000:80
kubectl -n observability port-forward svc/kube-prometheus-stack-prometheus 9090:9090
kubectl -n observability port-forward svc/loki-gateway 3100:80
kubectl -n observability port-forward svc/tempo 3200:3200
```

Open Grafana at `http://127.0.0.1:3000` with `admin` /
`eks-planner-local`. The app chart installs an `EKS Upgrade Planner` dashboard
ConfigMap when `grafanaDashboard.enabled=true`.

Prometheus should discover the app target from the ServiceMonitor. Useful local
queries:

```promql
sum(rate(http_requests_total[5m]))
histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))
sum by (route) (rate(http_requests_total[5m]))
sum(rate(http_requests_total{status_code=~"5.."}[5m]))
```

For traces, open Grafana Explore with the Tempo data source and search for
`service.name = eks-upgrade-planner` after generating a request. Container
stdout JSON logs can be queried from Loki by Kubernetes labels, and OTLP logs
are emitted when `OTEL_LOGS_EXPORTER=otlp` and an OTLP endpoint is configured.

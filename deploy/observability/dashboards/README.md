# Dashboards

The app chart packages the starter Grafana dashboard at:

`deploy/helm/eks-upgrade-planner/dashboards/eks-upgrade-planner-dashboard.json`

When `grafanaDashboard.enabled=true`, Helm renders it as a ConfigMap with the
standard `grafana_dashboard=1` sidecar label used by kube-prometheus-stack.

{{- define "eks-upgrade-planner.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "eks-upgrade-planner.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "eks-upgrade-planner.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "eks-upgrade-planner.selectorLabels" -}}
app.kubernetes.io/name: {{ include "eks-upgrade-planner.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "eks-upgrade-planner.labels" -}}
helm.sh/chart: {{ include "eks-upgrade-planner.chart" . }}
{{ include "eks-upgrade-planner.selectorLabels" . }}
app.kubernetes.io/component: web
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "eks-upgrade-planner.metricsSecretName" -}}
{{- if .Values.metrics.auth.existingSecret -}}
{{- .Values.metrics.auth.existingSecret -}}
{{- else -}}
{{- printf "%s-metrics" (include "eks-upgrade-planner.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

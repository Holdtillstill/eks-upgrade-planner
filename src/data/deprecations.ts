export type DeprecationRule = {
  apiVersion: string;
  kind: string;
  removedIn: string;
  severity: 'critical' | 'warning';
  replacement: string;
  migrationGuide: string;
  sourceLabel: string;
};

export const deprecations: DeprecationRule[] = [
  { apiVersion: 'extensions/v1beta1', kind: 'Ingress', removedIn: '1.22', severity: 'critical', replacement: 'networking.k8s.io/v1 Ingress', migrationGuide: 'https://kubernetes.io/docs/reference/using-api/deprecation-guide/#ingress-v122', sourceLabel: 'Kubernetes Ingress v1.22 deprecation guide' },
  { apiVersion: 'networking.k8s.io/v1beta1', kind: 'Ingress', removedIn: '1.22', severity: 'critical', replacement: 'networking.k8s.io/v1 Ingress', migrationGuide: 'https://kubernetes.io/docs/reference/using-api/deprecation-guide/#ingress-v122', sourceLabel: 'Kubernetes Ingress v1.22 deprecation guide' },
  { apiVersion: 'policy/v1beta1', kind: 'PodSecurityPolicy', removedIn: '1.25', severity: 'critical', replacement: 'Pod Security Admission or external policy controller', migrationGuide: 'https://kubernetes.io/docs/reference/using-api/deprecation-guide/#psp-v125', sourceLabel: 'Kubernetes PodSecurityPolicy v1.25 deprecation guide' },
  { apiVersion: 'batch/v1beta1', kind: 'CronJob', removedIn: '1.25', severity: 'critical', replacement: 'batch/v1 CronJob', migrationGuide: 'https://kubernetes.io/docs/reference/using-api/deprecation-guide/#cronjob-v125', sourceLabel: 'Kubernetes CronJob v1.25 deprecation guide' },
  { apiVersion: 'policy/v1beta1', kind: 'PodDisruptionBudget', removedIn: '1.25', severity: 'critical', replacement: 'policy/v1 PodDisruptionBudget', migrationGuide: 'https://kubernetes.io/docs/reference/using-api/deprecation-guide/#poddisruptionbudget-v125', sourceLabel: 'Kubernetes PDB v1.25 deprecation guide' },
  { apiVersion: 'autoscaling/v2beta2', kind: 'HorizontalPodAutoscaler', removedIn: '1.26', severity: 'warning', replacement: 'autoscaling/v2 HorizontalPodAutoscaler', migrationGuide: 'https://kubernetes.io/docs/reference/using-api/deprecation-guide/#horizontalpodautoscaler-v126', sourceLabel: 'Kubernetes HPA v1.26 deprecation guide' },
  { apiVersion: 'flowcontrol.apiserver.k8s.io/v1beta2', kind: 'FlowSchema', removedIn: '1.29', severity: 'warning', replacement: 'flowcontrol.apiserver.k8s.io/v1 FlowSchema', migrationGuide: 'https://kubernetes.io/docs/reference/using-api/deprecation-guide/#flowschema-v129', sourceLabel: 'Kubernetes FlowSchema v1.29 deprecation guide' },
  { apiVersion: 'flowcontrol.apiserver.k8s.io/v1beta2', kind: 'PriorityLevelConfiguration', removedIn: '1.29', severity: 'warning', replacement: 'flowcontrol.apiserver.k8s.io/v1 PriorityLevelConfiguration', migrationGuide: 'https://kubernetes.io/docs/reference/using-api/deprecation-guide/#prioritylevelconfiguration-v129', sourceLabel: 'Kubernetes PriorityLevelConfiguration v1.29 deprecation guide' },
  { apiVersion: 'storage.k8s.io/v1beta1', kind: 'CSIStorageCapacity', removedIn: '1.27', severity: 'warning', replacement: 'storage.k8s.io/v1 CSIStorageCapacity', migrationGuide: 'https://kubernetes.io/docs/reference/using-api/deprecation-guide/#csistoragecapacity-v127', sourceLabel: 'Kubernetes CSIStorageCapacity v1.27 deprecation guide' },
  { apiVersion: 'flowcontrol.apiserver.k8s.io/v1beta3', kind: 'FlowSchema', removedIn: '1.32', severity: 'warning', replacement: 'flowcontrol.apiserver.k8s.io/v1 FlowSchema', migrationGuide: 'https://kubernetes.io/docs/reference/using-api/deprecation-guide/#flowschema-v132', sourceLabel: 'Kubernetes FlowSchema v1.32 deprecation guide' },
  { apiVersion: 'flowcontrol.apiserver.k8s.io/v1beta3', kind: 'PriorityLevelConfiguration', removedIn: '1.32', severity: 'warning', replacement: 'flowcontrol.apiserver.k8s.io/v1 PriorityLevelConfiguration', migrationGuide: 'https://kubernetes.io/docs/reference/using-api/deprecation-guide/#prioritylevelconfiguration-v132', sourceLabel: 'Kubernetes PriorityLevelConfiguration v1.32 deprecation guide' },
];

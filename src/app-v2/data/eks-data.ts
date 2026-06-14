import { eksVersions as canonicalEksVersions } from '../../data/versions';
import { deprecations } from '../../data/deprecations';

export type SupportStatus = 'standard' | 'extended' | 'eol' | 'upcoming' | 'latest';

export interface EksVersion {
  version: string;
  releaseDate: string;
  standardEnd: string;
  extendedEnd: string;
  platform: string;
  status: SupportStatus;
  k8sVersion: string;
  sourceLabel: string;
  sourceUrl: string;
  notesUrl?: string;
  releaseUrl?: string;
}

export interface FleetRow {
  id: string;
  name: string;
  fromVersion: string;
  toVersion: string;
  clusters: number;
  environment: 'prod' | 'staging' | 'dev';
}

export interface Addon {
  id: string;
  name: string;
  publisher: string;
  managedByEks: boolean;
  minEksVersion: string;
  maxTestedVersion: string;
  checkCommand: string;
  validationChecklist: string[];
  whyItMatters: string;
  sourceUrl: string;
  gates: { label: string; status: 'passed' | 'warning' | 'blocked' }[];
}

const MS_PER_DAY = 86_400_000;
export const EXTENDED_SUPPORT_HOURLY_RATE = 0.6;
export const SUPPORT_HOURS_PER_MONTH = 730;

function versionRank(version: string) {
  return Number(version.split('.').at(-1) ?? 0);
}

function compareVersionsAsc(a: string, b: string) {
  return versionRank(a) - versionRank(b);
}

function isoDayToTime(date: string) {
  return Date.parse(`${date}T00:00:00Z`);
}

function utcToday(now = new Date()) {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function addUtcMonths(time: number, months: number) {
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate());
}

function supportStatusFor(version: typeof canonicalEksVersions[number], latestVersion: string, now = new Date()): SupportStatus {
  const today = utcToday(now);
  if (today > isoDayToTime(version.extendedSupportEnd)) {
    return 'eol';
  }
  if (today > isoDayToTime(version.standardSupportEnd)) {
    return 'extended';
  }
  if (version.version === latestVersion) {
    return 'latest';
  }
  return 'standard';
}

export function daysUntilIsoDate(date: string, now = new Date()) {
  return Math.ceil((isoDayToTime(date) - utcToday(now)) / MS_PER_DAY);
}

export function formatDaysUntilIsoDate(date: string, style: 'long' | 'short' = 'long') {
  const days = daysUntilIsoDate(date);
  if (days < 0) {
    const past = Math.abs(days);
    return style === 'short' ? `${past}d past` : `${past} day${past !== 1 ? 's' : ''} past due`;
  }
  if (days === 0) {
    return 'today';
  }
  return style === 'short' ? `${days}d` : `${days} day${days !== 1 ? 's' : ''}`;
}

export function getEksVersion(version: string) {
  return EKS_VERSIONS.find(item => item.version === version);
}

const latestCanonicalVersion = [...canonicalEksVersions]
  .sort((a, b) => compareVersionsAsc(a.version, b.version))
  .at(-1)?.version ?? '';

export const EKS_VERSIONS: EksVersion[] = [...canonicalEksVersions]
  .sort((a, b) => compareVersionsAsc(a.version, b.version))
  .map(version => ({
    version: version.version,
    k8sVersion: version.version,
    releaseDate: version.releaseDate,
    standardEnd: version.standardSupportEnd,
    extendedEnd: version.extendedSupportEnd,
    platform: version.latestPlatform ?? 'Unknown',
    status: supportStatusFor(version, latestCanonicalVersion),
    sourceLabel: version.sourceLabel,
    sourceUrl: version.sourceUrl,
    notesUrl: version.notesUrl,
    releaseUrl: version.releaseUrl,
  }));

export function supportDeadlineForVersion(version: EksVersion) {
  const extendedLine = version.status === 'extended' || version.status === 'eol';
  const date = extendedLine ? version.extendedEnd : version.standardEnd;
  return {
    version: version.version,
    date,
    days: daysUntilIsoDate(date),
    phase: extendedLine ? 'extended support' : 'standard support',
    shortPhase: extendedLine ? 'extended support ends' : 'standard support ends',
    status: version.status,
  };
}

export function nearestEksDeadline(versionNames: string[]) {
  const uniqueVersions = [...new Set(versionNames)];
  return uniqueVersions
    .map(version => getEksVersion(version))
    .filter((version): version is EksVersion => Boolean(version))
    .map(supportDeadlineForVersion)
    .sort((a, b) => a.days - b.days)[0];
}

export function calculateExtendedSupportFees(versionName: string, clusters: number, months: number, now = new Date()) {
  const version = getEksVersion(versionName);
  const start = utcToday(now);
  const end = addUtcMonths(start, months);
  const standardEnd = version ? isoDayToTime(version.standardEnd) : end;
  const extendedEnd = version ? isoDayToTime(version.extendedEnd) : start;
  const billableStart = Math.max(start, standardEnd);
  const billableEnd = Math.min(end, extendedEnd);
  const billableDays = Math.max(0, Math.ceil((billableEnd - billableStart) / MS_PER_DAY));
  const unsupportedStart = Math.max(start, extendedEnd);
  const unsupportedDays = Math.max(0, Math.ceil((end - unsupportedStart) / MS_PER_DAY));
  const billableHours = billableDays * 24;
  const totalFees = billableHours * EXTENDED_SUPPORT_HOURLY_RATE * clusters;

  return {
    version,
    clusters,
    months,
    billableDays,
    billableHours,
    billableClusterDays: billableDays * clusters,
    unsupportedDays,
    totalFees,
    billableStart: billableDays ? new Date(billableStart).toISOString().slice(0, 10) : null,
    billableEnd: billableDays ? new Date(billableEnd).toISOString().slice(0, 10) : null,
    modelEnd: new Date(end).toISOString().slice(0, 10),
  };
}

export function calculateFleetExtendedSupportFees(rows: { from: string; clusters: number }[], months: number, now = new Date()) {
  const details = rows.map(row => ({
    row,
    exposure: calculateExtendedSupportFees(row.from, row.clusters, months, now),
  }));

  return {
    details,
    totalFees: details.reduce((sum, detail) => sum + detail.exposure.totalFees, 0),
    billableClusterDays: details.reduce((sum, detail) => sum + detail.exposure.billableClusterDays, 0),
    unsupportedClusterDays: details.reduce((sum, detail) => sum + (detail.exposure.unsupportedDays * detail.row.clusters), 0),
    billableClusters: details
      .filter(detail => detail.exposure.billableDays > 0)
      .reduce((sum, detail) => sum + detail.row.clusters, 0),
  };
}

export const FLEET_ROWS: FleetRow[] = [
  { id: '1', name: 'prod-payments', fromVersion: '1.31', toVersion: '1.35', clusters: 5, environment: 'prod' },
  { id: '2', name: 'shared-platform', fromVersion: '1.30', toVersion: '1.35', clusters: 3, environment: 'prod' },
  { id: '3', name: 'dev-sandboxes', fromVersion: '1.33', toVersion: '1.35', clusters: 4, environment: 'dev' },
];

export const ADDONS: Addon[] = [
  {
    id: 'vpc-cni',
    name: 'Amazon VPC CNI',
    publisher: 'AWS',
    managedByEks: true,
    minEksVersion: '1.29',
    maxTestedVersion: '1.36',
    checkCommand: 'kubectl describe daemonset aws-node -n kube-system | grep Image',
    validationChecklist: [
      'Check VPC CNI version ≥ v1.18.3 for EKS 1.31+',
      'Verify IPAMD pod health: kubectl get pods -n kube-system -l k8s-app=aws-node',
      'Confirm no IP exhaustion events in CloudWatch',
      'Test pod connectivity cross-node after upgrade',
    ],
    whyItMatters: 'VPC CNI manages pod networking and IP allocation. An incompatible version can cause pod scheduling failures or network partitions during rolling upgrades.',
    sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/managing-vpc-cni.html',
    gates: [
      { label: 'Version compatible with EKS 1.35', status: 'passed' },
      { label: 'No pending IPAMD restarts', status: 'warning' },
      { label: 'Warm pool sizing reviewed', status: 'passed' },
    ],
  },
  {
    id: 'coredns',
    name: 'CoreDNS',
    publisher: 'AWS',
    managedByEks: true,
    minEksVersion: '1.29',
    maxTestedVersion: '1.36',
    checkCommand: 'kubectl get deployment coredns -n kube-system -o jsonpath=\'{.spec.template.spec.containers[0].image}\'',
    validationChecklist: [
      'Check CoreDNS version ≥ v1.11.3 for EKS 1.31+',
      'Verify CoreDNS pods running: kubectl rollout status deploy/coredns -n kube-system',
      'Test DNS resolution: kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup kubernetes',
      'Review CoreDNS ConfigMap for custom stub zones',
    ],
    whyItMatters: 'CoreDNS is the cluster DNS provider. Incompatible versions cause service discovery failures affecting all in-cluster communication.',
    sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/managing-coredns.html',
    gates: [
      { label: 'Version meets EKS 1.35 minimum', status: 'passed' },
      { label: 'Replica count ≥ 2 for HA', status: 'passed' },
      { label: 'Custom ConfigMap reviewed', status: 'blocked' },
    ],
  },
  {
    id: 'kube-proxy',
    name: 'kube-proxy',
    publisher: 'AWS',
    managedByEks: true,
    minEksVersion: '1.29',
    maxTestedVersion: '1.36',
    checkCommand: 'kubectl get ds kube-proxy -n kube-system -o jsonpath=\'{.spec.template.spec.containers[0].image}\'',
    validationChecklist: [
      'Verify kube-proxy version matches cluster minor version',
      'Check DaemonSet rollout: kubectl rollout status ds/kube-proxy -n kube-system',
      'Confirm iptables rules are consistent on all nodes',
      'Test service ClusterIP connectivity',
    ],
    whyItMatters: 'kube-proxy maintains network rules for Service routing. Version skew beyond one minor version from the control plane is unsupported.',
    sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/managing-kube-proxy.html',
    gates: [
      { label: 'Version skew within supported range', status: 'passed' },
      { label: 'IPVS mode compatibility checked', status: 'passed' },
    ],
  },
  {
    id: 'ebs-csi',
    name: 'Amazon EBS CSI Driver',
    publisher: 'AWS',
    managedByEks: true,
    minEksVersion: '1.29',
    maxTestedVersion: '1.36',
    checkCommand: 'kubectl get deployment ebs-csi-controller -n kube-system -o jsonpath=\'{.spec.template.spec.containers[0].image}\'',
    validationChecklist: [
      'Check ebs-csi-driver version ≥ v1.35.0 for EKS 1.31+',
      'Verify IAM role for EBS CSI is attached',
      'Test PVC create/mount/unmount cycle',
      'Confirm snapshot controller if using VolumeSnapshots',
    ],
    whyItMatters: 'EBS CSI driver handles persistent volume lifecycle for EBS-backed workloads. Incompatible versions can cause volume attachment failures.',
    sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/ebs-csi.html',
    gates: [
      { label: 'EBS CSI version compatible', status: 'passed' },
      { label: 'IRSA or EKS Pod Identity configured', status: 'warning' },
    ],
  },
  {
    id: 'aws-lb-controller',
    name: 'AWS Load Balancer Controller',
    publisher: 'AWS',
    managedByEks: false,
    minEksVersion: '1.29',
    maxTestedVersion: '1.35',
    checkCommand: 'kubectl get deployment aws-load-balancer-controller -n kube-system -o jsonpath=\'{.spec.template.spec.containers[0].image}\'',
    validationChecklist: [
      'Verify AWS LBC version ≥ v2.10.0',
      'Check webhook certificate is valid',
      'Test Ingress object reconciliation',
      'Confirm target group binding CRDs are up to date',
    ],
    whyItMatters: 'AWS LBC provisions ALBs and NLBs for Ingress and Service resources. Mismatched webhook versions can block pod scheduling cluster-wide.',
    sourceUrl: 'https://kubernetes-sigs.github.io/aws-load-balancer-controller/',
    gates: [
      { label: 'CRD version matches controller', status: 'passed' },
      { label: 'Webhook cert not expiring within 30d', status: 'passed' },
      { label: 'EKS 1.35 tested and supported', status: 'warning' },
    ],
  },
  {
    id: 'karpenter',
    name: 'Karpenter',
    publisher: 'AWS',
    managedByEks: false,
    minEksVersion: '1.29',
    maxTestedVersion: '1.35',
    checkCommand: 'kubectl get deployment karpenter -n kube-system -o jsonpath=\'{.spec.template.spec.containers[0].image}\'',
    validationChecklist: [
      'Verify Karpenter version ≥ v1.0.0 (v1 API GA)',
      'Check NodePool and EC2NodeClass CRDs are installed',
      'Confirm IAM role permissions for EC2 fleet provisioning',
      'Test scale-out event with a pending pod',
      'Review NodePool disruption budget settings',
    ],
    whyItMatters: 'Karpenter auto-provisions nodes for pending pods. Incompatible versions block node provisioning during surge events and can leave workloads unscheduled.',
    sourceUrl: 'https://karpenter.sh/',
    gates: [
      { label: 'v1 API CRDs installed', status: 'passed' },
      { label: 'IRSA permissions complete', status: 'passed' },
      { label: 'Drift feature flag reviewed', status: 'warning' },
    ],
  },
  {
    id: 'cert-manager',
    name: 'cert-manager',
    publisher: 'cert-manager.io',
    managedByEks: false,
    minEksVersion: '1.27',
    maxTestedVersion: '1.35',
    checkCommand: 'kubectl get deployment cert-manager -n cert-manager -o jsonpath=\'{.spec.template.spec.containers[0].image}\'',
    validationChecklist: [
      'Verify cert-manager version ≥ v1.15.0',
      'Check CRD version compatibility: kubectl get crd certificates.cert-manager.io',
      'Validate webhook is healthy',
      'Test Certificate issuance with a dry-run',
    ],
    whyItMatters: 'cert-manager manages TLS certificates for in-cluster services and ingress. Webhook failures block all pod scheduling that depends on admission webhooks.',
    sourceUrl: 'https://cert-manager.io/docs/',
    gates: [
      { label: 'CRDs match controller version', status: 'passed' },
      { label: 'Webhook endpoint reachable', status: 'passed' },
    ],
  },
  {
    id: 'ingress-nginx',
    name: 'ingress-nginx',
    publisher: 'Kubernetes',
    managedByEks: false,
    minEksVersion: '1.27',
    maxTestedVersion: '1.34',
    checkCommand: 'kubectl get deployment ingress-nginx-controller -n ingress-nginx -o jsonpath=\'{.spec.template.spec.containers[0].image}\'',
    validationChecklist: [
      'Verify ingress-nginx version ≥ v1.11.0',
      'Check IngressClass resource is configured',
      'Test HTTP/HTTPS routing after upgrade',
      'Verify custom nginx config snippets are compatible',
    ],
    whyItMatters: 'ingress-nginx serves as the HTTP routing layer for web workloads. Incompatible admission webhook versions can block Ingress object creation.',
    sourceUrl: 'https://kubernetes.github.io/ingress-nginx/',
    gates: [
      { label: 'EKS 1.35 compatibility not yet tested', status: 'blocked' },
      { label: 'ValidatingWebhookConfiguration reviewed', status: 'warning' },
    ],
  },
  {
    id: 'argo-cd',
    name: 'Argo CD',
    publisher: 'CNCF',
    managedByEks: false,
    minEksVersion: '1.27',
    maxTestedVersion: '1.35',
    checkCommand: 'kubectl get deployment argocd-server -n argocd -o jsonpath=\'{.spec.template.spec.containers[0].image}\'',
    validationChecklist: [
      'Verify Argo CD version ≥ v2.12.0',
      'Check API server connectivity after control-plane upgrade',
      'Test application sync against staging cluster first',
      'Review AppProject RBAC for any deprecated API usage',
    ],
    whyItMatters: 'Argo CD manages GitOps application deployments. API server disruptions during upgrade can block sync operations and leave deployments in an unknown state.',
    sourceUrl: 'https://argo-cd.readthedocs.io/',
    gates: [
      { label: 'API server compatibility confirmed', status: 'passed' },
      { label: 'Deprecated API resources in app repos', status: 'blocked' },
    ],
  },
  {
    id: 'kube-prometheus',
    name: 'kube-prometheus-stack',
    publisher: 'prometheus-community',
    managedByEks: false,
    minEksVersion: '1.27',
    maxTestedVersion: '1.35',
    checkCommand: 'kubectl get deployment prometheus-operator -n monitoring -o jsonpath=\'{.spec.template.spec.containers[0].image}\'',
    validationChecklist: [
      'Verify kube-prometheus-stack chart ≥ v65.0.0',
      'Check PrometheusRule and ServiceMonitor CRDs are current',
      'Validate scrape targets return data after upgrade',
      'Test alerting pipeline with a test alert',
    ],
    whyItMatters: 'kube-prometheus-stack provides cluster metrics, alerting, and dashboards. Broken scrape targets during upgrade create blind spots in operational visibility.',
    sourceUrl: 'https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack',
    gates: [
      { label: 'CRD version matches operator', status: 'passed' },
      { label: 'Scrape targets healthy', status: 'passed' },
    ],
  },
];

const SAMPLE_DEPRECATED_API_FILES: Record<string, { lineNumber: number; fileName: string; excerpt: string }> = {
  'policy/v1beta1-PodSecurityPolicy': {
    lineNumber: 14,
    excerpt: 'apiVersion: policy/v1beta1\nkind: PodSecurityPolicy',
    fileName: 'base/security-policy.yaml',
  },
  'autoscaling/v2beta2-HorizontalPodAutoscaler': {
    lineNumber: 38,
    excerpt: 'apiVersion: autoscaling/v2beta2\nkind: HorizontalPodAutoscaler',
    fileName: 'apps/payments-hpa.yaml',
  },
};

export const DEPRECATED_APIS = deprecations
  .filter(rule => SAMPLE_DEPRECATED_API_FILES[`${rule.apiVersion}-${rule.kind}`])
  .map((rule, index) => {
    const sample = SAMPLE_DEPRECATED_API_FILES[`${rule.apiVersion}-${rule.kind}`];
    return {
      id: String(index + 1),
      severity: rule.severity === 'critical' ? 'error' as const : 'warning' as const,
      apiVersion: rule.apiVersion,
      kind: rule.kind,
      removedIn: rule.removedIn,
      replacement: rule.replacement,
      source: rule.apiVersion,
      sourceUrl: rule.migrationGuide,
      lineNumber: sample.lineNumber,
      excerpt: sample.excerpt,
      fileName: sample.fileName,
    };
  });

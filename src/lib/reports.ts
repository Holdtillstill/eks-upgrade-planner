import { addons } from '../data/addons';
import { deprecations } from '../data/deprecations';
import { eksPricing } from '../data/pricing';
import { dataFreshness, eksVersions, type EksVersion } from '../data/versions';
import {
  calculateEksSupportExposure,
  compareEksVersions,
  formatCurrency,
  formatHourlyCurrency,
  generateHopSequence,
  getSupportStatus,
  scanDeprecatedApis,
  statusLabel,
  type ScanFinding,
} from './planner';

export type NodeModel = 'managed-node-groups' | 'self-managed' | 'fargate' | 'karpenter';

export const nodeModelLabels: Record<NodeModel, string> = {
  'managed-node-groups': 'Managed node groups',
  'self-managed': 'Self-managed nodes',
  fargate: 'AWS Fargate',
  karpenter: 'Karpenter',
};

export const nodeModelChecks: Record<NodeModel, string[]> = {
  'managed-node-groups': [
    'Upgrade or replace managed node groups after each control-plane hop.',
    'Confirm launch template, AMI, and node Kubernetes minor version before draining workloads.',
    'Validate PodDisruptionBudgets and workload rollout status after node replacement.',
  ],
  'self-managed': [
    'Build and test the target AMI/bootstrap path before the control-plane maintenance window.',
    'Drain and replace Auto Scaling group capacity one failure domain at a time.',
    'Confirm kubelet, CNI, and admission webhook health after replacement.',
  ],
  fargate: [
    'Confirm Fargate profiles still select the intended namespaces and labels.',
    'Restart representative workloads so pods are recreated against the upgraded control plane.',
    'Validate DNS, service discovery, and admission webhooks for Fargate-only namespaces.',
  ],
  karpenter: [
    'Review Karpenter release notes and CRDs before the EKS control-plane upgrade.',
    'Validate NodePools, NodeClaims, EC2NodeClasses, disruption settings, and consolidation behavior.',
    'Run a scale-out and interruption handling test after each control-plane hop.',
  ],
};

export type VersionGuide = {
  version: EksVersion;
  targetVersion: EksVersion;
  hops: string[];
  costRisk: string;
  deprecatedApiChecks: typeof deprecations;
  managedAddonChecks: typeof addons;
  postUpgradeValidation: string[];
  markdown: string;
};

export type PlannerReportInput = {
  currentVersion: string;
  targetVersion: string;
  clusterCount: number;
  monthsDelayed: number;
  nodeModel: NodeModel;
  selectedAddonIds: string[];
  scannerFindings: ScanFinding[];
};

export type EvidenceReportInput = PlannerReportInput & {
  evidenceVersion: string;
};

export function findEksVersion(version: string): EksVersion {
  const selected = eksVersions.find((item) => item.version === version);
  return selected ?? eksVersions[0];
}

export function newestEksVersion(): EksVersion {
  return [...eksVersions].sort((a, b) => compareEksVersions(b.version, a.version))[0];
}

export function buildVersionGuide(version: string): VersionGuide {
  const selected = findEksVersion(version);
  const targetVersion = newestEksVersion();
  const effectiveTarget = compareEksVersions(targetVersion.version, selected.version) >= 0 ? targetVersion : selected;
  const hops = generateHopSequence(selected.version, effectiveTarget.version);
  const status = getSupportStatus(selected);
  const cost = calculateEksSupportExposure(selected, 1, 1);
  const costRisk = status === 'standard' || status === 'standard-ending-soon'
    ? `If EKS ${selected.version} remains after ${selected.standardSupportEnd}, this local estimate uses a ${formatCurrency(cost.extraMonthly)} per-cluster monthly support-tier delta.`
    : `EKS ${selected.version} is outside standard support in the static dataset; this local estimate uses a ${formatCurrency(cost.extraMonthly)} per-cluster monthly support-tier delta while extended support applies.`;
  const deprecatedApiChecks = deprecations.filter((rule) => compareEksVersions(rule.removedIn, selected.version) <= 0 || compareEksVersions(rule.removedIn, effectiveTarget.version) <= 0);
  const managedAddonChecks = addons.filter((addon) => addon.type === 'AWS managed');
  const postUpgradeValidation = [
    'Confirm all nodes report Ready and match the intended Kubernetes minor version.',
    'Check kube-system rollouts, CoreDNS resolution, service networking, ingress reconciliation, and storage attach/mount paths.',
    'Run representative workload smoke tests and compare platform alerts before closing the maintenance window.',
    'Attach scanner findings, add-on checks, and lifecycle citations to the change record.',
  ];

  return {
    version: selected,
    targetVersion: effectiveTarget,
    hops,
    costRisk,
    deprecatedApiChecks,
    managedAddonChecks,
    postUpgradeValidation,
    markdown: generateVersionGuideMarkdown({
      version: selected,
      targetVersion: effectiveTarget,
      hops,
      costRisk,
      deprecatedApiChecks,
      managedAddonChecks,
      postUpgradeValidation,
    }),
  };
}

export function generateVersionGuideMarkdown(guide: Omit<VersionGuide, 'markdown'>): string {
  return `# EKS ${guide.version.version} upgrade guide

Data checked: ${dataFreshness.checkedAt}

## Lifecycle
- Release date: ${guide.version.releaseDate}
- Standard support ends: ${guide.version.standardSupportEnd}
- Extended support ends: ${guide.version.extendedSupportEnd}
- Current status: ${statusLabel(getSupportStatus(guide.version))}
- Source: ${guide.version.sourceUrl}

## Cost risk
${guide.costRisk}
- Pricing source: ${eksPricing.sourceUrl}
- Pricing limitation: ${eksPricing.note}

## Upgrade hops
${guide.hops.map((hop, index) => `- ${index === 0 ? 'Current' : 'Hop'}: EKS ${hop}`).join('\n')}

## Deprecated API checks
${guide.deprecatedApiChecks.map((rule) => `- ${rule.severity.toUpperCase()}: ${rule.kind} ${rule.apiVersion} removed in ${rule.removedIn}; migrate to ${rule.replacement}. ${rule.migrationGuide}`).join('\n')}

## Managed add-on checks
${guide.managedAddonChecks.map((addon) => `- ${addon.name}: ${addon.whyItMatters} ${addon.sourceUrl}`).join('\n')}

## Post-upgrade validation
${guide.postUpgradeValidation.map((item) => `- ${item}`).join('\n')}

## Limitations
- Static browser dataset only; verify lifecycle, pricing, add-on, and Kubernetes API details against linked sources before production approval.
- Scanner checks pasted text for known apiVersion/kind pairs; it is not a Kubernetes schema validator.`;
}

export function generateCostReport(version: string, clusterCount: number, monthsDelayed: number, now = new Date()): string {
  const selected = findEksVersion(version);
  const cost = calculateEksSupportExposure(selected, clusterCount, monthsDelayed, now);
  const remainingFeeValue = cost.isPastExtendedSupport
    ? 'Not applicable - release is past extended support'
    : formatCurrency(cost.extraTotal);
  const riskNote = cost.isPastExtendedSupport
    ? `- Risk note: Extended support ended on ${selected.extendedSupportEnd}; AWS can automatically upgrade clusters after the end of extended support.`
    : cost.postExtendedSupportDays > 0
      ? `- Risk note: The billable window stops at ${selected.extendedSupportEnd}; ${cost.postExtendedSupportDays} modeled day(s) fall after extended support ends.`
      : '';
  return `# EKS extended support estimate

Version: EKS ${selected.version}
Cluster count: ${clusterCount}
Exposure window: ${monthsDelayed} month(s)
Standard support end: ${selected.standardSupportEnd}
Extended support end: ${selected.extendedSupportEnd}
Billing calendar: AWS UTC lifecycle day

## Local estimate
- Standard support control-plane rate: ${formatHourlyCurrency(eksPricing.standardPerClusterHour)} per cluster hour
- Extended support control-plane rate: ${formatHourlyCurrency(eksPricing.extendedPerClusterHour)} per cluster hour
- Standard monthly estimate: ${formatCurrency(cost.standardMonthly)}
- Extended monthly estimate: ${formatCurrency(cost.extendedMonthly)}
- Monthly rate delta if extended support is reached: ${formatCurrency(cost.extraMonthly)}
- Billable extended-support days in modeled window: ${cost.billableDays}
- Past-support days in modeled window: ${cost.postExtendedSupportDays}
- Modeled remaining support fees: ${remainingFeeValue}
${riskNote}

## Sources and limits
- Lifecycle source: ${selected.sourceUrl}
- Pricing source: ${eksPricing.sourceUrl}
- Data checked: ${dataFreshness.checkedAt}
- Limitation: ${eksPricing.note}`;
}

export function generatePlannerMarkdown(input: PlannerReportInput): string {
  const current = findEksVersion(input.currentVersion);
  const target = findEksVersion(input.targetVersion);
  const effectiveTarget = compareEksVersions(target.version, current.version) < 0 ? current : target;
  const hops = generateHopSequence(current.version, effectiveTarget.version);
  const selectedAddons = addons.filter((addon) => input.selectedAddonIds.includes(addon.id));
  const cost = calculateEksSupportExposure(current, input.clusterCount, input.monthsDelayed);
  const costExposure = cost.isPastExtendedSupport ? 'Not applicable - release is past extended support' : formatCurrency(cost.extraTotal);
  const costRiskNote = cost.isPastExtendedSupport
    ? `- Extended support ended on ${current.extendedSupportEnd}; treat this as automatic-upgrade risk, not a zero-cost state.`
    : cost.postExtendedSupportDays > 0
      ? `- Billable support fees stop at ${current.extendedSupportEnd}; ${cost.postExtendedSupportDays} modeled day(s) are after extended support ends.`
      : '';

  return `# EKS upgrade change plan

## Scope
- Current version: EKS ${current.version}
- Target version: EKS ${effectiveTarget.version}
- Cluster count: ${input.clusterCount}
- Delay model: ${input.monthsDelayed} month(s)
- Node model: ${nodeModelLabels[input.nodeModel]}

## Control-plane hops
${hops.map((hop, index) => `- ${index === 0 ? 'Baseline' : 'Upgrade'}: EKS ${hop}`).join('\n')}

## Node model checklist
${nodeModelChecks[input.nodeModel].map((item) => `- ${item}`).join('\n')}

## Add-on checklist
${selectedAddons.map((addon) => `- ${addon.name}: ${addon.checks[0]} (${addon.sourceUrl})`).join('\n') || '- No add-ons selected.'}

## Deprecated API scan
${input.scannerFindings.length ? input.scannerFindings.map((finding) => `- ${finding.severity.toUpperCase()}: line ${finding.line}, ${finding.kind} ${finding.apiVersion}; use ${finding.replacement}. ${finding.migrationGuide}`).join('\n') : '- No deprecated API matches detected in pasted manifest text.'}

## Cost and deadline risk
- Monthly rate delta if delayed into extended support: ${formatCurrency(cost.extraMonthly)}
- Billable extended-support days in modeled window: ${cost.billableDays}
- Modeled remaining support fees: ${costExposure}
${costRiskNote}
- Pricing source: ${eksPricing.sourceUrl}

## Limitations
- Local planner only; it does not inspect AWS accounts, clusters, IAM, workloads, or live add-on versions.
- Verify every linked source before approving production maintenance.`;
}

export function generateEvidenceReport(input: EvidenceReportInput): string {
  const current = findEksVersion(input.currentVersion);
  const target = findEksVersion(input.targetVersion);
  const selectedAddons = addons.filter((addon) => input.selectedAddonIds.includes(addon.id));
  const costReport = generateCostReport(current.version, input.clusterCount, input.monthsDelayed);
  const scanSummary = input.scannerFindings.length
    ? input.scannerFindings.map((finding) => `- ${finding.kind} ${finding.apiVersion}, line ${finding.line}, removed in ${finding.removedIn}; ${finding.migrationGuide}`).join('\n')
    : '- No deprecated API matches detected in pasted manifest text.';

  return `# EKS production change packet

Evidence id: EKS-${current.version.replaceAll('.', '')}-${target.version.replaceAll('.', '')}-${input.evidenceVersion}
Data checked: ${dataFreshness.checkedAt}

## Selected version
- Current: EKS ${current.version}
- Target: EKS ${target.version}
- Lifecycle source: ${current.sourceUrl}

## Cost record
${costReport}

## Change plan record
${generatePlannerMarkdown(input)}

## Scanner record
${scanSummary}

## Add-on record
${selectedAddons.map((addon) => `- ${addon.name}: ${addon.whyItMatters} Source: ${addon.sourceUrl}`).join('\n') || '- No add-ons selected.'}

## Citations
- ${dataFreshness.sourceLabel}: ${dataFreshness.sourceUrl}
- ${eksPricing.sourceLabel}: ${eksPricing.sourceUrl}
- ${deprecations[0].sourceLabel}: ${deprecations[0].migrationGuide}
${selectedAddons.map((addon) => `- ${addon.sourceLabel}: ${addon.sourceUrl}`).join('\n')}

## Explicit limitations
- This report is generated entirely in the browser from static local data and pasted text.
- It does not call AWS APIs, upload manifests, validate Kubernetes schemas, inspect IAM, or confirm live cluster state.
- Treat all cost values as EKS control-plane support-tier estimates only.`;
}

export function scanExampleManifest(): string {
  return `apiVersion: networking.k8s.io/v1beta1
kind: Ingress
metadata:
  name: legacy-web
---
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: privileged`;
}

export function scanManifest(input: string): ScanFinding[] {
  return scanDeprecatedApis(input);
}

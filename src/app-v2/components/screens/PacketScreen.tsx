import { useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, ExternalLink, Shield, Circle, Printer } from 'lucide-react';
import { CopyButton } from '../ui/CopyButton';
import { DownloadButton } from '../ui/DownloadButton';
import { StatusPill } from '../ui/StatusPill';
import { ADDONS, calculateFleetExtendedSupportFees, EKS_VERSIONS, EXTENDED_SUPPORT_HOURLY_RATE, type Addon, type EksVersion, type SupportStatus } from '../../data/eks-data';
import { readStoredScannerEvidence, scannerEvidenceIsStale, scannerEvidenceMeta, scannerEvidenceSummary, scannerSummary, type ScannerEvidence } from '../../../lib/scanner-state';
import { highestTargetVersion, readPlannerState, totalClusters, type CostScenarioId, type PlannerFleetRow } from '../../../lib/planner-state';
import { addonChecklistProgress, addonEvidenceIsStale, addonEvidenceMeta, readAddonChecklistState, type AddonChecklistState } from '../../../lib/addon-state';
import { maintenanceGateDetail, maintenanceGateStatus, maintenanceMd, maintenanceStatusLabel, readPacketState, waiverAcceptedDate, waiverIsAccepted, waiverIsRecorded, writePacketState, type MaintenanceWindow, type PacketState, type WaiverState } from '../../../lib/packet-state';
import { NODE_MODEL_STORAGE_KEY, executionHistoryMarkdown, executionMarkdown, executionProgress, readExecutionState, type ExecutionState } from '../../../lib/execution-state';
import { dataFreshness } from '../../../data/versions';
import { safeArtifactName } from '../../../lib/download';
interface Gate {
    id: string;
    label: string;
    status: 'passed' | 'warning' | 'blocked' | 'queued';
    detail: string;
    actionScreen?: string;
    actionLabel?: string;
}
interface SummaryRow {
    label: string;
    value: string;
    mono?: boolean;
    tone?: string;
    actionScreen?: string;
    actionLabel?: string;
}
interface VersionDistribution {
    version: string;
    clusters: number;
    rows: number;
    data: EksVersion;
}
interface PacketContext {
    fleetRows: PlannerFleetRow[];
    sourceDistribution: VersionDistribution[];
    targetDistribution: VersionDistribution[];
    totalClusters: number;
    extendedClusterCount: number;
    billableClusterCount: number;
    billableClusterDays: number;
    unsupportedClusterDays: number;
    costScenarioLabel: string;
    costScenarioMonths: number;
    extendedSupportFeesText: string;
    sourceVersionText: string;
    targetVersionText: string;
    lifecycleDetail: string;
    fleetScopeRowsMd: string;
    lifecycleRowsMd: string;
}
interface AddonValidationContext {
    rowsMd: string;
    checkedCount: number;
    total: number;
    staleCount: number;
    complete: boolean;
    gateStatus: GateStatus;
    detail: string;
}
type GateStatus = Gate['status'];
type PacketStatus = 'draft' | 'blocked' | 'waiver_recorded' | 'approval_ready_with_waiver' | 'approval_ready';
const NODE_MODELS = {
    rolling: {
        packetLabel: 'Rolling upgrade',
        summary: 'Replace nodes gradually inside each group, one availability zone at a time.',
        bullets: [
            'Cordon and drain nodes in small batches.',
            'Keep existing capacity online while replacement nodes join.',
            'Requires PodDisruptionBudgets and drain-timeout checks.',
        ],
    },
    bluegreen: {
        packetLabel: 'Blue/Green cutover',
        summary: 'Stand up parallel capacity, shift workloads, then retire old nodes.',
        bullets: [
            'Create replacement node groups before draining old capacity.',
            'Validate workloads on green capacity before cutover.',
            'Higher temporary cost, lower rollback friction.',
        ],
    },
} as const;
type NodeModelId = keyof typeof NODE_MODELS;
const dataCheckedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
}).format(new Date(`${dataFreshness.checkedAt}T00:00:00Z`));

function storedNodeModel(): NodeModelId {
    if (typeof window === 'undefined') {
        return 'rolling';
    }
    return window.localStorage.getItem(NODE_MODEL_STORAGE_KEY) === 'bluegreen' ? 'bluegreen' : 'rolling';
}
const STATUS_LABEL: Record<SupportStatus, string> = {
    latest: 'Latest',
    standard: 'Standard',
    extended: 'Extended',
    eol: 'End of life',
    upcoming: 'Upcoming',
};
const STATUS_RISK: Record<SupportStatus, number> = {
    eol: 0,
    extended: 1,
    standard: 2,
    latest: 3,
    upcoming: 4,
};
function versionSort(a: string, b: string) {
    const [aMajor, aMinor] = a.split('.').map(Number);
    const [bMajor, bMinor] = b.split('.').map(Number);
    return aMajor === bMajor ? aMinor - bMinor : aMajor - bMajor;
}
function versionData(version: string): EksVersion {
    return EKS_VERSIONS.find(v => v.version === version) ?? {
        version,
        k8sVersion: version,
        releaseDate: 'Unknown',
        standardEnd: 'Unknown',
        extendedEnd: 'Unknown',
        platform: 'Unknown',
        status: 'upcoming',
        sourceLabel: 'Unknown',
        sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html',
    };
}
function distributionFor(rows: PlannerFleetRow[], key: 'from' | 'to'): VersionDistribution[] {
    const byVersion = new Map<string, { clusters: number; rows: number }>();
    rows.forEach(row => {
        const version = row[key];
        const current = byVersion.get(version) ?? { clusters: 0, rows: 0 };
        byVersion.set(version, { clusters: current.clusters + row.clusters, rows: current.rows + 1 });
    });
    return [...byVersion.entries()]
        .map(([version, value]) => ({ version, ...value, data: versionData(version) }))
        .sort((a, b) => versionSort(a.version, b.version));
}
function formatDistribution(rows: VersionDistribution[]) {
    return rows.map(row => `${row.version} (${row.clusters} cluster${row.clusters !== 1 ? 's' : ''})`).join(' / ');
}
const EXTENDED_SUPPORT_RATE = EXTENDED_SUPPORT_HOURLY_RATE;
const COST_SCENARIOS: Record<CostScenarioId, { label: string; months: number }> = {
    accelerate: { label: 'Accelerate', months: 1 },
    bridge: { label: 'Bridge', months: 3 },
    defer: { label: 'Defer', months: 6 },
};
type AddonGateStatus = 'passed' | 'warning' | 'blocked';
const ADDON_STATUS_LABEL: Record<AddonGateStatus, string> = {
    passed: 'Passed',
    warning: 'Warning',
    blocked: 'Blocked',
};
function addonStatus(addon: Addon): AddonGateStatus {
    if (addon.gates.some(gate => gate.status === 'blocked')) {
        return 'blocked';
    }
    if (addon.gates.some(gate => gate.status === 'warning')) {
        return 'warning';
    }
    return 'passed';
}
const ADDON_STATUS_ROWS = ADDONS.map(addon => {
    const status = addonStatus(addon);
    const openGates = addon.gates.filter(gate => gate.status !== 'passed');
    return { addon, status, openGates };
});
const ADDON_COUNTS = ADDON_STATUS_ROWS.reduce<Record<AddonGateStatus, number>>((counts, row) => {
    counts[row.status] += 1;
    return counts;
}, { passed: 0, warning: 0, blocked: 0 });
const ADDON_OPEN_GATE_COUNT = ADDON_STATUS_ROWS.reduce((sum, row) => sum + row.openGates.length, 0);
const ADDON_SUMMARY = `${ADDON_COUNTS.passed} passed / ${ADDON_COUNTS.warning} warning / ${ADDON_COUNTS.blocked} blocked`;
const ADDON_GATE_STATUS: GateStatus = ADDON_COUNTS.blocked > 0 ? 'blocked'
    : ADDON_COUNTS.warning > 0 ? 'warning'
        : 'passed';
function buildAddonValidationContext(checklistState: AddonChecklistState, targetVersion: string): AddonValidationContext {
    const totals = ADDONS.reduce((acc, addon) => {
        const progress = addonChecklistProgress(checklistState, addon.id, addon.validationChecklist.length);
        return {
            checkedCount: acc.checkedCount + progress.checkedCount,
            total: acc.total + progress.total,
        };
    }, { checkedCount: 0, total: 0 });
    const complete = totals.total > 0 && totals.checkedCount >= totals.total;
    const staleCount = ADDONS.filter(addon => addonEvidenceIsStale(checklistState, addon.id, targetVersion, dataFreshness.checkedAt)).length;
    const gateStatus: GateStatus = ADDON_GATE_STATUS === 'blocked' ? 'blocked'
        : ADDON_GATE_STATUS === 'warning' || !complete || staleCount > 0 ? 'warning'
            : 'passed';
    const rowsMd = ADDON_STATUS_ROWS.map(row => {
        const progress = addonChecklistProgress(checklistState, row.addon.id, row.addon.validationChecklist.length);
        const stale = addonEvidenceIsStale(checklistState, row.addon.id, targetVersion, dataFreshness.checkedAt);
        const meta = addonEvidenceMeta(checklistState, row.addon.id);
        const openGateText = row.openGates.length
            ? ` - ${row.openGates.map(gate => gate.label).join('; ')}`
            : '';
        const staleText = stale ? ` · stale evidence${meta ? ` (${meta})` : ''}` : '';
        return `- ${row.addon.name.padEnd(32)} : ${ADDON_STATUS_LABEL[row.status]} · validation ${progress.checkedCount}/${progress.total}${staleText}${openGateText}`;
    }).join('\n');

    return {
        rowsMd,
        checkedCount: totals.checkedCount,
        total: totals.total,
        staleCount,
        complete,
        gateStatus,
        detail: `${ADDON_SUMMARY}; validation ${totals.checkedCount}/${totals.total}${staleCount > 0 ? `; ${staleCount} stale` : ''}`,
    };
}
function buildPacketContext(fleetRows: PlannerFleetRow[], costScenarioId: CostScenarioId): PacketContext {
    const sourceDistribution = distributionFor(fleetRows, 'from');
    const targetDistribution = distributionFor(fleetRows, 'to');
    const extendedClusterCount = fleetRows
        .filter(row => ['extended', 'eol'].includes(versionData(row.from).status))
        .reduce((sum, row) => sum + row.clusters, 0);
    const costScenario = COST_SCENARIOS[costScenarioId];
    const costExposure = calculateFleetExtendedSupportFees(fleetRows, costScenario.months);
    const highestRiskSource = [...sourceDistribution].sort((a, b) => {
        const risk = STATUS_RISK[a.data.status] - STATUS_RISK[b.data.status];
        return risk || a.data.extendedEnd.localeCompare(b.data.extendedEnd);
    })[0];
    const fleetScopeRowsMd = fleetRows.map(row => {
        const source = versionData(row.from);
        return `| ${row.name.padEnd(15)} | ${row.from.padEnd(6)} | ${row.to.padEnd(6)} | ${String(row.clusters).padStart(8)} | ${STATUS_LABEL[source.status].padEnd(11)} | ${source.standardEnd.padEnd(12)} | ${source.extendedEnd.padEnd(12)} |`;
    }).join('\n');
    const lifecycleRowsMd = sourceDistribution.map(row => {
        return `| ${row.version.padEnd(7)} | ${String(row.clusters).padStart(8)} | ${STATUS_LABEL[row.data.status].padEnd(11)} | ${row.data.standardEnd.padEnd(12)} | ${row.data.extendedEnd.padEnd(12)} |`;
    }).join('\n');

    return {
        fleetRows,
        sourceDistribution,
        targetDistribution,
        totalClusters: totalClusters(fleetRows),
        extendedClusterCount,
        billableClusterCount: costExposure.billableClusters,
        billableClusterDays: costExposure.billableClusterDays,
        unsupportedClusterDays: costExposure.unsupportedClusterDays,
        costScenarioLabel: costScenario.label,
        costScenarioMonths: costScenario.months,
        extendedSupportFeesText: costExposure.totalFees.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }),
        sourceVersionText: formatDistribution(sourceDistribution),
        targetVersionText: formatDistribution(targetDistribution),
        lifecycleDetail: highestRiskSource
            ? `${sourceDistribution.length} source versions covered · highest risk EKS ${highestRiskSource.version}`
            : 'No source versions in scope',
        fleetScopeRowsMd,
        lifecycleRowsMd,
    };
}
function scannerGateStatus(evidence: ScannerEvidence, targetVersion: string): GateStatus {
    if (scannerEvidenceIsStale(evidence, targetVersion, dataFreshness.checkedAt))
        return 'blocked';
    if (evidence.status === 'not_scanned' || evidence.status === 'empty_input' || evidence.status === 'scan_error')
        return 'blocked';
    if (evidence.findings.some(finding => finding.severity === 'error'))
        return 'blocked';
    if (evidence.findings.length > 0)
        return 'warning';
    return 'passed';
}
function scannerGateDetail(evidence: ScannerEvidence, targetVersion: string) {
    if (scannerEvidenceIsStale(evidence, targetVersion, dataFreshness.checkedAt))
        return `Stale scan - captured for EKS ${evidence.targetVersion ?? 'unknown'}, current packet target EKS ${targetVersion}`;
    return evidence.findings.length > 0 ? `${scannerSummary(evidence.findings)} · unresolved` : scannerEvidenceSummary(evidence);
}
function scannerEvidenceMd(evidence: ScannerEvidence, targetVersion: string) {
    const meta = scannerEvidenceMeta(evidence);
    if (scannerEvidenceIsStale(evidence, targetVersion, dataFreshness.checkedAt))
        return `- Stale scanner evidence${meta ? ` (${meta})` : ''}.\n- Current packet target: EKS ${targetVersion}.\n- Current rule snapshot: ${dataFreshness.checkedAt}.\n- Re-scan manifests before approval.`;
    if (evidence.status === 'not_scanned')
        return '- No manifest has been scanned. Run the Scanner page by pasting Kubernetes manifests and clicking Scan manifest, or import kubent/Pluto output.';
    if (evidence.status === 'empty_input')
        return `- Empty manifest scanned${meta ? ` (${meta})` : ''}. No approval evidence captured.`;
    if (evidence.status === 'scan_error')
        return `- Scanner failed${meta ? ` (${meta})` : ''}: ${evidence.errorMessage ?? 'Unknown error'}`;
    if (evidence.findings.length === 0)
        return `- Clean non-empty manifest scan${meta ? ` (${meta})` : ''}. No deprecated or removed API findings in the selected static rules.`;
    return [
        `Scanner result: ${scannerEvidenceSummary(evidence)}${meta ? ` (${meta})` : ''}`,
        ...evidence.findings.map(finding => `- ${finding.apiVersion} / ${finding.kind}\n  ${finding.removedIn.toUpperCase()} -> Replace with ${finding.replacement}\n  Source: ${finding.sourceUrl}`),
    ].join('\n');
}
function buildGates(scannerEvidence: ScannerEvidence, context: PacketContext, addonValidation: AddonValidationContext, maintenance: MaintenanceWindow, scannerTargetVersion: string): Gate[] {
    const apiStatus = scannerGateStatus(scannerEvidence, scannerTargetVersion);
    return [
        { id: 'lifecycle', label: 'Lifecycle citations', status: 'passed', detail: context.lifecycleDetail, actionScreen: 'lifecycle', actionLabel: 'Open' },
        { id: 'scenario', label: 'Selected cost scenario', status: 'passed', detail: `${context.costScenarioLabel} scenario · ${context.billableClusterCount}/${context.totalClusters} clusters enter a billable window`, actionScreen: 'cost', actionLabel: 'Open' },
        { id: 'api', label: 'Deprecated API scan evidence', status: apiStatus, detail: apiStatus === 'blocked' && scannerEvidence.status === 'not_scanned' ? 'Run on Scanner: paste manifests and click Scan manifest, or import kubent/Pluto output.' : scannerGateDetail(scannerEvidence, scannerTargetVersion), actionScreen: 'scanner', actionLabel: apiStatus === 'passed' ? 'View' : 'Run scan' },
        { id: 'addons', label: 'Add-on readiness', status: addonValidation.gateStatus, detail: addonValidation.detail, actionScreen: 'addons', actionLabel: addonValidation.gateStatus === 'passed' ? 'View' : 'Review' },
        { id: 'maintenance', label: 'Maintenance window', status: maintenanceGateStatus(maintenance), detail: maintenanceGateDetail(maintenance) },
        { id: 'fleet', label: 'Fleet context', status: 'passed', detail: `${context.fleetRows.length} scope rows · ${context.totalClusters} clusters defined`, actionScreen: 'overview', actionLabel: 'Edit' },
    ];
}
function summaryRows(nodeModel: NodeModelId, scannerEvidence: ScannerEvidence, context: PacketContext, addonValidation: AddonValidationContext, maintenance: MaintenanceWindow, scannerTargetVersion: string, executionState: ExecutionState): SummaryRow[] {
    const scannerStatus = scannerGateStatus(scannerEvidence, scannerTargetVersion);
    const execution = executionProgress(executionState);
    return [
        { label: 'Source EKS versions', value: context.sourceVersionText, mono: true },
        { label: 'Target EKS versions', value: context.targetVersionText, mono: true, tone: 'text-primary' },
        { label: 'Total clusters', value: String(context.totalClusters), mono: true },
        { label: 'Clusters on extended/EOL lines', value: String(context.extendedClusterCount), mono: true, tone: 'text-warning' },
        { label: 'Billable cluster-days', value: context.billableClusterDays.toLocaleString(), mono: true, tone: context.billableClusterDays > 0 ? 'text-danger' : 'text-success', actionScreen: 'cost', actionLabel: 'Cost' },
        { label: 'Scanner evidence', value: scannerEvidenceSummary(scannerEvidence), tone: scannerStatus === 'passed' ? 'text-success' : scannerStatus === 'blocked' ? 'text-danger' : 'text-warning', actionScreen: 'scanner', actionLabel: scannerStatus === 'passed' ? 'View' : 'Run scan' },
        { label: 'Scanner target', value: scannerEvidenceIsStale(scannerEvidence, scannerTargetVersion, dataFreshness.checkedAt) ? `Stale - re-scan for EKS ${scannerTargetVersion}` : `EKS ${scannerTargetVersion}`, tone: scannerStatus === 'blocked' ? 'text-danger' : 'text-muted-foreground', actionScreen: 'scanner', actionLabel: scannerStatus === 'passed' ? 'View' : 'Re-scan' },
        { label: 'Add-on readiness', value: addonValidation.detail, tone: addonValidation.gateStatus === 'blocked' ? 'text-danger' : addonValidation.gateStatus === 'passed' ? 'text-success' : 'text-warning', actionScreen: 'addons', actionLabel: 'Review' },
        { label: 'Add-on validation', value: `${addonValidation.checkedCount}/${addonValidation.total}`, mono: true, tone: addonValidation.complete ? 'text-success' : 'text-warning', actionScreen: 'addons', actionLabel: 'Review' },
        { label: 'Maintenance window', value: maintenance.status === 'approved' ? 'Approved' : maintenance.status === 'scheduled' ? 'Scheduled - needs approval' : 'Missing', tone: maintenance.status === 'approved' ? 'text-success' : 'text-danger' },
        { label: 'Cost scenario', value: `${context.costScenarioLabel} (${context.costScenarioMonths} months)`, actionScreen: 'cost', actionLabel: 'Cost' },
        { label: 'Node model', value: NODE_MODELS[nodeModel].packetLabel, actionScreen: 'plan', actionLabel: 'Plan' },
        { label: 'Execution tracker', value: `${execution.done}/${execution.total} done · ${execution.running} running · ${execution.blocked} blocked`, tone: execution.blocked > 0 ? 'text-danger' : execution.running > 0 ? 'text-info' : execution.complete ? 'text-success' : 'text-muted-foreground', actionScreen: 'plan', actionLabel: 'Plan' },
        { label: 'Fleet rows', value: String(context.fleetRows.length), mono: true, actionScreen: 'overview', actionLabel: 'Edit' },
    ];
}
function buildPacket(nodeModel: NodeModelId, scannerEvidence: ScannerEvidence, context: PacketContext, addonValidation: AddonValidationContext, maintenance: MaintenanceWindow, approvalStatusMd: string, scannerTargetVersion: string, executionState: ExecutionState) {
    const model = NODE_MODELS[nodeModel];
    const scannerOpenCount = scannerEvidence.findings.length;
    const apiResolved = scannerGateStatus(scannerEvidence, scannerTargetVersion) === 'passed';
    const maintenanceApproved = maintenanceGateStatus(maintenance) === 'passed';
    return `# EKS Upgrade Change Packet
Generated : ${new Date().toISOString().slice(0, 10)}
Tool      : EKS Upgrade Planner (browser-local, no AWS API calls)

## Scope
Source versions: ${context.sourceVersionText}
Target versions: ${context.targetVersionText}
Clusters       : ${context.totalClusters} total
Node model     : ${model.packetLabel}

## Node execution model
${model.summary}
${model.bullets.map(bullet => `- ${bullet}`).join('\n')}

## Execution tracker
${executionMarkdown(executionState)}

## Execution history
${executionHistoryMarkdown(executionState)}

## Fleet scope
| Group           | Source | Target | Clusters | Status      | Standard end | Extended end |
|-----------------|--------|--------|----------|-------------|--------------|--------------|
${context.fleetScopeRowsMd}

## Lifecycle citations by source version
| Version | Clusters | Status      | Standard end | Extended end |
|---------|----------|-------------|--------------|--------------|
${context.lifecycleRowsMd}
Source: https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html

## Cost scenario: ${context.costScenarioLabel} (${context.costScenarioMonths} months)
Clusters currently on extended/EOL lines : ${context.extendedClusterCount}
Clusters entering billable window     : ${context.billableClusterCount}
Billable cluster-days                  : ${context.billableClusterDays}
Unsupported cluster-days after extended support : ${context.unsupportedClusterDays}
Rate                          : $${EXTENDED_SUPPORT_RATE.toFixed(2)}/cluster/hour
Modeled months                : ${context.costScenarioMonths}
Total extended support fees    : ${context.extendedSupportFeesText}
Source: https://aws.amazon.com/eks/pricing/

## API evidence (scanner)
${scannerEvidenceMd(scannerEvidence, scannerTargetVersion)}

## Add-on readiness
Target: EKS ${scannerTargetVersion}
Data snapshot: ${dataFreshness.checkedAt}
${addonValidation.rowsMd}

## Maintenance window
${maintenanceMd(maintenance)}

## Gates
[x] Lifecycle citation sourced
[x] Fleet scope defined
[x] Cost scenario selected
[${apiResolved ? 'x' : ' '}] API evidence accepted (${scannerOpenCount} open)
[${addonValidation.gateStatus === 'passed' ? 'x' : ' '}] Add-on readiness complete (${ADDON_OPEN_GATE_COUNT} open checks, ${addonValidation.checkedCount}/${addonValidation.total} validation checks${addonValidation.staleCount > 0 ? `, ${addonValidation.staleCount} stale evidence` : ''})
[${maintenanceApproved ? 'x' : ' '}] Maintenance window approved

## Approval status
${approvalStatusMd}

## Limitations
All lifecycle dates, pricing, and deprecation data sourced from public
AWS/k8s documentation checked ${dataCheckedDate}. Verify before production use.
Cost estimates use actual billable days in the modeled window and a 24-hour UTC billing day.

## References
- https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html
- https://aws.amazon.com/eks/pricing/
- https://docs.aws.amazon.com/eks/latest/userguide/update-cluster.html
- https://kubernetes.io/docs/reference/using-api/deprecation-guide/`;
}
function buildExportTargets(packet: string, context: PacketContext, packetStatus: PacketStatus, approvalStatusMd: string) {
    const summary = `EKS fleet upgrade: ${context.sourceVersionText} to ${context.targetVersionText}`;
    const labels = {
        jira: 'Jira',
        servicenow: 'ServiceNow',
        github: 'GitHub PR',
        confluence: 'Confluence',
    };
    return [
        {
            id: 'jira',
            label: labels.jira,
            title: 'Copy Jira ticket',
            text: `Summary: ${summary}

Issue type: Change
Status: ${PACKET_STATUS_LABEL[packetStatus]}
Clusters: ${context.totalClusters}
Extended support estimate: ${context.extendedSupportFeesText}

Description:
${approvalStatusMd}

${packet}`,
        },
        {
            id: 'servicenow',
            label: labels.servicenow,
            title: 'Copy ServiceNow change',
            text: `Short description: ${summary}
Category: Infrastructure
Risk: Moderate
Assignment group: Platform Engineering
Approval state: ${PACKET_STATUS_LABEL[packetStatus]}
Planned impact: ${context.totalClusters} EKS cluster${context.totalClusters !== 1 ? 's' : ''}

Implementation plan:
${packet}

Backout plan:
Pause upgrade hops, keep previous node groups available, and follow rollback owner instructions from the packet.`,
        },
        {
            id: 'github',
            label: labels.github,
            title: 'Copy GitHub PR body',
            text: `## Change
${summary}

## Approval State
${approvalStatusMd}

## Validation
- [ ] Scanner evidence attached
- [ ] Add-on readiness reviewed
- [ ] Maintenance window approved
- [ ] Rollback owner confirmed

${packet}`,
        },
        {
            id: 'confluence',
            label: labels.confluence,
            title: 'Copy Confluence page',
            text: `${summary}

Status: ${PACKET_STATUS_LABEL[packetStatus]}
Audience: Platform Engineering, SRE, Change Approval Board

${packet}`,
        },
    ];
}
const GATE_ICON = {
    passed: <CheckCircle2 size={15} className="text-success"/>,
    warning: <AlertTriangle size={15} className="text-warning"/>,
    blocked: <XCircle size={15} className="text-danger"/>,
    queued: <Circle size={15} className="text-muted-foreground"/>,
};
const PACKET_STATUS_LABEL: Record<PacketStatus, string> = {
    draft: 'Draft packet',
    blocked: 'Blocked packet',
    waiver_recorded: 'Waiver recorded - approver review required',
    approval_ready_with_waiver: 'Approval-ready with accepted waiver',
    approval_ready: 'Approval-ready packet',
};
const PACKET_STATUS_VARIANT: Record<PacketStatus, 'passed' | 'warning' | 'blocked' | 'queued'> = {
    draft: 'warning',
    blocked: 'blocked',
    waiver_recorded: 'warning',
    approval_ready_with_waiver: 'warning',
    approval_ready: 'passed',
};
export function PacketScreen({ onNavigate = () => undefined }: {
    onNavigate?: (s: string) => void;
}) {
    const [nodeModel] = useState<NodeModelId>(storedNodeModel);
    const [planner] = useState(readPlannerState);
    const [scannerEvidence] = useState<ScannerEvidence>(readStoredScannerEvidence);
    const [addonChecklistState] = useState<AddonChecklistState>(readAddonChecklistState);
    const [executionState] = useState<ExecutionState>(readExecutionState);
    const [packetState, setPacketState] = useState<PacketState>(readPacketState);
    const { maintenance, waiver } = packetState;
    const context = buildPacketContext(planner.fleetRows, planner.costScenarioId);
    const scannerTargetVersion = highestTargetVersion(planner.fleetRows);
    const addonValidation = buildAddonValidationContext(addonChecklistState, scannerTargetVersion);
    const gates = buildGates(scannerEvidence, context, addonValidation, maintenance, scannerTargetVersion);
    const blockingGates = gates.filter(g => g.status === 'blocked');
    const hasWaiver = blockingGates.length > 0 && waiverIsRecorded(waiver);
    const acceptedWaiver = blockingGates.length > 0 && waiverIsAccepted(waiver);
    const packetStatus: PacketStatus = blockingGates.length > 0
        ? acceptedWaiver ? 'approval_ready_with_waiver' : hasWaiver ? 'waiver_recorded' : 'blocked'
        : gates.every(gate => gate.status === 'passed') ? 'approval_ready' : 'draft';
    const approvalReady = packetStatus === 'approval_ready' || packetStatus === 'approval_ready_with_waiver';
    const approvalStatusMd = packetStatus === 'approval_ready'
        ? 'Status: Approval-ready\nAll required gates are passed.'
        : packetStatus === 'approval_ready_with_waiver'
            ? `Status: Approval-ready with accepted waiver\nWaiver owner: ${waiver.owner.trim()}\nWaiver approver: ${waiver.approver.trim()}\nWaiver accepted: ${waiverAcceptedDate(waiver)}\nWaiver reason: ${waiver.reason.trim()}\nAccepted blockers: ${blockingGates.map(gate => gate.label).join(', ')}`
            : packetStatus === 'waiver_recorded'
                ? `Status: Waiver recorded - approver review required\nWaiver owner: ${waiver.owner.trim()}\nWaiver reason: ${waiver.reason.trim()}\nBlockers requiring approver review: ${blockingGates.map(gate => gate.label).join(', ')}`
                : packetStatus === 'blocked'
                    ? `Status: Blocked\nUnwaived blockers: ${blockingGates.map(gate => gate.label).join(', ')}`
                    : 'Status: Draft\nWarnings or queued gates remain open.';
    const packet = buildPacket(nodeModel, scannerEvidence, context, addonValidation, maintenance, approvalStatusMd, scannerTargetVersion, executionState);
    const exportTargets = buildExportTargets(packet, context, packetStatus, approvalStatusMd);
    const summary = summaryRows(nodeModel, scannerEvidence, context, addonValidation, maintenance, scannerTargetVersion, executionState);
    const passed = gates.filter(g => g.status === 'passed').length;
    const firstBlockingAction = blockingGates.find(gate => gate.actionScreen);
    const updateMaintenance = <K extends keyof MaintenanceWindow>(key: K, value: MaintenanceWindow[K]) => {
        setPacketState(current => {
            const next = { ...current, maintenance: { ...current.maintenance, [key]: value } };
            writePacketState(next);
            return next;
        });
    };
    const updateWaiver = <K extends keyof WaiverState>(key: K, value: WaiverState[K]) => {
        setPacketState(current => {
            const nextWaiver = { ...current.waiver, [key]: value };
            if ((key === 'owner' || key === 'reason' || key === 'approver') && !waiverIsAccepted(nextWaiver)) {
                nextWaiver.accepted = false;
                nextWaiver.acceptedAt = null;
            }
            const next = { ...current, waiver: nextWaiver };
            writePacketState(next);
            return next;
        });
    };
    const toggleWaiverAcceptance = (accepted: boolean) => {
        setPacketState(current => {
            const next = {
                ...current,
                waiver: {
                    ...current.waiver,
                    accepted,
                    acceptedAt: accepted ? current.waiver.acceptedAt ?? new Date().toISOString() : null,
                },
            };
            writePacketState(next);
            return next;
        });
    };
    return (<div className="p-5 space-y-5 w-full">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-eks-teal-bg text-primary">
            <Shield size={16}/>
          </div>
          <div>
            <h2 className="text-[13px] font-semibold">Change packet</h2>
            <p className="text-[11px] text-muted-foreground">Evidence assembly for change approvals</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill variant={PACKET_STATUS_VARIANT[packetStatus]} size="sm" label={PACKET_STATUS_LABEL[packetStatus]}/>
          <button onClick={() => window.print()} className="no-print flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary">
            <Printer size={13}/>
            Print
          </button>
          <DownloadButton text={packet} filename={safeArtifactName('eks-change-packet', 'md')} label="Download packet" size="md"/>
          <CopyButton text={packet} label={approvalReady ? 'Copy packet' : 'Copy draft'} size="md"/>
        </div>
      </div>

      {blockingGates.length > 0 && (<div className="rounded-xl border border-danger-border bg-danger-bg p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[12px] font-semibold text-danger">{acceptedWaiver ? 'Approval uses accepted waiver' : 'Approval is blocked'}</p>
            <p className="mt-1 text-[11px] text-foreground">
              {acceptedWaiver
                  ? 'The packet can be copied for approval with waiver acceptance recorded, while the underlying blocked gates remain visible.'
                  : 'Resolve the blocked gates or record a waiver owner, reason, and approver acceptance. A recorded waiver is not an approval until accepted.'}
            </p>
            <p className="mt-2 text-[11px] font-mono text-danger">
              {blockingGates.map(gate => gate.label).join(' · ')}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {firstBlockingAction?.actionScreen && (<button type="button" onClick={() => onNavigate(firstBlockingAction.actionScreen!)} aria-label={`${firstBlockingAction.actionLabel ?? 'Open'} ${firstBlockingAction.label}`} className="rounded-lg border border-danger-border bg-card px-3 py-1.5 text-[11px] font-semibold text-danger transition-colors hover:bg-danger-bg focus:outline-none focus:ring-1 focus:ring-danger">
              {firstBlockingAction.actionLabel ?? 'Open'}
            </button>)}
            <StatusPill variant={acceptedWaiver ? 'warning' : hasWaiver ? 'warning' : 'blocked'} size="xs" label={acceptedWaiver ? 'Accepted waiver' : hasWaiver ? 'Waiver recorded - review required' : 'Blocked'}/>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr_180px]">
          <label className="block text-[11px] font-semibold text-foreground">
            Waiver owner
            <input value={waiver.owner} onChange={event => updateWaiver('owner', event.target.value)} placeholder="name or team" className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-danger"/>
          </label>
          <label className="block text-[11px] font-semibold text-foreground">
            Waiver reason
            <input value={waiver.reason} onChange={event => updateWaiver('reason', event.target.value)} placeholder="risk accepted until..." className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-danger"/>
          </label>
          <label className="block text-[11px] font-semibold text-foreground">
            Approver
            <input value={waiver.approver} onChange={event => updateWaiver('approver', event.target.value)} placeholder="approval owner" className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-danger"/>
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 rounded-lg border border-danger-border bg-card/70 px-3 py-2 text-[11px] font-semibold text-foreground">
          <input type="checkbox" checked={waiver.accepted} onChange={event => toggleWaiverAcceptance(event.target.checked)} disabled={!hasWaiver || waiver.approver.trim().length === 0} className="h-3.5 w-3.5 accent-primary disabled:opacity-50"/>
          Approver accepted this waiver
          {waiver.acceptedAt && <span className="ml-auto font-mono text-[10px] text-muted-foreground">{waiverAcceptedDate(waiver)}</span>}
        </label>
      </div>)}

      <div className="print-packet rounded-xl overflow-hidden card-shadow">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <p className="text-[12px] font-semibold">Maintenance window</p>
          <StatusPill variant={maintenanceGateStatus(maintenance)} size="xs" label={maintenanceStatusLabel(maintenance)}/>
        </div>
        <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-3">
          <label className="block text-[11px] font-semibold">
            Start
            <input type="datetime-local" value={maintenance.start} onChange={event => updateMaintenance('start', event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"/>
          </label>
          <label className="block text-[11px] font-semibold">
            End
            <input type="datetime-local" value={maintenance.end} onChange={event => updateMaintenance('end', event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"/>
          </label>
          <label className="block text-[11px] font-semibold">
            Status
            <select value={maintenance.status} onChange={event => updateMaintenance('status', event.target.value as MaintenanceWindow['status'])} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="missing">Missing</option>
              <option value="scheduled">Scheduled - needs approval</option>
              <option value="approved">Approved</option>
            </select>
          </label>
          <label className="block text-[11px] font-semibold">
            Timezone
            <input value={maintenance.timezone} onChange={event => updateMaintenance('timezone', event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"/>
          </label>
          <label className="block text-[11px] font-semibold">
            Change owner
            <input value={maintenance.changeOwner} onChange={event => updateMaintenance('changeOwner', event.target.value)} placeholder="team or person" className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"/>
          </label>
          <label className="block text-[11px] font-semibold">
            Approver
            <input value={maintenance.approver} onChange={event => updateMaintenance('approver', event.target.value)} placeholder="change approver" className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"/>
          </label>
          <label className="block text-[11px] font-semibold">
            Rollback owner
            <input value={maintenance.rollbackOwner} onChange={event => updateMaintenance('rollbackOwner', event.target.value)} placeholder="rollback lead" className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"/>
          </label>
          <label className="block text-[11px] font-semibold">
            Comms channel
            <input value={maintenance.commsChannel} onChange={event => updateMaintenance('commsChannel', event.target.value)} placeholder="#platform-changes" className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"/>
          </label>
          <label className="block text-[11px] font-semibold">
            Impacted services
            <input value={maintenance.impactedServices} onChange={event => updateMaintenance('impactedServices', event.target.value)} placeholder="payments-api, shared ingress" className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"/>
          </label>
        </div>
      </div>

      {/* Gates */}
      <div className="rounded-xl overflow-hidden card-shadow">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <p className="text-[12px] font-semibold">Evidence gates</p>
          <span className="font-mono text-[11px]">{passed}/{gates.length} passed</span>
        </div>
        <div className="divide-y">
          {gates.map(g => (<div key={g.id} className="flex items-center gap-3.5 px-5 py-3.5">
              {GATE_ICON[g.status]}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold">{g.label}</p>
                <p className="text-[11px] mt-0.5 text-muted-foreground">{g.detail}</p>
              </div>
              {g.actionScreen && (<button type="button" onClick={() => onNavigate(g.actionScreen!)} aria-label={`${g.actionLabel ?? 'Open'} ${g.label}`} className="shrink-0 rounded border border-border bg-card px-2 py-1 text-[10px] font-semibold text-primary transition-colors hover:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
                {g.actionLabel ?? 'Open'}
              </button>)}
              <StatusPill variant={g.status} size="xs" showIcon={false}/>
            </div>))}
        </div>
      </div>

      {/* Summary grid */}
      <div className="rounded-xl overflow-hidden card-shadow">
        <div className="px-5 py-3 border-b text-[12px] font-semibold">
          Summary grid
        </div>
        <div tabIndex={0} aria-label="Packet summary table" className="overflow-x-auto focus:outline-none focus:ring-1 focus:ring-primary">
          <table className="w-full">
            <tbody>
              {summary.map((row, i) => (<tr key={i} className="border-b transition-colors">
                  <td className="px-5 py-3 text-[12px] w-60 text-muted-foreground">{row.label}</td>
                  <td className="px-5 py-3 text-[12px]">
                    <div className="flex min-w-[220px] items-center justify-between gap-3">
                      <span className={`font-semibold ${row.mono ? 'font-mono' : ''} ${row.tone ?? 'text-foreground'}`}>{row.value}</span>
                      {row.actionScreen && (<button type="button" onClick={() => onNavigate(row.actionScreen!)} aria-label={`${row.actionLabel ?? 'Open'} ${row.label}`} className="shrink-0 rounded border border-border bg-card px-2 py-1 text-[10px] font-semibold text-primary transition-colors hover:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
                        {row.actionLabel ?? 'Open'}
                      </button>)}
                    </div>
                  </td>
                </tr>))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Version mix */}
      <div className="rounded-xl overflow-hidden card-shadow">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div>
            <p className="text-[12px] font-semibold">Source version mix</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Packet evidence covers each source EKS version in the mixed fleet.
            </p>
          </div>
          <StatusPill variant={context.sourceDistribution.length > 1 ? 'info' : 'passed'} size="xs" label={context.sourceDistribution.length > 1 ? 'Mixed fleet' : 'Single version'}/>
        </div>
        <div tabIndex={0} aria-label="Source version mix table" className="overflow-x-auto focus:outline-none focus:ring-1 focus:ring-primary">
          <table className="w-full">
            <thead>
              <tr>
                {['Source', 'Clusters', 'Rows', 'Status', 'Standard end', 'Extended end'].map(h => (<th key={h} className="text-left px-5 py-2.5 text-[11px] font-semibold whitespace-nowrap">
                  {h}
                </th>))}
              </tr>
            </thead>
            <tbody>
              {context.sourceDistribution.map(row => (<tr key={row.version} className="border-t">
                <td className="px-5 py-3 font-mono text-[12px] font-semibold">EKS {row.version}</td>
                <td className="px-5 py-3 font-mono text-[12px]">{row.clusters}</td>
                <td className="px-5 py-3 font-mono text-[12px]">{row.rows}</td>
                <td className="px-5 py-3">
                  <StatusPill variant={row.data.status} label={STATUS_LABEL[row.data.status]} size="xs"/>
                </td>
                <td className="px-5 py-3 font-mono text-[12px] text-muted-foreground">{row.data.standardEnd}</td>
                <td className="px-5 py-3 font-mono text-[12px] text-muted-foreground">{row.data.extendedEnd}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Limitations */}
      <div className="rounded-xl p-5 bg-warning-bg border border-warning-border">
        <p className="text-[12px] font-semibold mb-3 text-warning">Limitations &amp; attestation</p>
        <ul className="space-y-2 text-[12px] text-foreground">
          {[
            'Generated by a browser-local tool — no live AWS API access, no manifest upload.',
            `All lifecycle dates, pricing, and deprecation data sourced from public documentation checked ${dataCheckedDate}.`,
            'Cost estimates use actual billable days in the modeled window and a 24-hour UTC billing day. Actual billing may vary.',
            'Verify all findings against official AWS documentation before production change approvals.',
        ].map((n, i) => (<li key={i} className="flex items-start gap-2.5">
              <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-warning"/>
              {n}
            </li>))}
        </ul>
      </div>

      {/* Export templates */}
      <div className="rounded-xl overflow-hidden card-shadow">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b flex-wrap">
          <div>
            <p className="text-[12px] font-semibold">Export templates</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Copies formatted text only; no external ticket or page is created.</p>
          </div>
          <StatusPill variant="info" size="xs" label="Local copy"/>
        </div>
        <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-4">
          {exportTargets.map(target => (<div key={target.id} className="rounded-lg border border-border bg-card p-3">
            <p className="text-[12px] font-semibold">{target.label}</p>
            <p className="mt-1 min-h-8 text-[11px] leading-relaxed text-muted-foreground">{target.title.replace('Copy ', '')} template for review handoff.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyButton text={target.text} label={target.title} size="sm"/>
              <DownloadButton text={target.text} filename={safeArtifactName(`eks-${target.id}-handoff`, 'md')} label="Download" size="sm"/>
            </div>
          </div>))}
        </div>
      </div>

      {/* Copyable packet */}
      <div className="rounded-xl overflow-hidden card-shadow">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <p className="text-[12px] font-semibold">Copyable change packet</p>
          <CopyButton text={packet} label="Copy markdown" size="sm"/>
        </div>
        <pre tabIndex={0} className="p-5 text-[11px] font-mono whitespace-pre overflow-x-auto max-h-96 focus:outline-none focus:ring-1 focus:ring-primary">
          {packet}
        </pre>
        <div className="px-5 py-3 border-t flex items-center gap-2 text-[11px] bg-muted text-muted-foreground">
          <ExternalLink size={11}/>
          Paste into Confluence, Jira, GitHub PR description, or ServiceNow change record
        </div>
      </div>
    </div>);
}

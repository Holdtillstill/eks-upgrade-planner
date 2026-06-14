import { useEffect, useState } from 'react';
import { Plus, Trash2, ArrowRight, ExternalLink, ChevronRight, AlertTriangle, Upload, RotateCcw, Database, FileJson } from 'lucide-react';
import { StatusPill } from '../ui/StatusPill';
import { MetricTile } from '../ui/MetricTile';
import { GateRow, type GateStatus } from '../ui/RiskGate';
import { CopyButton } from '../ui/CopyButton';
import { DownloadButton } from '../ui/DownloadButton';
import { ADDONS, calculateFleetExtendedSupportFees, EKS_VERSIONS, formatDaysUntilIsoDate, getEksVersion, nearestEksDeadline } from '../../data/eks-data';
import {
    ALL_EKS_VERSIONS as ALL_HOPS,
    DEFAULT_PLANNER_STATE,
    PACKET_STEPS,
    PLANNER_STATE_STORAGE_KEY,
    readPlannerState,
    targetOptionsFor,
    totalClusters as sumClusters,
    versionHopCount,
    writePlannerState,
    highestTargetVersion,
    type PacketStepId,
    type PlannerFleetRow,
} from '../../../lib/planner-state';
import { DEFAULT_SCANNER_EVIDENCE, SCANNER_EVIDENCE_STORAGE_KEY, SCANNER_FINDINGS_STORAGE_KEY, readStoredScannerEvidence, scannerEvidenceIsStale, scannerEvidenceSummary, scannerSummary, type ScannerEvidence } from '../../../lib/scanner-state';
import { DEFAULT_PACKET_STATE, maintenanceGateDetail, maintenanceGateStatus, PACKET_STATE_STORAGE_KEY, readPacketState, type PacketState } from '../../../lib/packet-state';
import { ADDON_CHECKLIST_STORAGE_KEY, addonChecklistProgress, addonEvidenceIsStale, readAddonChecklistState, type AddonChecklistState } from '../../../lib/addon-state';
import { EXECUTION_STATE_STORAGE_KEY, NODE_MODEL_STORAGE_KEY } from '../../../lib/execution-state';
import { fleetToCsv, fleetToJson, parseFleetImport, type FleetImportResult } from '../../../lib/fleet-tools';
import { applyWorkspaceSnapshot, buildSampleWorkspaceSnapshot, parseWorkspaceSnapshot, workspaceSnapshotToJson } from '../../../lib/workspace-state';
import { dataFreshness } from '../../../data/versions';
import { safeArtifactName } from '../../../lib/download';
/* ─────────────────────────────────────────────────────────────
   Upgrade path — version chip pipeline
   ───────────────────────────────────────────────────────────── */
type ChipRole = 'current' | 'hop' | 'target' | 'outside';
const INVENTORY_IMPORT_COMMANDS = [
    {
        label: 'Describe one cluster',
        command: 'aws eks describe-cluster --name <cluster-name> --region <region> --output json',
    },
    {
        label: 'Batch describe names',
        command: 'for c in $(aws eks list-clusters --region <region> --query "clusters[]" --output text); do aws eks describe-cluster --name "$c" --region <region> --output json; done',
    },
    {
        label: 'Kubectl context',
        command: 'kubectl version --short',
    },
];
function VersionChip({ version, role }: {
    version: string;
    role: ChipRole;
}) {
    if (role === 'outside')
        return null;
    const isCurrent = role === 'current';
    const isTarget = role === 'target';
    const tone = isCurrent
        ? 'border-primary bg-primary text-primary-foreground shadow-[0_0_0_3px_rgb(15_118_110_/_15%)]'
        : isTarget
        ? 'border-dashed border-primary bg-card text-primary shadow-[0_0_0_3px_rgb(15_118_110_/_8%)]'
        : 'border-border-solid bg-card text-muted-foreground';
    return (<div className="flex flex-col items-center shrink-0">
      {/* Chip */}
	      <div className={`w-[74px] flex flex-col items-center justify-center rounded-xl border-2 py-2.5 transition-all ${tone}`}>
        <span className="text-[10px] font-semibold uppercase tracking-widest">EKS</span>
        <span className="text-base font-mono font-bold leading-none">{version}</span>
      </div>
      {/* Label */}
      <span className="mt-1.5 text-[10px] font-semibold text-muted-foreground">
        {isCurrent ? 'Current' : isTarget ? 'Target' : '\u00a0'}
      </span>
    </div>);
}
function HopConnector({ active }: { active: boolean }) {
    return (<div className="flex items-center justify-center mt-[-16px]">
      <div className={`w-7 h-0.5 ${active ? 'bg-primary' : 'bg-border-solid'}`}/>
      <ArrowRight size={10} className={active ? 'text-primary' : 'text-muted-foreground'}/>
    </div>);
}
function UpgradePath({ from, to }: {
    from: string;
    to: string;
}) {
    const fromIdx = ALL_HOPS.indexOf(from);
    const toIdx = ALL_HOPS.indexOf(to);
    const visible = fromIdx >= 0 && toIdx >= fromIdx
        ? ALL_HOPS.slice(Math.max(0, fromIdx), toIdx + 1)
        : [from, to];
    return (<div tabIndex={0} className="flex items-start overflow-x-auto pb-2 gap-0 focus:outline-none focus:ring-1 focus:ring-primary" role="list" aria-label="Upgrade hops">
      {visible.map((v, i) => {
            const role: ChipRole = v === from ? 'current' :
                v === to ? 'target' : 'hop';
            const isActive = ALL_HOPS.indexOf(v) <= toIdx && ALL_HOPS.indexOf(v) >= fromIdx;
            return (<div key={v} className="flex items-center shrink-0" role="listitem">
            {i > 0 && <HopConnector active={isActive}/>}
            <VersionChip version={v} role={role}/>
          </div>);
        })}
    </div>);
}
/* ─────────────────────────────────────────────────────────────
   Fleet table
   ───────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────
   Main component
   ───────────────────────────────────────────────────────────── */
export function OverviewScreen({ onNavigate }: {
    onNavigate: (s: string) => void;
}) {
    const initialPlanner = readPlannerState();
    const [delay, setDelay] = useState(initialPlanner.delayMonths);
    const [fleet, setFleet] = useState<PlannerFleetRow[]>(initialPlanner.fleetRows);
    const [activeId, setActiveId] = useState(initialPlanner.activeFleetRowId);
    const [checked, setChecked] = useState<Set<PacketStepId>>(new Set(initialPlanner.completedPacketSteps));
    const [scannerEvidence, setScannerEvidence] = useState<ScannerEvidence>(readStoredScannerEvidence);
    const [packetState, setPacketState] = useState<PacketState>(readPacketState);
    const [addonChecklistState, setAddonChecklistState] = useState<AddonChecklistState>(readAddonChecklistState);
    const [importOpen, setImportOpen] = useState(false);
    const [importText, setImportText] = useState('');
    const [importResult, setImportResult] = useState<FleetImportResult | null>(null);
    const activeRow = fleet.find(r => r.id === activeId) ?? fleet[0];
    const activeVersion = activeRow ? getEksVersion(activeRow.from) : undefined;
    const totalClusters = sumClusters(fleet);
    const extendedVersions = new Set(EKS_VERSIONS.filter(v => ['extended', 'eol'].includes(v.status)).map(v => v.version));
    const extClusters = fleet.filter(r => extendedVersions.has(r.from)).reduce((s, r) => s + r.clusters, 0);
    const scannerFindings = scannerEvidence.findings;
    const scannerOpen = scannerFindings.length;
    const scannerBlocked = scannerFindings.some(finding => finding.severity === 'error');
    const scannerTargetVersion = highestTargetVersion(fleet);
    const staleScannerEvidence = scannerEvidenceIsStale(scannerEvidence, scannerTargetVersion, dataFreshness.checkedAt);
    const addonGateCounts = ADDONS.reduce((counts, addon) => {
        if (addon.gates.some(gate => gate.status === 'blocked')) {
            counts.blocked += 1;
        }
        else if (addon.gates.some(gate => gate.status === 'warning')) {
            counts.warning += 1;
        }
        else {
            counts.passed += 1;
        }
        const progress = addonChecklistProgress(addonChecklistState, addon.id, addon.validationChecklist.length);
        counts.checked += progress.checkedCount;
        counts.total += progress.total;
        if (addonEvidenceIsStale(addonChecklistState, addon.id, scannerTargetVersion, dataFreshness.checkedAt)) {
            counts.stale += 1;
        }
        return counts;
    }, { passed: 0, warning: 0, blocked: 0, checked: 0, total: 0, stale: 0 });
    const addonValidationComplete = addonGateCounts.total > 0 && addonGateCounts.checked >= addonGateCounts.total;
    const addonGateStatus: GateStatus = addonGateCounts.blocked > 0
        ? 'blocked'
        : addonGateCounts.warning > 0 || addonGateCounts.stale > 0 || !addonValidationComplete ? 'warning'
            : 'passed';
    const addonGateDetail = `${addonGateCounts.passed} passed / ${addonGateCounts.warning} warning / ${addonGateCounts.blocked} blocked · validation ${addonGateCounts.checked}/${addonGateCounts.total}${addonGateCounts.stale > 0 ? ` · ${addonGateCounts.stale} stale` : ''}`;
    const scannerGateStatus: GateStatus = staleScannerEvidence || scannerEvidence.status === 'not_scanned' || scannerEvidence.status === 'empty_input' || scannerEvidence.status === 'scan_error'
        ? 'queued'
        : scannerOpen === 0 ? 'passed' : scannerBlocked ? 'blocked' : 'warning';
    const scannerDetail = staleScannerEvidence ? `Stale scan - re-scan for EKS ${scannerTargetVersion}` : scannerEvidenceSummary(scannerEvidence);
    const scannerRunDetail = 'Run on Scanner: paste manifests and click Scan manifest, or import kubent/Pluto output.';
    const feeExposure = calculateFleetExtendedSupportFees(fleet, delay);
    const fmtFees = feeExposure.totalFees.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    const billableClusterDaysText = feeExposure.billableClusterDays.toLocaleString();
    const unsupportedClusterDaysText = feeExposure.unsupportedClusterDays.toLocaleString();
    const lifecycleExposureText = feeExposure.unsupportedClusterDays > 0
        ? `${billableClusterDaysText} billable · ${unsupportedClusterDaysText} after EOL`
        : `${billableClusterDaysText} billable cluster-days`;
    const fleetDeadline = nearestEksDeadline(fleet.map(row => row.from));
    const deadlineValue = fleetDeadline ? formatDaysUntilIsoDate(fleetDeadline.date) : 'Unavailable';
    const deadlineMetric = fleetDeadline ? formatDaysUntilIsoDate(fleetDeadline.date, 'short') : 'n/a';
    const deadlineSub = fleetDeadline ? `EKS ${fleetDeadline.version} ${fleetDeadline.shortPhase} · ${fleetDeadline.date}` : 'Version data unavailable';
    const maintenanceStatus = maintenanceGateStatus(packetState.maintenance);
    const nextAction = scannerGateStatus !== 'passed'
        ? {
            screen: 'scanner',
            label: scannerOpen > 0 ? 'Open Scanner' : 'Run scan',
            value: scannerOpen > 0 ? 'Fix API removals' : 'Run deprecated API scan',
            sub: scannerOpen > 0 ? `${scannerSummary(scannerFindings)} in scanner` : 'Paste manifests or import kubent/Pluto output',
        }
        : addonGateStatus !== 'passed'
            ? {
                screen: 'addons',
                label: 'Open Add-ons',
                value: 'Review add-ons',
                sub: addonGateDetail,
            }
            : maintenanceStatus !== 'passed'
                ? {
                    screen: 'packet',
                    label: 'Open Packet',
                    value: 'Approve maintenance',
                    sub: maintenanceGateDetail(packetState.maintenance),
                }
                : {
                    screen: 'packet',
                    label: 'Open Packet',
                    value: 'Assemble packet',
                    sub: 'All primary readiness gates are clear',
                };
    const readinessGates: { label: string; status: GateStatus; detail: string; actionScreen?: string; actionLabel?: string }[] = [
        { label: 'Fleet scope', status: 'passed' as const, detail: `${fleet.length} rows · ${totalClusters} clusters defined` },
        { label: 'Deprecated API scan', status: scannerGateStatus, detail: scannerGateStatus === 'queued' ? scannerRunDetail : staleScannerEvidence ? scannerDetail : scannerOpen > 0 ? `${scannerSummary(scannerFindings)} unresolved` : scannerDetail, actionScreen: 'scanner', actionLabel: scannerGateStatus === 'passed' ? 'View' : 'Run' },
        { label: 'Add-on readiness', status: addonGateStatus, detail: addonGateDetail, actionScreen: 'addons', actionLabel: addonGateStatus === 'passed' ? 'View' : 'Review' },
        { label: 'Maintenance window', status: maintenanceStatus, detail: maintenanceGateDetail(packetState.maintenance), actionScreen: 'packet', actionLabel: maintenanceStatus === 'passed' ? 'View' : 'Approve' },
    ];
    const blockedGateCount = readinessGates.filter(gate => gate.status === 'blocked').length;
    const warningGateCount = readinessGates.filter(gate => gate.status === 'warning').length;
    const gateSummary = blockedGateCount > 0
        ? `${blockedGateCount} blocked`
        : warningGateCount > 0 ? `${warningGateCount} warning` : 'Ready';
    const gateSummaryTone = blockedGateCount > 0 ? 'text-danger' : warningGateCount > 0 ? 'text-warning' : 'text-success';
    useEffect(() => {
        const current = readPlannerState();
        const nextActiveId = fleet.some(row => row.id === activeId) ? activeId : fleet[0]?.id ?? current.activeFleetRowId;
        writePlannerState({
            ...current,
            fleetRows: fleet,
            delayMonths: delay,
            activeFleetRowId: nextActiveId,
            completedPacketSteps: [...checked],
        });
    }, [activeId, checked, delay, fleet]);
    const addRow = () => {
        const id = Date.now().toString();
        setFleet(p => [...p, { id, name: 'new-scope', from: '1.31', to: '1.35', clusters: 1 }]);
        setActiveId(id);
    };
    const loadSampleFleet = () => {
        setFleet(DEFAULT_PLANNER_STATE.fleetRows);
        setDelay(DEFAULT_PLANNER_STATE.delayMonths);
        setActiveId(DEFAULT_PLANNER_STATE.activeFleetRowId);
        setChecked(new Set(DEFAULT_PLANNER_STATE.completedPacketSteps));
    };
    const applyWorkspaceToScreen = (snapshot: ReturnType<typeof buildSampleWorkspaceSnapshot>) => {
        applyWorkspaceSnapshot(snapshot);
        setFleet(snapshot.planner.fleetRows);
        setDelay(snapshot.planner.delayMonths);
        setActiveId(snapshot.planner.activeFleetRowId);
        setChecked(new Set(snapshot.planner.completedPacketSteps));
        setScannerEvidence(snapshot.scannerEvidence);
        setAddonChecklistState(snapshot.addonChecklist);
        setPacketState(snapshot.packet);
    };
    const loadSampleWorkspace = () => {
        const snapshot = buildSampleWorkspaceSnapshot();
        applyWorkspaceToScreen(snapshot);
        setImportResult({
            rows: snapshot.planner.fleetRows,
            sourceType: 'json',
            warnings: ['Loaded sample story: mixed fleet, scanner findings, add-on evidence, maintenance approval, accepted waiver, and execution history.'],
        });
    };
    const resetWorkspace = () => {
        window.localStorage.removeItem(PLANNER_STATE_STORAGE_KEY);
        window.localStorage.removeItem(SCANNER_EVIDENCE_STORAGE_KEY);
        window.localStorage.removeItem(SCANNER_FINDINGS_STORAGE_KEY);
        window.localStorage.removeItem(ADDON_CHECKLIST_STORAGE_KEY);
        window.localStorage.removeItem(PACKET_STATE_STORAGE_KEY);
        window.localStorage.removeItem(EXECUTION_STATE_STORAGE_KEY);
        window.localStorage.removeItem(NODE_MODEL_STORAGE_KEY);
        loadSampleFleet();
        setScannerEvidence(DEFAULT_SCANNER_EVIDENCE);
        setAddonChecklistState({});
        setPacketState(DEFAULT_PACKET_STATE);
        setImportResult(null);
    };
    const applyFleetImport = () => {
        const workspaceResult = parseWorkspaceSnapshot(importText);
        if (workspaceResult.snapshot) {
            const snapshot = workspaceResult.snapshot;
            applyWorkspaceToScreen(snapshot);
            setImportResult({
                rows: snapshot.planner.fleetRows,
                sourceType: 'json',
                warnings: [`Workspace imported from ${snapshot.exportedAt.slice(0, 10)}.`, ...workspaceResult.warnings],
            });
            return;
        }
        const result = parseFleetImport(importText);
        setImportResult(result);
        if (result.rows.length === 0)
            return;
        setFleet(result.rows);
        setActiveId(result.rows[0].id);
    };
    const importFile = async (file: File | null | undefined) => {
        if (!file)
            return;
        const text = await file.text();
        setImportOpen(true);
        setImportText(text);
        setImportResult(null);
    };
    const removeRow = (id: string) => {
        if (fleet.length <= 1) {
            return;
        }
        if (id === activeId) {
            setActiveId(fleet.find(row => row.id !== id)?.id ?? activeId);
        }
        setFleet(p => p.filter(r => r.id !== id));
    };
    const updateRow = (id: string, k: keyof PlannerFleetRow, v: string | number) => setFleet(p => p.map(r => r.id === id ? { ...r, [k]: v } : r));
    const updateRouteFrom = (id: string, from: string) => setFleet(p => p.map(r => {
        if (r.id !== id)
            return r;
        const to = ALL_HOPS.indexOf(r.to) < ALL_HOPS.indexOf(from) ? from : r.to;
        return { ...r, from, to };
    }));
    const updateRouteTo = (id: string, to: string) => setFleet(p => p.map(r => r.id === id ? { ...r, to } : r));
    const toggleCheck = (id: PacketStepId) => setChecked(p => {
        const n = new Set(p);
        if (n.has(id)) {
            n.delete(id);
        }
        else {
            n.add(id);
        }
        return n;
    });
    const completedCount = checked.size;
    const packetProgressClass = ['w-0', 'w-1/5', 'w-2/5', 'w-3/5', 'w-4/5', 'w-full'][completedCount];
    return (<div className="p-5 space-y-5 w-full">

      {/* ── Hero: upgrade path ─────────────────────── */}
      <section className="rounded-xl card-shadow overflow-hidden">
        {/* Hero header strip */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Upgrade path
              </p>
              <div className="flex items-center gap-2.5 mt-0.5 flex-wrap">
                <span className="text-[15px] font-semibold font-mono">
                  EKS {activeRow?.from} → EKS {activeRow?.to}
                </span>
                <StatusPill variant={activeVersion?.status ?? 'standard'} size="xs"/>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-mono shrink-0 text-muted-foreground">
            <span>{versionHopCount(activeRow?.from ?? '1.31', activeRow?.to ?? '1.35')} hops</span>
            <span>·</span>
            <span>{activeRow?.clusters ?? 0} clusters</span>
          </div>
        </div>

        {/* Node graph */}
        <div className="px-6 py-5">
          <UpgradePath from={activeRow?.from ?? '1.31'} to={activeRow?.to ?? '1.35'}/>
        </div>

        {/* Meta strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 border-t">
          {[
            {
                label: 'Fleet deadline',
                value: deadlineValue,
                sub: deadlineSub,
                tone: 'text-warning',
                action: () => onNavigate('lifecycle'),
                actionLabel: 'Open Lifecycle',
            },
            {
                label: 'Billable ext. fees',
                value: fmtFees,
                sub: feeExposure.unsupportedClusterDays > 0 ? `${delay} month${delay !== 1 ? 's' : ''} · ${unsupportedClusterDaysText} cluster-days after EOL` : `over ${delay}-month delay window`,
                tone: 'text-danger',
                action: () => onNavigate('cost'),
                actionLabel: 'Open Cost',
            },
            {
                label: 'Next blocker',
                value: nextAction.value,
                sub: nextAction.sub,
                tone: nextAction.screen === 'packet' && nextAction.value === 'Assemble packet' ? 'text-success' : 'text-foreground',
                action: () => onNavigate(nextAction.screen),
                actionLabel: nextAction.label,
            },
	        ].map((m, i) => {
                const content = (<>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1 text-muted-foreground">
                {m.label}
              </p>
	              <p className={`text-[15px] font-semibold font-mono ${m.tone}`}>
                {m.value}
              </p>
              <p className="text-[11px] mt-0.5 text-muted-foreground">{m.sub}</p>
              <span className="mt-2 inline-flex text-[10px] font-semibold text-primary">{m.actionLabel}</span>
            </>);
                return (<button key={m.label} type="button" onClick={m.action} className={`px-6 py-4 text-left transition-colors hover:bg-muted/60 focus:outline-none focus:ring-1 focus:ring-primary ${i < 2 ? 'sm:border-r sm:border-border' : ''}`} aria-label={`${m.label}: ${m.value}. ${m.actionLabel}`}>
                  {content}
                </button>);
            })}
        </div>

        {/* Delay slider */}
        <div className="flex items-center gap-4 px-6 py-3 border-t bg-muted">
	          <label htmlFor="delay-slider" className="text-[11px] shrink-0 text-muted-foreground">
	            Upgrade delay
	          </label>
	          <input id="delay-slider" type="range" min={0} max={12} step={1} value={delay} onChange={e => setDelay(+e.target.value)} className="range-control flex-1"/>
          <span className="text-[11px] font-mono font-semibold w-20 text-right">
            {delay} month{delay !== 1 ? 's' : ''}
          </span>
        </div>
      </section>

      {/* ── Scope row selector ────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap rounded-lg px-4 py-3 card-shadow">
        <p className="text-[10px] font-semibold uppercase tracking-widest mr-2 text-muted-foreground">
          Path view scope
        </p>
        {fleet.map(row => (<button key={row.id} onClick={() => setActiveId(row.id)} className={`flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] font-medium transition-all ${activeId === row.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border-solid bg-muted text-muted-foreground hover:text-foreground'}`}>
            <span className="font-mono">{row.name}</span>
            <span className="font-mono">{row.from}→{row.to}</span>
            <span>{row.clusters} cluster{row.clusters !== 1 ? 's' : ''}</span>
          </button>))}
      </div>

      {/* ── Metric tiles ─────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricTile label="Total clusters" value={totalClusters} sublabel={`${fleet.length} scope rows`}/>
        <MetricTile label="In extended support" value={extClusters} sublabel="billing active" accent="warning" onClick={() => onNavigate('lifecycle')} actionLabel="Open Lifecycle"/>
        <MetricTile label="Billable ext. fees" value={fmtFees} sublabel={lifecycleExposureText} accent="danger" onClick={() => onNavigate('cost')} actionLabel="Open Cost"/>
        <MetricTile label="Deprecated API scan" value={scannerGateStatus === 'queued' ? 'Needs scan' : scannerOpen} sublabel={scannerGateStatus === 'queued' ? 'Run on Scanner page' : scannerOpen === 0 ? 'latest scan clean' : 'scanner findings'} accent={scannerGateStatus === 'queued' ? 'warning' : scannerOpen === 0 ? 'success' : 'warning'} onClick={() => onNavigate('scanner')} actionLabel={scannerGateStatus === 'passed' ? 'View evidence' : 'Open Scanner'}/>
        <MetricTile label="Nearest deadline" value={deadlineMetric} sublabel={deadlineSub} accent="teal" onClick={() => onNavigate('lifecycle')} actionLabel="Open Lifecycle"/>
      </div>

      {/* ── Lower section ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left (2 cols): gates + fleet table */}
        <div className="lg:col-span-2 space-y-4">

          {/* Readiness gates */}
          <div className="rounded-xl overflow-hidden card-shadow">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <p className="text-[12px] font-semibold">Readiness gates</p>
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 text-[11px] ${gateSummaryTone}`}>
                  <AlertTriangle size={11}/>
                  <span>{gateSummary}</span>
                </div>
              </div>
            </div>
            <div className="px-5 py-1">
              {readinessGates.map(gate => <GateRow key={gate.label} label={gate.label} status={gate.status} detail={gate.detail} actionLabel={gate.actionLabel} onAction={gate.actionScreen ? () => onNavigate(gate.actionScreen!) : undefined}/>)}
            </div>
          </div>

          {/* Fleet scope table */}
          <div className="rounded-xl overflow-hidden card-shadow">
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b flex-wrap">
              <p className="text-[12px] font-semibold">Fleet scope</p>
              <div className="flex items-center gap-2 flex-wrap">
                <CopyButton text={fleetToCsv(fleet)} label="Copy CSV" size="sm"/>
                <CopyButton text={fleetToJson(fleet)} label="Copy JSON" size="sm"/>
                <CopyButton text={workspaceSnapshotToJson()} label="Copy workspace" size="sm"/>
                <DownloadButton text={workspaceSnapshotToJson()} filename={safeArtifactName('eks-upgrade-planner-workspace', 'json')} label="Download workspace" mimeType="application/json;charset=utf-8" size="sm"/>
                <button onClick={() => setImportOpen(open => !open)} className="flex items-center gap-1.5 rounded border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                  <Upload size={12}/>
                  Import
                </button>
                <button onClick={loadSampleWorkspace} className="flex items-center gap-1.5 rounded border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                  <Database size={12}/>
                  Sample story
                </button>
                <button onClick={resetWorkspace} className="flex items-center gap-1.5 rounded border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-danger hover:text-danger">
                  <RotateCcw size={12}/>
                  Reset
                </button>
                <button onClick={addRow} className="flex items-center gap-1.5 rounded border border-primary bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90">
                  <Plus size={12}/>
                  Add row
                </button>
              </div>
            </div>
            {importOpen && (<div className="border-b border-border bg-muted p-4">
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_280px]">
                <label className="block text-[11px] font-semibold text-foreground">
                  Paste workspace or fleet data
                  <textarea value={importText} onChange={event => setImportText(event.target.value)} placeholder={'Workspace JSON, fleet CSV/JSON, AWS EKS describe-cluster JSON, or kubectl text\\n\\nCSV: name,from,to,clusters\\nprod-payments,1.31,1.35,5\\n\\nWorkspace JSON: {"schema":"eks-upgrade-planner-workspace",...}'} className="mt-1 h-36 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 font-mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"/>
                </label>
                <div className="flex flex-col justify-end gap-2">
                  <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                    <FileJson size={13}/>
                    Import file
                    <input type="file" accept=".json,.csv,.txt,.yaml,.yml,application/json,text/*" className="sr-only" onChange={event => importFile(event.target.files?.[0])}/>
                  </label>
                  <button onClick={applyFleetImport} className="rounded-lg bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90">
                    Apply import
                  </button>
                  <button onClick={() => { setImportText(''); setImportResult(null); }} className="rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground">
                    Clear
                  </button>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-border bg-card">
                <div className="border-b border-border px-3 py-2">
                  <p className="text-[11px] font-semibold">Inventory import commands</p>
                </div>
                <div className="divide-y divide-border">
                  {INVENTORY_IMPORT_COMMANDS.map(item => (<div key={item.label} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-32 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{item.label}</span>
                    <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{item.command}</code>
                    <CopyButton text={item.command} size="sm"/>
                  </div>))}
                </div>
              </div>
              {importResult && (<div className="mt-3 rounded-lg border border-border bg-card px-3 py-2 text-[11px]">
                <p className="font-semibold">
                  {importResult.rows.length} row{importResult.rows.length !== 1 ? 's' : ''} parsed from {importResult.sourceType.toUpperCase()}
                </p>
                {importResult.warnings.length > 0 && (<ul className="mt-1 space-y-0.5 text-warning">
                  {importResult.warnings.map(warning => <li key={warning}>{warning}</li>)}
                </ul>)}
              </div>)}
            </div>)}

            <div tabIndex={0} aria-label="Fleet scope table" className="overflow-x-auto focus:outline-none focus:ring-1 focus:ring-primary">
	              <table className="w-full table-fixed text-[12px]">
                <thead>
                  <tr>
                    {['Name', 'Route', 'Clusters', 'Remove'].map(h => (<th key={h} className="text-left px-5 py-2 font-semibold">
                        {h === 'Remove' ? <span className="sr-only">{h}</span> : h}
                      </th>))}
                  </tr>
                </thead>
                <tbody>
	                  {fleet.map(row => {
                        const isActive = row.id === activeId;
                        return (<tr key={row.id} onClick={() => setActiveId(row.id)} className={`transition-colors cursor-pointer ${isActive ? 'bg-eks-teal-bg' : 'hover:bg-muted/50'}`}>
                      <td className="px-5 py-2.5">
                        <input value={row.name} onChange={e => updateRow(row.id, 'name', e.target.value)} aria-label={`Scope group name for ${row.name}`} className="w-full bg-transparent font-mono focus:outline-none focus:ring-1 focus:ring-primary rounded px-1 -mx-1"/>
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-1 font-mono text-[12px]">
	                          <select value={row.from} onChange={e => updateRouteFrom(row.id, e.target.value)} className="w-[64px] rounded border border-border bg-card px-1.5 py-1 text-center font-mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary" aria-label={`From version for ${row.name}`}>
	                            {ALL_HOPS.map(version => (<option key={version} value={version}>{version}</option>))}
	                          </select>
	                          <ArrowRight size={12}/>
	                          <select value={row.to} onChange={e => updateRouteTo(row.id, e.target.value)} className="w-[64px] rounded border border-border bg-card px-1.5 py-1 text-center font-mono text-[11px] text-primary focus:outline-none focus:ring-1 focus:ring-primary" aria-label={`Target version for ${row.name}`}>
	                            {targetOptionsFor(row.from).map(version => (<option key={version} value={version}>{version}</option>))}
	                          </select>
                        </div>
                      </td>
                      <td className="px-5 py-2.5">
                        <input type="number" min={1} value={row.clusters} onChange={e => updateRow(row.id, 'clusters', Math.max(1, +e.target.value || 1))} aria-label={`Cluster count for ${row.name}`} className="w-12 bg-transparent font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary rounded"/>
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center">
	                          <button onClick={event => { event.stopPropagation(); removeRow(row.id); }} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-danger-bg hover:text-danger focus:outline-none focus:ring-1 focus:ring-danger" aria-label={`Remove ${row.name} scope row`} title={`Remove ${row.name}`}>
                            <Trash2 size={12}/>
                          </button>
                        </div>
                      </td>
                    </tr>);
                    })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-2 flex items-center gap-3 text-[11px] bg-muted text-muted-foreground">
              <span>{fleet.length} row{fleet.length !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span className="font-mono">{totalClusters} clusters</span>
            </div>
          </div>
        </div>

        {/* Right (1 col): change packet */}
        <div className="space-y-4">

          {/* Packet checklist */}
          <div className="rounded-xl overflow-hidden card-shadow">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <p className="text-[12px] font-semibold">Change packet</p>
              <span className="text-[10px] font-semibold font-mono">
                {completedCount}/{PACKET_STEPS.length}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-muted">
              <div className={`h-full bg-primary transition-all duration-500 ${packetProgressClass}`}/>
            </div>

            <div className="px-4 py-3 space-y-0.5">
              {PACKET_STEPS.map(step => {
            const done = checked.has(step.id);
	            return (<label key={step.id} className="flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer group transition-colors hover:bg-muted/50">
                    <input type="checkbox" checked={done} onChange={() => toggleCheck(step.id)} className="sr-only"/>
	                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${done ? 'border-primary bg-primary' : 'border-border bg-card'}`}>
                      {done && (<svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>)}
                    </span>
                    <span className={`flex-1 text-[12px] ${done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                      {step.label}
                    </span>
                    <button type="button" onClick={e => { e.preventDefault(); onNavigate(step.screen); }} className="rounded-md p-1 transition-opacity hover:bg-card" aria-label={`Open ${step.label}`} title={`Open ${step.label}`}>
                      <ChevronRight size={13}/>
                    </button>
                  </label>);
        })}
            </div>

            <div className="px-4 pb-4 pt-2 space-y-1.5">
	              {PACKET_STEPS.map(step => (<button key={step.id} onClick={() => onNavigate(step.screen)} className="w-full flex items-center justify-between rounded-lg border border-border px-3 py-2 text-[11px] font-medium text-foreground transition-all hover:border-primary hover:text-primary">
                  {step.label}
                  <ExternalLink size={11}/>
                </button>))}
            </div>
          </div>

          {/* Blocker callout */}
          <div className="rounded-xl p-4 bg-danger-bg border border-danger-border">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={13} className="text-danger"/>
              <p className="text-[12px] font-semibold text-danger">{nextAction.value}</p>
            </div>
            <ul className="space-y-1 text-[11px] text-foreground">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-danger"/>
                {nextAction.sub}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-danger"/>
                {addonGateDetail}
              </li>
            </ul>
            <button type="button" onClick={() => onNavigate(nextAction.screen)} className="mt-3 rounded-lg border border-danger-border bg-card px-3 py-2 text-[11px] font-semibold text-danger transition-colors hover:bg-danger-bg focus:outline-none focus:ring-1 focus:ring-danger">
              {nextAction.label}
            </button>
          </div>

          {/* Source citations */}
          <div className="rounded-xl p-4 bg-card border border-border">
            <p className="text-[11px] font-semibold mb-2">Sources</p>
            <div className="space-y-1.5 text-[11px]">
              {['AWS EKS lifecycle table', 'EKS extended support pricing', 'k8s deprecation guide'].map(s => (<div key={s} className="flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors">
                  <ExternalLink size={10}/>{s}
                </div>))}
              <p className="text-[10px] pt-1.5 text-muted-foreground">
                Local only · no AWS API calls
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>);
}

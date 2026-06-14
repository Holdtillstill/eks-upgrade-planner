import { useEffect, useState } from 'react';
import { GitBranch, ArrowRight } from 'lucide-react';
import { SegmentedControl } from '../ui/SegmentedControl';
import { GateRow } from '../ui/RiskGate';
import { CopyButton } from '../ui/CopyButton';
import { StatusPill } from '../ui/StatusPill';
import { calculateExtendedSupportFees, formatDaysUntilIsoDate, nearestEksDeadline } from '../../data/eks-data';
import { ALL_EKS_VERSIONS, highestTargetVersion, readPlannerState, totalClusters, versionHopCount, versionPath, type PlannerFleetRow } from '../../../lib/planner-state';
import { readStoredScannerEvidence, scannerEvidenceIsStale, scannerEvidenceSummary, scannerSummary, type ScannerEvidence } from '../../../lib/scanner-state';
import { EXECUTION_STATUS_OPTIONS, NODE_MODEL_STORAGE_KEY, executionHistoryMarkdown, executionMarkdown, executionProgress, executionStatusLabel, executionStatusVariant, readExecutionState, updateExecutionStep, writeExecutionState, type ExecutionState, type ExecutionStep, type ExecutionStepStatus } from '../../../lib/execution-state';
import { dataFreshness } from '../../../data/versions';
type PlanMode = 'fleet' | 'single';
const ALL_VERSIONS = ALL_EKS_VERSIONS;
const NODE_MODELS = {
    rolling: {
        label: 'Rolling',
        summary: 'Replace nodes gradually inside each group, one availability zone at a time.',
        bullets: [
            'Cordon and drain nodes in small batches.',
            'Keep existing capacity online while replacement nodes join.',
            'Requires PodDisruptionBudgets and drain-timeout checks.',
        ],
    },
    bluegreen: {
        label: 'Blue/Green',
        summary: 'Stand up parallel capacity, shift workloads, then retire old nodes.',
        bullets: [
            'Create replacement node groups before draining old capacity.',
            'Validate workloads on green capacity before cutover.',
            'Higher temporary cost, lower rollback friction.',
        ],
    },
} as const;
type NodeModelId = keyof typeof NODE_MODELS;
function storedNodeModel(): NodeModelId {
    if (typeof window === 'undefined') {
        return 'rolling';
    }
    return window.localStorage.getItem(NODE_MODEL_STORAGE_KEY) === 'bluegreen' ? 'bluegreen' : 'rolling';
}
function buildFleetMd(nodeModel: NodeModelId, fleetGroups: PlannerFleetRow[]) {
    const model = NODE_MODELS[nodeModel];
    const rows = fleetGroups.map(row => {
        const path = versionPath(row.from, row.to);
        return `| ${row.name.padEnd(15)} | ${path.join(' → ').padEnd(28)} | ${String(row.clusters).padStart(8)} | ${String(path.length - 1).padStart(4)} |`;
    }).join('\n');
    const sequence = [...fleetGroups]
        .sort((a, b) => versionHopCount(a.from, a.to) - versionHopCount(b.from, b.to))
        .map((row, index) => `${index + 1}. ${row.name} — ${versionHopCount(row.from, row.to)} hop${versionHopCount(row.from, row.to) !== 1 ? 's' : ''}, ${row.clusters} cluster${row.clusters !== 1 ? 's' : ''}`)
        .join('\n');
    return `# EKS Fleet Upgrade Change Plan
Generated: ${new Date().toISOString().slice(0, 10)}

## Scope
| Group           | Route                        | Clusters | Hops |
|-----------------|------------------------------|----------|------|
${rows}

**Total: ${totalClusters(fleetGroups)} clusters · ${fleetGroups.length} scope rows**

## Recommended sequence
${sequence}

## Node model: ${model.label}
${model.bullets.map((bullet) => `- ${bullet}`).join('\n')}

## Readiness dependencies
- Add-on readiness: tracked in Add-ons
- Extended support exposure: tracked in Cost
- API removals: tracked in Scanner
- Execution tracker: update Plan after each hop

## References
- https://docs.aws.amazon.com/eks/latest/userguide/update-cluster.html`;
}
function buildExecutionTrackerMd(executionState: ExecutionState, fleetGroups: PlannerFleetRow[], nodeModel: NodeModelId) {
    return `# EKS Upgrade Execution Tracker
Generated: ${new Date().toISOString().slice(0, 10)}
Scope: ${totalClusters(fleetGroups)} clusters across ${fleetGroups.length} route groups
Node model: ${NODE_MODELS[nodeModel].label}

## Steps
${executionMarkdown(executionState)}

## Notes
- Keep this tracker updated after each control-plane hop and node capacity replacement.
- A pending tracker is expected before approval; blocked steps should be reflected in the change record before execution continues.`;
}
function Panel({ title, children, action }: {
    title: string;
    children: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (<div className="rounded-xl overflow-hidden card-shadow">
      <div className="flex items-center justify-between px-5 py-3 border-b">
        <p className="text-[12px] font-semibold">{title}</p>
        {action}
      </div>
      {children}
    </div>);
}
function FleetPlan({ onNavigate }: {
    onNavigate: (s: string) => void;
}) {
    const [nodeModel, setNodeModel] = useState<NodeModelId>(storedNodeModel);
    const [planner] = useState(readPlannerState);
    const [scannerEvidence] = useState<ScannerEvidence>(readStoredScannerEvidence);
    const [executionState, setExecutionState] = useState<ExecutionState>(readExecutionState);
    const scannerFindings = scannerEvidence.findings;
    const fleetGroups = planner.fleetRows;
    const scannerTargetVersion = highestTargetVersion(fleetGroups);
    const staleScannerEvidence = scannerEvidenceIsStale(scannerEvidence, scannerTargetVersion, dataFreshness.checkedAt);
    const [activeGroupId, setActiveGroupId] = useState(planner.activeFleetRowId);
    useEffect(() => {
        window.localStorage.setItem(NODE_MODEL_STORAGE_KEY, nodeModel);
    }, [nodeModel]);
    useEffect(() => {
        writeExecutionState(executionState);
    }, [executionState]);
    const activeGroup = fleetGroups.find(g => g.id === activeGroupId) ?? fleetGroups[0];
    const activeHops = versionPath(activeGroup.from, activeGroup.to);
    const model = NODE_MODELS[nodeModel];
    const fleetMd = buildFleetMd(nodeModel, fleetGroups);
    const executionMd = buildExecutionTrackerMd(executionState, fleetGroups, nodeModel);
    const executionHistoryMd = executionHistoryMarkdown(executionState);
    const execution = executionProgress(executionState);
    const executionGateStatus = execution.blocked > 0 ? 'blocked' : execution.running > 0 ? 'running' : execution.complete ? 'passed' : 'queued';
    const updateStep = (stepId: string, patch: Partial<Omit<ExecutionStep, 'id' | 'label'>>) => {
        setExecutionState(current => updateExecutionStep(current, stepId, patch));
    };
    const scannerStatus = staleScannerEvidence || scannerEvidence.status === 'not_scanned' || scannerEvidence.status === 'empty_input' || scannerEvidence.status === 'scan_error'
        ? 'queued'
        : scannerFindings.length === 0 ? 'passed' : scannerFindings.some(finding => finding.severity === 'error') ? 'blocked' : 'warning';
    const scannerRunDetail = 'Run on Scanner: paste manifests and click Scan manifest, or import kubent/Pluto output.';
    const fleetDeadline = nearestEksDeadline(fleetGroups.map(row => row.from));
    const deadlineDetail = fleetDeadline
        ? `EKS ${fleetDeadline.version} ${fleetDeadline.phase} ends ${fleetDeadline.date} (${formatDaysUntilIsoDate(fleetDeadline.date)})`
        : 'Version data unavailable';
    return (<div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Inputs */}
        <Panel title="Execution model">
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest mb-2 text-muted-foreground">
                Node model
              </label>
              <SegmentedControl options={[{ label: 'Rolling', value: 'rolling' }, { label: 'Blue/Green', value: 'bluegreen' }]} value={nodeModel} onChange={setNodeModel}/>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                {model.summary}
              </p>
            </div>
          </div>
        </Panel>

        {/* Upgrade groups */}
        <div className="lg:col-span-2">
          <Panel title="Fleet upgrade groups">
            <div tabIndex={0} aria-label="Fleet upgrade groups table" className="overflow-x-auto focus:outline-none focus:ring-1 focus:ring-primary">
              <table className="w-full text-[12px]">
                <thead>
                  <tr>
                    {['Route group', 'Clusters', 'Hops', 'Hop path'].map(h => (<th key={h} className="text-left px-5 py-2 font-semibold">
                        {h}
                      </th>))}
                  </tr>
                </thead>
                <tbody>
                  {fleetGroups.map(g => {
            const hops = versionHopCount(g.from, g.to);
            const isActive = g.id === activeGroupId;
            return (<tr key={g.id} role="button" tabIndex={0} onClick={() => setActiveGroupId(g.id)} onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveGroupId(g.id);
                }
            }} className={`transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary ${isActive ? 'bg-eks-teal-bg' : 'hover:bg-muted/50'}`}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {isActive && <span className="w-0.5 h-4 rounded-full shrink-0 bg-primary"/>}
                            <span className={`font-mono font-semibold ${isActive ? 'text-primary' : 'text-foreground'}`}>{g.name}</span>
                            {isActive && <span className="rounded-full border border-primary-light bg-card px-1.5 py-0.5 text-[10px] font-semibold text-primary">Selected</span>}
                          </div>
                        </td>
                        <td className="px-5 py-3 font-mono">{g.clusters}</td>
                        <td className="px-5 py-3 font-mono">{hops}</td>
                        <td className="px-5 py-3 hidden xl:table-cell">
                          <span className="font-mono text-[11px] text-muted-foreground">{versionPath(g.from, g.to).join('→')}</span>
                        </td>
                      </tr>);
        })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Selected group detail">
        <div className="p-5 grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-5">
          <div className="space-y-3 text-[12px]">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Route group</p>
              <p className="mt-1 font-mono text-[14px] font-semibold">{activeGroup.name}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Clusters</p>
                <p className="mt-1 font-mono font-semibold">{activeGroup.clusters}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Hops</p>
                <p className="mt-1 font-mono font-semibold">{activeHops.length - 1}</p>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Execution model</p>
              <p className="mt-1 font-semibold">{model.label}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{model.summary}</p>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted p-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Hop sequence</p>
            <div className="flex flex-wrap items-center gap-2">
              {activeHops.map((version, index) => (<div key={`${version}-${index}`} className="flex items-center gap-2">
                <span className={`rounded-md border px-2 py-1 font-mono text-[11px] font-semibold ${index === 0 ? 'border-primary bg-primary text-primary-foreground' : index === activeHops.length - 1 ? 'border-primary bg-card text-primary' : 'border-border bg-card text-foreground'}`}>
                  EKS {version}
                </span>
                {index < activeHops.length - 1 && <ArrowRight size={12} className="text-muted-foreground"/>}
              </div>))}
            </div>
            <ul className="mt-4 space-y-1.5 text-[11px] text-muted-foreground">
              {model.bullets.map((bullet) => <li key={bullet} className="flex gap-2"><span>·</span><span>{bullet}</span></li>)}
            </ul>
          </div>
        </div>
      </Panel>

      <Panel title="Plan gates">
        <div className="px-5 py-2">
          <GateRow label="Fleet scope" status="passed" detail={`${fleetGroups.length} groups · ${totalClusters(fleetGroups)} clusters`}/>
          <GateRow label="Deadline risk" status="warning" detail={deadlineDetail} actionLabel="Lifecycle" onAction={() => onNavigate('lifecycle')}/>
          <GateRow label="Add-on readiness" status="warning" detail="3 issues tracked in Add-ons" actionLabel="Review" onAction={() => onNavigate('addons')}/>
          <GateRow label="Node model" status="passed" detail={`${model.label} execution selected`}/>
          <GateRow label="Deprecated API scan" status={scannerStatus} detail={scannerStatus === 'queued' ? scannerRunDetail : staleScannerEvidence ? `Stale scan - re-scan for EKS ${scannerTargetVersion}` : scannerFindings.length > 0 ? `${scannerSummary(scannerFindings)} unresolved` : scannerEvidenceSummary(scannerEvidence)} actionLabel={scannerStatus === 'passed' ? 'View' : 'Run'} onAction={() => onNavigate('scanner')}/>
          <GateRow label="Execution tracker" status={executionGateStatus} detail={`${execution.done}/${execution.total} done · ${execution.running} running · ${execution.blocked} blocked`}/>
        </div>
      </Panel>

      <Panel title="Execution tracker" action={<CopyButton text={executionMd} label="Copy tracker"/>}>
        <div className="border-b border-border bg-muted px-5 py-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <StatusPill variant={executionGateStatus} label={execution.complete ? 'Execution complete' : execution.blocked > 0 ? 'Execution blocked' : execution.running > 0 ? 'In progress' : 'Not started'} size="xs"/>
            <span className="font-mono text-muted-foreground">{execution.done}/{execution.total} done</span>
            <span className="text-muted-foreground">This tracker is operational status, not an approval prerequisite before the change starts.</span>
          </div>
        </div>
        <div tabIndex={0} aria-label="Execution tracker table" className="overflow-x-auto focus:outline-none focus:ring-1 focus:ring-primary">
          <table className="w-full text-[12px]">
            <thead>
              <tr>
                {['Step', 'Status', 'Owner', 'Notes'].map(header => (<th key={header} className="text-left px-5 py-2 font-semibold whitespace-nowrap">{header}</th>))}
              </tr>
            </thead>
            <tbody>
              {executionState.steps.map(step => (<tr key={step.id} className="border-t border-border">
                <td className="px-5 py-3 min-w-[220px]">
                  <p className="font-semibold">{step.label}</p>
                  {step.updatedAt && <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">Updated {step.updatedAt.slice(0, 10)}</p>}
                </td>
                <td className="px-5 py-3 min-w-[140px]">
                  <div className="flex items-center gap-2">
                    <StatusPill variant={executionStatusVariant(step.status)} label={executionStatusLabel(step.status)} size="xs"/>
                    <select value={step.status} onChange={event => updateStep(step.id, { status: event.target.value as ExecutionStepStatus })} aria-label={`Status for ${step.label}`} className="rounded border border-border bg-card px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                      {EXECUTION_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                </td>
                <td className="px-5 py-3 min-w-[150px]">
                  <input value={step.owner} onChange={event => updateStep(step.id, { owner: event.target.value })} aria-label={`Owner for ${step.label}`} className="w-full rounded border border-border bg-card px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"/>
                </td>
                <td className="px-5 py-3 min-w-[260px]">
                  <input value={step.notes} onChange={event => updateStep(step.id, { notes: event.target.value })} placeholder="Add handoff note" aria-label={`Notes for ${step.label}`} className="w-full rounded border border-border bg-card px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"/>
                </td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Execution history" action={<CopyButton text={executionHistoryMd} label="Copy history"/>}>
        <div className="p-5">
          {executionState.history.length === 0 ? (<p className="text-[12px] text-muted-foreground">No execution status changes recorded yet.</p>) : (<ol className="space-y-2">
            {[...executionState.history].reverse().slice(0, 8).map(entry => (<li key={entry.id} className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">{entry.at.slice(0, 16).replace('T', ' ')}Z</span>
                <span className="text-[12px] font-semibold">{entry.stepLabel}</span>
                <StatusPill variant={executionStatusVariant(entry.toStatus)} label={`${executionStatusLabel(entry.fromStatus)} → ${executionStatusLabel(entry.toStatus)}`} size="xs"/>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Owner: <span className="font-mono text-foreground">{entry.owner || 'unassigned'}</span>{entry.notes ? ` · ${entry.notes}` : ''}
              </p>
            </li>))}
          </ol>)}
        </div>
      </Panel>

      <Panel title="Fleet change plan" action={<CopyButton text={fleetMd} label="Copy markdown"/>}>
        <pre tabIndex={0} className="p-5 text-[11px] font-mono overflow-x-auto whitespace-pre max-h-72 focus:outline-none focus:ring-1 focus:ring-primary">
          {fleetMd}
        </pre>
      </Panel>
    </div>);
}
function SinglePlan() {
    const [from, setFrom] = useState('1.31');
    const [to, setTo] = useState('1.35');
    const [cl, setCl] = useState(5);
    const [delay, setDelay] = useState(4);
    const fromIdx = ALL_VERSIONS.indexOf(from);
    const toIdx = ALL_VERSIONS.indexOf(to);
    const targetOptions = ALL_VERSIONS.slice(Math.max(fromIdx + 1, 1));
    const safeTo = toIdx > fromIdx ? to : targetOptions[0];
    const safeToIdx = ALL_VERSIONS.indexOf(safeTo);
    const hops = ALL_VERSIONS.slice(fromIdx, safeToIdx + 1);
    const hopCount = hops.length - 1;
    const exposure = calculateExtendedSupportFees(from, cl, delay);
    const fees = Math.round(exposure.totalFees);
    const fmtFees = fees.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    const md = `# EKS Upgrade Plan: ${from} → ${safeTo}\nGenerated: ${new Date().toISOString().slice(0, 10)}\n\n## Scope\n- Current: EKS ${from}  Target: EKS ${safeTo}\n- Clusters: ${cl}  Delay: ${delay} month${delay !== 1 ? 's' : ''}\n\n## Hops (${hopCount})\n${hops.join(' → ')}\n\n## Extended fees\n${fmtFees} ($0.60 × ${exposure.billableClusterDays.toLocaleString()} cluster-days × 24hr)\n- Billable window: ${exposure.billableStart ? `${exposure.billableStart} to ${exposure.billableEnd}` : 'none in modeled window'}\n- Unsupported days after extended support: ${exposure.unsupportedDays}\n\n## Checklist\n- [ ] PodDisruptionBudgets applied\n- [ ] Deprecated APIs resolved\n- [ ] Add-on versions verified\n- [ ] Maintenance window approved`;
    return (<div className="space-y-5">
      <Panel title="Single release inputs">
        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-5">
          {[
            { label: 'Current version', el: (<select value={from} onChange={e => setFrom(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-[12px] font-mono focus:outline-none">
                {ALL_VERSIONS.slice(0, -1).map(v => <option key={v} value={v}>EKS {v}</option>)}
              </select>) },
            { label: 'Target version', el: (<select value={safeTo} onChange={e => setTo(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-[12px] font-mono focus:outline-none">
                {targetOptions.map(v => <option key={v} value={v}>EKS {v}</option>)}
              </select>) },
            { label: 'Clusters', el: (<input type="number" value={cl} min={1} onChange={e => setCl(Math.max(1, +e.target.value || 1))} className="w-full rounded-lg border px-3 py-2 text-[12px] font-mono focus:outline-none"/>) },
            { label: `Delay: ${delay} month${delay !== 1 ? 's' : ''}`, el: (<input type="range" min={0} max={12} step={1} value={delay} onChange={e => setDelay(+e.target.value)} className="range-control mt-3"/>) },
        ].map(({ label, el }) => (<div key={label}>
              <label className="block text-[10px] font-semibold uppercase tracking-widest mb-2 text-muted-foreground">{label}</label>
              {el}
            </div>))}
        </div>
      </Panel>

      <Panel title="Control-plane hop sequence">
        <div className="p-5">
          <div tabIndex={0} className="flex items-center overflow-x-auto gap-0 pb-2 focus:outline-none focus:ring-1 focus:ring-primary" aria-label="Control-plane hop sequence">
            {hops.map((v, i) => (<div key={v} className="flex items-center shrink-0">
                {i > 0 && (<div className="flex items-center w-8 mt-[-14px] text-primary/40">
                    <div className="flex-1 h-0.5 bg-primary/40"/>
                    <ArrowRight size={10} className="shrink-0"/>
                  </div>)}
                <div className="flex flex-col items-center">
                  <div className={`w-16 flex flex-col items-center py-2 rounded-xl border-2 ${i === 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-primary bg-card text-primary'}`}>
                    <span className="text-[9px] font-semibold uppercase tracking-widest opacity-60">EKS</span>
                    <span className="text-[13px] font-mono font-bold leading-none">{v}</span>
                  </div>
                  <span className="text-[10px] mt-1 text-muted-foreground">
                    {i === 0 ? 'Start' : i === hops.length - 1 ? 'Target' : `Hop ${i}`}
                  </span>
                </div>
              </div>))}
          </div>
          <div className="flex items-center gap-2 mt-3 text-[11px] text-muted-foreground">
            <GitBranch size={12}/>
            {hopCount} hop{hopCount !== 1 ? 's' : ''} · each hop = one control-plane upgrade + node group replacement
          </div>
        </div>
      </Panel>

      <div className="rounded-xl p-4 bg-warning-bg border border-warning-border">
        <p className="text-[11px] font-semibold mb-1 text-warning">Extended support exposure</p>
        <p className="text-2xl font-mono font-bold text-danger">{fmtFees}</p>
        <p className="text-[11px] mt-0.5 text-foreground">
          {exposure.billableClusterDays.toLocaleString()} billable cluster-days × 24 hr × $0.60
        </p>
      </div>

      <Panel title="Change plan" action={<CopyButton text={md} label="Copy markdown"/>}>
        <pre tabIndex={0} className="p-5 text-[11px] font-mono overflow-x-auto whitespace-pre max-h-56 focus:outline-none focus:ring-1 focus:ring-primary">
          {md}
        </pre>
      </Panel>
    </div>);
}
export function PlanScreen({ onNavigate = () => undefined }: {
    onNavigate?: (s: string) => void;
}) {
    const [mode, setMode] = useState<PlanMode>('fleet');
    return (<div className="p-5 space-y-5 w-full">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[13px] font-semibold">Upgrade plan</h2>
          <p className="text-[11px] mt-0.5 text-muted-foreground">Generate a structured change plan for approvals</p>
        </div>
        <SegmentedControl options={[{ label: 'Fleet change plan', value: 'fleet' }, { label: 'Single release', value: 'single' }]} value={mode} onChange={setMode}/>
      </div>
      {mode === 'fleet' ? <FleetPlan onNavigate={onNavigate}/> : <SinglePlan />}
    </div>);
}

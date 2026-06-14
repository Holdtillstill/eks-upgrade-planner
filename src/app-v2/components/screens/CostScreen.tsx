import { useState } from 'react';
import { ExternalLink, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { SegmentedControl } from '../ui/SegmentedControl';
import { MetricTile } from '../ui/MetricTile';
import { CopyButton } from '../ui/CopyButton';
import { calculateExtendedSupportFees, calculateFleetExtendedSupportFees, EKS_VERSIONS, EXTENDED_SUPPORT_HOURLY_RATE, formatDaysUntilIsoDate, nearestEksDeadline, SUPPORT_HOURS_PER_MONTH } from '../../data/eks-data';
import { readPlannerState, totalClusters, updatePlannerState, type CostScenarioId } from '../../../lib/planner-state';
type CostMode = 'fleet' | 'single';
const RATE = EXTENDED_SUPPORT_HOURLY_RATE;
const HRS = SUPPORT_HOURS_PER_MONTH;
const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
function clusterDayExposureText(billableClusterDays: number, unsupportedClusterDays: number) {
    const billable = billableClusterDays.toLocaleString();
    const unsupported = unsupportedClusterDays.toLocaleString();
    return unsupportedClusterDays > 0
        ? `${billable} billable; ${unsupported} after EOL`
        : `${billable} billable cluster-days`;
}
const SCENARIOS = [
    { id: 'accelerate', label: 'Accelerate', sub: '1-month window', months: 1,
        Icon: TrendingDown, tone: 'text-success', card: 'border-success-border bg-success-bg' },
    { id: 'bridge', label: 'Bridge', sub: '3-month window', months: 3,
        Icon: Minus, tone: 'text-warning', card: 'border-warning-border bg-warning-bg' },
    { id: 'defer', label: 'Defer', sub: '6-month window', months: 6,
        Icon: TrendingUp, tone: 'text-danger', card: 'border-danger-border bg-danger-bg' },
];
function Panel({ children, title, action }: {
    children: React.ReactNode;
    title: string;
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
function FleetMode() {
    const initialPlanner = readPlannerState();
    const [sel, setSel] = useState<CostScenarioId>(initialPlanner.costScenarioId);
    const [fleet] = useState(initialPlanner.fleetRows);
    const extendedVersions = new Set(EKS_VERSIONS.filter(v => ['extended', 'eol'].includes(v.status)).map(v => v.version));
    const extC = fleet.filter(row => extendedVersions.has(row.from)).reduce((sum, row) => sum + row.clusters, 0);
    const s = SCENARIOS.find(x => x.id === sel)!;
    const exposure = calculateFleetExtendedSupportFees(fleet, s.months);
    const allClusters = totalClusters(fleet);
    const total = Math.round(exposure.totalFees);
    const clDays = exposure.billableClusterDays;
    const unsupportedClDays = exposure.unsupportedClusterDays;
    const exposureText = clusterDayExposureText(clDays, unsupportedClDays);
    const monthly = extC * HRS * RATE;
    const fleetDeadline = nearestEksDeadline(fleet.map(row => row.from));
    const deadlineText = fleetDeadline
        ? `EKS ${fleetDeadline.version} ${fleetDeadline.phase} ends ${fleetDeadline.date} (${formatDaysUntilIsoDate(fleetDeadline.date)})`
        : 'Version data unavailable';
    const deadlineMetric = fleetDeadline ? formatDaysUntilIsoDate(fleetDeadline.date, 'short') : 'n/a';
    const deadlineSub = fleetDeadline ? `EKS ${fleetDeadline.version} ${fleetDeadline.shortPhase}` : 'Version data unavailable';
    const selectScenario = (id: CostScenarioId) => {
        setSel(id);
        updatePlannerState({ costScenarioId: id });
    };
    const copyText = `EKS Fleet Extended Support Cost Model
${'─'.repeat(42)}
Clusters in extended support : ${extC}
Rate                          : $${RATE}/cluster/hour
Hours/month                   : ${HRS}
Monthly fleet fee             : ${fmt(monthly)}
${'─'.repeat(42)}
Scenario : ${s.label} (${s.months} month${s.months !== 1 ? 's' : ''})
Billable cluster-days modeled : ${clDays.toLocaleString()}
Total extended fees   : ${fmt(total)}
Unsupported cluster-days after extended support : ${exposure.unsupportedClusterDays.toLocaleString()}
${'─'.repeat(42)}
Deadline  : ${deadlineText}
Source    : https://aws.amazon.com/eks/pricing/
Generated : ${new Date().toISOString().slice(0, 10)} (local)`;
    return (<div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricTile label="Billable ext. fees" value={fmt(total)} sublabel={exposureText} accent="danger"/>
	        <MetricTile label="Billable clusters" value={exposure.billableClusters} sublabel={`of ${allClusters}`} accent="warning"/>
        <MetricTile label="After EOL" value={unsupportedClDays.toLocaleString()} sublabel="unsupported cluster-days" accent={unsupportedClDays > 0 ? 'danger' : 'success'}/>
        <MetricTile label="Next deadline" value={deadlineMetric} sublabel={deadlineSub} accent="teal"/>
      </div>

      <Panel title="Scenario ledger">
        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SCENARIOS.map(sc => {
            const scenarioExposure = calculateFleetExtendedSupportFees(fleet, sc.months);
            const fee = Math.round(scenarioExposure.totalFees);
            const isSel = sel === sc.id;
            return (<button key={sc.id} onClick={() => selectScenario(sc.id as CostScenarioId)} className={`text-left p-4 rounded-xl border-2 transition-all text-[12px] ${isSel ? sc.card : 'border-border bg-card hover:border-primary'}`}>
                <div className="flex items-start justify-between mb-2">
                  <span className={`font-semibold ${isSel ? sc.tone : 'text-foreground'}`}>{sc.label}</span>
                  <sc.Icon size={14} className={isSel ? sc.tone : 'text-muted-foreground'}/>
                </div>
                <p className="text-[10px] mb-3 text-muted-foreground">{sc.sub}</p>
                <p className={`text-[20px] font-mono font-bold ${isSel ? sc.tone : 'text-foreground'}`}>
                  {fmt(fee)}
                </p>
                <p className="text-[10px] mt-0.5 text-muted-foreground">
                  {clusterDayExposureText(scenarioExposure.billableClusterDays, scenarioExposure.unsupportedClusterDays)}
                </p>
              </button>);
        })}
        </div>
      </Panel>

      <Panel title="Cost formula">
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="rounded-xl overflow-hidden border border-border-solid">
              <div className="px-4 py-2 border-b text-[10px] font-mono bg-muted text-muted-foreground">
                extended_support_fee.formula
              </div>
              <pre tabIndex={0} className="px-4 py-3 text-[11px] font-mono overflow-x-auto focus:outline-none focus:ring-1 focus:ring-primary">
        {`fee = billable cluster-days × 24 hours × rate

    = ${clDays}
    × 24
    × $${RATE}

    = ${fmt(total)} in this ${s.months}-month window

unsupported_after_eol = ${unsupportedClDays.toLocaleString()} cluster-days`}
              </pre>
            </div>
          </div>
          <div className="text-[12px] space-y-3 text-muted-foreground">
            <p className="font-semibold text-[12px] text-foreground">Planning notes</p>
            <ul className="space-y-2">
              {[
            'Billing begins the day standard support ends.',
            'Node count does not affect extended support pricing.',
            'Each control plane = one cluster-hour.',
            'Modeled fees are clipped at the extended support end date.',
            'If fees drop because the window passed EOL, the missing days are unsupported risk.',
            'Rate covers security patches and API deprecation.',
        ].map((n, i) => (<li key={i} className="flex items-start gap-2">
                  <span className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full bg-border-solid"/>
                  {n}
                </li>))}
            </ul>
            <a href="https://aws.amazon.com/eks/pricing/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-primary hover:opacity-70 transition-opacity">
              <ExternalLink size={11}/>
              AWS EKS pricing docs
            </a>
          </div>
        </div>
      </Panel>

      <Panel title="Fleet cost model — copyable output" action={<CopyButton text={copyText} label="Copy"/>}>
        <pre tabIndex={0} className="p-5 text-[11px] font-mono overflow-x-auto whitespace-pre focus:outline-none focus:ring-1 focus:ring-primary">
          {copyText}
        </pre>
      </Panel>
    </div>);
}
function SingleMode() {
    const [version, setVersion] = useState('1.31');
    const [clusters, setClusters] = useState(5);
    const [months, setMonths] = useState(4);
    const exposure = calculateExtendedSupportFees(version, clusters, months);
    const total = Math.round(exposure.totalFees);
    const monthly = clusters * HRS * RATE;
    const unsupportedClusterDays = exposure.unsupportedDays * clusters;
    const singleClusterDaysText = unsupportedClusterDays > 0 ? `${unsupportedClusterDays.toLocaleString()} after EOL` : 'billable';
    const copyText = `EKS Single Release Extended Support Cost Model
${'─'.repeat(42)}
EKS version : ${version}
Clusters    : ${clusters}
Delay       : ${months} month${months !== 1 ? 's' : ''}
Rate        : $${RATE}/cluster/hour
Monthly fee : ${fmt(monthly)}
Billable days : ${exposure.billableDays}${exposure.billableStart ? ` (${exposure.billableStart} to ${exposure.billableEnd})` : ' (none in modeled window)'}
Unsupported days after extended support : ${exposure.unsupportedDays}
${'─'.repeat(42)}
Total extended support fees : ${fmt(total)}
${'─'.repeat(42)}
Source    : https://aws.amazon.com/eks/pricing/
Generated : ${new Date().toISOString().slice(0, 10)}`;
    return (<div className="space-y-5">
      <Panel title="Release inputs">
        <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest mb-2 text-muted-foreground">
              EKS version
            </label>
            <select value={version} onChange={e => setVersion(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-[12px] font-mono focus:outline-none">
              {EKS_VERSIONS.map(v => <option key={v.version} value={v.version}>EKS {v.version}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest mb-2 text-muted-foreground">
              Cluster count
            </label>
            <input type="number" value={clusters} min={1} onChange={e => setClusters(Math.max(1, +e.target.value || 1))} className="w-full rounded-lg border px-3 py-2 text-[12px] font-mono focus:outline-none"/>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest mb-2 text-muted-foreground">
              Delay:{' '}
              <span className="font-mono normal-case tracking-normal text-foreground">
                {months} month{months !== 1 ? 's' : ''}
              </span>
            </label>
            <input type="range" min={0} max={12} step={1} value={months} onChange={e => setMonths(+e.target.value)} className="range-control mt-2"/>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricTile label="Billable ext. fees" value={fmt(total)} sublabel={`${months} month${months !== 1 ? 's' : ''}`} accent="danger"/>
        <MetricTile label="Monthly fee" value={fmt(Math.round(monthly))} sublabel={`${clusters} cluster${clusters !== 1 ? 's' : ''}`} accent="warning"/>
        <MetricTile label="Cluster-days" value={exposure.billableClusterDays.toLocaleString()} sublabel={singleClusterDaysText}/>
        <MetricTile label="Rate" value="$0.60" sublabel="per cluster/hr"/>
      </div>

      <Panel title="Single release cost output" action={<CopyButton text={copyText} label="Copy"/>}>
        <pre tabIndex={0} className="p-5 text-[11px] font-mono overflow-x-auto whitespace-pre focus:outline-none focus:ring-1 focus:ring-primary">
          {copyText}
        </pre>
      </Panel>
    </div>);
}
export function CostScreen() {
    const [mode, setMode] = useState<CostMode>('fleet');
    return (<div className="p-5 space-y-5 w-full">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[13px] font-semibold">Cost model</h2>
          <p className="text-[11px] mt-0.5 text-muted-foreground">Extended support billing exposure by scenario</p>
        </div>
        <SegmentedControl options={[{ label: 'Fleet aggregate', value: 'fleet' }, { label: 'Single release', value: 'single' }]} value={mode} onChange={setMode}/>
      </div>
      {mode === 'fleet' ? <FleetMode /> : <SingleMode />}
    </div>);
}

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { EKS_VERSIONS, type EksVersion, type SupportStatus } from '../../data/eks-data';
import { StatusPill } from '../ui/StatusPill';
import { readPlannerState, type PlannerFleetRow } from '../../../lib/planner-state';
import { dataFreshness } from '../../../data/versions';

const STATUS_LABEL: Record<SupportStatus, string> = {
    latest: 'Latest', standard: 'Standard', extended: 'Extended', eol: 'End of life', upcoming: 'Upcoming',
};
interface FleetScope {
    sourceClusters: number;
    sourceRows: number;
    targetClusters: number;
    targetRows: number;
}
function versionSort(a: string, b: string) {
    const [aMajor, aMinor] = a.split('.').map(Number);
    const [bMajor, bMinor] = b.split('.').map(Number);
    return aMajor === bMajor ? aMinor - bMinor : aMajor - bMajor;
}
function fleetScopeByVersion(fleetRows: PlannerFleetRow[]) {
    const scope = new Map<string, FleetScope>();
    const ensure = (version: string) => {
        const current = scope.get(version) ?? { sourceClusters: 0, sourceRows: 0, targetClusters: 0, targetRows: 0 };
        scope.set(version, current);
        return current;
    };
    fleetRows.forEach(row => {
        const source = ensure(row.from);
        source.sourceClusters += row.clusters;
        source.sourceRows += 1;
        const target = ensure(row.to);
        target.targetClusters += row.clusters;
        target.targetRows += 1;
    });
    return scope;
}
function formatFleetScope(version: string, scope: FleetScope) {
    const parts = [];
    if (scope.sourceClusters > 0)
        parts.push(`${version} source ${scope.sourceClusters} cluster${scope.sourceClusters !== 1 ? 's' : ''}`);
    if (scope.targetClusters > 0)
        parts.push(`${version} target ${scope.targetClusters} cluster${scope.targetClusters !== 1 ? 's' : ''}`);
    return parts.join(' / ');
}
function fleetSourceSummary(scopeByVersion: Map<string, FleetScope>) {
    return [...scopeByVersion.entries()]
    .filter(([, scope]) => scope.sourceClusters > 0)
    .sort(([a], [b]) => versionSort(a, b))
    .map(([version, scope]) => `${version} (${scope.sourceClusters} cluster${scope.sourceClusters !== 1 ? 's' : ''})`)
    .join(' / ');
}
function fleetTargetSummary(scopeByVersion: Map<string, FleetScope>) {
    return [...scopeByVersion.entries()]
    .filter(([, scope]) => scope.targetClusters > 0)
    .sort(([a], [b]) => versionSort(a, b))
    .map(([version, scope]) => `${version} (${scope.targetClusters} cluster${scope.targetClusters !== 1 ? 's' : ''})`)
    .join(' / ');
}
function daysUntil(d: string) {
    const diff = Math.round((new Date(d).getTime() - Date.now()) / 86400000);
    if (diff < 0)
        return `${Math.abs(diff)}d ago`;
    if (diff === 0)
        return 'today';
    return `${diff}d`;
}
function daysTone(v: EksVersion) {
    if (v.status === 'eol')
        return 'text-danger';
    if (v.status === 'extended')
        return 'text-warning';
    return 'text-muted-foreground';
}
const dataCheckedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
}).format(new Date(`${dataFreshness.checkedAt}T00:00:00Z`));
function referenceFor(v: EksVersion) {
    if (v.notesUrl) {
        return {
            href: v.notesUrl,
            label: 'Notes',
            title: `Open EKS ${v.version} release notes`,
        };
    }
    if (v.releaseUrl) {
        return {
            href: v.releaseUrl,
            label: 'Release',
            title: `Open EKS ${v.version} release announcement`,
        };
    }
    if (v.sourceUrl.includes('endoflife.date')) {
        return {
            href: v.sourceUrl,
            label: 'Archive',
            title: `Open archived lifecycle source for EKS ${v.version}`,
        };
    }
    return {
        href: v.sourceUrl,
        label: 'Lifecycle',
        title: `Open AWS EKS lifecycle source for EKS ${v.version}`,
    };
}
const GATE_VERSIONS = ['1.36', '1.35', '1.34', '1.33'];
const DEFAULT_BASELINE_VERSION = '1.31';
function VersionGateCard({ vd }: {
    vd: EksVersion;
}) {
    const d = daysUntil(vd.standardEnd);
    const urgent = !d.includes('ago') && parseInt(d) < 250;
    return (<div className="rounded-xl p-4 card-shadow flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <span className="font-mono text-[15px] font-bold">
          EKS {vd.version}
        </span>
        <StatusPill variant={vd.status} size="xs" showIcon label={STATUS_LABEL[vd.status]}/>
      </div>

      <div className="space-y-1.5">
                        {[
            { label: 'Released', val: vd.releaseDate, hl: false },
            { label: 'Standard support ends', val: vd.standardEnd, hl: vd.status === 'extended' },
            { label: 'Extended support ends', val: vd.extendedEnd, hl: false },
        ].map(({ label, val, hl }) => (<div key={label} className="flex justify-between items-center text-[11px]">
            <span className="text-muted-foreground">{label}</span>
            <span className={`font-mono font-medium ${hl ? 'text-warning' : 'text-foreground'}`}>
              {val}
            </span>
          </div>))}
      </div>

      <div className="flex justify-between items-center pt-2 border-t border-border">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Standard support ends in
        </span>
        <span className={`font-mono text-[13px] font-bold ${urgent ? 'text-warning' : 'text-muted-foreground'}`}>
          {d}
        </span>
      </div>
    </div>);
}
export function LifecycleScreen() {
    const [planner] = useState(readPlannerState);
    const activeRow = planner.fleetRows.find(row => row.id === planner.activeFleetRowId) ?? planner.fleetRows[0];
    const [selectedVersion, setSelectedVersion] = useState(activeRow?.from ?? DEFAULT_BASELINE_VERSION);
    const scopeByVersion = fleetScopeByVersion(planner.fleetRows);
    const sourceSummary = fleetSourceSummary(scopeByVersion);
    const targetSummary = fleetTargetSummary(scopeByVersion);
    const orderedVersions = [...EKS_VERSIONS].reverse();
    return (<div className="p-5 space-y-6 w-full">

      {/* Top gates */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-3">
          Active versions — quick gates
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {GATE_VERSIONS.map(v => {
            const vd = EKS_VERSIONS.find(e => e.version === v);
            return vd ? <VersionGateCard key={v} vd={vd}/> : null;
        })}
        </div>
      </div>

      {/* Registry table */}
      <div className="rounded-xl overflow-hidden card-shadow">
        <div className="flex flex-col gap-3 px-5 py-3 border-b lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold">EKS version registry</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Teal rail marks the selected baseline: <span className="font-mono text-primary">EKS {selectedVersion}</span>. Blue rail marks versions in fleet scope.
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              Fleet source: <span className="font-mono text-foreground">{sourceSummary}</span>
              <span className="hidden px-1 text-border-solid sm:inline">·</span>
              <span className="block sm:inline">Target: <span className="font-mono text-primary">{targetSummary}</span></span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] lg:justify-end">
            {[
            { tone: 'bg-success', l: 'Standard' },
            { tone: 'bg-warning', l: 'Extended' },
            { tone: 'bg-danger', l: 'EOL' },
            { tone: 'bg-primary', l: 'Latest' },
            { tone: 'bg-info', l: 'In fleet' },
        ].map(({ tone, l }) => (<span key={l} className="flex items-center gap-1.5 text-muted-foreground">
                <span className={`w-2 h-2 rounded-full ${tone}`}/>
                {l}
              </span>))}
          </div>
        </div>

        <div className="divide-y lg:hidden">
          {orderedVersions.map(v => {
            const sel = v.version === selectedVersion;
            const fleetScope = scopeByVersion.get(v.version);
            const inFleet = !!fleetScope && (fleetScope.sourceClusters > 0 || fleetScope.targetClusters > 0);
            const reference = referenceFor(v);
            return (<div key={v.version} className={`border-l-4 transition-colors ${sel ? 'border-primary bg-eks-teal-bg/80' : inFleet ? 'border-info bg-info-bg/80' : 'border-transparent bg-card'}`}>
              <button type="button" onClick={() => setSelectedVersion(v.version)} className="w-full p-4 text-left">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className={`font-mono text-[13px] font-semibold ${sel ? 'text-primary' : 'text-foreground'}`}>EKS {v.version}</p>
                      {inFleet && <StatusPill variant="info" size="xs" showIcon={false} label="In fleet"/>}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">Standard {v.standardEnd} · Extended {v.extendedEnd}</p>
                  </div>
                  <StatusPill variant={v.status} size="xs" showIcon label={STATUS_LABEL[v.status]}/>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {fleetScope?.sourceClusters ? <StatusPill variant="info" size="xs" showIcon={false} label={`Source ${fleetScope.sourceClusters} cluster${fleetScope.sourceClusters !== 1 ? 's' : ''}`}/> : null}
                  {fleetScope?.targetClusters ? <StatusPill variant="latest" size="xs" showIcon={false} label={`Target ${fleetScope.targetClusters} cluster${fleetScope.targetClusters !== 1 ? 's' : ''}`}/> : null}
                  {!fleetScope && <span className="text-[11px] text-muted-foreground">No fleet scope</span>}
                </div>
              </button>
              <div className="border-t border-border/70 px-4 py-2">
                <a href={reference.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary transition-opacity hover:opacity-70" aria-label={reference.title} title={reference.title}>
                  {reference.label}
                  <ExternalLink size={11}/>
                </a>
              </div>
            </div>);
          })}
        </div>

        <div tabIndex={0} aria-label="EKS version registry table" className="hidden overflow-x-auto focus:outline-none focus:ring-1 focus:ring-primary lg:block">
          <table className="w-full">
            <thead>
              <tr>
                {['Release', 'Status', 'Release date', 'Standard support ends', 'Extended support ends', 'Platform', 'Days to standard support end', 'Fleet scope', 'Reference'].map(h => (<th key={h} className="text-left px-5 py-2.5 font-semibold whitespace-nowrap">
                    {h}
                  </th>))}
              </tr>
            </thead>
            <tbody>
              {orderedVersions.map(v => {
            const sel = v.version === selectedVersion;
            const fleetScope = scopeByVersion.get(v.version);
            const inFleet = !!fleetScope && (fleetScope.sourceClusters > 0 || fleetScope.targetClusters > 0);
            const reference = referenceFor(v);
            return (<tr key={v.version} onClick={() => setSelectedVersion(v.version)} className={`transition-colors cursor-pointer ${sel ? 'bg-eks-teal-bg/80' : inFleet ? 'bg-info-bg/80 hover:bg-info-bg' : 'hover:bg-muted/40'}`}>
                    <td className={`border-l-4 px-5 py-3 ${sel ? 'border-primary' : inFleet ? 'border-info' : 'border-transparent'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-semibold text-[13px] ${sel ? 'text-primary' : 'text-foreground'}`}>
                          EKS {v.version}
                        </span>
                        {inFleet && <StatusPill variant="info" size="xs" showIcon={false} label="In fleet"/>}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill variant={v.status} size="xs" showIcon label={STATUS_LABEL[v.status]}/>
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-[12px] text-muted-foreground">{v.releaseDate}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`font-mono text-[12px] font-medium ${(v.status === 'extended' || v.status === 'eol') ? 'text-warning' : 'text-foreground'}`}>
                        {v.standardEnd}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-[12px] text-muted-foreground">{v.extendedEnd}</span>
                    </td>
                    <td className="px-5 py-3 hidden lg:table-cell">
                      <span className="text-[11px] text-muted-foreground">{v.platform}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`font-mono text-[12px] font-semibold ${daysTone(v)}`}>
                        {daysUntil(v.standardEnd)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {fleetScope ? (<div className="flex flex-wrap gap-1.5">
                        {fleetScope.sourceClusters > 0 && (<StatusPill variant="info" size="xs" showIcon={false} label={`Source ${fleetScope.sourceClusters} cluster${fleetScope.sourceClusters !== 1 ? 's' : ''}`}/>)}
                        {fleetScope.targetClusters > 0 && (<StatusPill variant="latest" size="xs" showIcon={false} label={`Target ${fleetScope.targetClusters} cluster${fleetScope.targetClusters !== 1 ? 's' : ''}`}/>)}
                        <span className="sr-only">{formatFleetScope(v.version, fleetScope)}</span>
                      </div>) : (<span className="text-[11px] text-muted-foreground">—</span>)}
                    </td>
                    <td className="px-5 py-3">
                      <a href={reference.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary transition-opacity hover:opacity-70" onClick={e => e.stopPropagation()} aria-label={reference.title} title={reference.title}>
                        {reference.label}
                        <ExternalLink size={11}/>
                      </a>
                    </td>
                  </tr>);
        })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-2.5 flex items-center gap-2 text-[11px] bg-muted text-muted-foreground border-t border-border">
          <ExternalLink size={11} className="opacity-50"/>
          <a href="https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html" target="_blank" rel="noreferrer" className="hover:underline">
            Source: AWS EKS Kubernetes versions documentation
          </a>
          <span className="text-border-solid">·</span>
          Data checked: {dataCheckedDate}
        </div>
      </div>

      {/* Extended support note */}
      <div className="rounded-xl p-5 bg-warning-bg border border-warning-border">
        <p className="text-[12px] font-semibold mb-1 text-warning">
          Extended support pricing
        </p>
        <p className="text-[12px] leading-relaxed">
          EKS extended support charges{' '}
          <span className="font-mono font-semibold">$0.60 / cluster / hour</span> per cluster
          past the standard support end date. One cluster in extended support for one month (730 h)
          costs <span className="font-mono font-semibold">~$438</span> in extended support fees alone.
        </p>
        <a href="https://aws.amazon.com/eks/pricing/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 mt-3 text-[12px] font-semibold text-warning hover:opacity-70 transition-opacity">
          <ExternalLink size={12}/>
          AWS EKS pricing page
        </a>
      </div>
    </div>);
}

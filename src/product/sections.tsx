import { useState, type Dispatch, type SetStateAction } from 'react';
import { addons } from '../data/addons';
import { deprecations } from '../data/deprecations';
import { dataFreshness, eksVersions, type EksVersion } from '../data/versions';
import { eksPricing } from '../data/pricing';
import { addonCompatibilityPath, addonValidationChecklist, findAddonBySlug } from '../lib/addonLookup';
import { calculateEksSupportExposure, compareEksVersions, formatCurrency, formatHourlyCurrency, generateHopSequence, getSupportStatus, statusLabel } from '../lib/planner';
import { buildVersionGuide, generateCostReport, generateEvidenceReport, generatePlannerMarkdown, nodeModelChecks, nodeModelLabels, scanExampleManifest, type NodeModel, type scanManifest } from '../lib/reports';
import { navigate } from '../lib/navigation';
import { versionGuidePath, type AppRoute } from '../lib/routes';
import { costSummary, deadlineCopy, statusTone, supportExposureLabel, toggleRecord } from '../lib/ui';
import { CopyButton, Source, StatusPill } from '../components/shared';
import { CopyableReport, Gate, ProductField, ProductMetric, ScenarioLedger, TerminalOutput, VersionSelect, type GateState, type ScenarioId, type ScenarioRow } from './components';
import { fleetItemClusters, nodeModelIds, normalizedFleetItem, selectedAddonIdsFrom, summarizeFleet, versionForFleetItem, type FleetItem } from './state';

export function OverviewSection({
  currentVersion,
  targetVersion,
  clusterCount,
  monthsDelayed,
  scannerFindings,
  selectedAddonIds,
  fleetItems,
  activeFleetItemId,
  applyFleetItemToScenario,
  setMonthsDelayed,
  setFleetItems,
  setRoute,
}: {
  currentVersion: string;
  targetVersion: string;
  clusterCount: number;
  monthsDelayed: number;
  scannerFindings: ReturnType<typeof scanManifest>;
  selectedAddonIds: string[];
  fleetItems: FleetItem[];
  activeFleetItemId: string | null;
  applyFleetItemToScenario: (item: FleetItem) => void;
  setMonthsDelayed: (value: number) => void;
  setFleetItems: Dispatch<SetStateAction<FleetItem[]>>;
  setRoute: (route: AppRoute) => void;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({
    owners: true,
    addons: true,
    api: scannerFindings.length === 0,
    window: false,
  });
  const selected = eksVersions.find((version) => version.version === currentVersion) ?? eksVersions[0];
  const target = compareEksVersions(targetVersion, currentVersion) < 0 ? currentVersion : targetVersion;
  const hops = generateHopSequence(currentVersion, target);
  const { cost } = costSummary(currentVersion, clusterCount, monthsDelayed);
  const tone = statusTone(selected);
  const fleetSummary = summarizeFleet(fleetItems, monthsDelayed);
  const activeFleetItem = fleetItems.find((item) => item.id === activeFleetItemId) ?? null;
  const activeFleetScope = activeFleetItem ? normalizedFleetItem(activeFleetItem) : null;
  const fleetNeedsAction = fleetSummary.unsupportedClusters > 0 || fleetSummary.extendedClusters > 0 || fleetSummary.endingSoonClusters > 0;
  const pathTone = fleetSummary.unsupportedClusters > 0 || scannerFindings.length > 0 ? 'bad' : fleetNeedsAction || fleetSummary.exposureTotal > 0 ? 'warn' : 'ok';
  const pathAction = scannerFindings.length
    ? 'Fix API removals'
    : fleetSummary.unsupportedClusters
    ? 'Recover unsupported rows'
    : fleetNeedsAction
    ? 'Prioritize deadlines'
    : 'Build change packet';
  const tasks = [
    { id: 'owners', label: 'Fleet scope reviewed', detail: `${fleetSummary.totalClusters} cluster(s) across ${fleetItems.length} row(s)` },
    { id: 'addons', label: 'Add-on checks selected', detail: `${selectedAddonIds.length} selected group(s)` },
    { id: 'api', label: 'API scan attached', detail: `${scannerFindings.length} deprecated API finding(s)` },
    { id: 'window', label: 'Maintenance window approved', detail: `${hops.length - 1} hop(s) to EKS ${target}` },
  ];
  const completed = tasks.filter((task) => checked[task.id]).length;
  const updateFleetItem = (id: string, changes: Partial<FleetItem>) => {
    const existing = fleetItems.find((item) => item.id === id);
    if (!existing) return;
    const updated = normalizedFleetItem({ ...existing, ...changes });
    setFleetItems((items) => items.map((item) => item.id === id ? updated : item));
    if (id === activeFleetItemId) applyFleetItemToScenario(updated);
  };
  const addFleetItem = () => {
    setFleetItems((items) => [
      ...items,
      {
        id: `fleet-${Date.now()}`,
        label: 'new-service',
        version: currentVersion,
        targetVersion: target,
        clusters: 1,
      },
    ]);
  };
  const removeFleetItem = (id: string) => {
    const remainingItems = fleetItems.filter((item) => item.id !== id).map((item) => normalizedFleetItem(item));
    if (remainingItems.length === 0) return;
    setFleetItems(remainingItems);
    if (id === activeFleetItemId) applyFleetItemToScenario(remainingItems[0]);
  };
  const nextDeadlineCopy = fleetSummary.nextDeadline
    ? `${fleetSummary.nextDeadline.days}d · ${fleetSummary.nextDeadline.label}`
    : 'No future lifecycle deadline in modeled fleet';
  const overviewBrief = `EKS upgrade overview
Selected single-version scope: EKS ${selected.version} -> EKS ${target}
Selected single-version row: ${activeFleetScope ? activeFleetScope.label : 'custom what-if'}
Scenario lifecycle: ${deadlineCopy(selected)}
Fleet rows: ${fleetItems.length}
Fleet clusters: ${fleetSummary.totalClusters}
Clusters in extended support: ${fleetSummary.extendedClusters}
Clusters past extended support: ${fleetSummary.unsupportedClusters}
Fleet remaining support fees: ${formatCurrency(fleetSummary.exposureTotal)}
Next deadline: ${nextDeadlineCopy}
Change readiness: ${completed}/${tasks.length}
Scanner findings: ${scannerFindings.length}`;
  return <section className="product-section">
    <div className="section-head">
      <div>
        <span className="eyebrow">Overview</span>
        <h1>Upgrade plan</h1>
      </div>
      <p>Fleet route, support windows, cost exposure, and blockers.</p>
    </div>

    <div className={`upgrade-path-surface ${pathTone}`} aria-label="Selected upgrade path">
      <div className="upgrade-path-primary">
        <span>Selected route</span>
        <strong>{selected.version} -&gt; {target}</strong>
        <p>{activeFleetScope ? activeFleetScope.label : 'custom row'} · {fleetSummary.totalClusters} fleet cluster(s)</p>
      </div>
      <div className="upgrade-path-track" aria-label={`Upgrade hops from EKS ${currentVersion} to EKS ${target}`} tabIndex={0}>
        {hops.map((hop, index) => <span key={hop} className={`upgrade-hop ${index === 0 ? 'origin' : ''} ${index === hops.length - 1 ? 'target' : ''}`}>
          <em>{index === 0 ? 'now' : index === hops.length - 1 ? 'target' : `hop ${index}`}</em>
          <strong>{hop}</strong>
        </span>)}
      </div>
      <div className="upgrade-path-meta">
        <div><span>Deadline</span><strong>{fleetSummary.nextDeadline ? `${fleetSummary.nextDeadline.days}d` : 'Clear'}</strong><em>{fleetSummary.nextDeadline?.version ? `EKS ${fleetSummary.nextDeadline.version}` : 'no deadline in scope'}</em></div>
        <div><span>Exposure</span><strong>{fleetSummary.unsupportedClusters ? `${fleetSummary.unsupportedClusters} past` : formatCurrency(fleetSummary.exposureTotal)}</strong><em>{monthsDelayed} month window</em></div>
        <div><span>Next</span><strong>{pathAction}</strong><em>{scannerFindings.length} API finding(s)</em></div>
      </div>
    </div>

    <div className="overview-control-strip" aria-label="Fleet planning controls">
      <ProductField label={`Delay: ${monthsDelayed} month(s)`}><input type="range" min="1" max="24" value={monthsDelayed} onChange={(event) => setMonthsDelayed(Number(event.target.value))}/></ProductField>
      <div className="release-control-note selected-row-note">
        <span>Active row</span>
        <strong>{activeFleetScope ? `${activeFleetScope.label}: EKS ${activeFleetScope.version} -> EKS ${activeFleetScope.targetVersion}` : `Custom: EKS ${selected.version} -> EKS ${target}`}</strong>
        <p>{activeFleetScope ? `${fleetItemClusters(activeFleetScope)} cluster(s)` : `${clusterCount} cluster(s)`}</p>
      </div>
      <div className="release-control-note">
        <span>Fleet</span>
        <strong>{fleetSummary.totalClusters} cluster(s)</strong>
        <p>{fleetItems.length} row(s)</p>
      </div>
    </div>

    <div className="metric-row overview-metrics">
      <ProductMetric label="Clusters" value={String(fleetSummary.totalClusters)} detail={`${fleetItems.length} scope row(s)`}/>
      <ProductMetric label="Past support" value={String(fleetSummary.unsupportedClusters)} detail="Clusters past extended support" tone={fleetSummary.unsupportedClusters ? 'bad' : 'ok'}/>
      <ProductMetric label="Billing ext." value={String(fleetSummary.extendedClusters)} detail="Clusters in extended support" tone={fleetSummary.extendedClusters ? 'warn' : 'ok'}/>
      <ProductMetric label="Fees" value={formatCurrency(fleetSummary.exposureTotal)} detail={`${monthsDelayed} month overlap`} tone={fleetSummary.exposureTotal > 0 ? 'warn' : 'ok'}/>
      <ProductMetric label="Deadline" value={fleetSummary.nextDeadline ? `${fleetSummary.nextDeadline.days}d` : 'Clear'} detail={fleetSummary.nextDeadline?.label ?? 'No future deadline'} tone={fleetNeedsAction ? 'warn' : 'ok'}/>
    </div>

    <div className="incident-board overview-workspace">
      <section className="readiness-strip" aria-label="Readiness gates">
        <Gate title="Fleet scope" state={fleetSummary.unsupportedClusters ? 'blocked' : fleetNeedsAction ? 'running' : 'passed'} detail={`${fleetSummary.extendedClusters} extended, ${fleetSummary.unsupportedClusters} past support`} meta={`${fleetSummary.totalClusters} cluster(s)`}/>
        <Gate title="API scan" state={scannerFindings.length ? 'blocked' : 'passed'} detail={`${scannerFindings.length} deprecated API finding(s)`} meta="local manifest text"/>
        <Gate title="Add-ons" state={selectedAddonIds.length >= 4 ? 'passed' : selectedAddonIds.length ? 'running' : 'queued'} detail={`${selectedAddonIds.length} add-on group(s) selected`} meta="checklist"/>
        <Gate title="Maintenance" state={checked.window ? 'passed' : 'running'} detail={`${hops.length - 1} control-plane hop(s)`} meta={`EKS ${currentVersion} -> ${target}`}/>
      </section>

      <section className="product-panel fleet-panel">
        <div className="panel-title">
          <h2>Fleet scope</h2>
          <Source label={dataFreshness.sourceLabel} url={dataFreshness.sourceUrl}/>
        </div>
        <p className="fleet-caption">Editable rows feed cost, plan, scanner, and packet views.</p>
        <div className="fleet-list" aria-label="Editable fleet scope rows">
          {fleetItems.map((rawItem) => {
            const item = normalizedFleetItem(rawItem);
            const version = versionForFleetItem(item);
            const status = getSupportStatus(version);
            const rowTone = statusTone(version);
            const rowTargetOptions = eksVersions.filter((candidate) => compareEksVersions(candidate.version, item.version) >= 0);
            const rowExposure = calculateEksSupportExposure(version, fleetItemClusters(item), monthsDelayed);
            const isActive = item.id === activeFleetItemId;
            return <article key={item.id} className={`fleet-row ${isActive ? 'active' : ''}`} aria-label={`Fleet scope ${item.label}`}>
              <label className="fleet-cell fleet-scope-name">
                <span>Scope</span>
                <input aria-label={`Fleet item ${item.label} name`} value={item.label} onChange={(event) => updateFleetItem(item.id, { label: event.target.value || 'unnamed-scope' })}/>
              </label>
              <label className="fleet-cell">
                <span>Current</span>
                <VersionSelect value={item.version} ariaLabel={`Fleet item ${item.label} current EKS release`} onChange={(value) => updateFleetItem(item.id, { version: value })}/>
              </label>
              <label className="fleet-cell">
                <span>Target</span>
                <VersionSelect value={item.targetVersion} versions={rowTargetOptions} ariaLabel={`Fleet item ${item.label} target EKS release`} onChange={(value) => updateFleetItem(item.id, { targetVersion: value })}/>
              </label>
              <label className="fleet-cell fleet-cluster-count">
                <span>Clusters</span>
                <input aria-label={`Fleet item ${item.label} clusters`} type="number" min="1" value={fleetItemClusters(item)} onChange={(event) => updateFleetItem(item.id, { clusters: Math.max(1, Number(event.target.value) || 1) })}/>
              </label>
              <div className="fleet-cell fleet-status-cell">
                <span>Status</span>
                <strong className={`fleet-status ${rowTone}`}>{statusLabel(status)}</strong>
                <small>{deadlineCopy(version)}</small>
              </div>
              <div className="fleet-cell fleet-exposure">
                <span>Fees</span>
                <strong>{supportExposureLabel(rowExposure)}</strong>
              </div>
              <div className="fleet-actions">
                {isActive && <span className="active-scope-badge">Active scope</span>}
                {!isActive && <button type="button" onClick={() => applyFleetItemToScenario(item)}>Use in tools <span className="sr-only">for {item.label}</span></button>}
                <button type="button" onClick={() => removeFleetItem(item.id)} disabled={fleetItems.length === 1}>Remove</button>
              </div>
            </article>;
          })}
        </div>
        <button type="button" className="add-row-button" onClick={addFleetItem}>Add scope row</button>
      </section>

      <section className="product-panel change-packet-panel">
        <div className="panel-title">
          <h2>Change packet</h2>
          <CopyButton text={overviewBrief} label="Copy summary"/>
        </div>
        <div className={`response-token ${tone}`}>
          <span>{tone === 'bad' ? 'Action required' : tone === 'warn' ? 'Watch' : 'Ready'}</span>
          <strong>Single-version row EKS {selected.version}</strong>
          <p>{statusLabel(getSupportStatus(selected))}; {formatCurrency(cost.extraMonthly)} monthly support-tier delta across {clusterCount} selected-row cluster(s) if the modeled window overlaps extended support.</p>
        </div>
        <div className="response-checklist">
          {tasks.map((task) => <label key={task.id} className={checked[task.id] ? 'done' : ''}>
            <input type="checkbox" checked={Boolean(checked[task.id])} onChange={() => setChecked((current) => toggleRecord(current, task.id))}/>
            <span>{task.label}</span>
            <small>{task.detail}</small>
          </label>)}
        </div>
        <div className="action-list">
          <a href="/eks/extended-support-cost-calculator" onClick={(event) => { event.preventDefault(); navigate('/eks/extended-support-cost-calculator', setRoute); }}>Open cost model</a>
          <a href="/eks/upgrade-planner" onClick={(event) => { event.preventDefault(); navigate('/eks/upgrade-planner', setRoute); }}>Draft change plan</a>
          <a href="/eks/deprecated-api-scanner" onClick={(event) => { event.preventDefault(); navigate('/eks/deprecated-api-scanner', setRoute); }}>Scan pasted manifests</a>
          <a href={versionGuidePath(currentVersion)} onClick={(event) => { event.preventDefault(); navigate(versionGuidePath(currentVersion), setRoute); }}>Open EKS {currentVersion} guide</a>
          <a href="/eks/evidence-pack" onClick={(event) => { event.preventDefault(); navigate('/eks/evidence-pack', setRoute); }}>Assemble change packet</a>
        </div>
      </section>
    </div>
  </section>;
}

export function VersionsSection({ currentVersion, setCurrentVersion, setRoute }: { currentVersion: string; setCurrentVersion: (value: string) => void; setRoute: (route: AppRoute) => void }) {
  const gateForVersion = (version: EksVersion): GateState => {
    const status = getSupportStatus(version);
    if (status === 'standard') return 'passed';
    if (status === 'standard-ending-soon' || status === 'extended') return 'running';
    return 'blocked';
  };
  return <section className="product-section">
    <div className="section-head">
      <div>
        <span className="eyebrow">Lifecycle</span>
        <h1>EKS lifecycle registry</h1>
      </div>
      <p>Release dates, support windows, platform versions, and source links.</p>
    </div>

    <div className="lifecycle-gate-row">
      {eksVersions.slice(0, 4).map((version) => <Gate
        key={version.version}
        title={`EKS ${version.version}`}
        state={gateForVersion(version)}
        detail={statusLabel(getSupportStatus(version))}
        meta={deadlineCopy(version)}
      />)}
    </div>

    <div className="product-table-wrap">
      <table className="product-table lifecycle-table">
        <caption>Amazon EKS lifecycle registry with support gates, lifecycle dates, platform versions, source citations, and version guides.</caption>
        <colgroup>
          <col className="lifecycle-col-release"/>
          <col className="lifecycle-col-gate"/>
          <col className="lifecycle-col-status"/>
          <col className="lifecycle-col-date"/>
          <col className="lifecycle-col-date"/>
          <col className="lifecycle-col-date"/>
          <col className="lifecycle-col-platform"/>
          <col className="lifecycle-col-source"/>
          <col className="lifecycle-col-guide"/>
        </colgroup>
        <thead><tr><th scope="col">Release</th><th scope="col">Gate</th><th scope="col">Status</th><th scope="col">Release date</th><th scope="col">Standard end</th><th scope="col">Extended end</th><th scope="col">Platform</th><th scope="col">Source</th><th scope="col">Guide</th></tr></thead>
        <tbody>{eksVersions.map((version) => <tr key={version.version} className={version.version === currentVersion ? 'selected' : ''} aria-selected={version.version === currentVersion}>
          <th scope="row"><button type="button" aria-label={`Select EKS ${version.version}`} aria-pressed={version.version === currentVersion} onClick={() => setCurrentVersion(version.version)}>EKS {version.version}</button></th>
          <td><span className={`table-gate gate-${gateForVersion(version)}`}>{gateForVersion(version)}</span></td>
          <td><StatusPill version={version}/></td>
          <td>{version.releaseDate}</td>
          <td>{version.standardSupportEnd}</td>
          <td>{version.extendedSupportEnd}</td>
          <td>{version.latestPlatform ?? 'Check source'}</td>
          <td><Source label="EKS lifecycle source" url={version.sourceUrl}/></td>
          <td><a href={versionGuidePath(version.version)} onClick={(event) => { event.preventDefault(); navigate(versionGuidePath(version.version), setRoute); }}>Guide</a></td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}

export function CostSection({
  currentVersion,
  clusterCount,
  monthsDelayed,
  fleetItems,
  activeFleetItemId,
  applyFleetItemToScenario,
  setActiveFleetItemId,
  setCurrentVersion,
  setClusterCount,
  setMonthsDelayed,
}: {
  currentVersion: string;
  clusterCount: number;
  monthsDelayed: number;
  fleetItems: FleetItem[];
  activeFleetItemId: string | null;
  applyFleetItemToScenario: (item: FleetItem) => void;
  setActiveFleetItemId: (value: string | null) => void;
  setCurrentVersion: (value: string) => void;
  setClusterCount: (value: number) => void;
  setMonthsDelayed: (value: number) => void;
}) {
  const [costMode, setCostMode] = useState<'fleet' | 'single'>('fleet');
  const [scenario, setScenario] = useState<ScenarioId>('bridge');
  const { selected, cost } = costSummary(currentVersion, clusterCount, monthsDelayed);
  const fleetSummary = summarizeFleet(fleetItems, monthsDelayed);
  const activeFleetItem = fleetItems.find((item) => item.id === activeFleetItemId) ?? null;
  const isExpired = getSupportStatus(selected) === 'expired';
  const monthCountCopy = (value: number) => `${value} month${value === 1 ? '' : 's'}`;
  const accelerateWindowMonths = Math.max(1, monthsDelayed - 2);
  const deferWindowMonths = Math.min(24, monthsDelayed + 4);
  const scenarioDefinitions = [
    { id: 'accelerate' as ScenarioId, label: 'Accelerate', months: accelerateWindowMonths },
    { id: 'bridge' as ScenarioId, label: 'Bridge', months: monthsDelayed },
    { id: 'defer' as ScenarioId, label: 'Defer', months: deferWindowMonths },
  ];
  const scenarioWindowNote = (scenarioCost: ReturnType<typeof calculateEksSupportExposure>, fallback: string) => {
    if (scenarioCost.isPastExtendedSupport) return `already ${scenarioCost.daysPastExtendedSupport}d past extended support`;
    if (scenarioCost.postExtendedSupportDays > 0) return `misses extended end by ${scenarioCost.postExtendedSupportDays}d`;
    if (scenarioCost.billableDays === 0) return 'no extended-support overlap';
    return fallback;
  };
  const scenarioNote = (scenarioCost: ReturnType<typeof calculateEksSupportExposure>, fallback: string) => {
    if (scenarioCost.isPastExtendedSupport) return `past support since ${selected.extendedSupportEnd}`;
    if (scenarioCost.postExtendedSupportDays > 0) return `misses extended end by ${scenarioCost.postExtendedSupportDays}d`;
    if (scenarioCost.billableDays === 0) return 'no extended-support overlap';
    return fallback;
  };
  const formatCount = (value: number) => new Intl.NumberFormat('en-US').format(value);
  const rowFeeCopy = (rowCost: ReturnType<typeof calculateEksSupportExposure>) => {
    if (rowCost.isPastExtendedSupport) return 'past support, automatic-upgrade risk';
    if (rowCost.postExtendedSupportDays > 0) {
      return `${supportExposureLabel(rowCost)} remaining, ${rowCost.postExtendedSupportDays}d unsupported`;
    }
    return `${supportExposureLabel(rowCost)} remaining`;
  };
  const fleetScenarioPrimary = (row: { exposureTotal: number; postExtendedClusterDays: number }) => {
    if (row.postExtendedClusterDays > 0) return `${formatCount(row.postExtendedClusterDays)} unsupported`;
    return formatCurrency(row.exposureTotal);
  };
  const fleetScenarioSecondary = (row: { postExtendedClusterDays: number }) => {
    if (row.postExtendedClusterDays > 0) return 'cluster-days past support';
    return 'Remaining support fees';
  };
  const scenarioRows: ScenarioRow[] = scenarioDefinitions.map((definition) => ({
    ...definition,
    note: '',
    cost: definition.id === 'bridge'
      ? cost
      : calculateEksSupportExposure(selected, clusterCount, definition.months),
  }));
  scenarioRows[0].note = scenarioNote(scenarioRows[0].cost, isExpired ? 'execute recovery upgrade' : 'fund platform focus now');
  scenarioRows[1].note = scenarioNote(scenarioRows[1].cost, isExpired ? 'stabilize and upgrade now' : 'hold current delivery plan');
  scenarioRows[2].note = scenarioNote(scenarioRows[2].cost, isExpired ? 'high-risk auto-upgrade' : 'accept support runway');
  const fleetScenarioRows = scenarioDefinitions.map((definition) => {
    const details = fleetItems.map((rawItem) => {
      const item = normalizedFleetItem(rawItem);
      const version = versionForFleetItem(item);
      const clusters = fleetItemClusters(item);
      const rowCost = calculateEksSupportExposure(version, clusters, definition.months);
      return { item, version, clusters, cost: rowCost };
    });
    const exposureTotal = details.reduce((sum, detail) => sum + (detail.cost.isPastExtendedSupport ? 0 : detail.cost.extraTotal), 0);
    const billableClusterDays = details.reduce((sum, detail) => sum + detail.cost.billableDays * detail.clusters, 0);
    const postExtendedClusterDays = details.reduce((sum, detail) => sum + detail.cost.postExtendedSupportDays * detail.clusters, 0);
    const rowsPastSupport = details.filter((detail) => detail.cost.isPastExtendedSupport || detail.cost.postExtendedSupportDays > 0).length;
    const note = postExtendedClusterDays > 0
      ? `${postExtendedClusterDays} cluster-day(s) after extended support`
      : billableClusterDays > 0
      ? `${billableClusterDays} billable cluster-day(s)`
      : 'no extended-support overlap';
    return {
      ...definition,
      details,
      exposureTotal,
      billableClusterDays,
      billableClusterHours: billableClusterDays * 24,
      postExtendedClusterDays,
      rowsPastSupport,
      note,
    };
  });
  const activeScenario = scenarioRows.find((row) => row.id === scenario) ?? scenarioRows[1];
  const activeFleetScenario = fleetScenarioRows.find((row) => row.id === scenario) ?? fleetScenarioRows[1];
  const deferScenario = scenarioRows.find((row) => row.id === 'defer') ?? activeScenario;
  const fleetDeferScenario = fleetScenarioRows.find((row) => row.id === 'defer') ?? activeFleetScenario;
  const avoided = Math.max(0, deferScenario.cost.extraTotal - activeScenario.cost.extraTotal);
  const fleetAvoided = Math.max(0, fleetDeferScenario.exposureTotal - activeFleetScenario.exposureTotal);
  const unsupportedDaysAvoided = Math.max(0, deferScenario.cost.postExtendedSupportDays - activeScenario.cost.postExtendedSupportDays);
  const unsupportedClusterDaysAvoided = unsupportedDaysAvoided * clusterCount;
  const fleetUnsupportedClusterDaysAvoided = Math.max(0, fleetDeferScenario.postExtendedClusterDays - activeFleetScenario.postExtendedClusterDays);
  const exposureCopy = activeScenario.cost.isPastExtendedSupport
    ? `past extended support since ${selected.extendedSupportEnd}; AWS can automatically upgrade after extended support ends`
    : activeScenario.cost.billableDays > 0
    ? `${activeScenario.cost.billableDays} billable extended-support day(s) in the ${activeScenario.months}-month window`
    : `no extended-support billing in the ${activeScenario.months}-month window`;
  const scenarioExposureCopy = activeScenario.cost.isPastExtendedSupport
    ? 'Not applicable - release is past extended support'
    : formatCurrency(activeScenario.cost.extraTotal);
  const avoidedCopy = activeScenario.cost.isPastExtendedSupport
    ? 'Not applicable'
    : formatCurrency(avoided);
  const avoidedSentence = activeScenario.cost.postExtendedSupportDays > 0 || deferScenario.cost.postExtendedSupportDays > 0
    ? activeScenario.id === 'defer'
      ? `${activeScenario.cost.postExtendedSupportDays} unsupported day(s) remain in the modeled window; fee totals are capped at extended-support end.`
      : `${unsupportedDaysAvoided} unsupported day(s) avoided versus Defer (${formatCount(unsupportedClusterDaysAvoided)} cluster-day(s)); remaining-fee totals are capped at extended-support end.`
    : `${avoidedCopy} remaining fees avoided versus Defer.`;
  const fleetComparisonSentence = activeFleetScenario.postExtendedClusterDays > 0 || fleetDeferScenario.postExtendedClusterDays > 0
    ? activeFleetScenario.id === 'defer'
      ? `${formatCount(activeFleetScenario.postExtendedClusterDays)} unsupported cluster-day(s) remain in the modeled window; fee totals are capped at each version's extended-support end.`
      : `${formatCount(fleetUnsupportedClusterDaysAvoided)} unsupported cluster-day(s) avoided versus Defer; remaining-fee totals are capped at each version's extended-support end.`
    : `${formatCurrency(fleetAvoided)} remaining fees avoided versus Defer.`;
  const comparisonCaveat = deferScenario.cost.billableWindowClippedByExtendedEnd
    ? ` Defer may not add remaining support fees after ${selected.extendedSupportEnd} because extended support has ended, but it carries past-support and automatic-upgrade risk.`
    : '';
  const clippedWindowCopy = activeScenario.cost.billableWindowClippedByExtendedEnd
    ? `The billable window stops at ${selected.extendedSupportEnd}. A near-expired release can show less remaining spend than a newer release because the plan is running out of supported time.`
    : '';
  const activeBillableCopy = activeScenario.cost.isPastExtendedSupport
    ? 'Past support'
    : `${activeScenario.cost.billableDays}d / ${activeScenario.cost.billableHours}h`;
  const hourlyDelta = (eksPricing.extendedPerClusterHour - eksPricing.standardPerClusterHour) * clusterCount;
  const billableOverlapCopy = activeScenario.cost.isPastExtendedSupport
    ? `Release is past extended support; remaining support fees are no longer the right model.`
    : activeScenario.cost.billableStart && activeScenario.cost.billableEnd
    ? `${activeScenario.cost.billableStart} -> ${activeScenario.cost.billableEnd}`
    : 'No overlap with extended support in the modeled window';
  const billingCalendarCopy = 'AWS UTC calendar day';
  const windowReasonCopy = activeScenario.cost.isPastExtendedSupport
    ? 'Past-support releases are shown as operational risk because AWS can automatically upgrade clusters after extended support ends.'
    : activeScenario.cost.billableWindowClippedByExtendedEnd
    ? `The overlap stops at extended support end. The modeled plan then has ${activeScenario.cost.postExtendedSupportDays} day(s) after EKS ${selected.version} leaves extended support.`
    : activeScenario.cost.billableDays > 0
    ? 'The modeled window overlaps the extended-support period, so only those overlapping days are counted.'
    : 'The modeled window stays in standard support, so the support-tier delta is zero for this scenario.';
  const scenarioScopeLabel = activeFleetItem ? activeFleetItem.label : 'custom scenario';
  const scenarioBasisCopy = `Bridge uses the ${monthCountCopy(monthsDelayed)} base delay; Accelerate models ${monthCountCopy(accelerateWindowMonths)} and Defer models ${monthCountCopy(deferWindowMonths)}. Windows are clamped to the 1-24 month range.`;
  const singleDeadlineResult = activeScenario.cost.isPastExtendedSupport
    ? 'Already past extended support'
    : activeScenario.cost.postExtendedSupportDays > 0
    ? `Deadline missed by ${activeScenario.cost.postExtendedSupportDays}d`
    : activeScenario.cost.billableDays > 0
    ? 'Inside extended support'
    : 'No extended-support fees';
  const fleetDeadlineResult = activeFleetScenario.postExtendedClusterDays > 0
    ? `${activeFleetScenario.postExtendedClusterDays} unsupported cluster-day(s)`
    : activeFleetScenario.billableClusterDays > 0
    ? 'All rows stay supported'
    : 'No extended-support fees';
  const selectedSingleFeeCopy = activeScenario.cost.isPastExtendedSupport
    ? 'remaining fees not applicable'
    : `${supportExposureLabel(activeScenario.cost)} remaining support fees`;
  const selectedSingleScenarioCopy = `Selected case: ${activeScenario.label}, ${activeScenario.months}-month completion window, ${selectedSingleFeeCopy}, ${singleDeadlineResult.toLowerCase()}.`;
  const selectedFleetScenarioCopy = `Selected fleet case: ${activeFleetScenario.label}, ${activeFleetScenario.months}-month completion window, ${formatCurrency(activeFleetScenario.exposureTotal)} remaining support fees, ${fleetDeadlineResult.toLowerCase()}.`;
  const modeledUnsupportedTone: 'ok' | 'bad' = activeFleetScenario.postExtendedClusterDays > 0 ? 'bad' : 'ok';
  const modeledUnsupportedDetail = activeFleetScenario.postExtendedClusterDays > 0
    ? `${activeFleetScenario.label} window after extended-support end`
    : 'Selected fleet window stays within support end dates';
  const remainingFeesCopy = 'Remaining fees count only future EKS extended-support charges. When a modeled window passes extended-support end, dollars stop accumulating and unsupported-days risk starts.';
  const fleetReport = `# EKS fleet support-cost model

Scope: ${fleetItems.length} row(s), ${fleetSummary.totalClusters} cluster(s)
Scenario: ${activeFleetScenario.label}
Completion window: ${activeFleetScenario.months} month(s)
Billing calendar: ${billingCalendarCopy}
Billable cluster-days: ${activeFleetScenario.billableClusterDays}
Past-support cluster-days in modeled window: ${activeFleetScenario.postExtendedClusterDays}
Remaining support fees: ${formatCurrency(activeFleetScenario.exposureTotal)}
Remaining fees avoided versus defer scenario: ${formatCurrency(fleetAvoided)}
Unsupported cluster-days avoided versus defer scenario: ${fleetUnsupportedClusterDaysAvoided}

Rows:
${activeFleetScenario.details.map((detail) => `- ${detail.item.label}: EKS ${detail.item.version} -> EKS ${detail.item.targetVersion}, ${detail.clusters} cluster(s), ${detail.cost.billableDays} billable day(s), ${detail.cost.postExtendedSupportDays} past-support day(s), ${supportExposureLabel(detail.cost)}`).join('\n')}

Recommendation:
${activeFleetScenario.postExtendedClusterDays > 0 ? 'At least one modeled completion window crosses the extended-support end date. Treat this as support-deadline risk first and spend optimization second.' : activeFleetScenario.exposureTotal > 0 ? 'Prioritize rows with the largest billable cluster-day count and earliest lifecycle deadlines.' : 'No modeled extended-support fees in this fleet window; keep lifecycle deadlines visible so the fleet does not drift into the paid window.'}

Sources:
- ${eksPricing.sourceLabel}: ${eksPricing.sourceUrl}
- ${dataFreshness.sourceLabel}: ${dataFreshness.sourceUrl}

Limitations:
${eksPricing.note} Fleet mode sums static row inputs; it does not discover live AWS clusters.`;
  const businessCase = `# EKS support-tier cost model

Scope: ${scenarioScopeLabel}
Version: EKS ${selected.version}
Standard support end: ${selected.standardSupportEnd}
Scenario: ${activeScenario.label}
Clusters: ${clusterCount}
Completion window: ${activeScenario.months} month(s)
Billing calendar: ${billingCalendarCopy}
Monthly rate delta if extended support is reached: ${formatCurrency(activeScenario.cost.extraMonthly)}
Billable extended-support window: ${exposureCopy}
Billable days/hours: ${activeBillableCopy}
Past-support days in modeled window: ${activeScenario.cost.postExtendedSupportDays}
Remaining support fees: ${scenarioExposureCopy}
Remaining fees avoided versus defer scenario: ${avoidedCopy}
Unsupported cluster-days avoided versus defer scenario: ${unsupportedClusterDaysAvoided}
${comparisonCaveat ? `Comparison note: ${comparisonCaveat.trim()}\n` : ''}
${clippedWindowCopy ? `Risk note: ${clippedWindowCopy}\n` : ''}

Recommendation:
${activeScenario.cost.isPastExtendedSupport ? 'Treat this as an urgent unsupported-version recovery. Confirm whether AWS has already initiated an automatic upgrade and move to a supported target deliberately.' : activeScenario.id === 'accelerate' ? 'Fund focused platform time before extended support billing becomes the operating baseline.' : activeScenario.id === 'bridge' ? 'Keep the committed plan, but reserve a budget-visible bridge for the modeled support-fee window.' : 'Defer only with explicit acceptance of the support-tier delta, owner, and review date.'}

Sources:
- ${eksPricing.sourceLabel}: ${eksPricing.sourceUrl}
- ${selected.sourceLabel}: ${selected.sourceUrl}

Limitations:
${eksPricing.note} Lifecycle dates and billable windows use AWS UTC dates from the EKS lifecycle calendar.`;
  const report = `${businessCase}\n\n---\n\n${generateCostReport(currentVersion, clusterCount, monthsDelayed)}`;
  return <section className="product-section">
    <div className="section-head">
      <div>
        <span className="eyebrow">Cost</span>
        <h1>Support fees and deadline risk</h1>
      </div>
      <p>Remaining support fees and unsupported days.</p>
    </div>

    <section className="product-panel cost-scope-panel" aria-label="Fleet cost scope">
      <div className="panel-title">
        <div>
          <h2>Fleet Cost Scope</h2>
        <p>Carried from Overview. Fleet mode sums mixed-version rows; Single release models one release line.</p>
        </div>
        <span>{fleetSummary.totalClusters} clusters · {fleetItems.length} scope rows</span>
      </div>
      <div className="cost-scope-metrics">
        <ProductMetric label="Fleet remaining fees" value={formatCurrency(fleetSummary.exposureTotal)} detail={`${monthsDelayed} month support-tier overlap`} tone={fleetSummary.exposureTotal > 0 ? 'warn' : 'ok'}/>
        <ProductMetric label="Extended support" value={String(fleetSummary.extendedClusters)} detail="Clusters currently billing extended support" tone={fleetSummary.extendedClusters ? 'warn' : 'ok'}/>
        <ProductMetric label="Modeled unsupported" value={formatCount(activeFleetScenario.postExtendedClusterDays)} detail={modeledUnsupportedDetail} tone={modeledUnsupportedTone}/>
        <ProductMetric label="Next deadline" value={fleetSummary.nextDeadline ? `${fleetSummary.nextDeadline.days}d` : 'Clear'} detail={fleetSummary.nextDeadline?.label ?? 'No future deadline in scope'} tone={fleetSummary.nextDeadline ? 'warn' : 'ok'}/>
      </div>
      <div className="cost-scope-list" aria-label="Fleet rows available for cost modeling">
        {fleetItems.map((rawItem) => {
          const item = normalizedFleetItem(rawItem);
          const version = versionForFleetItem(item);
          const rowExposure = calculateEksSupportExposure(version, fleetItemClusters(item), monthsDelayed);
          const isActive = item.id === activeFleetItemId;
          return <button
            type="button"
            key={item.id}
            className={isActive ? 'active' : ''}
            aria-pressed={isActive}
            onClick={() => {
              applyFleetItemToScenario(item);
              setCostMode('single');
              setScenario('bridge');
            }}
          >
            <span>{item.label}</span>
            <strong>EKS {item.version}{' -> '}EKS {item.targetVersion}</strong>
            <em>{fleetItemClusters(item)} cluster(s) · {rowFeeCopy(rowExposure)} · {deadlineCopy(version)}</em>
            <span className="sr-only">Model this row</span>
          </button>;
        })}
      </div>
    </section>

    <div className="segmented cost-mode-toggle" aria-label="Cost model scope">
      <button type="button" className={costMode === 'fleet' ? 'active' : ''} aria-pressed={costMode === 'fleet'} onClick={() => setCostMode('fleet')}>Fleet aggregate</button>
      <button type="button" className={costMode === 'single' ? 'active' : ''} aria-pressed={costMode === 'single'} onClick={() => setCostMode('single')}>Single release</button>
    </div>

    {costMode === 'fleet' ? <div className="tool-grid finance-layout">
      <section className="product-panel finance-controls-panel">
        <ProductField label={`Bridge delay: ${monthsDelayed} month(s)`}><input type="range" min="1" max="24" value={monthsDelayed} onChange={(event) => {
          setScenario('bridge');
          setMonthsDelayed(Number(event.target.value));
        }}/></ProductField>
        <p className="small-note">Fleet aggregate mode uses every row from Overview, so mixed EKS versions are modeled together instead of forcing one selected version to represent the fleet. {scenarioBasisCopy}</p>
        <p className="small-note selected-scenario-note">{selectedFleetScenarioCopy}</p>
        <p className="small-note support-window-note">{remainingFeesCopy}</p>
        <div className="scenario-ledger" aria-label="Fleet support cost scenarios">
          {fleetScenarioRows.map((row) => <button
            type="button"
            key={row.id}
            className={scenario === row.id ? 'active' : ''}
            aria-pressed={scenario === row.id}
            onClick={() => setScenario(row.id)}
          >
            <span>{row.label}</span>
            <strong className={row.postExtendedClusterDays > 0 ? 'risk-headline' : ''}>{fleetScenarioPrimary(row)}</strong>
            <em>{fleetScenarioSecondary(row)}</em>
            <em>{row.months} mo window · {row.note}</em>
            <span className="sr-only">Select {row.label} fleet scenario.</span>
          </button>)}
        </div>
        <dl className="cost-ledger">
          <div><dt>Fleet clusters</dt><dd>{fleetSummary.totalClusters}</dd></div>
          <div><dt>Selected case</dt><dd>{activeFleetScenario.label}</dd></div>
          <div><dt>Remaining fees</dt><dd>{formatCurrency(activeFleetScenario.exposureTotal)}</dd></div>
          <div><dt>Billable cluster-days</dt><dd>{activeFleetScenario.billableClusterDays}</dd></div>
          <div><dt>Past-support cluster-days</dt><dd>{activeFleetScenario.postExtendedClusterDays}</dd></div>
          <div><dt>Selected window</dt><dd>{activeFleetScenario.months} mo</dd></div>
          <div><dt>Deadline result</dt><dd>{fleetDeadlineResult}</dd></div>
        </dl>
        <p className="small-note">Formula uses {formatHourlyCurrency(eksPricing.extendedPerClusterHour - eksPricing.standardPerClusterHour)}/cluster-hour x billable cluster-hours. Windows use the AWS UTC lifecycle calendar. <Source label={eksPricing.sourceLabel} url={eksPricing.sourceUrl}/></p>
        {activeFleetScenario.postExtendedClusterDays > 0 && <p className="small-note support-window-note">At least one row crosses an extended-support end date. The dollar model stops there; the remaining modeled days are support-deadline risk, not savings.</p>}
        <div className="cost-explainer" aria-label="Fleet cost calculation explanation">
          <h2>Why this number?</h2>
          <dl>
            <div><dt>Fleet rows</dt><dd>{fleetItems.length} row(s), {fleetSummary.totalClusters} cluster(s)</dd></div>
            <div><dt>Billing day</dt><dd>{billingCalendarCopy}</dd></div>
            <div><dt>Billable work</dt><dd>{activeFleetScenario.billableClusterDays} cluster-day(s) / {activeFleetScenario.billableClusterHours} cluster-hour(s)</dd></div>
            <div><dt>Formula</dt><dd>{formatHourlyCurrency(eksPricing.extendedPerClusterHour - eksPricing.standardPerClusterHour)}/cluster-hour delta x {activeFleetScenario.billableClusterHours} billable cluster-hour(s)</dd></div>
          </dl>
          <p>{activeFleetScenario.postExtendedClusterDays > 0 ? `${activeFleetScenario.postExtendedClusterDays} cluster-day(s) in this modeled window fall after an extended-support end date and should be treated as unsupported-version execution risk.` : 'Each row contributes only the days where its modeled window overlaps that row version support window.'}</p>
        </div>
      </section>

      <section className="product-panel finance-paper">
        <span className="eyebrow">{activeFleetScenario.label} fleet case</span>
        <strong className={activeFleetScenario.postExtendedClusterDays > 0 ? 'risk-headline' : ''}>{fleetScenarioPrimary(activeFleetScenario)}</strong>
        {activeFleetScenario.postExtendedClusterDays > 0 && <em className="paper-subtotal">{formatCurrency(activeFleetScenario.exposureTotal)} remaining support fees</em>}
        <p>{activeFleetScenario.months} month modeled completion window, {activeFleetScenario.billableClusterDays} billable cluster-day(s). {fleetComparisonSentence}</p>
        <div className="product-table-wrap finance-table-wrap">
          <table className="finance-table product-finance-table">
            <thead><tr><th>Scope</th><th>Version</th><th>Clusters</th><th>Billable</th><th>Unsupported</th><th>Remaining fees</th><th>Assessment</th></tr></thead>
            <tbody>{activeFleetScenario.details.map((detail) => <tr key={detail.item.id}>
              <td>{detail.item.label}</td>
              <td>EKS {detail.item.version}{' -> '}{detail.item.targetVersion}</td>
              <td>{detail.clusters}</td>
              <td>{detail.cost.billableDays}d</td>
              <td>{detail.cost.postExtendedSupportDays}d</td>
              <td>{supportExposureLabel(detail.cost)}</td>
              <td>{scenarioWindowNote(detail.cost, deadlineCopy(detail.version))}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="business-case">
          <h2>Planning Note</h2>
          <p>{activeFleetScenario.postExtendedClusterDays > 0 ? 'Shorten or split the plan for rows that miss extended-support end dates before optimizing dollars.' : 'Use the row table to prioritize the releases with the most billable cluster-days and nearest lifecycle deadlines.'}</p>
        </div>
      </section>

      <CopyableReport className="wide" title="Copyable Fleet Cost Model" text={fleetReport} label="Copy fleet model"/>
    </div> : (
    <div className="tool-grid finance-layout">
      <section className="product-panel finance-controls-panel">
        <div className="form-grid">
          <ProductField label="Scenario EKS version"><VersionSelect value={currentVersion} onChange={(value) => {
            setActiveFleetItemId(null);
            setScenario('bridge');
            setCurrentVersion(value);
          }}/></ProductField>
          <ProductField label="Scenario clusters"><input type="number" min="1" value={clusterCount} onChange={(event) => {
            setActiveFleetItemId(null);
            setScenario('bridge');
            setClusterCount(Math.max(1, Number(event.target.value) || 1));
          }}/></ProductField>
          <ProductField label={`Bridge delay: ${monthsDelayed} month(s)`}><input type="range" min="1" max="24" value={monthsDelayed} onChange={(event) => {
            setScenario('bridge');
            setMonthsDelayed(Number(event.target.value));
          }}/></ProductField>
        </div>
        <p className="small-note">Scenario scope: {scenarioScopeLabel}. This view models one release line; switch to Fleet aggregate for mixed-version totals. {scenarioBasisCopy}</p>
        <p className="small-note selected-scenario-note">{selectedSingleScenarioCopy}</p>
        <p className="small-note support-window-note">{remainingFeesCopy}</p>
        <ScenarioLedger rows={scenarioRows} activeId={scenario} setActiveId={setScenario}/>
        <dl className="cost-ledger">
          <div><dt>Selected case</dt><dd>{activeScenario.label}</dd></div>
          <div><dt>Selected window</dt><dd>{activeScenario.months} mo</dd></div>
          <div><dt>Remaining fees</dt><dd>{activeScenario.cost.isPastExtendedSupport ? 'Not applicable' : supportExposureLabel(activeScenario.cost)}</dd></div>
          <div><dt>Billable window</dt><dd>{activeScenario.cost.isPastExtendedSupport ? 'Ended' : `${activeScenario.cost.billableDays}d`}</dd></div>
          <div><dt>Unsupported days</dt><dd>{activeScenario.cost.postExtendedSupportDays}d</dd></div>
          <div><dt>Deadline result</dt><dd>{singleDeadlineResult}</dd></div>
        </dl>
        <p className="small-note">{activeScenario.cost.isPastExtendedSupport ? `EKS ${selected.version} extended support ended ${selected.extendedSupportEnd}; automatic upgrades can happen after that date.` : `EKS ${selected.version} standard support ends ${selected.standardSupportEnd}.`} Windows use the AWS UTC lifecycle calendar and actual billable days; monthly figures use the AWS 730-hour rate-card convention. <Source label={eksPricing.sourceLabel} url={eksPricing.sourceUrl}/></p>
        {clippedWindowCopy && <p className="small-note support-window-note">{clippedWindowCopy}</p>}
        <div className="cost-explainer" aria-label="Cost calculation explanation">
          <h2>Why this number?</h2>
          <dl>
            <div><dt>Modeled window</dt><dd>{activeScenario.cost.modelStart}{' -> '}{activeScenario.cost.modelEnd}</dd></div>
            <div><dt>Billing day</dt><dd>{billingCalendarCopy}</dd></div>
            <div><dt>Billable overlap</dt><dd>{billableOverlapCopy}</dd></div>
            <div><dt>Rate card</dt><dd>{formatCurrency(activeScenario.cost.standardMonthly)} standard monthly / {formatCurrency(activeScenario.cost.extendedMonthly)} extended monthly</dd></div>
            <div><dt>Monthly delta</dt><dd>{formatCurrency(activeScenario.cost.extraMonthly)} if the window is fully in extended support</dd></div>
            <div><dt>Formula</dt><dd>{formatHourlyCurrency(hourlyDelta)}/hour delta x {activeScenario.cost.billableHours} billable hour(s)</dd></div>
          </dl>
          <p>{windowReasonCopy}</p>
        </div>
      </section>

      <section className="product-panel finance-paper">
        <span className="eyebrow">{activeScenario.label} case</span>
        <strong className={activeScenario.cost.postExtendedSupportDays > 0 || activeScenario.cost.isPastExtendedSupport ? 'risk-headline' : ''}>{activeScenario.cost.postExtendedSupportDays > 0 && !activeScenario.cost.isPastExtendedSupport ? `${activeScenario.cost.postExtendedSupportDays}d unsupported` : supportExposureLabel(activeScenario.cost)}</strong>
        {activeScenario.cost.postExtendedSupportDays > 0 && !activeScenario.cost.isPastExtendedSupport && <em className="paper-subtotal">{supportExposureLabel(activeScenario.cost)} remaining support fees</em>}
        <p>{activeScenario.cost.isPastExtendedSupport ? `EKS ${selected.version} is outside the extended-support window. This is automatic-upgrade risk, not a zero-cost state.` : `${activeScenario.months} month modeled window, ${exposureCopy}, ${avoidedSentence}${comparisonCaveat}`}</p>
        <div className="product-table-wrap finance-table-wrap">
          <table className="finance-table product-finance-table">
            <thead><tr><th>Scenario</th><th>Window</th><th>Billable</th><th>Unsupported</th><th>Remaining fees</th><th>Planning note</th></tr></thead>
            <tbody>{scenarioRows.map((row) => <tr key={row.id} className={row.id === scenario ? 'selected' : ''}><td>{row.label}</td><td>{row.months} mo</td><td>{row.cost.isPastExtendedSupport ? 'Past support' : `${row.cost.billableDays}d`}</td><td>{row.cost.postExtendedSupportDays}d</td><td>{supportExposureLabel(row.cost)}</td><td>{row.note}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="business-case">
          <h2>Planning Note</h2>
          <p>{activeScenario.cost.isPastExtendedSupport ? 'Move this into an unsupported-version recovery plan with explicit owner, supported target, and rollback evidence.' : activeScenario.id === 'accelerate' ? 'Fund upgrade execution now to avoid normalizing extended support as a recurring operating cost.' : activeScenario.id === 'bridge' ? 'Reserve a time-boxed budget bridge while platform work clears add-on, API, and maintenance gates.' : 'Defer only with explicit acceptance of support-tier fees, owner, and review date.'}</p>
        </div>
      </section>

      <CopyableReport className="wide" title="Copyable Cost Model" text={report} label="Copy cost model"/>
    </div>
    )}
  </section>;
}

export function PlannerSection({
  currentVersion,
  targetVersion,
  clusterCount,
  monthsDelayed,
  nodeModel,
  selectedAddons,
  scannerFindings,
  fleetItems,
  activeFleetItemId,
  applyFleetItemToScenario,
  setCurrentVersion,
  setTargetVersion,
  setClusterCount,
  setMonthsDelayed,
  setNodeModel,
  setSelectedAddons,
}: {
  currentVersion: string;
  targetVersion: string;
  clusterCount: number;
  monthsDelayed: number;
  nodeModel: NodeModel;
  selectedAddons: Record<string, boolean>;
  scannerFindings: ReturnType<typeof scanManifest>;
  fleetItems: FleetItem[];
  activeFleetItemId: string | null;
  applyFleetItemToScenario: (item: FleetItem) => void;
  setCurrentVersion: (value: string) => void;
  setTargetVersion: (value: string) => void;
  setClusterCount: (value: number) => void;
  setMonthsDelayed: (value: number) => void;
  setNodeModel: (value: NodeModel) => void;
  setSelectedAddons: (value: Record<string, boolean>) => void;
}) {
  const [plannerMode, setPlannerMode] = useState<'fleet' | 'single'>('fleet');
  const targetOptions = eksVersions.filter((version) => compareEksVersions(version.version, currentVersion) >= 0);
  const effectiveTarget = compareEksVersions(targetVersion, currentVersion) < 0 ? currentVersion : targetVersion;
  const selectedAddonIds = selectedAddonIdsFrom(selectedAddons);
  const selectedAddonsForReport = addons.filter((addon) => selectedAddonIds.includes(addon.id));
  const hops = generateHopSequence(currentVersion, effectiveTarget);
  const { selected, cost } = costSummary(currentVersion, clusterCount, monthsDelayed);
  const formatCount = (value: number) => new Intl.NumberFormat('en-US').format(value);
  const activeFleetItem = fleetItems.find((item) => item.id === activeFleetItemId) ?? null;
  const fleetPlanRows = fleetItems.map((rawItem) => {
    const item = normalizedFleetItem(rawItem);
    const version = versionForFleetItem(item);
    const clusters = fleetItemClusters(item);
    const target = item.targetVersion;
    const rowHops = generateHopSequence(item.version, target);
    const rowCost = calculateEksSupportExposure(version, clusters, monthsDelayed);
    const risk = rowCost.isPastExtendedSupport
      ? `Past support since ${version.extendedSupportEnd}`
      : rowCost.postExtendedSupportDays > 0
      ? `${rowCost.postExtendedSupportDays}d after extended support`
      : rowCost.billableDays > 0
      ? `${supportExposureLabel(rowCost)} remaining fees`
      : 'No support-fee window';
    return { item, version, clusters, target, hops: rowHops, cost: rowCost, risk };
  });
  const fleetPlanGroups = Array.from(fleetPlanRows.reduce((groups, row) => {
    const key = `${row.version.version}->${row.target}`;
    const existing = groups.get(key) ?? {
      key,
      current: row.version.version,
      target: row.target,
      clusters: 0,
      rows: 0,
      hops: row.hops,
    };
    groups.set(key, {
      ...existing,
      clusters: existing.clusters + row.clusters,
      rows: existing.rows + 1,
    });
    return groups;
  }, new Map<string, { key: string; current: string; target: string; clusters: number; rows: number; hops: string[] }>()).values());
  const fleetClusters = fleetPlanRows.reduce((sum, row) => sum + row.clusters, 0);
  const fleetRemainingFees = fleetPlanRows.reduce((sum, row) => sum + (row.cost.isPastExtendedSupport ? 0 : row.cost.extraTotal), 0);
  const fleetBillableClusterDays = fleetPlanRows.reduce((sum, row) => sum + row.cost.billableDays * row.clusters, 0);
  const fleetUnsupportedClusterDays = fleetPlanRows.reduce((sum, row) => sum + row.cost.postExtendedSupportDays * row.clusters, 0);
  const fleetHopWorkItems = fleetPlanRows.reduce((sum, row) => sum + Math.max(0, row.hops.length - 1), 0);
  const fleetRowsWithDeadlineRisk = fleetPlanRows.filter((row) => row.cost.isPastExtendedSupport || row.cost.postExtendedSupportDays > 0).length;
  const scannerReportLines = scannerFindings.length
    ? scannerFindings.map((finding) => `- ${finding.severity.toUpperCase()}: line ${finding.line}, ${finding.kind} ${finding.apiVersion}; use ${finding.replacement}. ${finding.migrationGuide}`).join('\n')
    : '- No deprecated API matches detected in pasted manifest text.';
  const selectedAddonReportLines = selectedAddonsForReport.map((addon) => `- ${addon.name}: ${addon.checks[0]} (${addon.sourceUrl})`).join('\n') || '- No add-ons selected.';
  const fleetPlanReport = `# EKS fleet upgrade change plan

## Fleet scope
- Fleet rows: ${fleetPlanRows.length}
- Fleet clusters: ${fleetClusters}
- Upgrade route groups: ${fleetPlanGroups.length}
- Delay model: ${monthsDelayed} month(s)
- Node model: ${nodeModelLabels[nodeModel]}
- Remaining EKS support fees in modeled window: ${formatCurrency(fleetRemainingFees)}
- Billable cluster-days: ${formatCount(fleetBillableClusterDays)}
- Past-support cluster-days in modeled window: ${formatCount(fleetUnsupportedClusterDays)}

## Upgrade route groups
${fleetPlanGroups.map((group) => `- EKS ${group.current} -> EKS ${group.target}: ${group.clusters} cluster(s), ${group.rows} row(s), ${Math.max(0, group.hops.length - 1)} control-plane hop(s): ${group.hops.join(' -> ')}`).join('\n')}

## Fleet row plan
${fleetPlanRows.map((row) => `- ${row.item.label}: ${row.clusters} cluster(s), EKS ${row.version.version} -> EKS ${row.target}, ${Math.max(0, row.hops.length - 1)} hop(s), ${row.hops.join(' -> ')}, ${row.risk}`).join('\n')}

## Shared node model checklist
${nodeModelChecks[nodeModel].map((item) => `- ${item}`).join('\n')}

## Shared add-on checklist
${selectedAddonReportLines}

## Deprecated API scan
${scannerReportLines}

## Planning notes
- Split production waves by route group and deadline risk, not by a single average EKS version.
- Rows that cross extended-support end should be treated as support-deadline recovery before spend optimization.
- Verify live cluster inventory, add-on versions, IAM, workloads, and maintenance windows before approval.`;
  const plannerCostTone = cost.isPastExtendedSupport ? 'bad' : cost.postExtendedSupportDays > 0 ? 'warn' : '';
  const plannerCostHeadline = cost.isPastExtendedSupport
    ? 'Past support'
    : cost.postExtendedSupportDays > 0
    ? `${cost.postExtendedSupportDays}d unsupported`
    : formatCurrency(cost.extraTotal);
  const plannerCostDetail = cost.isPastExtendedSupport
    ? `EKS ${selected.version} extended support ended ${selected.extendedSupportEnd}; AWS can automatically upgrade the control plane.`
    : cost.postExtendedSupportDays > 0
    ? `${cost.billableDays} billable day(s), then ${cost.postExtendedSupportDays} unsupported day(s) in this delay model.`
    : `${formatCurrency(cost.extraMonthly)} monthly delta across ${clusterCount} cluster(s) if the window reaches extended support.`;
  const report = generatePlannerMarkdown({
    currentVersion,
    targetVersion: effectiveTarget,
    clusterCount,
    monthsDelayed,
    nodeModel,
    selectedAddonIds,
    scannerFindings,
  });
  const plannerGates: { title: string; state: GateState; detail: string; meta: string }[] = [
    { title: 'Plan draft', state: hops.length > 1 ? 'running' : 'passed', detail: `${hops.length - 1} control-plane hop(s)`, meta: `EKS ${currentVersion} -> ${effectiveTarget}` },
    { title: 'Add-on checklist', state: selectedAddonIds.length >= 4 ? 'passed' : selectedAddonIds.length ? 'running' : 'queued', detail: `${selectedAddonIds.length} selected add-on group(s)`, meta: 'preflight' },
    { title: 'API scan', state: scannerFindings.length ? 'blocked' : 'passed', detail: `${scannerFindings.length} deprecated API finding(s)`, meta: 'local text scan' },
    { title: 'Maintenance', state: hops.length > 2 ? 'running' : 'passed', detail: nodeModelLabels[nodeModel], meta: `${clusterCount} cluster(s)` },
  ];
  const fleetPlannerGates: { title: string; state: GateState; detail: string; meta: string }[] = [
    { title: 'Fleet scope', state: fleetPlanRows.length ? 'passed' : 'queued', detail: `${fleetClusters} cluster(s), ${fleetPlanRows.length} row(s)`, meta: `${fleetPlanGroups.length} route group(s)` },
    { title: 'Deadline risk', state: fleetUnsupportedClusterDays ? 'blocked' : fleetBillableClusterDays ? 'running' : 'passed', detail: fleetUnsupportedClusterDays ? `${formatCount(fleetUnsupportedClusterDays)} cluster-day(s) past support` : `${formatCount(fleetBillableClusterDays)} billable cluster-day(s)`, meta: `${fleetRowsWithDeadlineRisk} risky row(s)` },
    { title: 'Add-on checklist', state: selectedAddonIds.length >= 4 ? 'passed' : selectedAddonIds.length ? 'running' : 'queued', detail: `${selectedAddonIds.length} selected add-on group(s)`, meta: 'shared checks' },
    { title: 'API scan', state: scannerFindings.length ? 'blocked' : 'passed', detail: `${scannerFindings.length} deprecated API finding(s)`, meta: 'local manifest text' },
  ];
  return <section className="product-section">
    <div className="section-head">
      <div>
        <span className="eyebrow">Planner</span>
        <h1>Upgrade change plan</h1>
      </div>
      <p>Fleet routes first. Open a row when a release needs its own plan.</p>
    </div>

    <div className="segmented planner-mode-toggle" aria-label="Planner scope">
      <button type="button" className={plannerMode === 'fleet' ? 'active' : ''} aria-pressed={plannerMode === 'fleet'} onClick={() => setPlannerMode('fleet')}>Fleet change plan</button>
      <button type="button" className={plannerMode === 'single' ? 'active' : ''} aria-pressed={plannerMode === 'single'} onClick={() => setPlannerMode('single')}>Single release</button>
    </div>

    {plannerMode === 'fleet' ? <div className="tool-grid planner-grid release-planner fleet-release-planner">
      <section className="product-panel train-control-panel">
        <div className="panel-title"><h2>Fleet Plan Inputs</h2><span>{fleetClusters} clusters · {fleetPlanRows.length} row(s)</span></div>
        <p className="small-note">Rows come from Overview Fleet Scope. Open one row when it needs its own plan.</p>
        <dl className="cost-ledger">
          <div><dt>Route groups</dt><dd>{fleetPlanGroups.length}</dd></div>
          <div><dt>Total row hops</dt><dd>{fleetHopWorkItems}</dd></div>
          <div><dt>Remaining fees</dt><dd>{formatCurrency(fleetRemainingFees)}</dd></div>
          <div><dt>Past-support cluster-days</dt><dd>{formatCount(fleetUnsupportedClusterDays)}</dd></div>
        </dl>
        <ProductField label={`Delay model: ${monthsDelayed} month(s)`}><input type="range" min="1" max="24" value={monthsDelayed} onChange={(event) => setMonthsDelayed(Number(event.target.value))}/></ProductField>
        <div className="segmented">
          {nodeModelIds.map((item) => <button type="button" key={item} className={nodeModel === item ? 'active' : ''} aria-pressed={nodeModel === item} onClick={() => setNodeModel(item)}>{nodeModelLabels[item]}</button>)}
        </div>
        <div className="checklist-grid">
          {addons.map((addon) => <label key={addon.id} className={selectedAddons[addon.id] ? 'checked' : ''}>
            <input type="checkbox" checked={Boolean(selectedAddons[addon.id])} onChange={() => setSelectedAddons(toggleRecord(selectedAddons, addon.id))}/>
            <span>{addon.name}</span>
          </label>)}
        </div>
      </section>

      <section className="product-panel release-train-panel">
        <div className="panel-title"><h2>Fleet Upgrade Groups</h2><span>{fleetPlanGroups.length} route group(s)</span></div>
        <div className="product-table-wrap finance-table-wrap">
          <table className="finance-table product-finance-table">
            <thead><tr><th>Route group</th><th>Rows</th><th>Clusters</th><th>Hops</th><th>Hop path</th></tr></thead>
            <tbody>{fleetPlanGroups.map((group) => <tr key={group.key}>
              <td>EKS {group.current}{' -> '}EKS {group.target}</td>
              <td>{group.rows}</td>
              <td>{group.clusters}</td>
              <td>{Math.max(0, group.hops.length - 1)}</td>
              <td>{group.hops.join(' -> ')}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="gate-grid product-gate-grid">{fleetPlannerGates.map((gate) => <Gate key={gate.title} title={gate.title} state={gate.state} detail={gate.detail} meta={gate.meta}/>)}</div>
        <h3>Fleet row plan</h3>
        <div className="product-table-wrap finance-table-wrap">
          <table className="finance-table product-finance-table">
            <thead><tr><th>Scope</th><th>Version</th><th>Clusters</th><th>Hops</th><th>Deadline risk</th><th>Action</th></tr></thead>
            <tbody>{fleetPlanRows.map((row) => <tr key={row.item.id} className={row.item.id === activeFleetItemId ? 'selected' : ''}>
              <td>{row.item.label}</td>
              <td>EKS {row.version.version}{' -> '}EKS {row.target}</td>
              <td>{row.clusters}</td>
              <td>{row.hops.join(' -> ')}</td>
              <td>{row.risk}</td>
              <td><button type="button" aria-label={`Open row plan for ${row.item.label}`} onClick={() => {
                applyFleetItemToScenario(row.item);
                setPlannerMode('single');
              }}>Open row</button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <CopyableReport className="wide" title="Copyable Fleet Change Markdown" text={fleetPlanReport} label="Copy fleet plan"/>
    </div> : <div className="tool-grid planner-grid release-planner">
      <section className="product-panel train-control-panel">
        <div className="panel-title"><h2>Plan Inputs</h2><span>{selectedAddonIds.length} add-ons</span></div>
        <p className="small-note">Single release models one selected row. {activeFleetItem ? `Loaded from ${activeFleetItem.label}.` : 'Use Fleet change plan for mixed-version execution.'}</p>
        <div className="form-grid">
          <ProductField label="Current version"><VersionSelect value={currentVersion} onChange={(value) => {
            setCurrentVersion(value);
            if (compareEksVersions(targetVersion, value) < 0) setTargetVersion(value);
          }}/></ProductField>
          <ProductField label="Target version"><VersionSelect value={effectiveTarget} versions={targetOptions} onChange={setTargetVersion}/></ProductField>
          <ProductField label="Clusters"><input type="number" min="1" value={clusterCount} onChange={(event) => setClusterCount(Math.max(1, Number(event.target.value) || 1))}/></ProductField>
          <ProductField label={`Months delayed: ${monthsDelayed}`}><input type="range" min="1" max="24" value={monthsDelayed} onChange={(event) => setMonthsDelayed(Number(event.target.value))}/></ProductField>
        </div>

        <div className="segmented">
          {nodeModelIds.map((item) => <button type="button" key={item} className={nodeModel === item ? 'active' : ''} aria-pressed={nodeModel === item} onClick={() => setNodeModel(item)}>{nodeModelLabels[item]}</button>)}
        </div>

        <div className="checklist-grid">
          {addons.map((addon) => <label key={addon.id} className={selectedAddons[addon.id] ? 'checked' : ''}>
            <input type="checkbox" checked={Boolean(selectedAddons[addon.id])} onChange={() => setSelectedAddons(toggleRecord(selectedAddons, addon.id))}/>
            <span>{addon.name}</span>
          </label>)}
        </div>
      </section>

      <section className="product-panel release-train-panel">
        <div className="panel-title"><h2>Control-plane Hops</h2><span>{hops.length - 1} hop(s)</span></div>
        <div className="release-stations">{hops.map((hop, index) => <button
          type="button"
          key={hop}
          className={index === 0 ? 'origin' : index === hops.length - 1 ? 'target' : ''}
          aria-label={`${index === 0 ? 'Current' : 'Set target to'} EKS ${hop}`}
          onClick={() => setTargetVersion(hop)}
        >
          <strong>{hop}</strong>
          <span>{index === 0 ? 'current' : index === hops.length - 1 ? 'target' : 'promote'}</span>
        </button>)}</div>
        <div className="gate-grid product-gate-grid">{plannerGates.map((gate) => <Gate key={gate.title} title={gate.title} state={gate.state} detail={gate.detail} meta={gate.meta}/>)}</div>
        <div className="node-checks">
          <h3>{nodeModelLabels[nodeModel]} checks</h3>
          {nodeModelChecks[nodeModel].map((check) => <p key={check}>{check}</p>)}
        </div>
        <div className={`cost-callout ${plannerCostTone}`}>
          <span>Remaining support fees</span>
          <strong>{plannerCostHeadline}</strong>
          <p>{plannerCostDetail}</p>
        </div>
      </section>

      <CopyableReport className="wide" title="Copyable Change Markdown" text={report} label="Copy plan"/>
    </div>}
  </section>;
}

export function ScannerSection({ manifest, setManifest, scannerFindings }: { manifest: string; setManifest: (value: string) => void; scannerFindings: ReturnType<typeof scanManifest> }) {
  const scannerReport = scannerFindings.length
    ? scannerFindings.map((finding) => `- ${finding.severity.toUpperCase()} line ${finding.line}: ${finding.kind} ${finding.apiVersion} removed in ${finding.removedIn}; use ${finding.replacement}. ${finding.migrationGuide}`).join('\n')
    : 'No deprecated API matches detected in pasted manifest text.';
  const terminalLines = [
    '$ eks-plan scan --stdin manifest.yaml',
    'mode: local-browser-text-scan',
    `rules: ${deprecations.length} apiVersion/kind pairs`,
    `findings: ${scannerFindings.length}`,
    ...(scannerFindings.length
      ? scannerFindings.map((finding) => `${finding.severity}: line ${finding.line} ${finding.kind} ${finding.apiVersion} removed in ${finding.removedIn}; use ${finding.replacement}`)
      : ['result: no deprecated API matches in pasted text']),
  ];
  return <section className="product-section">
    <div className="section-head">
      <div>
        <span className="eyebrow">Scanner</span>
        <h1>Local manifest scan</h1>
      </div>
      <p>Paste manifests. Findings stay local.</p>
    </div>

    <div className="tool-grid scanner-grid scanner-workbench">
      <section className="product-panel manifest-panel">
        <div className="panel-title">
          <h2>manifest.yaml</h2>
          <div className="button-row">
            <button type="button" onClick={() => setManifest(scanExampleManifest())}>Load example</button>
            <button type="button" onClick={() => setManifest('')}>Clear</button>
          </div>
        </div>
        <textarea aria-label="Manifest text" value={manifest} onChange={(event) => setManifest(event.target.value)} spellCheck={false}/>
      </section>

      <section className="product-panel findings-panel scanner-terminal-panel">
        <div className="panel-title">
          <h2>Terminal Output</h2>
          <CopyButton text={scannerReport} label="Copy findings"/>
        </div>
        <TerminalOutput
          title="local scanner"
          subtitle="static rules · no AWS call"
          lines={terminalLines}
          footer={[`${scannerFindings.length} finding(s)`, `${manifest.split(/\r?\n/).length} line(s)`, 'static ruleset']}
        />
        {scannerFindings.length ? <div className="finding-list">
          {scannerFindings.map((finding) => <article key={`${finding.apiVersion}-${finding.kind}-${finding.line}`} className={finding.severity}>
            <div>
              <span>{finding.severity}</span>
              <strong>Line {finding.line}: {finding.kind}</strong>
            </div>
            <p>{finding.apiVersion} was removed in Kubernetes {finding.removedIn}. Replace with {finding.replacement}.</p>
            <Source label={finding.sourceLabel} url={finding.migrationGuide}/>
            <pre>{finding.excerpt}</pre>
          </article>)}
        </div> : <div className="empty-state">
          <strong>No deprecated API matches detected</strong>
          <p>This does not prove the manifests are valid. It only means the local text scan did not match the included rules.</p>
        </div>}
      </section>
    </div>
  </section>;
}

export function GuidesSection({ guideVersion, setGuideVersion, setRoute }: { guideVersion: string; setGuideVersion: (value: string) => void; setRoute: (route: AppRoute) => void }) {
  const guide = buildVersionGuide(guideVersion);
  return <section className="product-section">
    <div className="section-head">
      <div>
        <span className="eyebrow">Guides</span>
        <h1>EKS {guide.version.version} upgrade guide</h1>
      </div>
      <p>Lifecycle notes, API removals, add-ons, and validation checks.</p>
    </div>

    <div className="tool-grid guide-grid guide-report-grid">
      <nav className="guide-index" aria-label="Version guides">
        {eksVersions.map((version) => <a
          key={version.version}
          className={version.version === guide.version.version ? 'active' : ''}
          href={versionGuidePath(version.version)}
          onClick={(event) => {
            event.preventDefault();
            setGuideVersion(version.version);
            navigate(versionGuidePath(version.version), setRoute);
          }}
        >
          <strong>EKS {version.version}</strong>
          <span>{statusLabel(getSupportStatus(version))}</span>
        </a>)}
      </nav>

      <article className="product-panel guide-detail guide-article">
        <div className="panel-title">
          <h2>EKS {guide.version.version} lifecycle brief</h2>
          <Source label={guide.version.sourceLabel} url={guide.version.sourceUrl}/>
        </div>
        <p className="guide-dek">Static notes for planning and review.</p>
        <dl className="guide-facts">
          <div><dt>Release</dt><dd>{guide.version.releaseDate}</dd></div>
          <div><dt>Standard support ends</dt><dd>{guide.version.standardSupportEnd}</dd></div>
          <div><dt>Extended support ends</dt><dd>{guide.version.extendedSupportEnd}</dd></div>
          <div><dt>Suggested target</dt><dd>EKS {guide.targetVersion.version}</dd></div>
        </dl>

        <section>
          <h3>Cost Risk</h3>
          <p>{guide.costRisk}</p>
        </section>
        <section>
          <h3>Upgrade Hops</h3>
          <div className="hop-line compact">{guide.hops.map((hop) => <div key={hop}><strong>{hop}</strong></div>)}</div>
        </section>
        <section>
          <h3>Deprecated API Checks</h3>
          <div className="dense-list">{guide.deprecatedApiChecks.slice(0, 7).map((rule) => <p key={`${rule.apiVersion}-${rule.kind}`}>{rule.kind} {rule.apiVersion} removed in {rule.removedIn}; use {rule.replacement}. <Source label={rule.sourceLabel} url={rule.migrationGuide}/></p>)}</div>
        </section>
        <section>
          <h3>Managed Add-on Checks</h3>
          <div className="dense-list">{guide.managedAddonChecks.map((addon) => <p key={addon.id}>{addon.name}: {addon.whyItMatters} <Source label={addon.sourceLabel} url={addon.sourceUrl}/></p>)}</div>
        </section>
        <section>
          <h3>Post-upgrade Validation</h3>
          <ul>{guide.postUpgradeValidation.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
        <section>
          <h3>Source Citations</h3>
          <div className="source-citation-list">
            <Source label={guide.version.sourceLabel} url={guide.version.sourceUrl}/>
            <Source label={eksPricing.sourceLabel} url={eksPricing.sourceUrl}/>
            {guide.version.releaseUrl && <Source label={`EKS ${guide.version.version} release note`} url={guide.version.releaseUrl}/>}
          </div>
        </section>
      </article>

      <CopyableReport className="wide" title="Copyable Markdown Guide" text={guide.markdown} label="Copy guide"/>
    </div>
  </section>;
}

export function AddonsSection({ activeAddonId, setActiveAddonId, setRoute }: { activeAddonId: string; setActiveAddonId: (value: string) => void; setRoute: (route: AppRoute) => void }) {
  const activeAddon = findAddonBySlug(activeAddonId) ?? addons[0];
  const checklist = addonValidationChecklist(activeAddon);
  const detailMarkdown = `# ${activeAddon.name} EKS compatibility check

Why it matters: ${activeAddon.whyItMatters}
Type: ${activeAddon.type}
Source: ${activeAddon.sourceUrl}

## Checks
${activeAddon.checks.map((check) => `- \`${check}\``).join('\n')}

## Suggested validation
${checklist.map((item) => `- ${item}`).join('\n')}

Limitations: Local checklist only; verify against source docs and live cluster state.`;
  const addonGates: { title: string; state: GateState; detail: string; meta: string }[] = [
    { title: 'Source check', state: 'running', detail: activeAddon.sourceLabel, meta: activeAddon.type },
    { title: 'Version check', state: activeAddon.type === 'AWS managed' ? 'running' : 'queued', detail: activeAddon.checks[0], meta: 'preflight command' },
    { title: 'Post-hop validation', state: 'queued', detail: `${checklist.length} validation prompt(s)`, meta: 'after each hop' },
  ];

  return <section className="product-section">
    <div className="section-head">
      <div>
        <span className="eyebrow">Add-ons</span>
        <h1>Add-on readiness checklist</h1>
      </div>
      <p>Managed add-ons and platform controllers to check before a hop.</p>
    </div>

    <div className="tool-grid addon-grid addon-preflight-grid">
      <nav className="addon-index" aria-label="Addon detail routes">
        {addons.map((addon) => <a
          key={addon.id}
          className={activeAddon.id === addon.id ? 'active' : ''}
          href={addonCompatibilityPath(addon)}
          onClick={(event) => {
            event.preventDefault();
            setActiveAddonId(addon.id);
            navigate(addonCompatibilityPath(addon), setRoute);
          }}
        >
          <strong>{addon.name}</strong>
          <span>{addon.type}</span>
        </a>)}
      </nav>

      <article className="product-panel addon-detail">
        <div className="panel-title">
          <h2>{activeAddon.name}</h2>
          <Source label={activeAddon.sourceLabel} url={activeAddon.sourceUrl}/>
        </div>
        <p className="why">{activeAddon.whyItMatters}</p>
        <div className="gate-grid product-gate-grid addon-gates">{addonGates.map((gate) => <Gate key={gate.title} title={gate.title} state={gate.state} detail={gate.detail} meta={gate.meta}/>)}</div>
        <h3>Checks</h3>
        <div className="command-list">{activeAddon.checks.map((check) => <code key={check}>{check}</code>)}</div>
        <h3>Suggested Upgrade Validation</h3>
        <div className="preflight-checklist">{checklist.map((item) => <label key={item}><input type="checkbox"/><span>{item}</span></label>)}</div>
        <CopyButton text={detailMarkdown} label="Copy add-on checklist"/>
      </article>
    </div>
  </section>;
}

export function EvidenceSection({
  currentVersion,
  targetVersion,
  clusterCount,
  monthsDelayed,
  nodeModel,
  selectedAddonIds,
  scannerFindings,
  fleetItems,
}: {
  currentVersion: string;
  targetVersion: string;
  clusterCount: number;
  monthsDelayed: number;
  nodeModel: NodeModel;
  selectedAddonIds: string[];
  scannerFindings: ReturnType<typeof scanManifest>;
  fleetItems: FleetItem[];
}) {
  const { selected, cost } = costSummary(currentVersion, clusterCount, monthsDelayed);
  const fleetSummary = summarizeFleet(fleetItems, monthsDelayed);
  const scenarioReport = generateEvidenceReport({
    currentVersion,
    targetVersion,
    clusterCount,
    monthsDelayed,
    nodeModel,
    selectedAddonIds,
    scannerFindings,
    evidenceVersion: `${dataFreshness.checkedAt}-${scannerFindings.length}`,
  });
  const report = `${scenarioReport}

## Fleet context
- Overview fleet rows: ${fleetItems.length}
- Overview fleet clusters: ${fleetSummary.totalClusters}
- Fleet remaining support fees in the ${monthsDelayed}-month model: ${formatCurrency(fleetSummary.exposureTotal)}
- Fleet rows are summarized here for context only. Use the Upgrade change plan page in Fleet mode for per-row mixed-version execution details.`;
  const evidenceGates: { title: string; state: GateState; detail: string; meta: string }[] = [
    { title: 'Lifecycle citation', state: 'passed', detail: selected.sourceLabel, meta: selected.standardSupportEnd },
    { title: 'Selected scenario cost', state: cost.extraTotal > 0 ? 'running' : 'passed', detail: formatCurrency(cost.extraTotal), meta: `${monthsDelayed} month model` },
    { title: 'API evidence', state: scannerFindings.length ? 'blocked' : 'passed', detail: `${scannerFindings.length} scanner finding(s)`, meta: 'local manifest text' },
    { title: 'Fleet context', state: fleetSummary.unsupportedClusters ? 'blocked' : fleetSummary.extendedClusters ? 'running' : 'passed', detail: `${fleetSummary.totalClusters} cluster(s), ${fleetItems.length} row(s)`, meta: `${fleetSummary.unsupportedClusters} cluster(s) past support` },
  ];
  return <section className="product-section">
    <div className="section-head">
      <div>
        <span className="eyebrow">Packet</span>
        <h1>Selected scenario change packet</h1>
      </div>
      <p>Copyable scenario summary with fleet context.</p>
    </div>

    <div className="tool-grid evidence-layout">
      <section className="product-panel evidence-paper">
        <div className="panel-title">
          <h2>Packet Contents</h2>
          <span>{dataFreshness.checkedAt}</span>
        </div>
        <div className="gate-grid product-gate-grid evidence-gates">{evidenceGates.map((gate) => <Gate key={gate.title} title={gate.title} state={gate.state} detail={gate.detail} meta={gate.meta}/>)}</div>
        <div className="evidence-summary">
          <div><span>Current</span><strong>EKS {currentVersion}</strong></div>
          <div><span>Target</span><strong>EKS {targetVersion}</strong></div>
          <div><span>Clusters</span><strong>{clusterCount}</strong></div>
          <div><span>Scanner findings</span><strong>{scannerFindings.length}</strong></div>
          <div><span>Add-on groups</span><strong>{selectedAddonIds.length}</strong></div>
          <div><span>Node model</span><strong>{nodeModelLabels[nodeModel]}</strong></div>
          <div><span>Fleet rows</span><strong>{fleetItems.length}</strong></div>
          <div><span>Fleet clusters</span><strong>{fleetSummary.totalClusters}</strong></div>
        </div>
        <div className="limitations">
          <h2>Limitations</h2>
          <p>Browser-only static report. It does not call AWS APIs, upload manifests, verify IAM, inspect workloads, or confirm live add-on versions.</p>
          <p>The main packet is still selected-scenario evidence. Use Planner Fleet mode for mixed-version execution sequencing.</p>
          <p>{eksPricing.note}</p>
        </div>
      </section>

      <CopyableReport title="Copyable Change Packet" text={report} label="Copy packet"/>
    </div>
  </section>;
}

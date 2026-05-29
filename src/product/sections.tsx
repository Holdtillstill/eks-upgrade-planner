import { useState } from 'react';
import { addons } from '../data/addons';
import { deprecations } from '../data/deprecations';
import { dataFreshness, eksVersions, type EksVersion } from '../data/versions';
import { eksPricing } from '../data/pricing';
import { addonCompatibilityPath, addonValidationChecklist, findAddonBySlug } from '../lib/addonLookup';
import { calculateEksSupportCost, compareEksVersions, formatCurrency, generateHopSequence, getSupportStatus, statusLabel } from '../lib/planner';
import { buildVersionGuide, generateCostReport, generateEvidenceReport, generatePlannerMarkdown, nodeModelChecks, nodeModelLabels, scanExampleManifest, type NodeModel, type scanManifest } from '../lib/reports';
import { navigate } from '../lib/navigation';
import { versionGuidePath, type AppRoute } from '../lib/routes';
import { costSummary, deadlineCopy, statusTone, toggleRecord } from '../lib/ui';
import { CopyButton, Source, StatusPill } from '../components/shared';
import { CopyableReport, Gate, ProductField, ProductMetric, ScenarioLedger, TerminalOutput, VersionSelect, type GateState, type ScenarioId, type ScenarioRow } from './components';
import { nodeModelIds, selectedAddonIdsFrom } from './state';

export function OverviewSection({
  currentVersion,
  targetVersion,
  clusterCount,
  monthsDelayed,
  scannerFindings,
  selectedAddonIds,
  setCurrentVersion,
  setRoute,
}: {
  currentVersion: string;
  targetVersion: string;
  clusterCount: number;
  monthsDelayed: number;
  scannerFindings: ReturnType<typeof scanManifest>;
  selectedAddonIds: string[];
  setCurrentVersion: (value: string) => void;
  setRoute: (route: AppRoute) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'at-risk' | 'standard'>('at-risk');
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
  const incidentRows = eksVersions.map((version) => ({
    version,
    tone: statusTone(version),
    label: deadlineCopy(version),
    escalation: getSupportStatus(version).includes('extended') || getSupportStatus(version) === 'expired' ? 'Finance + VP Eng' : 'Platform owner',
  }));
  const visibleRows = incidentRows.filter((row) => {
    if (filter === 'all') return true;
    if (filter === 'at-risk') return row.tone !== 'ok';
    return row.tone === 'ok';
  });
  const tasks = [
    { id: 'owners', label: 'Owners assigned', detail: `${clusterCount} cluster(s) in scope` },
    { id: 'addons', label: 'Add-on preflight started', detail: `${selectedAddonIds.length} selected gate group(s)` },
    { id: 'api', label: 'API scan attached', detail: `${scannerFindings.length} deprecated API finding(s)` },
    { id: 'window', label: 'Maintenance window approved', detail: `${hops.length - 1} hop(s) to EKS ${target}` },
  ];
  const completed = tasks.filter((task) => checked[task.id]).length;
  const atRiskCount = incidentRows.filter((row) => row.tone !== 'ok').length;
  const readiness = completed === tasks.length ? 'passed' : scannerFindings.length ? 'blocked' : 'running';
  const overviewBrief = `EKS upgrade overview
Current: EKS ${selected.version}
Target: EKS ${target}
Lifecycle: ${deadlineCopy(selected)}
Readiness: ${completed}/${tasks.length}
At-risk versions: ${atRiskCount}
Support-tier exposure model: ${formatCurrency(cost.extraTotal)}
Scanner findings: ${scannerFindings.length}`;
  return <section className="product-section">
    <div className="section-head">
      <div>
        <span className="eyebrow">Overview · Release Response</span>
        <h1>Upgrade control board</h1>
      </div>
      <p>Deadline watchlist, readiness gates, escalation context, and next actions for the selected EKS release train.</p>
    </div>

    <div className="metric-row overview-metrics">
      <ProductMetric label="Selected release" value={`EKS ${selected.version}`} detail={deadlineCopy(selected)} tone={tone}/>
      <ProductMetric label="Next hop" value={hops[1] ? `EKS ${hops[1]}` : 'No hop'} detail={`${hops.length - 1} control-plane hop(s) to ${target}`}/>
      <ProductMetric label="Cost exposure" value={formatCurrency(cost.extraTotal)} detail={`${clusterCount} cluster(s), ${monthsDelayed} month model`} tone={cost.extraTotal > 0 ? 'warn' : 'ok'}/>
      <ProductMetric label="Readiness" value={`${completed}/${tasks.length}`} detail="Lifecycle response checks complete" tone={readiness === 'passed' ? 'ok' : readiness === 'blocked' ? 'bad' : 'warn'}/>
      <ProductMetric label="At-risk releases" value={String(atRiskCount)} detail="Watchlist items outside calm standard support" tone={atRiskCount ? 'warn' : 'ok'}/>
    </div>

    <div className="incident-board">
      <section className="readiness-strip" aria-label="Readiness gates">
        <Gate title="Lifecycle" state={tone === 'ok' ? 'passed' : tone === 'warn' ? 'running' : 'blocked'} detail={statusLabel(getSupportStatus(selected))} meta={selected.standardSupportEnd}/>
        <Gate title="API scan" state={scannerFindings.length ? 'blocked' : 'passed'} detail={`${scannerFindings.length} deprecated API finding(s)`} meta="local manifest text"/>
        <Gate title="Add-ons" state={selectedAddonIds.length ? 'running' : 'queued'} detail={`${selectedAddonIds.length} add-on group(s) selected`} meta="preflight"/>
        <Gate title="Maintenance" state={checked.window ? 'passed' : 'running'} detail={`${hops.length - 1} control-plane hop(s)`} meta={`EKS ${currentVersion} -> ${target}`}/>
      </section>

      <section className="product-panel deadline-panel">
        <div className="panel-title">
          <h2>Deadline Watchlist</h2>
          <Source label={dataFreshness.sourceLabel} url={dataFreshness.sourceUrl}/>
        </div>
        <div className="war-filters product-filters">
          {(['all', 'at-risk', 'standard'] as const).map((item) => <button type="button" key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}
        </div>
        <div className="deadline-list">
          {visibleRows.map((row) => <button
            type="button"
            key={row.version.version}
            className={`deadline-row ${row.tone} ${row.version.version === selected.version ? 'active' : ''}`}
            aria-label={`Select EKS ${row.version.version}: ${row.label}`}
            onClick={() => setCurrentVersion(row.version.version)}
          >
            <span>EKS {row.version.version}</span>
            <strong>{row.label}</strong>
            <em>{row.escalation}</em>
          </button>)}
        </div>
      </section>

      <section className="product-panel escalation-panel">
        <div className="panel-title">
          <h2>Escalation Strip</h2>
          <CopyButton text={overviewBrief} label="Copy brief"/>
        </div>
        <div className={`response-token ${tone}`}>
          <span>{tone === 'bad' ? 'Escalate' : tone === 'warn' ? 'Watch' : 'Ready'}</span>
          <strong>{statusLabel(getSupportStatus(selected))}</strong>
          <p>{formatCurrency(cost.extraMonthly)} monthly support-tier delta across {clusterCount} cluster(s) if delayed into extended support.</p>
        </div>
        <div className="response-checklist">
          {tasks.map((task) => <label key={task.id} className={checked[task.id] ? 'done' : ''}>
            <input type="checkbox" checked={Boolean(checked[task.id])} onChange={() => setChecked((current) => toggleRecord(current, task.id))}/>
            <span>{task.label}</span>
            <small>{task.detail}</small>
          </label>)}
        </div>
        <div className="action-list">
          <a href="/eks/upgrade-planner" onClick={(event) => { event.preventDefault(); navigate('/eks/upgrade-planner', setRoute); }}>Draft upgrade RFC</a>
          <a href="/eks/deprecated-api-scanner" onClick={(event) => { event.preventDefault(); navigate('/eks/deprecated-api-scanner', setRoute); }}>Scan pasted manifests</a>
          <a href={versionGuidePath(currentVersion)} onClick={(event) => { event.preventDefault(); navigate(versionGuidePath(currentVersion), setRoute); }}>Open EKS {currentVersion} guide</a>
          <a href="/eks/evidence-pack" onClick={(event) => { event.preventDefault(); navigate('/eks/evidence-pack', setRoute); }}>Assemble evidence pack</a>
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
        <span className="eyebrow">Lifecycle · Version Gates</span>
        <h1>EKS lifecycle registry</h1>
      </div>
      <p>Dense, source-linked release data with gate treatment for standard support, extended support, and expired release lines.</p>
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
      <table className="product-table">
        <thead><tr><th>Release</th><th>Gate</th><th>Status</th><th>Release date</th><th>Standard end</th><th>Extended end</th><th>Platform</th><th>Source</th><th>Guide</th></tr></thead>
        <tbody>{eksVersions.map((version) => <tr key={version.version} className={version.version === currentVersion ? 'selected' : ''}>
          <td><button type="button" aria-label={`Select EKS ${version.version}`} onClick={() => setCurrentVersion(version.version)}>EKS {version.version}</button></td>
          <td><span className={`table-gate gate-${gateForVersion(version)}`}>{gateForVersion(version)}</span></td>
          <td><StatusPill version={version}/></td>
          <td>{version.releaseDate}</td>
          <td>{version.standardSupportEnd}</td>
          <td>{version.extendedSupportEnd}</td>
          <td>{version.latestPlatform ?? 'Check source'}</td>
          <td><Source label={version.sourceLabel} url={version.sourceUrl}/></td>
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
  setCurrentVersion,
  setClusterCount,
  setMonthsDelayed,
}: {
  currentVersion: string;
  clusterCount: number;
  monthsDelayed: number;
  setCurrentVersion: (value: string) => void;
  setClusterCount: (value: number) => void;
  setMonthsDelayed: (value: number) => void;
}) {
  const [scenario, setScenario] = useState<ScenarioId>('bridge');
  const { selected, cost } = costSummary(currentVersion, clusterCount, monthsDelayed);
  const scenarioRows: ScenarioRow[] = [
    { id: 'accelerate', label: 'Accelerate', months: Math.max(1, monthsDelayed - 2), note: 'fund platform focus now', cost: calculateEksSupportCost(clusterCount, Math.max(1, monthsDelayed - 2)) },
    { id: 'bridge', label: 'Bridge', months: monthsDelayed, note: 'hold current delivery plan', cost },
    { id: 'defer', label: 'Defer', months: Math.min(24, monthsDelayed + 4), note: 'accept support runway', cost: calculateEksSupportCost(clusterCount, Math.min(24, monthsDelayed + 4)) },
  ];
  const activeScenario = scenarioRows.find((row) => row.id === scenario) ?? scenarioRows[1];
  const deferScenario = scenarioRows.find((row) => row.id === 'defer') ?? activeScenario;
  const avoided = Math.max(0, deferScenario.cost.extraTotal - activeScenario.cost.extraTotal);
  const businessCase = `# EKS support-tier business case

Version: EKS ${selected.version}
Standard support end: ${selected.standardSupportEnd}
Scenario: ${activeScenario.label}
Clusters: ${clusterCount}
Exposure window: ${activeScenario.months} month(s)
Monthly support-tier delta: ${formatCurrency(activeScenario.cost.extraMonthly)}
Scenario exposure: ${formatCurrency(activeScenario.cost.extraTotal)}
Avoided versus defer scenario: ${formatCurrency(avoided)}

Recommendation:
${activeScenario.id === 'accelerate' ? 'Fund focused platform time before extended support billing becomes the operating baseline.' : activeScenario.id === 'bridge' ? 'Keep the committed plan, but reserve a finance-visible bridge for the modeled exposure window.' : 'Defer only with explicit acceptance of the support-tier delta and escalation ownership.'}

Sources:
- ${eksPricing.sourceLabel}: ${eksPricing.sourceUrl}
- ${selected.sourceLabel}: ${selected.sourceUrl}

Limitations:
${eksPricing.note}`;
  const report = `${businessCase}\n\n---\n\n${generateCostReport(currentVersion, clusterCount, monthsDelayed)}`;
  return <section className="product-section">
    <div className="section-head">
      <div>
        <span className="eyebrow">Cost · CFO Brief</span>
        <h1>Support-tier scenario ledger</h1>
      </div>
      <p>Finance-grade accelerate, bridge, and defer cases with copyable business language and source-linked pricing limits.</p>
    </div>

    <div className="tool-grid finance-layout">
      <section className="product-panel finance-controls-panel">
        <div className="form-grid">
          <ProductField label="EKS version"><VersionSelect value={currentVersion} onChange={setCurrentVersion}/></ProductField>
          <ProductField label="Clusters"><input type="number" min="1" value={clusterCount} onChange={(event) => setClusterCount(Math.max(1, Number(event.target.value) || 1))}/></ProductField>
          <ProductField label={`Months delayed: ${monthsDelayed}`}><input type="range" min="1" max="24" value={monthsDelayed} onChange={(event) => setMonthsDelayed(Number(event.target.value))}/></ProductField>
        </div>
        <ScenarioLedger rows={scenarioRows} activeId={scenario} setActiveId={setScenario}/>
        <dl className="cost-ledger">
          <div><dt>Standard monthly</dt><dd>{formatCurrency(activeScenario.cost.standardMonthly)}</dd></div>
          <div><dt>Extended monthly</dt><dd>{formatCurrency(activeScenario.cost.extendedMonthly)}</dd></div>
          <div><dt>Monthly delta</dt><dd>{formatCurrency(activeScenario.cost.extraMonthly)}</dd></div>
          <div><dt>{activeScenario.months}-month delta</dt><dd>{formatCurrency(activeScenario.cost.extraTotal)}</dd></div>
        </dl>
        <p className="small-note">EKS {selected.version} standard support ends {selected.standardSupportEnd}. <Source label={eksPricing.sourceLabel} url={eksPricing.sourceUrl}/></p>
      </section>

      <section className="product-panel finance-paper">
        <span className="eyebrow">{activeScenario.label} case</span>
        <strong>{formatCurrency(activeScenario.cost.extraTotal)}</strong>
        <p>{activeScenario.months} month exposure window, {formatCurrency(activeScenario.cost.extraMonthly)} extra per month, {formatCurrency(avoided)} avoided versus defer.</p>
        <table className="finance-table product-finance-table">
          <thead><tr><th>Scenario</th><th>Window</th><th>Exposure</th><th>Planning note</th></tr></thead>
          <tbody>{scenarioRows.map((row) => <tr key={row.id} className={row.id === scenario ? 'selected' : ''}><td>{row.label}</td><td>{row.months} mo</td><td>{formatCurrency(row.cost.extraTotal)}</td><td>{row.note}</td></tr>)}</tbody>
        </table>
        <div className="business-case">
          <h2>Business Case</h2>
          <p>{activeScenario.id === 'accelerate' ? 'Fund upgrade execution now to avoid normalizing extended support as a recurring operating cost.' : activeScenario.id === 'bridge' ? 'Reserve a time-boxed budget bridge while platform work clears add-on, API, and maintenance gates.' : 'Escalate the defer choice with explicit acceptance of support-tier exposure and release risk.'}</p>
        </div>
      </section>

      <CopyableReport className="wide" title="Copyable Cost Brief" text={report} label="Copy business case"/>
    </div>
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
  setCurrentVersion: (value: string) => void;
  setTargetVersion: (value: string) => void;
  setClusterCount: (value: number) => void;
  setMonthsDelayed: (value: number) => void;
  setNodeModel: (value: NodeModel) => void;
  setSelectedAddons: (value: Record<string, boolean>) => void;
}) {
  const targetOptions = eksVersions.filter((version) => compareEksVersions(version.version, currentVersion) >= 0);
  const effectiveTarget = compareEksVersions(targetVersion, currentVersion) < 0 ? currentVersion : targetVersion;
  const selectedAddonIds = selectedAddonIdsFrom(selectedAddons);
  const hops = generateHopSequence(currentVersion, effectiveTarget);
  const { cost } = costSummary(currentVersion, clusterCount, monthsDelayed);
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
    { title: 'Plan PR', state: hops.length > 1 ? 'running' : 'passed', detail: `${hops.length - 1} control-plane hop(s)`, meta: `EKS ${currentVersion} -> ${effectiveTarget}` },
    { title: 'Add-on matrix', state: selectedAddonIds.length >= 4 ? 'passed' : selectedAddonIds.length ? 'running' : 'queued', detail: `${selectedAddonIds.length} selected add-on group(s)`, meta: 'preflight' },
    { title: 'API scan', state: scannerFindings.length ? 'blocked' : 'passed', detail: `${scannerFindings.length} deprecated API finding(s)`, meta: 'local text scan' },
    { title: 'Maintenance', state: hops.length > 2 ? 'running' : 'passed', detail: nodeModelLabels[nodeModel], meta: `${clusterCount} cluster(s)` },
  ];
  return <section className="product-section">
    <div className="section-head">
      <div>
        <span className="eyebrow">Planner · GitOps Release Train</span>
        <h1>Release train RFC builder</h1>
      </div>
      <p>Version hops become stations; add-ons, deprecated APIs, node model checks, and maintenance approval become promotion gates.</p>
    </div>

    <div className="tool-grid planner-grid release-planner">
      <section className="product-panel train-control-panel">
        <div className="panel-title"><h2>Train Controls</h2><span>{selectedAddonIds.length} add-ons</span></div>
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
          {nodeModelIds.map((item) => <button type="button" key={item} className={nodeModel === item ? 'active' : ''} onClick={() => setNodeModel(item)}>{nodeModelLabels[item]}</button>)}
        </div>

        <div className="checklist-grid">
          {addons.map((addon) => <label key={addon.id} className={selectedAddons[addon.id] ? 'checked' : ''}>
            <input type="checkbox" checked={Boolean(selectedAddons[addon.id])} onChange={() => setSelectedAddons(toggleRecord(selectedAddons, addon.id))}/>
            <span>{addon.name}</span>
          </label>)}
        </div>
      </section>

      <section className="product-panel release-train-panel">
        <div className="panel-title"><h2>Stations</h2><span>{hops.length - 1} hop(s)</span></div>
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
        <div className="cost-callout">
          <span>Support-tier exposure model</span>
          <strong>{formatCurrency(cost.extraTotal)}</strong>
          <p>{formatCurrency(cost.extraMonthly)} monthly delta across {clusterCount} cluster(s).</p>
        </div>
      </section>

      <CopyableReport className="wide" title="Copyable Jira/RFC Markdown" text={report} label="Copy RFC"/>
    </div>
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
        <span className="eyebrow">Scanner · CLI Companion</span>
        <h1>Local manifest scanner</h1>
      </div>
      <p>Paste manifests into the browser-only scanner; output is formatted like a terminal so it can move directly into an RFC or evidence record.</p>
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
          subtitle="no upload · no AWS call"
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
        <span className="eyebrow">Guides · Source Briefing</span>
        <h1>EKS {guide.version.version} upgrade guide</h1>
      </div>
      <p>Editorial, source-cited upgrade guidance structured around lifecycle, cost exposure, API removals, add-ons, and validation.</p>
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
        <p className="guide-dek">Use this guide as a source-linked planning artifact before opening a production change. It intentionally stays static and local.</p>
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
    { title: 'Version matrix', state: activeAddon.type === 'AWS managed' ? 'running' : 'queued', detail: activeAddon.checks[0], meta: 'preflight command' },
    { title: 'Post-hop validation', state: 'queued', detail: `${checklist.length} validation prompt(s)`, meta: 'after each station' },
  ];

  return <section className="product-section">
    <div className="section-head">
      <div>
        <span className="eyebrow">Add-ons · Preflight Gates</span>
        <h1>Add-on readiness matrix</h1>
      </div>
      <p>Gate-oriented checks for managed and platform add-ons that commonly affect EKS promotion readiness.</p>
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
}: {
  currentVersion: string;
  targetVersion: string;
  clusterCount: number;
  monthsDelayed: number;
  nodeModel: NodeModel;
  selectedAddonIds: string[];
  scannerFindings: ReturnType<typeof scanManifest>;
}) {
  const { selected, cost } = costSummary(currentVersion, clusterCount, monthsDelayed);
  const report = generateEvidenceReport({
    currentVersion,
    targetVersion,
    clusterCount,
    monthsDelayed,
    nodeModel,
    selectedAddonIds,
    scannerFindings,
    evidenceVersion: `${dataFreshness.checkedAt}-${scannerFindings.length}`,
  });
  const evidenceGates: { title: string; state: GateState; detail: string; meta: string }[] = [
    { title: 'Lifecycle citation', state: 'passed', detail: selected.sourceLabel, meta: selected.standardSupportEnd },
    { title: 'Cost record', state: cost.extraTotal > 0 ? 'running' : 'passed', detail: formatCurrency(cost.extraTotal), meta: `${monthsDelayed} month model` },
    { title: 'API evidence', state: scannerFindings.length ? 'blocked' : 'passed', detail: `${scannerFindings.length} scanner finding(s)`, meta: 'local manifest text' },
    { title: 'Add-on record', state: selectedAddonIds.length ? 'running' : 'queued', detail: `${selectedAddonIds.length} group(s) selected`, meta: nodeModelLabels[nodeModel] },
  ];
  return <section className="product-section">
    <div className="section-head">
      <div>
        <span className="eyebrow">Evidence · Review Packet</span>
        <h1>Exportable evidence packet</h1>
      </div>
      <p>Report-style evidence with lifecycle citations, cost model, add-on record, scanner output, and explicit local-only limitations.</p>
    </div>

    <div className="tool-grid evidence-layout">
      <section className="product-panel evidence-paper">
        <div className="panel-title">
          <h2>Evidence Controls</h2>
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
        </div>
        <div className="limitations">
          <h2>Limitations</h2>
          <p>Browser-only static report. It does not call AWS APIs, upload manifests, verify IAM, inspect workloads, or confirm live add-on versions.</p>
          <p>{eksPricing.note}</p>
        </div>
      </section>

      <CopyableReport title="Copyable Evidence Report" text={report} label="Copy evidence"/>
    </div>
  </section>;
}

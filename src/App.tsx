import { useEffect, useMemo, useState, type ReactNode } from 'react';
import './App.css';
import { addons } from './data/addons';
import { deprecations } from './data/deprecations';
import { dataFreshness, eksVersions, type EksVersion } from './data/versions';
import { eksPricing } from './data/pricing';
import { addonCompatibilityPath, addonValidationChecklist, findAddonBySlug } from './lib/addonLookup';
import {
  calculateEksSupportCost,
  compareEksVersions,
  daysUntil,
  formatCurrency,
  formatHourlyCurrency,
  generateHopSequence,
  getSupportStatus,
  scanDeprecatedApis,
  statusLabel,
} from './lib/planner';
import {
  buildVersionGuide,
  generateCostReport,
  generateEvidenceReport,
  generatePlannerMarkdown,
  nodeModelChecks,
  nodeModelLabels,
  scanExampleManifest,
  scanManifest,
  type NodeModel,
} from './lib/reports';
import { productTabs, resolveAppRoute, versionGuidePath, type AppRoute, type DesignRoute, type ProductTab } from './lib/routes';

const routes: { path: DesignRoute; name: string; idea: string }[] = [
  { path: '/1', name: 'Mission Control', idea: 'orbital command center' },
  { path: '/2', name: 'Executive Memo', idea: 'boardroom cost narrative' },
  { path: '/3', name: 'Blueprint Lab', idea: 'technical upgrade drafting table' },
  { path: '/4', name: 'Signal OS', idea: 'dense product workspace' },
  { path: '/5', name: 'Risk Observatory', idea: 'radar + timeline system' },
  { path: '/6', name: 'Incident War Room', idea: 'deadline response board' },
  { path: '/7', name: 'CFO Cost Brief', idea: 'finance-grade scenario model' },
  { path: '/8', name: 'GitOps Release Train', idea: 'pipeline with upgrade gates' },
  { path: '/9', name: 'Compliance Binder', idea: 'audit evidence pack' },
  { path: '/10', name: 'CLI Companion', idea: 'terminal-first planner' },
];

const defaultManifest = `apiVersion: networking.k8s.io/v1beta1
kind: Ingress
metadata:
  name: legacy-web
---
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: privileged
---
apiVersion: flowcontrol.apiserver.k8s.io/v1beta3
kind: FlowSchema
metadata:
  name: noisy-tenants`;

function routeFromLocation(): AppRoute {
  return resolveAppRoute(window.location.pathname);
}

function navigate(path: string, setRoute: (route: AppRoute) => void) {
  window.history.pushState({}, '', path);
  setRoute(resolveAppRoute(path));
}

function Source({ label, url }: { label: string; url: string }) {
  return <a className="source" href={url} target="_blank" rel="noreferrer">{label}</a>;
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return <button className="copy" type="button" onClick={copy}>{copied ? 'Copied' : label}</button>;
}

function DesignNav({ active, setRoute }: { active: DesignRoute; setRoute: (route: AppRoute) => void }) {
  return <nav className="design-nav" aria-label="Design variants">
    <a className="brand" onClick={() => navigate('/1', setRoute)}><span/>EKS Upgrade Planner</a>
    <div>{routes.map((r) => <button key={r.path} className={active === r.path ? 'active' : ''} onClick={() => navigate(r.path, setRoute)}>{r.path}<em>{r.name}</em></button>)}</div>
  </nav>;
}

function statusTone(version: EksVersion) {
  const status = getSupportStatus(version);
  if (status === 'standard') return 'ok';
  if (status === 'standard-ending-soon') return 'warn';
  return 'bad';
}

function StatusPill({ version }: { version: EksVersion }) {
  return <span className={`pill ${statusTone(version)}`}>{statusLabel(getSupportStatus(version))}</span>;
}

function costSummary(version: string, clusters: number, months: number) {
  const selected = eksVersions.find((v) => v.version === version) ?? eksVersions[0];
  const cost = calculateEksSupportCost(clusters, months);
  const alreadyExtended = getSupportStatus(selected).includes('extended') || getSupportStatus(selected) === 'expired';
  const label = alreadyExtended ? 'current extra exposure' : 'possible exposure if delayed past standard support';
  const text = `EKS ${version} · ${clusters} cluster(s) · ${months} month(s)\nStandard support ends: ${selected.standardSupportEnd}\nExtended support ends: ${selected.extendedSupportEnd}\nStandard monthly: ${formatCurrency(cost.standardMonthly)}\nExtended monthly: ${formatCurrency(cost.extendedMonthly)}\nExtra monthly: ${formatCurrency(cost.extraMonthly)}\nExtra ${months}-month exposure: ${formatCurrency(cost.extraTotal)}\nSource: ${eksPricing.sourceUrl}`;
  return { selected, cost, label, text };
}

function deadlineCopy(version: EksVersion) {
  const standardDays = daysUntil(version.standardSupportEnd);
  const extendedDays = daysUntil(version.extendedSupportEnd);
  if (standardDays >= 0) return `${standardDays}d until standard support ends`;
  if (extendedDays >= 0) return `${Math.abs(standardDays)}d in extended support`;
  return `${Math.abs(extendedDays)}d past extended support`;
}

function toggleRecord(record: Record<string, boolean>, key: string) {
  return { ...record, [key]: !record[key] };
}

function VersionMiniTable({ limit = 6 }: { limit?: number }) {
  return <div className="mini-table">{eksVersions.slice(0, limit).map((v) => <div key={v.version}>
    <strong>{v.version}</strong><span>{v.standardSupportEnd}</span><StatusPill version={v}/><small>{daysUntil(v.standardSupportEnd) >= 0 ? `${daysUntil(v.standardSupportEnd)}d to billing` : `${daysUntil(v.extendedSupportEnd)}d to EOL`}</small>
  </div>)}</div>;
}

function CostDial({ version, clusters, months }: { version: string; clusters: number; months: number }) {
  const { cost, label } = costSummary(version, clusters, months);
  return <div className="cost-dial">
    <p>{label}</p>
    <strong>{formatCurrency(cost.extraTotal)}</strong>
    <div className="dial-bar"><i style={{ width: `${Math.min(100, Math.max(8, cost.extraMonthly / 25))}%` }} /></div>
    <span>{formatCurrency(cost.extraMonthly)} / month delta</span>
  </div>;
}

function Controls({ version, setVersion, clusters, setClusters, months, setMonths }: {
  version: string; setVersion: (v: string) => void; clusters: number; setClusters: (n: number) => void; months: number; setMonths: (n: number) => void;
}) {
  return <div className="controls">
    <label>Version<select value={version} onChange={(e) => setVersion(e.target.value)}>{eksVersions.map((v) => <option key={v.version}>{v.version}</option>)}</select></label>
    <label>Clusters<input type="number" min="1" value={clusters} onChange={(e) => setClusters(Math.max(1, Number(e.target.value) || 1))}/></label>
    <label>Delay <b>{months}mo</b><input type="range" min="1" max="18" value={months} onChange={(e) => setMonths(Number(e.target.value))}/></label>
  </div>;
}

function DesignOne() {
  const [version, setVersion] = useState('1.31');
  const [clusters, setClusters] = useState(12);
  const [months, setMonths] = useState(4);
  const { selected, text } = costSummary(version, clusters, months);
  const arcs = eksVersions.slice(2, 7);
  return <main className="page d1">
    <section className="mission-grid">
      <div className="mission-copy">
        <p className="kicker">/1 ORBITAL COMMAND CENTER</p>
        <h1>Track EKS versions like objects entering controlled re-entry.</h1>
        <p className="lead">A high-signal cockpit for the moment platform teams need to brief leadership: which clusters are entering extended support, how much it costs, and what upgrade path clears the burn.</p>
        <Controls version={version} setVersion={setVersion} clusters={clusters} setClusters={setClusters} months={months} setMonths={setMonths}/>
      </div>
      <div className="orbit-panel" aria-label="EKS lifecycle orbit visualization">
        {arcs.map((v, i) => <span key={v.version} className={`orbit o${i} ${statusTone(v)}`}><b>{v.version}</b></span>)}
        <div className="core"><span>EKS {selected.version}</span><strong>{daysUntil(selected.standardSupportEnd) < 0 ? 'BILLING' : `${daysUntil(selected.standardSupportEnd)}D`}</strong><em>standard support</em></div>
      </div>
      <div className="mission-card"><CostDial version={version} clusters={clusters} months={months}/><CopyButton text={text} label="Copy flight note"/></div>
      <div className="mission-card timeline"><h3>Upgrade burn sequence</h3>{generateHopSequence('1.30', '1.33').map((h, i) => <p key={h}><span>T+{i}</span> Control plane {h}</p>)}</div>
    </section>
  </main>;
}

function DesignTwo() {
  const [version, setVersion] = useState('1.31');
  const [clusters, setClusters] = useState(8);
  const [months, setMonths] = useState(6);
  const { selected, cost, text } = costSummary(version, clusters, months);
  return <main className="page d2">
    <article className="memo">
      <aside><p>STRICTLY PRACTICAL</p><h2>EKS Extended Support Memo</h2><span>Prepared for platform leads, managers, and finance reviewers.</span><Source label="AWS pricing" url={eksPricing.sourceUrl}/></aside>
      <section>
        <div className="memo-top"><p>Recommendation</p><time>{dataFreshness.checkedAt}</time></div>
        <h1>Move EKS {version} before {selected.standardSupportEnd}, or budget {formatCurrency(cost.extraTotal)} in avoidable support-tier delta.</h1>
        <p className="lead serif">This design treats the page as an executive artifact: less dashboard, more boardroom-ready decision memo. The calculator’s output is meant to paste into Jira, Slack, or an upgrade RFC.</p>
        <Controls version={version} setVersion={setVersion} clusters={clusters} setClusters={setClusters} months={months} setMonths={setMonths}/>
        <div className="memo-numbers"><div><span>Standard monthly</span><b>{formatCurrency(cost.standardMonthly)}</b></div><div><span>Extended monthly</span><b>{formatCurrency(cost.extendedMonthly)}</b></div><div><span>Delta</span><b>{formatCurrency(cost.extraMonthly)}</b></div></div>
        <blockquote>“The cost is not the upgrade. The cost is waiting until the upgrade has an invoice.”</blockquote>
        <CopyButton text={text} label="Copy memo summary"/>
      </section>
    </article>
  </main>;
}

function DesignThree() {
  const [current, setCurrent] = useState('1.30');
  const [target, setTarget] = useState('1.33');
  const targetOptions = eksVersions.filter((v) => compareEksVersions(v.version, current) >= 0);
  const effectiveTarget = compareEksVersions(target, current) < 0 ? current : target;
  const hops = generateHopSequence(current, effectiveTarget);
  const ticket = `EKS ${current} -> ${effectiveTarget}\n${hops.map((h, i) => `${i === 0 ? 'CURRENT' : 'UPGRADE'} ${h}`).join('\n')}\n\n${addons.slice(0, 6).flatMap((a) => a.checks).join('\n')}`;
  return <main className="page d3">
    <section className="blueprint-shell">
      <header><p>/3 BLUEPRINT LAB</p><h1>Draft the upgrade as an engineering drawing.</h1><span>Designed for operators who want dense structure, exact commands, and visible dependencies.</span></header>
      <div className="drafting-table">
        <div className="selectors"><label>From<select value={current} onChange={(e) => { setCurrent(e.target.value); if (compareEksVersions(target, e.target.value) < 0) setTarget(e.target.value); }}>{eksVersions.map((v) => <option key={v.version}>{v.version}</option>)}</select></label><label>To<select value={effectiveTarget} onChange={(e) => setTarget(e.target.value)}>{targetOptions.map((v) => <option key={v.version}>{v.version}</option>)}</select></label></div>
        <div className="schematic">{hops.map((h, i) => <div key={h} className="node"><b>{h}</b><span>{i === 0 ? 'baseline' : 'control plane hop'}</span></div>)}</div>
        <div className="command-matrix">{addons.slice(0, 8).map((a) => <section key={a.id}><h3>{a.name}</h3>{a.checks.map((c) => <code key={c}>{c}</code>)}<Source label="docs" url={a.sourceUrl}/></section>)}</div>
      </div>
      <CopyButton text={ticket} label="Copy drawing notes"/>
    </section>
  </main>;
}

function DesignFour() {
  const [query, setQuery] = useState(defaultManifest);
  const [version, setVersion] = useState('1.31');
  const findings = useMemo(() => scanDeprecatedApis(query), [query]);
  const selected = eksVersions.find((v) => v.version === version) ?? eksVersions[0];
  return <main className="page d4">
    <section className="os-frame">
      <aside className="os-rail"><strong>Signal OS</strong><button>⌘K</button><button>API</button><button>EOL</button><button>Cost</button></aside>
      <div className="os-main">
        <div className="command-palette"><span>Ask</span><input readOnly value={`Plan upgrade to EKS ${version} and scan pasted manifests`}/><select value={version} onChange={(e) => setVersion(e.target.value)}>{eksVersions.map((v) => <option key={v.version}>{v.version}</option>)}</select></div>
        <div className="os-grid">
          <section className="window big"><p className="kicker">/4 PRODUCT WORKSPACE</p><h1>One screen for deadline, evidence, and local manifest signals.</h1><textarea value={query} onChange={(e) => setQuery(e.target.value)}/></section>
          <section className="window"><h3>EKS {selected.version}</h3><StatusPill version={selected}/><dl><dt>Standard ends</dt><dd>{selected.standardSupportEnd}</dd><dt>Extended ends</dt><dd>{selected.extendedSupportEnd}</dd></dl></section>
          <section className="window"><h3>Scanner</h3><strong className="huge">{findings.length}</strong><span>deprecated API findings</span>{findings.map((f) => <p key={`${f.apiVersion}-${f.kind}`}>{f.kind} → {f.replacement}</p>)}</section>
          <section className="window"><h3>Next checks</h3>{addons.slice(0, 4).map((a) => <label key={a.id}><input type="checkbox" defaultChecked/> {a.name}</label>)}</section>
        </div>
      </div>
    </section>
  </main>;
}

function DesignFive() {
  const [version, setVersion] = useState('1.30');
  const [clusters, setClusters] = useState(16);
  const [months, setMonths] = useState(3);
  const { selected, cost, text } = costSummary(version, clusters, months);
  const severity = statusTone(selected);
  return <main className="page d5">
    <section className="observatory">
      <div className="radar"><div className={`sweep ${severity}`}/>{eksVersions.slice(1, 7).map((v, i) => <i key={v.version} style={{ rotate: `${i * 54}deg`, scale: `${.55 + i * .08}` }}><b>{v.version}</b></i>)}</div>
      <div className="obs-copy"><p className="kicker">/5 RISK OBSERVATORY</p><h1>A live-feeling radar for upgrade risk and cost gravity.</h1><p className="lead">This direction is intentionally cinematic: the site feels like an operational observatory, while every claim still resolves to a date, a price, or a command.</p><Controls version={version} setVersion={setVersion} clusters={clusters} setClusters={setClusters} months={months} setMonths={setMonths}/></div>
      <div className="obs-stack"><div className="obs-ticket"><span>Projected exposure</span><strong>{formatCurrency(cost.extraTotal)}</strong><p>{clusters} clusters · {months} months · {formatHourlyCurrency(eksPricing.extendedPerClusterHour)} extended support hourly rate</p><CopyButton text={text} label="Copy alert"/></div><VersionMiniTable limit={5}/></div>
    </section>
  </main>;
}

function DesignSix() {
  const [version, setVersion] = useState('1.31');
  const [clusters, setClusters] = useState(24);
  const [months, setMonths] = useState(3);
  const [filter, setFilter] = useState<'all' | 'at-risk' | 'standard'>('all');
  const [checked, setChecked] = useState<Record<string, boolean>>({
    owners: true,
    freeze: false,
    addons: true,
    api: false,
  });
  const { selected, cost } = costSummary(version, clusters, months);
  const incidentRows = eksVersions.map((v) => ({
    version: v,
    tone: statusTone(v),
    label: deadlineCopy(v),
    escalation: getSupportStatus(v).includes('extended') || getSupportStatus(v) === 'expired' ? 'Finance + VP Eng' : 'Platform lead',
  }));
  const visibleRows = incidentRows.filter((row) => {
    if (filter === 'all') return true;
    if (filter === 'at-risk') return row.tone !== 'ok';
    return row.tone === 'ok';
  });
  const tasks = [
    { id: 'owners', label: 'Cluster owners named', detail: `${clusters} clusters in response scope` },
    { id: 'freeze', label: 'Change freeze window cleared', detail: `${months} month delay model active` },
    { id: 'addons', label: 'Managed add-ons checked', detail: `${addons.slice(0, 4).map((a) => a.name).join(', ')}` },
    { id: 'api', label: 'Deprecated API scan attached', detail: `${deprecations.length} known rules available` },
  ];
  const completed = tasks.filter((task) => checked[task.id]).length;
  const severity = statusTone(selected) === 'bad' ? 'SEV-1' : statusTone(selected) === 'warn' ? 'SEV-2' : 'SEV-3';
  const responseNote = `${severity} EKS ${version} upgrade response
${deadlineCopy(selected)}
Scope: ${clusters} clusters, ${months} month exposure window
Projected support-tier delta: ${formatCurrency(cost.extraTotal)}
Completed response items: ${completed}/${tasks.length}
${tasks.map((task) => `${checked[task.id] ? '[x]' : '[ ]'} ${task.label} - ${task.detail}`).join('\n')}`;

  return <main className="page d6">
    <section className="war-room">
      <header className="war-command">
        <div>
          <p className="kicker">/6 INCIDENT WAR ROOM</p>
          <h1>Run the upgrade deadline like a live response.</h1>
          <p className="lead">Escalation, cost exposure, owners, and lifecycle dates stay on one operational board.</p>
        </div>
        <div className={`war-severity ${statusTone(selected)}`}>
          <span>{severity}</span>
          <strong>EKS {selected.version}</strong>
          <em>{deadlineCopy(selected)}</em>
        </div>
      </header>

      <Controls version={version} setVersion={setVersion} clusters={clusters} setClusters={setClusters} months={months} setMonths={setMonths}/>

      <div className="war-layout">
        <section className="war-timeline" aria-label="Version deadline timeline">
          <div className="war-filters">
            {(['all', 'at-risk', 'standard'] as const).map((item) => <button type="button" key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}
          </div>
          {visibleRows.map((row) => <button type="button" key={row.version.version} className={`war-version ${row.tone} ${version === row.version.version ? 'active' : ''}`} onClick={() => setVersion(row.version.version)}>
            <span>EKS {row.version.version}</span>
            <strong>{row.label}</strong>
            <em>{row.escalation}</em>
          </button>)}
        </section>

        <section className="war-status">
          <div className="war-meter">
            <span>Readiness</span>
            <strong>{completed}/{tasks.length}</strong>
            <i style={{ width: `${(completed / tasks.length) * 100}%` }} />
          </div>
          {tasks.map((task) => <label key={task.id} className={checked[task.id] ? 'done' : ''}>
            <input type="checkbox" checked={Boolean(checked[task.id])} onChange={() => setChecked((current) => toggleRecord(current, task.id))}/>
            <span>{task.label}</span>
            <small>{task.detail}</small>
          </label>)}
        </section>

        <aside className="war-brief">
          <span>Exposure if delayed</span>
          <strong>{formatCurrency(cost.extraTotal)}</strong>
          <p>{formatCurrency(cost.extraMonthly)} monthly support-tier delta across {clusters} clusters.</p>
          <CopyButton text={responseNote} label="Copy response brief"/>
        </aside>
      </div>
    </section>
  </main>;
}

function DesignSeven() {
  const [version, setVersion] = useState('1.31');
  const [clusters, setClusters] = useState(42);
  const [months, setMonths] = useState(6);
  const [scenario, setScenario] = useState<'accelerate' | 'bridge' | 'defer'>('bridge');
  const { selected } = costSummary(version, clusters, months);
  const scenarioRows = [
    { id: 'accelerate' as const, label: 'Accelerate', months: Math.max(1, months - 2), note: 'fund focused platform time now' },
    { id: 'bridge' as const, label: 'Bridge', months, note: 'keep current delivery plan' },
    { id: 'defer' as const, label: 'Defer', months: Math.min(24, months + 4), note: 'accept extended support runway' },
  ].map((row) => ({ ...row, cost: calculateEksSupportCost(clusters, row.months) }));
  const activeScenario = scenarioRows.find((row) => row.id === scenario) ?? scenarioRows[1];
  const deferCost = scenarioRows.find((row) => row.id === 'defer')?.cost.extraTotal ?? activeScenario.cost.extraTotal;
  const avoided = Math.max(0, deferCost - activeScenario.cost.extraTotal);
  const businessCase = `EKS extended support cost brief
Version: ${version}
Standard support end: ${selected.standardSupportEnd}
Scenario: ${activeScenario.label}
Clusters: ${clusters}
Exposure window: ${activeScenario.months} month(s)
Extra monthly support-tier delta: ${formatCurrency(activeScenario.cost.extraMonthly)}
Scenario exposure: ${formatCurrency(activeScenario.cost.extraTotal)}
Avoided vs defer case: ${formatCurrency(avoided)}
Pricing note: ${eksPricing.note}
Source: ${eksPricing.sourceUrl}`;

  return <main className="page d7">
    <section className="finance-brief">
      <header className="finance-cover">
        <p className="kicker">/7 CFO COST BRIEF</p>
        <h1>Convert upgrade delay into a finance decision.</h1>
        <p className="lead">A scenario model for managers who need a clean number, a defensible source, and a business case they can paste into planning threads.</p>
      </header>

      <div className="finance-model">
        <aside className="finance-controls">
          <label>EKS version<select value={version} onChange={(e) => setVersion(e.target.value)}>{eksVersions.map((v) => <option key={v.version}>{v.version}</option>)}</select></label>
          <label>Clusters <strong>{clusters}</strong><input type="range" min="1" max="120" value={clusters} onChange={(e) => setClusters(Number(e.target.value))}/></label>
          <label>Base delay <strong>{months} months</strong><input type="range" min="1" max="18" value={months} onChange={(e) => setMonths(Number(e.target.value))}/></label>
          <Source label={eksPricing.sourceLabel} url={eksPricing.sourceUrl}/>
        </aside>

        <section className="finance-statement">
          <div className="scenario-tabs">
            {scenarioRows.map((row) => <button type="button" key={row.id} className={scenario === row.id ? 'active' : ''} onClick={() => setScenario(row.id)}>
              <span>{row.label}</span>
              <strong>{formatCurrency(row.cost.extraTotal)}</strong>
            </button>)}
          </div>
          <div className="finance-total">
            <span>{activeScenario.label} case</span>
            <strong>{formatCurrency(activeScenario.cost.extraTotal)}</strong>
            <p>{activeScenario.months} month exposure, {formatCurrency(activeScenario.cost.extraMonthly)} extra per month, {formatCurrency(avoided)} avoided versus defer.</p>
          </div>
          <div className="ledger">
            <div><span>Standard support</span><b>{formatCurrency(activeScenario.cost.standardMonthly)}</b><em>monthly</em></div>
            <div><span>Extended support</span><b>{formatCurrency(activeScenario.cost.extendedMonthly)}</b><em>monthly</em></div>
            <div><span>Delta</span><b>{formatCurrency(activeScenario.cost.extraMonthly)}</b><em>monthly</em></div>
          </div>
          <table className="finance-table">
            <thead><tr><th>Scenario</th><th>Window</th><th>Exposure</th><th>Planning note</th></tr></thead>
            <tbody>{scenarioRows.map((row) => <tr key={row.id} className={scenario === row.id ? 'selected' : ''}><td>{row.label}</td><td>{row.months} mo</td><td>{formatCurrency(row.cost.extraTotal)}</td><td>{row.note}</td></tr>)}</tbody>
          </table>
          <CopyButton text={businessCase} label="Copy business case"/>
        </section>
      </div>
    </section>
  </main>;
}

function DesignEight() {
  const [current, setCurrent] = useState('1.30');
  const [target, setTarget] = useState('1.34');
  const [manifest, setManifest] = useState(defaultManifest);
  const [selectedAddons, setSelectedAddons] = useState<Record<string, boolean>>(() => Object.fromEntries(addons.slice(0, 7).map((addon) => [addon.id, true])) as Record<string, boolean>);
  const targetOptions = eksVersions.filter((v) => compareEksVersions(v.version, current) >= 0);
  const effectiveTarget = compareEksVersions(target, current) < 0 ? current : target;
  const hops = generateHopSequence(current, effectiveTarget);
  const findings = useMemo(() => scanDeprecatedApis(manifest), [manifest]);
  const selectedAddonList = addons.filter((addon) => selectedAddons[addon.id]);
  const gates = [
    { name: 'Plan PR', state: 'passed', detail: `${hops.length - 1} control-plane hop(s)` },
    { name: 'Add-on matrix', state: selectedAddonList.length >= 4 ? 'passed' : 'running', detail: `${selectedAddonList.length} add-ons selected` },
    { name: 'API scan', state: findings.length ? 'blocked' : 'passed', detail: `${findings.length} deprecated API finding(s)` },
    { name: 'Maintenance window', state: hops.length > 2 ? 'running' : 'passed', detail: `${current} -> ${effectiveTarget}` },
  ];
  const trainPlan = `GitOps release train: EKS ${current} -> ${effectiveTarget}
Hops:
${hops.map((hop, index) => `  ${index + 1}. ${hop}`).join('\n')}
Gates:
${gates.map((gate) => `  ${gate.state.toUpperCase()} ${gate.name}: ${gate.detail}`).join('\n')}
Add-ons:
${selectedAddonList.map((addon) => `  - ${addon.name}: ${addon.checks[0]}`).join('\n')}
Deprecated API findings: ${findings.length}`;

  return <main className="page d8">
    <section className="release-train">
      <header className="train-header">
        <p className="kicker">/8 GITOPS RELEASE TRAIN</p>
        <h1>Move the upgrade through gates, not guesses.</h1>
        <p className="lead">A pipeline view for Argo, Helm, and platform runbooks: versions become stops, add-ons become gates, deprecated APIs block promotion.</p>
      </header>

      <div className="train-console">
        <aside className="train-selectors">
          <label>Current<select value={current} onChange={(e) => { setCurrent(e.target.value); if (compareEksVersions(target, e.target.value) < 0) setTarget(e.target.value); }}>{eksVersions.map((v) => <option key={v.version}>{v.version}</option>)}</select></label>
          <label>Target<select value={effectiveTarget} onChange={(e) => setTarget(e.target.value)}>{targetOptions.map((v) => <option key={v.version}>{v.version}</option>)}</select></label>
          <div className="addon-switches">{addons.map((addon) => <label key={addon.id} className={selectedAddons[addon.id] ? 'enabled' : ''}>
            <input type="checkbox" checked={Boolean(selectedAddons[addon.id])} onChange={() => setSelectedAddons((currentAddons) => toggleRecord(currentAddons, addon.id))}/>
            <span>{addon.name}</span>
          </label>)}</div>
        </aside>

        <section className="track-panel">
          <div className="track-line">{hops.map((hop, index) => <button type="button" key={hop} className={index === 0 ? 'origin' : index === hops.length - 1 ? 'target' : ''} onClick={() => setTarget(hop)}>
            <span>{hop}</span>
            <em>{index === 0 ? 'current' : index === hops.length - 1 ? 'target' : 'promote'}</em>
          </button>)}</div>
          <div className="gate-grid">{gates.map((gate) => <div key={gate.name} className={`gate ${gate.state}`}>
            <span>{gate.state}</span>
            <strong>{gate.name}</strong>
            <p>{gate.detail}</p>
          </div>)}</div>
          <div className="manifest-scan">
            <textarea value={manifest} onChange={(e) => setManifest(e.target.value)}/>
            <div>
              <span>Promotion blockers</span>
              <strong>{findings.length}</strong>
              {findings.map((finding) => <p key={`${finding.apiVersion}-${finding.kind}`}>{finding.kind} removed in {finding.removedIn}</p>)}
            </div>
          </div>
          <CopyButton text={trainPlan} label="Copy train plan"/>
        </section>
      </div>
    </section>
  </main>;
}

function DesignNine() {
  const [version, setVersion] = useState('1.31');
  const [clusters, setClusters] = useState(18);
  const [months, setMonths] = useState(6);
  const [manifest, setManifest] = useState(defaultManifest);
  const [filter, setFilter] = useState<'all' | 'action' | 'ready'>('all');
  const [activeId, setActiveId] = useState('EKS-LC-01');
  const { selected, cost } = costSummary(version, clusters, months);
  const findings = useMemo(() => scanDeprecatedApis(manifest), [manifest]);
  const controls = [
    { id: 'EKS-LC-01', title: 'Kubernetes lifecycle evidence', state: statusTone(selected) === 'ok' ? 'ready' : 'action', owner: 'Platform', citation: selected.sourceLabel, url: selected.sourceUrl, detail: `${statusLabel(getSupportStatus(selected))}; ${deadlineCopy(selected)}` },
    { id: 'EKS-FIN-02', title: 'Extended support cost record', state: cost.extraTotal > 0 ? 'action' : 'ready', owner: 'Finance', citation: eksPricing.sourceLabel, url: eksPricing.sourceUrl, detail: `${formatCurrency(cost.extraTotal)} projected support-tier delta for ${clusters} clusters` },
    { id: 'EKS-ADD-03', title: 'Managed add-on preflight', state: 'ready', owner: 'SRE', citation: addons[0].sourceLabel, url: addons[0].sourceUrl, detail: `${addons.length} add-on check groups available` },
    { id: 'K8S-API-04', title: 'Deprecated API remediation', state: findings.length ? 'action' : 'ready', owner: 'App teams', citation: findings[0]?.sourceLabel ?? deprecations[0].sourceLabel, url: findings[0]?.migrationGuide ?? deprecations[0].migrationGuide, detail: `${findings.length} local manifest finding(s)` },
  ];
  const visibleControls = controls.filter((control) => filter === 'all' || control.state === filter);
  const activeControl = visibleControls.find((control) => control.id === activeId) ?? visibleControls[0] ?? controls[0];
  const evidenceId = `EKS-${version.replace('.', '')}-${clusters}-${months}-${findings.length}`;
  const evidencePack = `Compliance evidence pack ${evidenceId}
Data checked: ${dataFreshness.checkedAt}
Version: EKS ${version}
Lifecycle: ${deadlineCopy(selected)}
Extended support exposure: ${formatCurrency(cost.extraTotal)}
Controls:
${controls.map((control) => `${control.id} ${control.state.toUpperCase()} - ${control.title} - ${control.detail} - ${control.url}`).join('\n')}
Manifest findings:
${findings.length ? findings.map((finding) => `${finding.kind} ${finding.apiVersion} removed in ${finding.removedIn}: ${finding.migrationGuide}`).join('\n') : 'None detected in pasted manifest.'}`;

  return <main className="page d9">
    <section className="binder">
      <aside className="binder-spine">
        <span>Evidence Binder</span>
        <strong>{evidenceId}</strong>
        <em>{dataFreshness.checkedAt}</em>
      </aside>
      <div className="binder-pages">
        <header className="binder-cover">
          <p className="kicker">/9 COMPLIANCE EVIDENCE BINDER</p>
          <h1>Package upgrade risk as auditable evidence.</h1>
          <p className="lead">Lifecycle dates, cost exposure, add-on checks, API findings, and source citations assembled for review.</p>
        </header>

        <div className="binder-controls">
          <label>Version<select value={version} onChange={(e) => setVersion(e.target.value)}>{eksVersions.map((v) => <option key={v.version}>{v.version}</option>)}</select></label>
          <label>Clusters<input type="number" min="1" value={clusters} onChange={(e) => setClusters(Math.max(1, Number(e.target.value) || 1))}/></label>
          <label>Exposure months<input type="range" min="1" max="18" value={months} onChange={(e) => setMonths(Number(e.target.value))}/><span>{months}</span></label>
          <div className="binder-filter">{(['all', 'action', 'ready'] as const).map((item) => <button type="button" key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
        </div>

        <div className="evidence-grid">
          <nav className="control-index" aria-label="Evidence controls">
            {visibleControls.map((control) => <button type="button" key={control.id} className={`${control.state} ${activeControl.id === control.id ? 'active' : ''}`} onClick={() => setActiveId(control.id)}>
              <span>{control.id}</span>
              <strong>{control.title}</strong>
              <em>{control.state}</em>
            </button>)}
          </nav>
          <article className="evidence-page">
            <div className={`stamp ${activeControl.state}`}>{activeControl.state}</div>
            <p>{activeControl.id}</p>
            <h2>{activeControl.title}</h2>
            <dl>
              <dt>Owner</dt><dd>{activeControl.owner}</dd>
              <dt>Finding</dt><dd>{activeControl.detail}</dd>
              <dt>Citation</dt><dd><Source label={activeControl.citation} url={activeControl.url}/></dd>
            </dl>
            <textarea value={manifest} onChange={(e) => setManifest(e.target.value)}/>
            <CopyButton text={evidencePack} label="Copy evidence pack"/>
          </article>
        </div>
      </div>
    </section>
  </main>;
}

function DesignTen() {
  const [version, setVersion] = useState('1.31');
  const [target, setTarget] = useState('1.34');
  const [clusters, setClusters] = useState(9);
  const [months, setMonths] = useState(4);
  const [manifest, setManifest] = useState(defaultManifest);
  const [command, setCommand] = useState<'risk' | 'cost' | 'scan' | 'addons'>('risk');
  const { selected, cost } = costSummary(version, clusters, months);
  const effectiveTarget = compareEksVersions(target, version) < 0 ? version : target;
  const hops = generateHopSequence(version, effectiveTarget);
  const findings = useMemo(() => scanDeprecatedApis(manifest), [manifest]);
  const commandLabels = [
    { id: 'risk' as const, label: 'eks-plan risk' },
    { id: 'cost' as const, label: 'eks-plan cost' },
    { id: 'scan' as const, label: 'eks-plan scan' },
    { id: 'addons' as const, label: 'eks-plan addons' },
  ];
  const output = {
    risk: [
      `$ eks-plan risk --version ${version} --target ${effectiveTarget}`,
      `status: ${statusLabel(getSupportStatus(selected))}`,
      `deadline: ${deadlineCopy(selected)}`,
      `upgrade hops: ${hops.join(' -> ')}`,
      `recommended next hop: ${hops[1] ?? version}`,
    ],
    cost: [
      `$ eks-plan cost --version ${version} --clusters ${clusters} --months ${months}`,
      `standard monthly: ${formatCurrency(cost.standardMonthly)}`,
      `extended monthly: ${formatCurrency(cost.extendedMonthly)}`,
      `extra monthly: ${formatCurrency(cost.extraMonthly)}`,
      `extra total: ${formatCurrency(cost.extraTotal)}`,
    ],
    scan: [
      '$ eks-plan scan --file manifest.yaml',
      `findings: ${findings.length}`,
      ...(findings.length ? findings.map((finding) => `${finding.severity}: ${finding.kind} ${finding.apiVersion} removed in ${finding.removedIn}; use ${finding.replacement}`) : ['no deprecated API matches in pasted manifest']),
    ],
    addons: [
      `$ eks-plan addons --target ${effectiveTarget}`,
      ...addons.slice(0, 6).flatMap((addon) => [`${addon.name}: ${addon.whyItMatters}`, `  ${addon.checks[0]}`]),
    ],
  }[command];
  const runbook = `# EKS CLI companion runbook
${output.join('\n')}

# Upgrade path
${hops.map((hop) => `eksctl upgrade cluster --version ${hop}`).join('\n')}

# Add-on checks
${addons.slice(0, 6).flatMap((addon) => addon.checks).join('\n')}`;

  return <main className="page d10">
    <section className="cli-companion">
      <header className="cli-header">
        <p className="kicker">/10 CLI COMPANION</p>
        <h1>Planner output for engineers already in the shell.</h1>
        <p className="lead">Lifecycle lookup, cost math, manifest scanning, and add-on checks presented as a local terminal workspace.</p>
      </header>

      <div className="cli-grid">
        <aside className="cli-controls">
          <label>Version<select value={version} onChange={(e) => { setVersion(e.target.value); if (compareEksVersions(target, e.target.value) < 0) setTarget(e.target.value); }}>{eksVersions.map((v) => <option key={v.version}>{v.version}</option>)}</select></label>
          <label>Target<select value={effectiveTarget} onChange={(e) => setTarget(e.target.value)}>{eksVersions.filter((v) => compareEksVersions(v.version, version) >= 0).map((v) => <option key={v.version}>{v.version}</option>)}</select></label>
          <label>Clusters<input type="number" min="1" value={clusters} onChange={(e) => setClusters(Math.max(1, Number(e.target.value) || 1))}/></label>
          <label>Delay <span>{months} mo</span><input type="range" min="1" max="18" value={months} onChange={(e) => setMonths(Number(e.target.value))}/></label>
          <div className="cli-command-list">{commandLabels.map((item) => <button type="button" key={item.id} className={command === item.id ? 'active' : ''} onClick={() => setCommand(item.id)}>{item.label}</button>)}</div>
        </aside>

        <section className="terminal">
          <div className="terminal-bar"><span>local</span><span>{`${version} -> ${effectiveTarget}`}</span><span>{formatCurrency(cost.extraTotal)}</span></div>
          <pre>{output.join('\n')}</pre>
          <div className="terminal-footer">
            <span>{findings.length} API finding(s)</span>
            <span>{hops.length - 1} hop(s)</span>
            <span>{formatHourlyCurrency(eksPricing.extendedPerClusterHour)} extended/hr</span>
          </div>
        </section>

        <section className="cli-editor">
          <div><span>manifest.yaml</span><strong>{findings.length} finding(s)</strong></div>
          <textarea value={manifest} onChange={(e) => setManifest(e.target.value)}/>
          <CopyButton text={runbook} label="Copy shell runbook"/>
        </section>
      </div>
    </section>
  </main>;
}

const defaultSelectedAddons = Object.fromEntries(addons.map((addon) => [
  addon.id,
  ['vpc-cni', 'coredns', 'kube-proxy', 'karpenter', 'aws-load-balancer-controller'].includes(addon.id),
])) as Record<string, boolean>;

const nodeModelIds = Object.keys(nodeModelLabels) as NodeModel[];

function selectedAddonIdsFrom(record: Record<string, boolean>) {
  return addons.filter((addon) => record[addon.id]).map((addon) => addon.id);
}

function uniqueSources() {
  const sourceMap = new Map<string, string>();
  sourceMap.set(dataFreshness.sourceUrl, dataFreshness.sourceLabel);
  sourceMap.set(eksPricing.sourceUrl, eksPricing.sourceLabel);
  for (const version of eksVersions) {
    sourceMap.set(version.sourceUrl, version.sourceLabel);
    if (version.releaseUrl) sourceMap.set(version.releaseUrl, `EKS ${version.version} release note`);
  }
  for (const addon of addons) sourceMap.set(addon.sourceUrl, addon.sourceLabel);
  for (const rule of deprecations) sourceMap.set(rule.migrationGuide, rule.sourceLabel);
  return [...sourceMap.entries()].map(([url, label]) => ({ url, label }));
}

const productNavMeta: Record<ProductTab, { code: string; label: string; detail: string }> = {
  overview: { code: '00', label: 'Overview', detail: 'Status board' },
  versions: { code: '01', label: 'Lifecycle', detail: 'Version gates' },
  cost: { code: '02', label: 'Cost', detail: 'Scenario ledger' },
  planner: { code: '03', label: 'Planner', detail: 'Release train' },
  scanner: { code: '04', label: 'Scanner', detail: 'Local terminal' },
  guides: { code: '05', label: 'Guides', detail: 'Source briefings' },
  addons: { code: '06', label: 'Add-ons', detail: 'Preflight gates' },
  evidence: { code: '07', label: 'Evidence', detail: 'Review packet' },
};

function SourceRail({ currentVersion, scannerFindings }: { currentVersion: string; scannerFindings: number }) {
  const sources = uniqueSources();
  return <aside className="product-sources source-rail" aria-label="Data freshness and source links">
    <div className="rail-block rail-release">
      <span className="eyebrow">Release Source Rail</span>
      <strong>EKS {currentVersion}</strong>
      <p>{scannerFindings} local API finding(s) attached to the workspace state.</p>
    </div>
    <div>
      <span className="eyebrow">Data Freshness</span>
      <strong>{dataFreshness.checkedAt}</strong>
      <p>{dataFreshness.note}</p>
    </div>
    <div className="trust-box">
      <span className="eyebrow">Trust Model</span>
      <p>Runs locally in the browser. No AWS APIs, accounts, credentials, cluster discovery, or manifest upload are used.</p>
      <p>Cost values are estimates for the EKS control-plane support tier only.</p>
    </div>
    <div className="source-list">
      <span className="eyebrow">Sources</span>
      {sources.map((source) => <Source key={source.url} label={source.label} url={source.url}/>)}
    </div>
  </aside>;
}

function ProductTabs({ active, guideVersion, setRoute }: { active: ProductTab; guideVersion: string; setRoute: (route: AppRoute) => void }) {
  return <nav className="product-tabs" aria-label="EKS planner sections">
    {productTabs.map((tab) => {
      const path = tab.id === 'guides' ? versionGuidePath(guideVersion) : tab.path;
      const meta = productNavMeta[tab.id];
      return <a
        key={tab.id}
        className={active === tab.id ? 'active' : ''}
        href={path}
        onClick={(event) => {
          event.preventDefault();
          navigate(path, setRoute);
        }}
      >
        <span>{meta.code}</span>
        <strong>{meta.label}</strong>
        <em>{meta.detail}</em>
      </a>;
    })}
  </nav>;
}

function ProductField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="product-field">
    <span>{label}</span>
    {children}
  </label>;
}

function VersionSelect({ value, onChange, versions = eksVersions }: { value: string; onChange: (value: string) => void; versions?: EksVersion[] }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)}>
    {versions.map((version) => <option key={version.version} value={version.version}>EKS {version.version}</option>)}
  </select>;
}

function ProductMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return <div className={`product-metric ${tone ?? ''}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    <p>{detail}</p>
  </div>;
}

type GateState = 'passed' | 'running' | 'blocked' | 'queued';

function Gate({ title, state, detail, meta }: { title: string; state: GateState; detail: string; meta?: string }) {
  return <div className={`gate-card gate-${state}`}>
    <span>{state}</span>
    <strong>{title}</strong>
    <p>{detail}</p>
    {meta && <em>{meta}</em>}
  </div>;
}

type ScenarioId = 'accelerate' | 'bridge' | 'defer';

type ScenarioRow = {
  id: ScenarioId;
  label: string;
  months: number;
  note: string;
  cost: ReturnType<typeof calculateEksSupportCost>;
};

function ScenarioLedger({ rows, activeId, setActiveId }: { rows: ScenarioRow[]; activeId: ScenarioId; setActiveId: (id: ScenarioId) => void }) {
  return <div className="scenario-ledger" aria-label="Support cost scenarios">
    {rows.map((row) => <button type="button" key={row.id} className={activeId === row.id ? 'active' : ''} onClick={() => setActiveId(row.id)}>
      <span>{row.label}</span>
      <strong>{formatCurrency(row.cost.extraTotal)}</strong>
      <em>{row.months} mo · {row.note}</em>
    </button>)}
  </div>;
}

function TerminalOutput({ title, subtitle, lines, footer }: { title: string; subtitle: string; lines: string[]; footer: string[] }) {
  return <section className="terminal-output" aria-label={title}>
    <div className="terminal-output-bar">
      <span>{title}</span>
      <strong>{subtitle}</strong>
    </div>
    <pre>{lines.join('\n')}</pre>
    <div className="terminal-output-footer">
      {footer.map((item) => <span key={item}>{item}</span>)}
    </div>
  </section>;
}

function CopyableReport({ title, text, label = 'Copy report', className = '' }: { title: string; text: string; label?: string; className?: string }) {
  return <section className={`copyable-report ${className}`}>
    <div className="panel-title">
      <h2>{title}</h2>
      <CopyButton text={text} label={label}/>
    </div>
    <textarea readOnly value={text}/>
  </section>;
}

function OverviewSection({
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
          {visibleRows.map((row) => <button type="button" key={row.version.version} className={`deadline-row ${row.tone} ${row.version.version === selected.version ? 'active' : ''}`} onClick={() => setCurrentVersion(row.version.version)}>
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

function VersionsSection({ currentVersion, setCurrentVersion, setRoute }: { currentVersion: string; setCurrentVersion: (value: string) => void; setRoute: (route: AppRoute) => void }) {
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
          <td><button type="button" onClick={() => setCurrentVersion(version.version)}>EKS {version.version}</button></td>
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

function CostSection({
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

function PlannerSection({
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
        <div className="release-stations">{hops.map((hop, index) => <button type="button" key={hop} className={index === 0 ? 'origin' : index === hops.length - 1 ? 'target' : ''} onClick={() => setTargetVersion(hop)}>
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

function ScannerSection({ manifest, setManifest, scannerFindings }: { manifest: string; setManifest: (value: string) => void; scannerFindings: ReturnType<typeof scanManifest> }) {
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
        <textarea value={manifest} onChange={(event) => setManifest(event.target.value)} spellCheck={false}/>
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

function GuidesSection({ guideVersion, setGuideVersion, setRoute }: { guideVersion: string; setGuideVersion: (value: string) => void; setRoute: (route: AppRoute) => void }) {
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

function AddonsSection({ activeAddonId, setActiveAddonId, setRoute }: { activeAddonId: string; setActiveAddonId: (value: string) => void; setRoute: (route: AppRoute) => void }) {
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

function EvidenceSection({
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

function ProductShell({ route, setRoute }: { route: Extract<AppRoute, { kind: 'product' }>; setRoute: (route: AppRoute) => void }) {
  const routeGuideVersion = route.detail?.type === 'version-guide' ? route.detail.version : '1.31';
  const routeAddonId = route.detail?.type === 'addon' ? route.detail.addonId : 'vpc-cni';
  const [currentVersion, setCurrentVersion] = useState(routeGuideVersion);
  const [targetVersion, setTargetVersion] = useState(eksVersions[0].version);
  const [guideVersion, setGuideVersion] = useState(routeGuideVersion);
  const [activeAddonId, setActiveAddonId] = useState(routeAddonId);
  const [clusterCount, setClusterCount] = useState(12);
  const [monthsDelayed, setMonthsDelayed] = useState(4);
  const [nodeModel, setNodeModel] = useState<NodeModel>('managed-node-groups');
  const [manifest, setManifest] = useState(defaultManifest);
  const [selectedAddons, setSelectedAddons] = useState<Record<string, boolean>>(defaultSelectedAddons);

  const scannerFindings = useMemo(() => scanManifest(manifest), [manifest]);
  const selectedAddonIds = selectedAddonIdsFrom(selectedAddons);
  const selectedVersion = eksVersions.find((version) => version.version === currentVersion) ?? eksVersions[0];
  const effectiveTarget = compareEksVersions(targetVersion, currentVersion) < 0 ? currentVersion : targetVersion;
  const displayedGuideVersion = route.detail?.type === 'version-guide' ? route.detail.version : guideVersion;
  const displayedAddonId = route.detail?.type === 'addon' ? route.detail.addonId : activeAddonId;

  return <main className="product-shell">
    <aside className="product-rail">
      <a className="product-brand" href="/app" onClick={(event) => { event.preventDefault(); navigate('/app', setRoute); }}>
        <span/>
        <strong>EKS Upgrade Planner</strong>
        <em>release train workspace</em>
      </a>
      <ProductTabs active={route.tab} guideVersion={displayedGuideVersion} setRoute={setRoute}/>
      <button className="design-link" type="button" onClick={() => navigate('/1', setRoute)}>Design explorations</button>
    </aside>

    <div className="product-main">
      <header className="product-topbar">
        <div>
          <span className="eyebrow">Local SPA · No AWS Account Access</span>
          <strong>Release train: EKS {currentVersion} → EKS {effectiveTarget}</strong>
        </div>
        <div className="topbar-status">
          <StatusPill version={selectedVersion}/>
          <span>{selectedVersion.standardSupportEnd} standard end</span>
          <span>{scannerFindings.length} API finding(s)</span>
        </div>
      </header>

      {route.tab === 'overview' && <OverviewSection currentVersion={currentVersion} targetVersion={effectiveTarget} clusterCount={clusterCount} monthsDelayed={monthsDelayed} scannerFindings={scannerFindings} selectedAddonIds={selectedAddonIds} setCurrentVersion={setCurrentVersion} setRoute={setRoute}/>}
      {route.tab === 'versions' && <VersionsSection currentVersion={currentVersion} setCurrentVersion={setCurrentVersion} setRoute={setRoute}/>}
      {route.tab === 'cost' && <CostSection currentVersion={currentVersion} clusterCount={clusterCount} monthsDelayed={monthsDelayed} setCurrentVersion={setCurrentVersion} setClusterCount={setClusterCount} setMonthsDelayed={setMonthsDelayed}/>}
      {route.tab === 'planner' && <PlannerSection currentVersion={currentVersion} targetVersion={effectiveTarget} clusterCount={clusterCount} monthsDelayed={monthsDelayed} nodeModel={nodeModel} selectedAddons={selectedAddons} scannerFindings={scannerFindings} setCurrentVersion={setCurrentVersion} setTargetVersion={setTargetVersion} setClusterCount={setClusterCount} setMonthsDelayed={setMonthsDelayed} setNodeModel={setNodeModel} setSelectedAddons={setSelectedAddons}/>}
      {route.tab === 'scanner' && <ScannerSection manifest={manifest} setManifest={setManifest} scannerFindings={scannerFindings}/>}
      {route.tab === 'guides' && <GuidesSection guideVersion={displayedGuideVersion} setGuideVersion={setGuideVersion} setRoute={setRoute}/>}
      {route.tab === 'addons' && <AddonsSection activeAddonId={displayedAddonId} setActiveAddonId={setActiveAddonId} setRoute={setRoute}/>}
      {route.tab === 'evidence' && <EvidenceSection currentVersion={currentVersion} targetVersion={effectiveTarget} clusterCount={clusterCount} monthsDelayed={monthsDelayed} nodeModel={nodeModel} selectedAddonIds={selectedAddonIds} scannerFindings={scannerFindings}/>}
    </div>

    <SourceRail currentVersion={currentVersion} scannerFindings={scannerFindings.length}/>
  </main>;
}

function CurrentDesign({ route }: { route: DesignRoute }) {
  if (route === '/2') return <DesignTwo/>;
  if (route === '/3') return <DesignThree/>;
  if (route === '/4') return <DesignFour/>;
  if (route === '/5') return <DesignFive/>;
  if (route === '/6') return <DesignSix/>;
  if (route === '/7') return <DesignSeven/>;
  if (route === '/8') return <DesignEight/>;
  if (route === '/9') return <DesignNine/>;
  if (route === '/10') return <DesignTen/>;
  return <DesignOne/>;
}

function App() {
  const [route, setRoute] = useState<AppRoute>(routeFromLocation());
  useEffect(() => {
    const onPop = () => setRoute(routeFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  if (route.kind === 'design') {
    return <>
      <DesignNav active={route.route} setRoute={setRoute}/>
      <CurrentDesign route={route.route}/>
    </>;
  }
  return <ProductShell route={route} setRoute={setRoute}/>;
}

export default App;

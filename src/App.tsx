import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { addons } from './data/addons';
import { deprecations } from './data/deprecations';
import { dataFreshness, eksVersions, type EksVersion } from './data/versions';
import { eksPricing } from './data/pricing';
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

type Route = '/1' | '/2' | '/3' | '/4' | '/5' | '/6' | '/7' | '/8' | '/9' | '/10';

const routes: { path: Route; name: string; idea: string }[] = [
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

function routeFromLocation(): Route {
  const path = window.location.pathname as Route;
  return routes.some((r) => r.path === path) ? path : '/1';
}

function navigate(path: Route, setRoute: (path: Route) => void) {
  window.history.pushState({}, '', path);
  setRoute(path);
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

function DesignNav({ active, setRoute }: { active: Route; setRoute: (path: Route) => void }) {
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

function CurrentDesign({ route }: { route: Route }) {
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
  const [route, setRoute] = useState<Route>(routeFromLocation());
  useEffect(() => {
    const onPop = () => setRoute(routeFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return <>
    <DesignNav active={route} setRoute={setRoute}/>
    <CurrentDesign route={route}/>
  </>;
}

export default App;

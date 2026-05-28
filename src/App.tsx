import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { addons } from './data/addons';
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

type Route = '/1' | '/2' | '/3' | '/4' | '/5';

const routes: { path: Route; name: string; idea: string }[] = [
  { path: '/1', name: 'Mission Control', idea: 'orbital command center' },
  { path: '/2', name: 'Executive Memo', idea: 'boardroom cost narrative' },
  { path: '/3', name: 'Blueprint Lab', idea: 'technical upgrade drafting table' },
  { path: '/4', name: 'Signal OS', idea: 'dense product workspace' },
  { path: '/5', name: 'Risk Observatory', idea: 'radar + timeline system' },
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

function CurrentDesign({ route }: { route: Route }) {
  if (route === '/2') return <DesignTwo/>;
  if (route === '/3') return <DesignThree/>;
  if (route === '/4') return <DesignFour/>;
  if (route === '/5') return <DesignFive/>;
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

import { useMemo, useState } from 'react';
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

type View = 'overview' | 'versions' | 'calculator' | 'planner' | 'scanner';
const nav: { id: View; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'versions', label: 'EKS Versions' },
  { id: 'calculator', label: 'Cost Calculator' },
  { id: 'planner', label: 'Upgrade Planner' },
  { id: 'scanner', label: 'Browser Scanner' },
];

const exampleManifest = `apiVersion: networking.k8s.io/v1beta1
kind: Ingress
metadata:
  name: legacy-web
  namespace: production
---
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: privileged
---
apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: nightly-report`;

function Citation({ label, url }: { label: string; url: string }) {
  return <a className="citation" href={url} target="_blank" rel="noreferrer">↗ {label}</a>;
}

function StatusBadge({ version }: { version: EksVersion }) {
  const status = getSupportStatus(version);
  return <span className={`status ${status}`}>{statusLabel(status)}</span>;
}

function CopyButton({ text, label = 'Copy markdown' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return <button className="secondary" onClick={copy}>{copied ? 'Copied' : label}</button>;
}

function Overview({ setView }: { setView: (view: View) => void }) {
  const extended = eksVersions.filter((v) => getSupportStatus(v).includes('extended')).length;
  const nextEnd = eksVersions
    .filter((v) => daysUntil(v.standardSupportEnd) > 0)
    .sort((a, b) => daysUntil(a.standardSupportEnd) - daysUntil(b.standardSupportEnd))[0];
  return <>
    <section className="hero-card">
      <div>
        <p className="eyebrow">EKS Upgrade Risk + Extended Support Cost Planner</p>
        <h1>Know when EKS starts costing more, what to upgrade, and what to check before the change window.</h1>
        <p className="hero-copy">A 100% client-side planning workspace for platform teams. No AWS credentials, no uploads, no backend. Data is static, source-linked, and intentionally conservative.</p>
        <div className="hero-actions">
          <button onClick={() => setView('calculator')}>Calculate cost exposure</button>
          <button className="secondary" onClick={() => setView('planner')}>Generate upgrade ticket</button>
        </div>
      </div>
      <div className="hero-metrics">
        <div><strong>{eksVersions[0].version}</strong><span>Newest tracked EKS</span></div>
        <div><strong>{extended}</strong><span>Versions in extended billing</span></div>
        <div><strong>{nextEnd?.version}</strong><span>Next standard support deadline</span></div>
      </div>
    </section>
    <section className="grid three">
      <div className="card"><h3>Money question first</h3><p>Model the 6× control-plane support-tier jump from {formatHourlyCurrency(eksPricing.standardPerClusterHour)}/hr to {formatHourlyCurrency(eksPricing.extendedPerClusterHour)}/hr per cluster.</p></div>
      <div className="card"><h3>Upgrade path, not vibes</h3><p>Generate one-minor-version hops, preflight commands, managed addon checks, and post-upgrade validation steps.</p></div>
      <div className="card"><h3>Local scanner</h3><p>Paste YAML locally to detect known removed Kubernetes APIs. Results cite official migration guides.</p></div>
    </section>
    <FreshnessBanner />
  </>;
}

function FreshnessBanner() {
  return <div className="banner"><strong>Data freshness:</strong> checked {dataFreshness.checkedAt}. {dataFreshness.note} <Citation label={dataFreshness.sourceLabel} url={dataFreshness.sourceUrl} /></div>;
}

function VersionsView({ setView }: { setView: (view: View) => void }) {
  return <section className="card wide">
    <div className="section-title"><div><p className="eyebrow">Lifecycle tracker</p><h2>EKS versions and support deadlines</h2></div><button onClick={() => setView('calculator')}>Estimate delay cost</button></div>
    <FreshnessBanner />
    <div className="table-wrap"><table><thead><tr><th>Version</th><th>Status</th><th>Release</th><th>Standard end</th><th>Extended end</th><th>Deadline signal</th><th>Source</th></tr></thead><tbody>
      {eksVersions.map((v) => {
        const standardDays = daysUntil(v.standardSupportEnd);
        const extendedDays = daysUntil(v.extendedSupportEnd);
        const signal = standardDays >= 0 ? `${standardDays} days to extended billing` : `${extendedDays} days to extended-support end`;
        return <tr key={v.version}><td className="version-cell">EKS {v.version}<span>{v.latestPlatform}</span></td><td><StatusBadge version={v} /></td><td>{v.releaseDate}</td><td>{v.standardSupportEnd}</td><td>{v.extendedSupportEnd}</td><td>{signal}</td><td><Citation label="source" url={v.sourceUrl} /></td></tr>;
      })}
    </tbody></table></div>
  </section>;
}

function CostCalculator() {
  const [version, setVersion] = useState('1.31');
  const [clusters, setClusters] = useState(5);
  const [months, setMonths] = useState(6);
  const selected = eksVersions.find((v) => v.version === version)!;
  const cost = calculateEksSupportCost(Math.max(1, clusters || 1), months);
  const status = getSupportStatus(selected);
  const alreadyExtended = status === 'extended' || status === 'extended-ending-soon' || status === 'expired';
  const exposureLabel = alreadyExtended ? 'current extra exposure' : 'potential exposure if delayed into extended support';
  const summary = `⚠️ EKS Extended Support Cost Alert\n\nWe run ${Math.max(1, clusters || 1)} cluster(s) on EKS ${version}.\n- Support status: ${statusLabel(status)}\n- Standard support ended/ends: ${selected.standardSupportEnd}\n- Extended support ends: ${selected.extendedSupportEnd}\n- Standard monthly control-plane cost: ${formatCurrency(cost.standardMonthly)}\n- Extended monthly control-plane cost: ${formatCurrency(cost.extendedMonthly)}\n- Extra monthly exposure: ${formatCurrency(cost.extraMonthly)}\n- Extra exposure over ${months} month(s): ${formatCurrency(cost.extraTotal)}\n\nSource: ${eksPricing.sourceUrl}\nNote: ${alreadyExtended ? 'This version is already in or past extended support.' : 'This models the cost if the cluster remains on this version after standard support ends.'} Control-plane support tier pricing only; worker nodes and workload costs excluded.`;
  return <section className="grid two">
    <div className="card"><p className="eyebrow">Cost exposure calculator</p><h2>How expensive is waiting?</h2><div className="form-grid">
      <label>EKS version<select value={version} onChange={(e) => setVersion(e.target.value)}>{eksVersions.map(v => <option key={v.version}>{v.version}</option>)}</select></label>
      <label>Cluster count<input type="number" min="1" value={clusters} onChange={(e) => setClusters(Math.max(1, Number(e.target.value) || 1))}/></label>
      <label>Months delayed<input type="range" min="1" max="18" value={months} onChange={(e) => setMonths(Number(e.target.value))}/><span className="range-label">{months} month(s)</span></label>
    </div><Citation label={eksPricing.sourceLabel} url={eksPricing.sourceUrl} /></div>
    <div className="card result-card"><p className="eyebrow">Projected delta</p><h2>{formatCurrency(cost.extraTotal)}</h2><p>{exposureLabel} over {months} month(s).</p><div className="bars"><div><span>Standard monthly</span><b>{formatCurrency(cost.standardMonthly)}</b><i style={{width:'18%'}} /></div><div><span>Extended monthly</span><b>{formatCurrency(cost.extendedMonthly)}</b><i className="danger" style={{width:'100%'}} /></div></div><pre>{summary}</pre><CopyButton text={summary}/></div>
  </section>;
}

function UpgradePlanner() {
  const [current, setCurrent] = useState('1.30');
  const [target, setTarget] = useState('1.33');
  const [selectedAddons, setSelectedAddons] = useState<string[]>(['vpc-cni', 'coredns', 'kube-proxy', 'aws-load-balancer-controller', 'karpenter']);
  const targetOptions = eksVersions.filter((v) => compareEksVersions(v.version, current) >= 0);
  const effectiveTarget = compareEksVersions(target, current) < 0 ? current : target;
  const hops = generateHopSequence(current, effectiveTarget);
  const chosen = addons.filter((a) => selectedAddons.includes(a.id));
  const ticket = `# EKS ${current} → ${effectiveTarget} Upgrade Plan\n\n## Hop sequence\n${hops.map((h, i) => i === 0 ? `- Current: ${h}` : `- Upgrade to ${h}`).join('\n')}\n\n## Preflight\n- aws eks describe-cluster --name $CLUSTER\n- kubectl get nodes -o wide\n- kubectl get apiservices\n- kubectl get events -A --sort-by=.lastTimestamp | tail -100\n\n## Addons to verify\n${chosen.map(a => [`- ${a.name}: ${a.sourceUrl}`, ...a.checks.map(check => `  - ${check}`)].join('\n')).join('\n')}\n\n## Post-upgrade validation\n- kubectl get nodes\n- kubectl -n kube-system get pods\n- kubectl get --raw /readyz?verbose\n- Review Argo CD/Helm sync status and workload SLO dashboards`;
  return <section className="grid two planner">
    <div className="card"><p className="eyebrow">Upgrade planner</p><h2>Generate a source-linked upgrade ticket</h2><div className="form-grid">
      <label>Current version<select value={current} onChange={(e) => {
        const nextCurrent = e.target.value;
        setCurrent(nextCurrent);
        if (compareEksVersions(target, nextCurrent) < 0) setTarget(nextCurrent);
      }}>{eksVersions.map(v => <option key={v.version}>{v.version}</option>)}</select></label>
      <label>Target version<select value={effectiveTarget} onChange={(e) => setTarget(e.target.value)}>{targetOptions.map(v => <option key={v.version}>{v.version}</option>)}</select></label>
    </div><div className="hop-line">{hops.map((h, i) => <span key={h} className={i === 0 ? 'muted-hop' : ''}>{h}</span>)}</div><h3>Addon checklist</h3><div className="addon-list">{addons.map(addon => <label key={addon.id} className="check-card"><input type="checkbox" checked={selectedAddons.includes(addon.id)} onChange={(e) => setSelectedAddons(e.target.checked ? [...selectedAddons, addon.id] : selectedAddons.filter(id => id !== addon.id))}/><span><b>{addon.name}</b><small>{addon.type} · {addon.whyItMatters}</small></span></label>)}</div></div>
    <div className="card"><p className="eyebrow">Runbook preview</p><h2>Preflight → control plane → addons → validation</h2><div className="command-block"><code>aws eks update-cluster-version --name $CLUSTER --kubernetes-version {effectiveTarget}</code><code>aws eks update-addon --cluster-name $CLUSTER --addon-name vpc-cni</code><code>kubectl get --raw /readyz?verbose</code></div><h3>Selected source checks</h3>{chosen.slice(0,5).map(a => <p className="source-row" key={a.id}><b>{a.name}</b><Citation label={a.sourceLabel} url={a.sourceUrl}/></p>)}<pre>{ticket}</pre><CopyButton text={ticket} label="Copy upgrade ticket" /></div>
  </section>;
}

function BrowserScanner() {
  const [input, setInput] = useState(exampleManifest);
  const findings = useMemo(() => scanDeprecatedApis(input), [input]);
  return <section className="grid two">
    <div className="card"><p className="eyebrow">Zero-trust local scanner</p><h2>Paste manifests. Nothing leaves your browser.</h2><p className="muted">Regex-based MVP scanner for known apiVersion/kind removals. Use Pluto/kubent in CI for authoritative cluster scans.</p><textarea value={input} onChange={(e) => setInput(e.target.value)} /><div className="hero-actions"><button className="secondary" onClick={() => setInput(exampleManifest)}>Load example</button><button className="secondary" onClick={() => setInput('')}>Clear</button></div></div>
    <div className="card"><p className="eyebrow">Findings</p><h2>{findings.length ? `${findings.length} deprecated API finding(s)` : 'No known deprecated APIs found'}</h2>{findings.map((f, idx) => <div className="finding" key={`${f.apiVersion}-${f.kind}-${idx}`}><span className={`status ${f.severity === 'critical' ? 'extended-ending-soon' : 'standard-ending-soon'}`}>{f.severity}</span><h3>{f.kind} {f.apiVersion}</h3><p>Removed in Kubernetes {f.removedIn}. Replace with <b>{f.replacement}</b>.</p><small>Line {f.line}</small><pre>{f.excerpt}</pre><Citation label={f.sourceLabel} url={f.migrationGuide}/></div>)}</div>
  </section>;
}

function App() {
  const [view, setView] = useState<View>('overview');
  return <main>
    <header><div className="brand"><span className="logo-dot"/> <span>EKS Upgrade Planner</span></div><nav>{nav.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}>{item.label}</button>)}</nav></header>
    {view === 'overview' && <Overview setView={setView}/>} {view === 'versions' && <VersionsView setView={setView}/>} {view === 'calculator' && <CostCalculator/>} {view === 'planner' && <UpgradePlanner/>} {view === 'scanner' && <BrowserScanner/>}
  </main>;
}

export default App;

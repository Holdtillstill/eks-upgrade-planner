import { type ReactNode } from 'react';
import { addons } from '../data/addons';
import { deprecations } from '../data/deprecations';
import { dataFreshness, eksVersions, type EksVersion } from '../data/versions';
import { eksPricing } from '../data/pricing';
import { formatCurrency, type calculateEksSupportCost } from '../lib/planner';
import { navigate } from '../lib/navigation';
import { productTabs, versionGuidePath, type AppRoute, type ProductTab } from '../lib/routes';
import { CopyButton, Source } from '../components/shared';

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

export function SourceRail({ currentVersion, scannerFindings }: { currentVersion: string; scannerFindings: number }) {
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
      <p>Planner inputs and pasted manifests run locally in the browser. No AWS APIs, product accounts, credentials, cluster discovery, or manifest upload are used or stored.</p>
      <p>Production request logs may include path, IP address, and user agent for operations and abuse prevention.</p>
      <p>Cost values are estimates for the EKS control-plane support tier only.</p>
    </div>
    <div className="source-list">
      <span className="eyebrow">Sources</span>
      {sources.map((source) => <Source key={source.url} label={source.label} url={source.url}/>)}
    </div>
  </aside>;
}

export function ProductTabs({ active, guideVersion, setRoute }: { active: ProductTab; guideVersion: string; setRoute: (route: AppRoute) => void }) {
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

export function ProductField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="product-field">
    <span>{label}</span>
    {children}
  </label>;
}

export function VersionSelect({ value, onChange, versions = eksVersions }: { value: string; onChange: (value: string) => void; versions?: EksVersion[] }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)}>
    {versions.map((version) => <option key={version.version} value={version.version}>EKS {version.version}</option>)}
  </select>;
}

export function ProductMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return <div className={`product-metric ${tone ?? ''}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    <p>{detail}</p>
  </div>;
}

export type GateState = 'passed' | 'running' | 'blocked' | 'queued';

export function Gate({ title, state, detail, meta }: { title: string; state: GateState; detail: string; meta?: string }) {
  return <div className={`gate-card gate-${state}`}>
    <span>{state}</span>
    <strong>{title}</strong>
    <p>{detail}</p>
    {meta && <em>{meta}</em>}
  </div>;
}

export type ScenarioId = 'accelerate' | 'bridge' | 'defer';

export type ScenarioRow = {
  id: ScenarioId;
  label: string;
  months: number;
  note: string;
  cost: ReturnType<typeof calculateEksSupportCost>;
};

export function ScenarioLedger({ rows, activeId, setActiveId }: { rows: ScenarioRow[]; activeId: ScenarioId; setActiveId: (id: ScenarioId) => void }) {
  return <div className="scenario-ledger" aria-label="Support cost scenarios">
    {rows.map((row) => <button
      type="button"
      key={row.id}
      className={activeId === row.id ? 'active' : ''}
      aria-pressed={activeId === row.id}
      aria-label={`${row.label} scenario, ${formatCurrency(row.cost.extraTotal)} exposure over ${row.months} months`}
      onClick={() => setActiveId(row.id)}
    >
      <span>{row.label}</span>
      <strong>{formatCurrency(row.cost.extraTotal)}</strong>
      <em>{row.months} mo · {row.note}</em>
    </button>)}
  </div>;
}

export function TerminalOutput({ title, subtitle, lines, footer }: { title: string; subtitle: string; lines: string[]; footer: string[] }) {
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

export function CopyableReport({ title, text, label = 'Copy report', className = '' }: { title: string; text: string; label?: string; className?: string }) {
  return <section className={`copyable-report ${className}`}>
    <div className="panel-title">
      <h2>{title}</h2>
      <CopyButton text={text} label={label}/>
    </div>
    <textarea readOnly value={text} aria-label={title}/>
  </section>;
}

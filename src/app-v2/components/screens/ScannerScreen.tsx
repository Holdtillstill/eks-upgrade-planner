import { useState } from 'react';
import { FileCode, Trash2, Terminal, XCircle, AlertTriangle, Info, ExternalLink, Play, Upload, FileJson, type LucideIcon } from 'lucide-react';
import { CopyButton } from '../ui/CopyButton';
import { DownloadButton } from '../ui/DownloadButton';
import { StatusPill } from '../ui/StatusPill';
import {
    buildExternalScannerEvidence,
    buildScannerEvidence,
    DEPRECATED_API_RULES,
    findingBlocksTarget,
    scannerEvidenceForUnscannedManifest,
    scannerEvidenceMeta,
    scannerEvidenceSummary,
    scannerCoverageSummary,
    scannerEvidenceIsStale,
    writeStoredScannerEvidence,
    type ExternalScannerImportResult,
    type ScannerEvidence,
    type ScannerFinding as Finding,
} from '../../../lib/scanner-state';
import { activeTargetVersion, readPlannerState } from '../../../lib/planner-state';
import { dataFreshness } from '../../../data/versions';
import { safeArtifactName } from '../../../lib/download';
const EXAMPLE = `apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: restricted
spec:
  privileged: false
  hostPID: false
  hostIPC: false
  seLinux:
    rule: RunAsAny
  runAsUser:
    rule: MustRunAsNonRoot
---
apiVersion: autoscaling/v2beta2
kind: HorizontalPodAutoscaler
metadata:
  name: payments-hpa
  namespace: prod
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: payments-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments-api
  namespace: prod
spec:
  replicas: 3
  selector:
    matchLabels:
      app: payments-api
  template:
    spec:
      containers:
      - name: api
        image: payments-api:v2.4.1
        resources:
          requests:
            cpu: "200m"
            memory: "256Mi"`;
const SEV: Record<Finding['severity'], {
    Icon: LucideIcon;
    label: string;
    tone: string;
    card: string;
    header: string;
}> = {
    error: { Icon: XCircle, label: 'Removed', tone: 'text-danger', card: 'border-danger-border', header: 'bg-danger-bg' },
    warning: { Icon: AlertTriangle, label: 'Deprecated', tone: 'text-warning', card: 'border-warning-border', header: 'bg-warning-bg' },
    info: { Icon: Info, label: 'Advisory', tone: 'text-info', card: 'border-info-border', header: 'bg-info-bg' },
};
const dataCheckedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
}).format(new Date(`${dataFreshness.checkedAt}T00:00:00Z`));
const EXTERNAL_SCANNER_COMMANDS = [
    {
        label: 'kubent',
        command: 'kubent --target-version 1.35 --output json',
    },
    {
        label: 'pluto',
        command: 'pluto detect-files -d ./manifests --target-versions k8s=v1.35 -o json',
    },
];

function scannerTargetVersion() {
    const planner = readPlannerState();
    return activeTargetVersion(planner);
}
function FindingCard({ f, targetVersion }: {
    f: Finding;
    targetVersion: string;
}) {
    const cfg = SEV[f.severity];
    const blocksTarget = findingBlocksTarget(f, targetVersion);
    return (<div className={`rounded-xl overflow-hidden border bg-card ${cfg.card}`}>
      <div className={`flex items-center gap-2.5 px-4 py-2.5 ${cfg.header}`}>
        <cfg.Icon size={13} className={`shrink-0 ${cfg.tone}`}/>
        <span className={`text-[12px] font-semibold flex-1 ${cfg.tone}`}>
          {cfg.label}: {f.kind}
        </span>
        <span className={`font-mono text-[10px] ${cfg.tone}`}>
          line {f.lineNumber}
        </span>
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'API version', val: f.apiVersion, mono: true, tone: 'text-foreground' },
            { label: 'Removed in', val: f.removedIn, mono: true, tone: 'text-foreground' },
            { label: 'Replacement', val: f.replacement, mono: true, tone: 'text-primary', span: true },
            { label: 'Target impact', val: blocksTarget ? `Blocks EKS ${targetVersion}` : `Review before EKS ${targetVersion}`, mono: false, tone: blocksTarget ? 'text-danger' : 'text-warning', span: true },
        ].map(({ label, val, mono, tone, span }) => (<div key={label} className={span ? 'col-span-2' : ''}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5 text-muted-foreground">{label}</p>
              <p className={`text-[11px] font-medium ${mono ? 'font-mono' : ''} ${tone}`}>{val}</p>
            </div>))}
        </div>

        {/* Excerpt */}
        <div className="rounded-lg overflow-hidden border border-border-solid">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted border-b border-border">
            <FileCode size={11} className="text-muted-foreground"/>
            <span className="font-mono text-[10px] text-muted-foreground">
              manifest.yaml:{f.lineNumber}
            </span>
          </div>
          <pre tabIndex={0} className="px-3 py-2.5 text-[11px] font-mono overflow-x-auto focus:outline-none focus:ring-1 focus:ring-primary">
            {f.excerpt}
          </pre>
        </div>

        <div className="flex items-center justify-between">
          <a href={f.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:opacity-70 transition-opacity">
            <ExternalLink size={11}/>
            {f.sourceLabel}
          </a>
          <CopyButton text={`Replace ${f.apiVersion}/${f.kind} with: ${f.replacement}`} size="sm"/>
        </div>
      </div>
    </div>);
}
export function ScannerScreen() {
    const targetVersion = scannerTargetVersion();
    const coverage = scannerCoverageSummary(targetVersion);
    const scanContext = { targetVersion, rulesCheckedAt: dataFreshness.checkedAt, ruleCount: coverage.ruleCount };
    const [manifest, setManifest] = useState(EXAMPLE);
    const [evidence, setEvidence] = useState<ScannerEvidence>(() => scannerEvidenceForUnscannedManifest(EXAMPLE, scanContext));
    const [externalImportText, setExternalImportText] = useState('');
    const [externalImportResult, setExternalImportResult] = useState<ExternalScannerImportResult | null>(null);
    const lineCount = manifest.split('\n').length;
    const findings = evidence.findings;
    const evidenceStale = scannerEvidenceIsStale(evidence, targetVersion, dataFreshness.checkedAt, coverage.ruleCount);
    const blockingRules = DEPRECATED_API_RULES.filter(rule => findingBlocksTarget(rule, targetVersion));
    const scanCurrentManifest = () => {
        const nextEvidence = buildScannerEvidence(manifest, new Date(), scanContext);
        writeStoredScannerEvidence(nextEvidence);
        setEvidence(nextEvidence);
    };
    const loadExample = () => {
        const nextEvidence = buildScannerEvidence(EXAMPLE, new Date(), scanContext);
        writeStoredScannerEvidence(nextEvidence);
        setManifest(EXAMPLE);
        setEvidence(nextEvidence);
    };
    const clearManifest = () => {
        setManifest('');
        setEvidence(scannerEvidenceForUnscannedManifest('', scanContext));
    };
    const editManifest = (value: string) => {
        setManifest(value);
        setEvidence(scannerEvidenceForUnscannedManifest(value, scanContext));
    };
    const importExternalScannerOutput = () => {
        const result = buildExternalScannerEvidence(externalImportText, new Date(), scanContext);
        writeStoredScannerEvidence(result.evidence);
        setEvidence(result.evidence);
        setExternalImportResult(result);
    };
    const importExternalScannerFile = async (file: File | null | undefined) => {
        if (!file)
            return;
        const text = await file.text();
        setExternalImportText(text);
        const result = buildExternalScannerEvidence(text, new Date(), scanContext);
        writeStoredScannerEvidence(result.evidence);
        setEvidence(result.evidence);
        setExternalImportResult(result);
    };
    const overallVariant = evidenceStale ? 'warning' :
        evidence.status === 'not_scanned' ? 'queued' :
        evidence.status === 'empty_input' || evidence.status === 'scan_error' ? 'blocked' :
        findings.some(f => f.severity === 'error') ? 'blocked' :
            findings.some(f => f.severity === 'warning') ? 'warning' : 'passed';
    const pillLabel = evidenceStale
        ? 'Stale scan'
        : evidence.status === 'findings' || evidence.status === 'clean'
        ? `${findings.length} finding${findings.length !== 1 ? 's' : ''}`
        : scannerEvidenceSummary(evidence);
    return (<div className="p-5 w-full h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0 flex-wrap gap-3">
        <div>
          <h2 className="text-[13px] font-semibold">Manifest scanner</h2>
          <p className="text-[11px] mt-0.5 text-muted-foreground">
            Run here: paste Kubernetes manifests and click Scan manifest, or import kubent/Pluto output. {DEPRECATED_API_RULES.length} selected rules · target EKS {targetVersion} · local only
          </p>
        </div>
        <div className="flex items-center gap-2.5">
            <StatusPill variant={overallVariant} label={pillLabel} size="sm"/>
            <span className="font-mono text-[11px] text-muted-foreground">
              {lineCount} lines
            </span>
          </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
            { label: 'Rule coverage', value: `${coverage.ruleCount} APIs` },
            { label: 'Target blockers', value: `${coverage.blockingRuleCount} rules` },
            { label: 'Active target', value: `EKS ${coverage.targetVersion}` },
            { label: 'Data checked', value: dataCheckedDate },
        ].map(item => (<div key={item.label} className="rounded-lg border border-border bg-card px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</p>
          <p className="mt-0.5 text-[12px] font-semibold font-mono">{item.value}</p>
        </div>))}
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-2.5">
            <p className="text-[12px] font-semibold">Live scanner handoff</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Use these outside the browser when you need cluster or repository-wide evidence.</p>
          </div>
          <div className="divide-y divide-border">
            {EXTERNAL_SCANNER_COMMANDS.map(item => {
                const command = item.command.replace('1.35', targetVersion);
                return (<div key={item.label} className="flex items-center gap-3 px-4 py-2">
                  <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{item.label}</span>
                  <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{command}</code>
                  <CopyButton text={command} size="sm"/>
                </div>);
            })}
          </div>
          <div className="border-t border-border p-3">
            <label className="block text-[11px] font-semibold text-foreground">
              Import kubent / Pluto output
              <textarea value={externalImportText} onChange={event => setExternalImportText(event.target.value)} placeholder="Paste kubent JSON, Pluto JSON, or scanner table output here..." className="mt-1 h-24 w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 font-mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"/>
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button onClick={importExternalScannerOutput} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90">
                <Upload size={12}/>
                Import evidence
              </button>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                <FileJson size={12}/>
                Import file
                <input type="file" accept=".json,.txt,.log,application/json,text/*" className="sr-only" onChange={event => importExternalScannerFile(event.target.files?.[0])}/>
              </label>
              {externalImportResult && (<span className="text-[11px] text-muted-foreground">
                {externalImportResult.evidence.findings.length} finding{externalImportResult.evidence.findings.length !== 1 ? 's' : ''} from {externalImportResult.sourceType.replace('_', ' ')}
              </span>)}
            </div>
            {externalImportResult?.warnings.length ? (<ul className="mt-2 space-y-0.5 text-[11px] text-warning">
              {externalImportResult.warnings.map(warning => <li key={warning}>{warning}</li>)}
            </ul>) : null}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            <div>
              <p className="text-[12px] font-semibold">Target-impact rule library</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{blockingRules.length} rules block or warn before EKS {targetVersion}; static local matching only.</p>
            </div>
            <StatusPill variant="info" label={`${DEPRECATED_API_RULES.length} rules`} size="xs"/>
          </div>
          <div tabIndex={0} aria-label="Scanner rule library" className="max-h-36 overflow-auto focus:outline-none focus:ring-1 focus:ring-primary">
            <table className="w-full text-[11px]">
              <thead>
                <tr>
                  {['API', 'Kind', 'Removed', 'Impact'].map(header => <th key={header} className="sticky top-0 bg-muted px-3 py-1.5 text-left font-semibold">{header}</th>)}
                </tr>
              </thead>
              <tbody>
                {DEPRECATED_API_RULES.map(rule => {
                    const blocks = findingBlocksTarget(rule, targetVersion);
                    return (<tr key={`${rule.apiVersion}-${rule.kind}`} className="border-t border-border">
                      <td className="px-3 py-1.5 font-mono">{rule.apiVersion}</td>
                      <td className="px-3 py-1.5">{rule.kind}</td>
                      <td className="px-3 py-1.5 font-mono">{rule.removedIn}</td>
                      <td className={`px-3 py-1.5 font-semibold ${blocks ? 'text-danger' : 'text-muted-foreground'}`}>{blocks ? `Blocks ${targetVersion}` : 'Later'}</td>
                    </tr>);
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {evidenceStale && (<div className="mb-4 rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-[11px] text-foreground">
        <span className="font-semibold text-warning">Re-scan required.</span>{' '}
        This evidence was captured for EKS {evidence.targetVersion ?? 'unknown'} with {evidence.ruleCount || 'unknown'} rules; the active target is EKS {targetVersion} with {coverage.ruleCount} rules.
      </div>)}

      {/* Two-pane */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">

        {/* Editor */}
        <div className="flex flex-col rounded-xl overflow-hidden card-shadow">
          <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-border bg-muted">
            <div className="flex items-center gap-2">
              <FileCode size={13} className="text-muted-foreground"/>
              <span className="text-[12px] font-semibold">manifest.yaml</span>
              <span className="font-mono text-[10px] text-muted-foreground">{lineCount} lines</span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={loadExample} className="text-[11px] font-medium text-primary transition-opacity hover:opacity-70">
                Load example
              </button>
              <button onClick={clearManifest} className="text-muted-foreground transition-colors hover:text-danger" aria-label="Clear manifest" title="Clear manifest">
                <Trash2 size={13}/>
              </button>
            </div>
          </div>

          {/* Editor with gutter */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div aria-hidden className="select-none shrink-0 py-3 pr-2 pl-3 text-right font-mono overflow-hidden bg-muted text-muted-foreground border-r border-border">
              {manifest.split('\n').map((_, i) => <div key={i}>{i + 1}</div>)}
            </div>
            <textarea value={manifest} onChange={e => editManifest(e.target.value)} spellCheck={false} placeholder="Paste Kubernetes manifest YAML here…" aria-label="Kubernetes manifest YAML" className="flex-1 resize-none py-3 px-3 font-mono overflow-y-auto focus:outline-none bg-card"/>
          </div>

          <div className="flex items-center gap-3 px-4 py-2.5 shrink-0 border-t border-border bg-muted">
            <button onClick={scanCurrentManifest} className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-[12px] font-semibold transition-all bg-primary text-primary-foreground hover:opacity-90">
              <Play size={12}/>
              Scan manifest
            </button>
            <span className="text-[11px] text-muted-foreground">
              {evidenceStale ? `Stale scan - re-scan for EKS ${targetVersion}` : scannerEvidenceSummary(evidence)}
            </span>
          </div>
        </div>

        {/* Findings panel */}
        <div className="flex flex-col rounded-xl overflow-hidden card-shadow">
          <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-border bg-muted">
            <div className="flex items-center gap-2.5">
              <span className="text-[12px] font-semibold">Findings</span>
              <span className="font-mono text-[10px]">
                {evidence.status === 'not_scanned' ? 'not scanned' : scannerEvidenceMeta(evidence)}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <DownloadButton text={JSON.stringify(evidence, null, 2)} filename={safeArtifactName('eks-scanner-evidence', 'json')} label="Evidence JSON" mimeType="application/json;charset=utf-8" size="sm"/>
              {[{ tone: 'bg-danger', l: 'removed' }, { tone: 'bg-warning', l: 'deprecated' }].map(({ tone, l }) => (<span key={l} className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${tone}`}/>{l}
                </span>))}
            </div>
          </div>

          <div tabIndex={0} aria-label="Scanner findings results" className="flex-1 overflow-y-auto p-4 space-y-3 focus:outline-none focus:ring-1 focus:ring-primary">
            {evidence.status === 'not_scanned' ? (<div className="flex flex-col items-center justify-center h-full text-center py-16">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-muted">
                  <Terminal size={22} className="text-muted-foreground"/>
                </div>
                <p className="text-[13px] font-semibold mb-1">
                  Paste a manifest and scan
                </p>
                <p className="text-[11px] max-w-[220px] text-muted-foreground">
                  Checks selected deprecated and removed Kubernetes APIs. Not a full cluster scanner.
                </p>
              </div>) : evidence.status === 'empty_input' ? (<div className="flex flex-col items-center justify-center h-full text-center py-16">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-danger-bg">
                  <XCircle size={22} className="text-danger"/>
                </div>
                <p className="text-[13px] font-semibold mb-1">
                  Empty manifest - no evidence captured
                </p>
                <p className="text-[11px] max-w-[260px] text-muted-foreground">
                  Paste a non-empty manifest before this gate can be used as approval evidence.
                </p>
              </div>) : evidence.status === 'scan_error' ? (<div className="flex flex-col items-center justify-center h-full text-center py-16">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-danger-bg">
                  <XCircle size={22} className="text-danger"/>
                </div>
                <p className="text-[13px] font-semibold mb-1">
                  Scan failed
                </p>
                <p className="text-[11px] max-w-[260px] text-muted-foreground">
                  {evidence.errorMessage ?? 'The manifest could not be scanned.'}
                </p>
              </div>) : findings.length === 0 ? (<div className="flex flex-col items-center justify-center h-full text-center py-16">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-success-bg">
                  <span className="text-2xl text-success">✓</span>
                </div>
                <p className="text-[13px] font-semibold mb-1">
                  No deprecated API matches detected
                </p>
                <p className="text-[11px] max-w-[220px] text-muted-foreground">
                  Clean result for this non-empty manifest and the scanner's selected rule set.
                </p>
              </div>) : (<>
                <p className="text-[11px] px-1 text-muted-foreground">
                  {findings.length} finding{findings.length !== 1 ? 's' : ''} · local rules · static analysis only{evidenceStale ? ' · stale target metadata' : ''}
                </p>
                {findings.map(f => <FindingCard key={f.id} f={f} targetVersion={targetVersion}/>)}
                <div className="rounded-lg p-3 text-[11px] bg-muted border border-border">
                  <span className="font-semibold">Scope: </span>
                  Selected local rules, no manifest upload. Source:{' '}
                  <a href="https://kubernetes.io/docs/reference/using-api/deprecation-guide/" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    kubernetes.io/docs/reference/using-api/deprecation-guide
                  </a>
                </div>
              </>)}
          </div>
        </div>
      </div>
    </div>);
}

import { useEffect, useState } from 'react';
import { ExternalLink, Terminal } from 'lucide-react';
import { ADDONS, type Addon } from '../../data/eks-data';
import { StatusPill } from '../ui/StatusPill';
import { CopyButton } from '../ui/CopyButton';
import { GateRow } from '../ui/RiskGate';
import { addonChecklistProgress, addonEvidenceIsStale, addonEvidenceMeta, readAddonChecklistState, updateAddonChecklistEntry, writeAddonChecklistState, type AddonChecklistState } from '../../../lib/addon-state';
import { highestTargetVersion, readPlannerState } from '../../../lib/planner-state';
import { dataFreshness } from '../../../data/versions';

const ADDON_ROUTE_ALIASES: Record<string, string> = {
    'aws-load-balancer-controller': 'aws-lb-controller',
};
const ADDON_CANONICAL_SLUGS: Record<string, string> = {
    'aws-lb-controller': 'aws-load-balancer-controller',
};

function canonicalSlugFor(addonId: string) {
    return ADDON_CANONICAL_SLUGS[addonId] ?? addonId;
}

function pathForAddon(addonId: string) {
    return `/addons/${canonicalSlugFor(addonId)}/eks-compatibility`;
}

function selectedAddonIdFromPath() {
    if (typeof window === 'undefined') {
        return undefined;
    }
    const match = /^\/addons\/([^/]+)\/eks-compatibility$/.exec(window.location.pathname);
    if (!match) {
        return undefined;
    }
    const slug = decodeURIComponent(match[1]);
    const addonId = ADDON_ROUTE_ALIASES[slug] ?? slug;
    return ADDONS.some(addon => addon.id === addonId) ? addonId : undefined;
}

function CommandBlock({ cmd, label }: {
    cmd: string;
    label?: string;
}) {
    return (<div className="rounded-xl overflow-hidden">
      {label && (<div className="flex items-center gap-2 px-3 py-1.5 border-b">
          <Terminal size={11}/>
          <span className="font-mono">{label}</span>
        </div>)}
      <div className="flex items-start">
        <pre tabIndex={0} className="flex-1 px-4 py-3 text-[11px] font-mono overflow-x-auto focus:outline-none focus:ring-1 focus:ring-primary">
          {cmd}
        </pre>
        <div className="px-2 py-2.5 shrink-0"><CopyButton text={cmd} size="sm"/></div>
      </div>
    </div>);
}
function versionMinor(version: string) {
    return Number(version.split('.').at(-1) ?? 0);
}
function addonTargetVerdict(addon: Addon, targetVersion: string): { variant: 'passed' | 'warning' | 'blocked'; label: string; detail: string } {
    const target = versionMinor(targetVersion);
    const min = versionMinor(addon.minEksVersion);
    const max = versionMinor(addon.maxTestedVersion);
    if (target < min) {
        return {
            variant: 'blocked',
            label: 'Below supported range',
            detail: `Target EKS ${targetVersion} is below the modeled minimum EKS ${addon.minEksVersion}.`,
        };
    }
    if (target > max) {
        return {
            variant: 'blocked',
            label: 'Above tested range',
            detail: `Target EKS ${targetVersion} is above this add-on's max tested EKS ${addon.maxTestedVersion}. Treat as a compatibility blocker until verified.`,
        };
    }
    if (target === max) {
        return {
            variant: 'warning',
            label: 'At max tested version',
            detail: `Target EKS ${targetVersion} is at the edge of the modeled tested range. Capture explicit rollout evidence.`,
        };
    }
    return {
        variant: 'passed',
        label: 'Inside tested range',
        detail: `Target EKS ${targetVersion} is within the modeled support band ${addon.minEksVersion}-${addon.maxTestedVersion}.`,
    };
}
const EKS_ADDON_NAMES: Record<string, string> = {
    'vpc-cni': 'vpc-cni',
    coredns: 'coredns',
    'kube-proxy': 'kube-proxy',
    'ebs-csi': 'aws-ebs-csi-driver',
};
const ADDON_HEALTH_COMMANDS: Record<string, string> = {
    'vpc-cni': 'kubectl rollout status -n kube-system daemonset/aws-node',
    coredns: 'kubectl rollout status -n kube-system deployment/coredns',
    'kube-proxy': 'kubectl rollout status -n kube-system daemonset/kube-proxy',
    'ebs-csi': 'kubectl rollout status -n kube-system deployment/ebs-csi-controller',
    'aws-lb-controller': 'kubectl rollout status -n kube-system deployment/aws-load-balancer-controller',
    karpenter: 'kubectl rollout status -n kube-system deployment/karpenter',
    'cert-manager': 'kubectl rollout status -n cert-manager deployment/cert-manager',
    'ingress-nginx': 'kubectl rollout status -n ingress-nginx deployment/ingress-nginx-controller',
    'argo-cd': 'kubectl rollout status -n argocd deployment/argocd-server',
    'kube-prometheus': 'kubectl rollout status -n monitoring deployment/prometheus-operator',
};
function addonEvidenceCommands(addon: Addon, targetVersion: string) {
    const commands = [
        { label: 'Current version', command: addon.checkCommand },
        { label: 'Rollout health', command: ADDON_HEALTH_COMMANDS[addon.id] ?? `kubectl get pods -A | grep -i "${addon.name.split(' ')[0]}"` },
    ];
    const eksAddonName = EKS_ADDON_NAMES[addon.id];
    if (eksAddonName) {
        commands.splice(1, 0, {
            label: 'Supported versions',
            command: `aws eks describe-addon-versions --addon-name ${eksAddonName} --kubernetes-version ${targetVersion} --output table`,
        });
    }
    else {
        commands.splice(1, 0, {
            label: 'Release inventory',
            command: `helm list -A | grep -i "${addon.name.split(' ')[0]}"`,
        });
    }
    return commands;
}
function AddonDetail({ addon, checked, onToggle, targetVersion, evidenceMeta, evidenceStale }: {
    addon: Addon;
    checked: Set<number>;
    onToggle: (index: number) => void;
    targetVersion: string;
    evidenceMeta: string;
    evidenceStale: boolean;
}) {
    const overall = addon.gates.every(g => g.status === 'passed') ? 'passed'
        : addon.gates.some(g => g.status === 'blocked') ? 'blocked' : 'warning';
    const compatibilityPassed = addon.gates.filter(gate => gate.status === 'passed').length;
    const compatibilityWarnings = addon.gates.filter(gate => gate.status === 'warning').length;
    const compatibilityBlocked = addon.gates.filter(gate => gate.status === 'blocked').length;
    const checklistText = addon.validationChecklist.map((item, i) => `[${checked.has(i) ? 'x' : ' '}] ${item}`).join('\n');
    const verdict = addonTargetVerdict(addon, targetVersion);
    const evidenceCommands = addonEvidenceCommands(addon, targetVersion);
    const validationComplete = checked.size >= addon.validationChecklist.length;
    const evidenceVariant = evidenceStale ? 'warning' : validationComplete ? 'passed' : checked.size > 0 ? 'info' : 'queued';
    const evidenceLabel = evidenceStale ? 'Stale evidence' : validationComplete ? 'Captured' : checked.size > 0 ? 'In progress' : 'Not captured';
    const progressStep = Math.round((checked.size / addon.validationChecklist.length) * 12);
    const progressClass = [
        'w-0', 'w-1/12', 'w-1/6', 'w-1/4', 'w-1/3', 'w-5/12',
        'w-1/2', 'w-7/12', 'w-2/3', 'w-3/4', 'w-5/6', 'w-11/12', 'w-full',
    ][progressStep];
    return (<div className="p-5 w-full space-y-4">
      <div className="rounded-xl overflow-hidden card-shadow">
        <div className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
            <div>
              <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                <h2 className="text-[14px] font-semibold">{addon.name}</h2>
                {addon.managedByEks && (<span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-eks-teal-border bg-eks-teal-bg text-primary">
                    EKS managed
                  </span>)}
              </div>
              <p className="text-[11px] text-muted-foreground">{addon.publisher}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <StatusPill variant={overall} size="sm"/>
              <a href={addon.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:opacity-70 transition-opacity">
                <ExternalLink size={11}/>Docs
              </a>
            </div>
          </div>
          <p className="text-[12px] leading-relaxed mb-4 text-muted-foreground">{addon.whyItMatters}</p>
          <div className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Compatibility</p>
              <p className="mt-1 text-[12px] font-semibold">{compatibilityPassed} passed / {compatibilityWarnings} warning / {compatibilityBlocked} blocked</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Evidence</p>
              <p className={`mt-1 text-[12px] font-semibold ${evidenceStale ? 'text-warning' : ''}`}>{checked.size}/{addon.validationChecklist.length} captured</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{evidenceMeta || `Target EKS ${targetVersion} · data ${dataFreshness.checkedAt}`}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Overall</p>
              <p className="mt-1 text-[12px] font-semibold capitalize">{overall}</p>
            </div>
          </div>
          <div className="flex items-center gap-5 pt-4 text-[11px] font-mono text-muted-foreground">
            <span>Min EKS <span className="text-foreground font-semibold">{addon.minEksVersion}</span></span>
            <span>·</span>
            <span>Max tested <span className="text-foreground font-semibold">{addon.maxTestedVersion}</span></span>
          </div>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden card-shadow">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b">
          <div>
            <p className="text-[12px] font-semibold">Target compatibility matrix</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{verdict.detail}</p>
          </div>
          <StatusPill variant={verdict.variant} label={verdict.label} size="xs"/>
        </div>
        <div className="grid grid-cols-1 gap-0 border-b border-border sm:grid-cols-3">
          {[
            { label: 'Minimum EKS', value: addon.minEksVersion },
            { label: 'Active target', value: targetVersion },
            { label: 'Max tested', value: addon.maxTestedVersion },
        ].map((item, index) => (<div key={item.label} className={`px-5 py-3 ${index < 2 ? 'sm:border-r sm:border-border' : ''}`}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{item.label}</p>
              <p className="mt-1 font-mono text-[13px] font-semibold">EKS {item.value}</p>
            </div>))}
        </div>
        <div className="divide-y divide-border">
          {evidenceCommands.map(item => (<div key={item.label} className="p-4">
            <CommandBlock cmd={item.command} label={item.label}/>
          </div>))}
        </div>
      </div>

      <div className="rounded-xl overflow-hidden card-shadow">
        <div className="px-5 py-3 border-b text-[12px] font-semibold">
          Readiness gates
        </div>
        <div className="px-5 py-1">
          {addon.gates.map((g, i) => <GateRow key={i} label={g.label} status={g.status}/>)}
        </div>
      </div>

      <div className="rounded-xl overflow-hidden card-shadow">
        <div className="px-5 py-3 border-b text-[12px] font-semibold">
          Version check command
        </div>
        <div className="p-4">
          <CommandBlock cmd={addon.checkCommand} label="shell"/>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden card-shadow">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <span className="text-[12px] font-semibold">Validation checklist</span>
          <div className="flex items-center gap-2.5">
            <StatusPill variant={evidenceVariant} label={evidenceLabel} size="xs"/>
            <span className="text-[10px] font-mono">
              {checked.size}/{addon.validationChecklist.length}
            </span>
            <CopyButton text={checklistText} label="Copy" size="sm"/>
          </div>
        </div>
        {evidenceStale && (<div className="border-b border-warning-border bg-warning-bg px-5 py-2 text-[11px] text-warning">
          Evidence was captured for an older target or data snapshot. Re-check this add-on for EKS {targetVersion} before approval.
        </div>)}
        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div className={`h-full bg-primary transition-all ${progressClass}`}/>
        </div>
        <div className="px-4 py-3 space-y-0.5">
          {addon.validationChecklist.map((item, i) => (<label key={i} className="flex items-start gap-3 px-2 py-2 rounded-lg cursor-pointer transition-colors hover:bg-muted/50">
              <input type="checkbox" checked={checked.has(i)} onChange={() => onToggle(i)} className="sr-only"/>
              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-all ${checked.has(i) ? 'border-primary bg-primary' : 'border-border-solid bg-card'}`}>
                {checked.has(i) && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </span>
              <span className={`text-[12px] ${checked.has(i) ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                {item}
              </span>
            </label>))}
        </div>
      </div>
    </div>);
}
const STATUS_DOT_CLASS = {
    passed: 'bg-success',
    blocked: 'bg-danger',
    warning: 'bg-warning',
} as const;
const STATUS_LABEL = {
    passed: 'Passed',
    blocked: 'Blocked',
    warning: 'Warning',
} as const;
function addonStatus(a: Addon) {
    if (a.gates.every(g => g.status === 'passed'))
        return 'passed';
    if (a.gates.some(g => g.status === 'blocked'))
        return 'blocked';
    return 'warning';
}
export function AddonsScreen() {
    const [selId, setSelId] = useState(() => selectedAddonIdFromPath() ?? ADDONS[0].id);
    const [checklistState, setChecklistState] = useState<AddonChecklistState>(readAddonChecklistState);
    const [planner] = useState(readPlannerState);
    const targetVersion = highestTargetVersion(planner.fleetRows);
    useEffect(() => {
        writeAddonChecklistState(checklistState);
    }, [checklistState]);
    useEffect(() => {
        const onPop = () => {
            setSelId(selectedAddonIdFromPath() ?? ADDONS[0].id);
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);
    const addon = ADDONS.find(a => a.id === selId)!;
    const selectedProgress = addonChecklistProgress(checklistState, addon.id, addon.validationChecklist.length);
    const selectedEvidenceStale = addonEvidenceIsStale(checklistState, addon.id, targetVersion, dataFreshness.checkedAt);
    const selectedEvidenceMeta = addonEvidenceMeta(checklistState, addon.id);
    const toggleChecklist = (addonId: string, index: number) => {
        setChecklistState(current => {
            const next = new Set(current[addonId]?.checked ?? []);
            if (next.has(index)) {
                next.delete(index);
            }
            else {
                next.add(index);
            }
            return updateAddonChecklistEntry(current, addonId, [...next], targetVersion, dataFreshness.checkedAt);
        });
    };
    const selectAddon = (addonId: string) => {
        setSelId(addonId);
        const nextPath = pathForAddon(addonId);
        if (window.location.pathname !== nextPath) {
            window.history.pushState({}, '', nextPath);
        }
    };
    return (<div className="flex h-full flex-col overflow-hidden lg:flex-row">
      <div className="max-h-56 w-full shrink-0 overflow-y-auto border-b border-border bg-card lg:max-h-none lg:w-[196px] lg:border-b-0 lg:border-r">
        <div className="px-4 py-3 border-b bg-muted">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Add-ons</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            {(['passed', 'warning', 'blocked'] as const).map(status => (<span key={status} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASS[status]}`}/>{STATUS_LABEL[status]}
            </span>))}
          </div>
        </div>
        {ADDONS.map(a => {
            const status = addonStatus(a);
            const progress = addonChecklistProgress(checklistState, a.id, a.validationChecklist.length);
            const staleEvidence = addonEvidenceIsStale(checklistState, a.id, targetVersion, dataFreshness.checkedAt);
            const isSel = a.id === selId;
            return (<button key={a.id} onClick={() => selectAddon(a.id)} className={`w-full text-left px-4 py-3 border-b transition-colors ${isSel ? 'bg-eks-teal-bg' : 'hover:bg-muted/50'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-[11px] font-semibold truncate ${isSel ? 'text-primary' : 'text-foreground'}`}>{a.name}</p>
                  <p className="text-[10px] mt-0.5 truncate text-muted-foreground">Compatibility: {STATUS_LABEL[status]}</p>
                  <p className={`text-[10px] mt-0.5 truncate ${staleEvidence ? 'text-warning' : 'text-muted-foreground'}`}>Evidence: {staleEvidence ? 'stale' : `${progress.checkedCount}/${progress.total} captured`}</p>
                </div>
                <span className={`w-2 h-2 rounded-full shrink-0 mt-1 ${STATUS_DOT_CLASS[status]}`}/>
              </div>
            </button>);
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AddonDetail addon={addon} checked={selectedProgress.checked} targetVersion={targetVersion} evidenceMeta={selectedEvidenceMeta} evidenceStale={selectedEvidenceStale} onToggle={(index) => toggleChecklist(addon.id, index)}/>
      </div>
    </div>);
}

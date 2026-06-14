import { useEffect, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeExternalLinks from 'rehype-external-links';
import remarkGfm from 'remark-gfm';
import { ADDONS, EKS_VERSIONS, type SupportStatus } from '../../data/eks-data';
import { StatusPill } from '../ui/StatusPill';
import { CopyButton } from '../ui/CopyButton';
import { dataFreshness } from '../../../data/versions';
import { deprecations } from '../../../data/deprecations';

const STATUS_LABEL: Record<SupportStatus, string> = {
    latest: 'Latest', standard: 'Standard', extended: 'Extended', eol: 'End of life', upcoming: 'Upcoming',
};
const dataCheckedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
}).format(new Date(`${dataFreshness.checkedAt}T00:00:00Z`));
function versionMinor(version: string) {
    return Number(version.split('.').at(-1) ?? 0);
}
function targetDeprecationRules(targetVersion: string) {
    const targetMinor = versionMinor(targetVersion);
    return deprecations.filter(rule => versionMinor(rule.removedIn) <= targetMinor);
}
function deprecatedApiTable(targetVersion: string) {
    const rows = targetDeprecationRules(targetVersion).map(rule => `| ${rule.apiVersion} | ${rule.kind} | k8s ${rule.removedIn} | ${rule.replacement} |`);
    return ['| API | Kind | Removed | Replacement |', '|-----|------|---------|-------------|', ...rows].join('\n');
}
function addonValidationMatrix(targetVersion: string) {
    const rows = ADDONS.map(addon => {
        const status = versionMinor(addon.maxTestedVersion) >= versionMinor(targetVersion)
            ? 'Target covered'
            : `Needs vendor review past ${addon.maxTestedVersion}`;
        return `| ${addon.name} | ${addon.managedByEks ? 'EKS managed' : 'Platform'} | ${addon.minEksVersion} | ${addon.maxTestedVersion} | ${status} |`;
    });
    return ['| Add-on | Owner model | Min EKS | Max tested | Target note |', '|--------|-------------|---------|------------|-------------|', ...rows].join('\n');
}
const GUIDE: Record<string, {
    suggestedTarget: string;
    sections: {
        title: string;
        body: string;
    }[];
}> = {
    '1.31': {
        suggestedTarget: '1.35',
        sections: [
            { title: 'Cost risk', body: `EKS 1.31 standard support ended **2025-11-26**. Clusters remaining on EKS 1.31 incur extended support charges of **$0.60 / cluster / hour** (~$438 / cluster / month at 730 hours). For a 5-cluster group, monthly exposure is approximately **$2,190 / month**. Extended coverage continues until **2026-11-26**, after which EKS 1.31 reaches end of life.` },
            { title: 'Upgrade hops', body: `EKS supports upgrading one minor version at a time. From EKS 1.31 to EKS 1.35:\n\n\`\`\`\nEKS 1.31 → 1.32 → 1.33 → 1.34 → 1.35   (4 hops)\n\`\`\`\n\nEach hop requires:\n1. Control-plane upgrade via EKS console or CLI\n2. Managed node group update to matching AMI\n3. Managed add-on version alignment\n4. Workload validation before next hop` },
            { title: 'Deprecated API checks', body: `Removed APIs to scan before upgrading to EKS 1.35:\n\n${deprecatedApiTable('1.35')}` },
            { title: 'Managed add-on checks', body: `Target validation matrix for EKS 1.35:\n\n${addonValidationMatrix('1.35')}\n\n\`\`\`bash\naws eks describe-addon-versions \\\\\n  --kubernetes-version 1.35 \\\\\n  --query 'addons[].{name:addonName,version:addonVersions[0].addonVersion}'\n\`\`\`` },
            { title: 'Post-upgrade validation', body: `\`\`\`bash\n# Control plane version\nkubectl version --short\n\n# All nodes must match new minor version\nkubectl get nodes -o wide\n\n# System pods healthy\nkubectl get pods -n kube-system\n\n# DNS test\nkubectl run dns-test --rm -it \\\\\n  --image=busybox --restart=Never \\\\\n  -- nslookup kubernetes\n\n# Add-on status\naws eks list-addons --cluster-name <CLUSTER_NAME>\n\`\`\`` },
            { title: 'Source citations', body: `- [EKS Kubernetes versions](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html)\n- [EKS extended support pricing](https://aws.amazon.com/eks/pricing/)\n- [Updating a cluster](https://docs.aws.amazon.com/eks/latest/userguide/update-cluster.html)\n- [Kubernetes API deprecation guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/)` },
        ],
    },
};
function compareVersions(a: string, b: string) {
    const [aMajor, aMinor] = a.split('.').map(Number);
    const [bMajor, bMinor] = b.split('.').map(Number);
    return aMajor === bMajor ? aMinor - bMinor : aMajor - bMajor;
}
function suggestedTargetFor(version: string) {
    const sorted = [...EKS_VERSIONS].map(v => v.version).sort(compareVersions);
    const currentIndex = sorted.indexOf(version);
    if (currentIndex < 0)
        return '1.35';
    return sorted[Math.min(sorted.length - 1, currentIndex + 2)] ?? version;
}
function hopSequence(from: string, to: string) {
    const sorted = [...EKS_VERSIONS].map(v => v.version).sort(compareVersions);
    const fromIndex = sorted.indexOf(from);
    const toIndex = sorted.indexOf(to);
    if (fromIndex < 0 || toIndex < fromIndex)
        return [from, to];
    return sorted.slice(fromIndex, toIndex + 1);
}
function generatedGuide(version: string, vd?: typeof EKS_VERSIONS[0]) {
    if (!vd)
        return undefined;
    const target = suggestedTargetFor(version);
    const hops = hopSequence(version, target);
    const hopText = hops.length > 1 ? hops.join(' → ') : `EKS ${version} is already at the suggested target line.`;
    const supportRisk = vd.status === 'eol'
            ? 'This version is end of life. Treat any remaining cluster as an urgent retirement or migration item.'
            : vd.status === 'extended'
            ? 'This version is in extended support. Delayed upgrades create direct hourly support charges.'
            : vd.status === 'latest'
                ? 'This version is on the latest planning line in the local dataset.'
                : 'This version is in standard support. Use the standard support end date as the planning deadline.';
    return {
        suggestedTarget: target,
        sections: [
            {
                title: 'Lifecycle position',
                body: `EKS ${version} is marked **${STATUS_LABEL[vd.status]}** in the local planning dataset.\n\n- Release date: ${vd.releaseDate}\n- Standard support ends: ${vd.standardEnd}\n- Extended support ends: ${vd.extendedEnd}\n\n${supportRisk}`,
            },
            {
                title: 'Suggested upgrade route',
                body: `Suggested target: **EKS ${target}**\n\n\`\`\`\n${hopText}\n\`\`\`\n\nEKS minor upgrades should be planned one minor at a time. Validate workloads, add-ons, and node groups after each hop before moving to the next.`,
            },
            {
                title: 'Preflight checks',
                body: `Before upgrading from EKS ${version}, collect these checks:\n\n- Deprecated Kubernetes API scan for all manifests\n- Managed add-on compatibility for the target minor version\n- Node group AMI and launch template readiness\n- PodDisruptionBudget coverage for production Deployments\n- Maintenance window and rollback owner approval`,
            },
            {
                title: 'Target-specific API removals',
                body: `APIs removed by the suggested target EKS ${target}:\n\n${deprecatedApiTable(target)}`,
            },
            {
                title: 'Add-on validation matrix',
                body: `Use the Add-ons page to capture evidence for these components before approval:\n\n${addonValidationMatrix(target)}`,
            },
            {
                title: 'Validation commands',
                body: `\`\`\`bash\nkubectl version --short\nkubectl get nodes -o wide\nkubectl get pods -A --field-selector=status.phase!=Running\nkubectl get pdb -A\naws eks list-addons --cluster-name <CLUSTER_NAME>\n\`\`\``,
            },
            {
                title: 'Source citations',
                body: `- [EKS Kubernetes versions](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html)\n- [EKS extended support pricing](https://aws.amazon.com/eks/pricing/)\n- [Updating a cluster](https://docs.aws.amazon.com/eks/latest/userguide/update-cluster.html)\n- [Kubernetes API deprecation guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/)`,
            },
        ],
    };
}
function guideFor(version: string, vd?: typeof EKS_VERSIONS[0]) {
    return GUIDE[version] ?? generatedGuide(version, vd);
}
function selectedVersionFromPath() {
    const match = /^\/eks\/(1-\d+)-upgrade-guide/.exec(window.location.pathname);
    return match?.[1].replace('-', '.');
}
function buildMd(version: string, vd?: typeof EKS_VERSIONS[0]) {
    const g = guideFor(version, vd);
    if (!vd || !g)
        return `# EKS ${version} Upgrade Guide\n\nNo detailed guide for this version yet.`;
    return `# EKS ${version} Upgrade Guide\n\n## Lifecycle brief\n- Release date          : ${vd.releaseDate}\n- Standard support ends : ${vd.standardEnd}\n- Extended support ends : ${vd.extendedEnd}\n- Suggested target      : EKS ${g.suggestedTarget}\n\n${g.sections.map(s => `## ${s.title}\n\n${s.body}`).join('\n\n')}\n\n---\n*EKS Upgrade Planner · data checked ${dataCheckedDate} · Local only*`;
}
function textFromReactNode(node: ReactNode): string {
    if (typeof node === 'string' || typeof node === 'number') {
        return String(node);
    }
    if (Array.isArray(node)) {
        return node.map(textFromReactNode).join('');
    }
    if (node && typeof node === 'object' && 'props' in node) {
        const props = node.props as { children?: ReactNode };
        return textFromReactNode(props.children);
    }
    return '';
}
function MdBody({ raw }: {
    raw: string;
}) {
    return (<div className="space-y-3 text-[12px] leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeExternalLinks, { target: '_blank', rel: ['noreferrer'] }]]} components={{
            h1: ({ children }) => <h2 className="text-[14px] font-semibold">{children}</h2>,
            h2: ({ children }) => <h3 className="text-[13px] font-semibold">{children}</h3>,
            h3: ({ children }) => <h4 className="text-[12px] font-semibold">{children}</h4>,
            p: ({ children }) => <p>{children}</p>,
            strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
            a: ({ children, href }) => <a href={href} className="font-medium text-primary hover:opacity-70">{children}</a>,
            ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
            li: ({ children }) => <li className="pl-1">{children}</li>,
            table: ({ children }) => <div tabIndex={0} aria-label="Markdown table" className="overflow-x-auto focus:outline-none focus:ring-1 focus:ring-primary"><table className="w-full rounded-xl overflow-hidden">{children}</table></div>,
            th: ({ children }) => <th className="text-left px-4 py-2 text-[11px] font-semibold">{children}</th>,
            td: ({ children }) => <td className="px-4 py-2 font-mono text-[11px]">{children}</td>,
            code: ({ children, className }) => className
                ? <code className="font-mono">{children}</code>
                : <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{children}</code>,
            pre: ({ children }) => {
                const text = textFromReactNode(children).replace(/\n$/, '');
                return (<div className="relative">
                  <pre tabIndex={0} className="rounded-xl p-4 text-[11px] font-mono overflow-x-auto focus:outline-none focus:ring-1 focus:ring-primary">
                    {children}
                  </pre>
                  <div className="absolute top-2.5 right-2.5"><CopyButton text={text} size="sm"/></div>
                </div>);
            },
        }}>
        {raw}
      </ReactMarkdown>
    </div>);
}
export function GuidesScreen() {
    const [sel, setSel] = useState(() => selectedVersionFromPath() ?? '1.31');
    useEffect(() => {
        const onPop = () => {
            setSel(selectedVersionFromPath() ?? '1.31');
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);
    const vd = EKS_VERSIONS.find(v => v.version === sel);
    const guide = guideFor(sel, vd);
    const selectVersion = (version: string) => {
        setSel(version);
        const path = `/eks/${version.replace('.', '-')}-upgrade-guide`;
        if (window.location.pathname !== path)
            window.history.pushState({}, '', path);
    };
    return (<div className="flex h-full flex-col overflow-hidden lg:flex-row">
      {/* Index */}
      <div className="max-h-56 w-full shrink-0 overflow-y-auto border-b border-border bg-card lg:max-h-none lg:w-[196px] lg:border-b-0 lg:border-r">
        <div className="px-4 py-3 border-b bg-muted">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Versions</p>
        </div>
        {[...EKS_VERSIONS].reverse().map(v => {
            const isSel = v.version === sel;
            return (<button key={v.version} onClick={() => selectVersion(v.version)} className={`w-full text-left px-4 py-3 border-b transition-colors ${isSel ? 'bg-eks-teal-bg' : 'hover:bg-muted/50'}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`font-mono text-[12px] font-semibold ${isSel ? 'text-primary' : 'text-foreground'}`}>
                  EKS {v.version}
                </span>
                {isSel && <span className="w-1.5 h-1.5 rounded-full bg-primary"/>}
              </div>
              <StatusPill variant={v.status} size="xs" showIcon={false} label={STATUS_LABEL[v.status]}/>
            </button>);
        })}
      </div>

      {/* Article */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="p-5 w-full space-y-4">
          {/* Header card */}
          <div className="rounded-xl overflow-hidden card-shadow">
            <div className="px-6 py-5">
              <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-1">
                    Lifecycle brief
                  </p>
                  <h1 className="font-mono font-bold">EKS {sel}</h1>
                  <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                    {vd && <StatusPill variant={vd.status} size="sm" label={STATUS_LABEL[vd.status]}/>}
                    {guide && (<span className="text-[11px]">
                        Suggested target:{' '}
                        <span className="font-mono font-semibold text-primary">
                          EKS {guide.suggestedTarget}
                        </span>
                      </span>)}
                  </div>
                </div>
                <CopyButton text={buildMd(sel, vd)} label="Copy guide" size="md"/>
              </div>
              {vd && (<div className="grid grid-cols-3 gap-4 pt-4">
                  {[
                { label: 'Release date', value: vd.releaseDate, warn: false },
                { label: 'Standard support ends', value: vd.standardEnd, warn: vd.status === 'extended' || vd.status === 'eol' },
                { label: 'Extended support ends', value: vd.extendedEnd, warn: false },
            ].map(({ label, value, warn }) => (<div key={label}>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
                      <p className={`font-mono text-[13px] font-semibold mt-0.5 ${warn ? 'text-warning' : 'text-foreground'}`}>
                        {value}
                      </p>
                    </div>))}
                </div>)}
            </div>
          </div>

          {/* Sections */}
          {guide ? guide.sections.map(s => (<div key={s.title} className="rounded-xl overflow-hidden card-shadow">
              <div className="px-5 py-3 border-b text-[12px] font-semibold">
                {s.title}
              </div>
              <div className="p-5"><MdBody raw={s.body}/></div>
            </div>)) : (<div className="rounded-xl p-8 text-center card-shadow">
              <p className="text-[12px]">No lifecycle data found for EKS {sel}.</p>
            </div>)}
        </div>
      </div>
    </div>);
}

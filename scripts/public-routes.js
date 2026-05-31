export const defaultSiteUrl = 'http://localhost:8080';
export const siteName = 'EKS Upgrade Planner';
export const socialImagePath = '/favicon.svg';
const enabledFlags = new Set(['1', 'true', 'yes', 'on']);

export const publicEksVersions = [
  { version: '1.35', releaseDate: '2026-01-27', standardSupportEnd: '2027-03-27', extendedSupportEnd: '2028-03-27', latestPlatform: '1.35-eks-13', sourceLabel: 'AWS EKS Kubernetes version lifecycle', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html', releaseUrl: 'https://aws.amazon.com/about-aws/whats-new/2026/01/amazon-eks-distro-kubernetes-version-1-35/' },
  { version: '1.34', releaseDate: '2025-10-02', standardSupportEnd: '2026-12-02', extendedSupportEnd: '2027-12-02', latestPlatform: '1.34-eks-23', sourceLabel: 'AWS EKS Kubernetes version lifecycle', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html', releaseUrl: 'https://aws.amazon.com/about-aws/whats-new/2025/10/amazon-eks-distro-kubernetes-version-1-34/' },
  { version: '1.33', releaseDate: '2025-05-29', standardSupportEnd: '2026-07-29', extendedSupportEnd: '2027-07-29', latestPlatform: '1.33-eks-37', sourceLabel: 'AWS EKS Kubernetes version lifecycle', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html' },
  { version: '1.32', releaseDate: '2025-01-23', standardSupportEnd: '2026-03-23', extendedSupportEnd: '2027-03-23', latestPlatform: '1.32-eks-44', sourceLabel: 'AWS EKS Kubernetes version lifecycle', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html' },
  { version: '1.31', releaseDate: '2024-09-26', standardSupportEnd: '2025-11-26', extendedSupportEnd: '2026-11-26', latestPlatform: '1.31-eks-60', sourceLabel: 'AWS EKS Kubernetes version lifecycle', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html', releaseUrl: 'https://aws.amazon.com/about-aws/whats-new/2024/09/amazon-eks-distro-kubernetes-version-1-31/' },
  { version: '1.30', releaseDate: '2024-05-23', standardSupportEnd: '2025-07-23', extendedSupportEnd: '2026-07-23', latestPlatform: '1.30-eks-68', sourceLabel: 'AWS EKS Kubernetes version lifecycle', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html', releaseUrl: 'https://aws.amazon.com/about-aws/whats-new/2024/05/amazon-eks-distro-kubernetes-version-1-30/' },
  { version: '1.29', releaseDate: '2024-01-23', standardSupportEnd: '2025-03-23', extendedSupportEnd: '2026-03-23', latestPlatform: '1.29-eks-66', sourceLabel: 'endoflife.date Amazon EKS lifecycle archive', sourceUrl: 'https://endoflife.date/amazon-eks' },
  { version: '1.28', releaseDate: '2023-09-26', standardSupportEnd: '2024-11-26', extendedSupportEnd: '2025-11-26', latestPlatform: '1.28-eks-63', sourceLabel: 'endoflife.date Amazon EKS lifecycle archive', sourceUrl: 'https://endoflife.date/amazon-eks' },
];

export const publicAddons = [
  { id: 'vpc-cni', name: 'Amazon VPC CNI', type: 'AWS managed', whyItMatters: 'Pod networking and IP allocation behavior can change across EKS releases.', sourceLabel: 'Amazon VPC CNI add-on docs', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/eks-add-ons.html', checks: ['aws eks describe-addon --cluster-name $CLUSTER --addon-name vpc-cni', 'aws eks describe-addon-versions --addon-name vpc-cni --kubernetes-version $TARGET'] },
  { id: 'coredns', name: 'CoreDNS', type: 'AWS managed', whyItMatters: 'DNS failures after upgrades are high-impact and often tied to stale managed add-on versions.', sourceLabel: 'Amazon EKS CoreDNS add-on docs', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/managing-coredns.html', checks: ['kubectl -n kube-system get deployment coredns -o wide', 'kubectl -n kube-system rollout status deploy/coredns'] },
  { id: 'kube-proxy', name: 'kube-proxy', type: 'AWS managed', whyItMatters: 'Should generally track the cluster minor version to avoid networking edge cases.', sourceLabel: 'Amazon EKS kube-proxy add-on', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/managing-kube-proxy.html', checks: ['kubectl -n kube-system get daemonset kube-proxy -o wide'] },
  { id: 'ebs-csi', name: 'Amazon EBS CSI Driver', type: 'AWS managed', whyItMatters: 'Storage attach/mount behavior is a critical preflight validation point.', sourceLabel: 'Amazon EBS CSI driver on EKS', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/ebs-csi.html', checks: ['aws eks describe-addon --cluster-name $CLUSTER --addon-name aws-ebs-csi-driver'] },
  { id: 'aws-load-balancer-controller', name: 'AWS Load Balancer Controller', type: 'Platform addon', whyItMatters: 'Ingress/Service reconciliation, webhook certs, and IAM permissions can block workloads after upgrades.', sourceLabel: 'AWS Load Balancer Controller docs', sourceUrl: 'https://kubernetes-sigs.github.io/aws-load-balancer-controller/', checks: ['helm -n kube-system list | grep aws-load-balancer-controller', 'kubectl -n kube-system logs deploy/aws-load-balancer-controller --tail=100'] },
  { id: 'karpenter', name: 'Karpenter', type: 'Platform addon', whyItMatters: 'Node provisioning APIs and disruption settings can change quickly; verify release notes before cluster upgrades.', sourceLabel: 'Karpenter documentation', sourceUrl: 'https://karpenter.sh/docs/', checks: ['kubectl get nodepools,nodeclaims,ec2nodeclasses -A', 'helm -n karpenter list'] },
  { id: 'cert-manager', name: 'cert-manager', type: 'Platform addon', whyItMatters: 'CRDs and admission webhooks must be healthy before and after control-plane upgrades.', sourceLabel: 'cert-manager supported releases', sourceUrl: 'https://cert-manager.io/docs/releases/', checks: ['kubectl get crd | grep cert-manager.io', 'kubectl -n cert-manager get pods'] },
  { id: 'ingress-nginx', name: 'ingress-nginx', type: 'Platform addon', whyItMatters: 'Ingress API and controller admission webhooks are common upgrade blockers.', sourceLabel: 'ingress-nginx releases', sourceUrl: 'https://github.com/kubernetes/ingress-nginx/releases', checks: ['helm -n ingress-nginx list', 'kubectl -n ingress-nginx get pods -o wide'] },
  { id: 'argo-cd', name: 'Argo CD', type: 'Platform addon', whyItMatters: 'GitOps controllers surface deprecated APIs and sync failures during upgrades.', sourceLabel: 'Argo CD releases', sourceUrl: 'https://github.com/argoproj/argo-cd/releases', checks: ['argocd app list', 'kubectl -n argocd get pods'] },
  { id: 'kube-prometheus-stack', name: 'kube-prometheus-stack', type: 'Platform addon', whyItMatters: 'CRDs for Prometheus/Alertmanager/Grafana dashboards should be upgraded intentionally.', sourceLabel: 'kube-prometheus-stack chart', sourceUrl: 'https://artifacthub.io/packages/helm/prometheus-community/kube-prometheus-stack', checks: ['helm -n monitoring list', 'kubectl get crd | grep monitoring.coreos.com'] },
];

const pricingNote = 'Control-plane support tier pricing only. Worker nodes, Fargate, EBS, data transfer, IPv4, and add-on costs are not included.';
const latestVersion = publicEksVersions[0];
const stableRoutes = [
  '/',
  '/app',
  '/eks/versions',
  '/eks/extended-support-cost-calculator',
  '/eks/upgrade-planner',
  '/eks/deprecated-api-scanner',
  '/eks/addons',
  '/eks/evidence-pack',
];

function versionToSlug(version) {
  return version.replace(/\./g, '-');
}

function versionGuidePath(version) {
  return `/eks/${versionToSlug(version)}-upgrade-guide`;
}

function addonCompatibilityPath(addon) {
  return `/addons/${addon.id}/eks-compatibility`;
}

function route(input) {
  return {
    ogType: 'website',
    twitterCard: 'summary',
    ...input,
  };
}

function featureSections() {
  return [
    {
      heading: 'Planner surface',
      items: [
        'Lifecycle watchlist for current Amazon EKS minor versions with standard and extended support dates.',
        'Extended support cost calculator using the EKS control-plane support tier delta.',
        'Fleet and single-version upgrade planner that turns EKS rows, node models, add-ons, and API findings into a change plan.',
      ],
    },
    {
      heading: 'Local trust model',
      items: [
        'Pasted manifests are scanned in the browser and are not uploaded to AWS or a product backend.',
        'Source citations stay visible for lifecycle data, pricing assumptions, add-on documentation, and migration guidance.',
        'Change packet exports call out local-only limitations so production reviewers know what still needs live-cluster verification.',
      ],
    },
  ];
}

function versionRoute(version, index) {
  const target = publicEksVersions.find((candidate) => candidate.version > version.version) ?? latestVersion;
  return route({
    path: versionGuidePath(version.version),
    priority: index < 6 ? '0.8' : '0.7',
    title: `EKS ${version.version} Upgrade Guide | Lifecycle, Cost, APIs, and Add-ons`,
    description: `Source-cited EKS ${version.version} upgrade guide with support dates, target planning, deprecated API checks, add-on validation, and change-packet notes.`,
    eyebrow: 'Version upgrade guide',
    heading: `EKS ${version.version} upgrade guide`,
    lead: `Plan an Amazon EKS ${version.version} upgrade with lifecycle dates, support-tier cost context, route-to-target notes, deprecated API checks, add-on validation, and change evidence collection.`,
    sections: [
      {
        heading: 'Lifecycle facts',
        items: [
          `EKS ${version.version} release date: ${version.releaseDate}.`,
          `Standard support ends: ${version.standardSupportEnd}.`,
          `Extended support ends: ${version.extendedSupportEnd}.`,
          `Latest platform recorded in the static dataset: ${version.latestPlatform}.`,
        ],
      },
      {
        heading: 'Upgrade planning focus',
        items: [
          `Use EKS ${target.version} or newer as the target planning line when it is available for your workloads.`,
          'Check deprecated Kubernetes API versions before the control plane hop and before workload rollout windows.',
          'Validate managed add-ons, platform controllers, node groups, networking, storage, and observability after each hop.',
          pricingNote,
        ],
      },
      {
        heading: 'Evidence to collect',
        items: [
          `Lifecycle source: ${version.sourceLabel}.`,
          'Attach support-tier cost assumptions, add-on preflight output, deprecated API scan output, and post-upgrade smoke test evidence.',
          'Verify every static recommendation against AWS documentation and live cluster state before production approval.',
        ],
      },
    ],
  });
}

function addonRoute(addon) {
  return route({
    path: addonCompatibilityPath(addon),
    priority: '0.7',
    title: `${addon.name} EKS Compatibility Checks | EKS Upgrade Planner`,
    description: `Preflight ${addon.name} compatibility checks for Amazon EKS upgrades, including source documentation, commands, and post-hop validation prompts.`,
    eyebrow: 'Add-on compatibility',
    heading: `${addon.name} EKS compatibility checks`,
    lead: `${addon.name} is a ${addon.type} dependency to validate before and after Amazon EKS control-plane upgrades. ${addon.whyItMatters}`,
    sections: [
      {
        heading: 'Why this add-on matters',
        items: [
          addon.whyItMatters,
          `Add-on type: ${addon.type}.`,
          `Primary source: ${addon.sourceLabel}.`,
        ],
      },
      {
        heading: 'Preflight commands',
        items: addon.checks,
      },
      {
        heading: 'Upgrade validation',
        items: [
          `Confirm ${addon.name} is installed and owned by the expected delivery mechanism.`,
          'Review version compatibility and release notes before changing the EKS control plane.',
          'Run workload smoke tests that exercise this add-on after each control-plane hop.',
          'Capture output in the change packet with any exceptions or follow-up work.',
        ],
      },
    ],
  });
}

export const publicRoutes = [
  route({
    path: '/',
    priority: '1.0',
    title: 'EKS Upgrade Planner | Kubernetes Upgrade Risk, Cost, and Readiness',
    description: 'Plan Amazon EKS Kubernetes upgrades with lifecycle deadlines, extended support cost estimates, upgrade hops, add-on checks, and local deprecated API scanning.',
    eyebrow: 'Amazon EKS upgrade planning',
    heading: 'EKS Upgrade Planner',
    lead: 'A static-heavy planning tool for platform teams preparing Amazon EKS upgrades, support deadline responses, add-on validation, deprecated API cleanup, and source-cited change packets.',
    sections: [
      ...featureSections(),
      {
        heading: 'SEO landing routes',
        items: stableRoutes.slice(1).map((path) => `Open ${path} for a focused EKS planning workflow with route-specific metadata and crawlable static content.`),
      },
    ],
  }),
  route({
    path: '/app',
    priority: '1.0',
    title: 'EKS Upgrade Planner App | Fleet Planning Workspace',
    description: 'Open the EKS Upgrade Planner workspace for fleet scope, lifecycle gates, remaining support fees, add-on readiness, deprecated API findings, and copyable change packets.',
    eyebrow: 'Fleet planning workspace',
    heading: 'EKS fleet planning workspace',
    lead: `Coordinate an EKS ${publicEksVersions[4].version} to EKS ${latestVersion.version} upgrade response with fleet scope, lifecycle status, cost context, API scan output, add-on checks, and change-packet exports.`,
    sections: featureSections(),
  }),
  route({
    path: '/eks/versions',
    priority: '0.9',
    title: 'Amazon EKS Versions and Support Deadlines | EKS Upgrade Planner',
    description: 'Compare Amazon EKS version release dates, standard support ends, extended support ends, platform versions, and source links for upgrade planning.',
    eyebrow: 'Lifecycle registry',
    heading: 'Amazon EKS versions and support deadlines',
    lead: 'Use this static lifecycle registry to compare currently tracked Amazon EKS minor versions before planning control-plane upgrade windows and escalation paths.',
    sections: [
      {
        heading: 'Tracked versions',
        items: publicEksVersions.map((version) => `EKS ${version.version}: released ${version.releaseDate}, standard support ends ${version.standardSupportEnd}, extended support ends ${version.extendedSupportEnd}, latest platform ${version.latestPlatform}.`),
      },
      {
        heading: 'How to use the registry',
        items: [
          'Prioritize versions that are in extended support, already expired, or close to the standard support end date.',
          'Open each version guide for lifecycle, cost, deprecated API, add-on, and change-packet planning details.',
          'Verify the static dataset against AWS documentation and linked archive sources before approving a production upgrade.',
        ],
      },
    ],
  }),
  route({
    path: '/eks/extended-support-cost-calculator',
    priority: '0.9',
    title: 'EKS Extended Support Cost Calculator | Support-Tier Cost Model',
    description: 'Estimate Amazon EKS remaining extended-support fees using $0.10 standard and $0.60 extended per cluster-hour pricing, with deadline-risk notes for unsupported windows.',
    eyebrow: 'Cost calculator',
    heading: 'EKS extended support cost calculator',
    lead: 'Model the control-plane support-tier delta for delayed Amazon EKS upgrades and show only the overlap between the delay window and extended support.',
    sections: [
      {
        heading: 'Cost model inputs',
        items: [
          'Select the current EKS version, number of clusters, and modeled delay window.',
          'Compare accelerate, bridge, and defer scenarios using monthly and total support-tier deltas.',
          'Copy the generated cost model into a change plan, Jira ticket, or budget review packet.',
        ],
      },
      {
        heading: 'Pricing scope',
        items: [
          'Standard support is modeled at USD 0.10 per cluster hour and extended support at USD 0.60 per cluster hour.',
          'The model uses 730 hours per month for planning estimates.',
          pricingNote,
        ],
      },
    ],
  }),
  route({
    path: '/eks/upgrade-planner',
    priority: '0.9',
    title: 'EKS Upgrade Planner | Fleet and Single-Version Change Plans',
    description: 'Build Amazon EKS upgrade plans for mixed-version fleets or single-version what-if scenarios with version hops, node checks, add-ons, API findings, and maintenance context.',
    eyebrow: 'Upgrade planner',
    heading: 'EKS fleet upgrade planner',
    lead: 'Turn Overview fleet rows into route-grouped control-plane hops, shared add-on and node checks, deadline risk, and copyable change Markdown.',
    sections: [
      {
        heading: 'Planner outputs',
        items: [
          'Fleet mode groups mixed EKS versions by current-to-target route and shows per-row hop paths.',
          'Single-version mode remains available for one selected release line or what-if scenario.',
          'Managed node group, self-managed node, Fargate, or Karpenter validation prompts.',
          'Copyable fleet or single-scenario change Markdown for upgrade review and execution tracking.',
        ],
      },
      {
        heading: 'Planning assumptions',
        items: [
          'The tool does not inspect live clusters or call AWS APIs.',
          'Teams should confirm IAM, add-on versions, workloads, maintenance windows, backup posture, and rollback options before production execution.',
        ],
      },
    ],
  }),
  route({
    path: '/eks/deprecated-api-scanner',
    priority: '0.8',
    title: 'EKS Deprecated API Scanner | Local Kubernetes Manifest Checks',
    description: 'Scan pasted Kubernetes manifests locally for deprecated API versions that can block Amazon EKS upgrades and copy migration findings.',
    eyebrow: 'Deprecated API scanner',
    heading: 'Local EKS deprecated API scanner',
    lead: 'Paste Kubernetes YAML or text into a browser-only scanner to flag included deprecated API version and kind pairs before EKS upgrades.',
    sections: [
      {
        heading: 'Scanner behavior',
        items: [
          'The scanner runs locally in the browser against a static ruleset and does not upload manifests.',
          'Findings include severity, line number, kind, apiVersion, removed Kubernetes version, replacement, and migration source.',
          'No finding means only that the included text rules did not match; it is not a full Kubernetes schema or admission validation.',
        ],
      },
      {
        heading: 'Upgrade workflow',
        items: [
          'Attach findings to the upgrade change plan and change packet.',
          'Remediate deprecated APIs before each control-plane hop and before workload rollout windows.',
          'Validate rendered Helm, Kustomize, and GitOps output, not only source templates.',
        ],
      },
    ],
  }),
  route({
    path: '/eks/addons',
    priority: '0.8',
    title: 'EKS Add-on Readiness Checklist | Managed and Platform Add-on Checks',
    description: 'Review Amazon EKS managed add-ons and platform controllers with preflight commands, source links, and post-upgrade validation prompts.',
    eyebrow: 'Add-on readiness',
    heading: 'EKS add-on readiness checklist',
    lead: 'Validate managed add-ons and platform controllers that commonly affect EKS upgrade readiness, including networking, DNS, storage, ingress, autoscaling, certificates, GitOps, and observability.',
    sections: [
      {
        heading: 'Tracked add-ons',
        items: publicAddons.map((addon) => `${addon.name}: ${addon.whyItMatters}`),
      },
      {
        heading: 'Preflight workflow',
        items: [
          'Open each add-on compatibility route for commands and source documentation.',
          'Capture installed version, ownership mechanism, health, and release-note exceptions before the control-plane change.',
          'Repeat validation after each hop and attach results to the change packet.',
        ],
      },
    ],
  }),
  route({
    path: '/eks/evidence-pack',
    priority: '0.8',
    title: 'EKS Selected Scenario Change Packet | Lifecycle, Cost, API, and Add-ons',
    description: 'Assemble a selected-scenario EKS upgrade change packet with lifecycle citations, support-cost model, deprecated API scan output, add-on records, fleet context, and local-only limitations.',
    eyebrow: 'Change packet',
    heading: 'EKS selected scenario change packet',
    lead: 'Create a source-cited change packet for the selected EKS scenario, with fleet context summarized and mixed-version execution handled in the Planner.',
    sections: [
      {
        heading: 'Packet contents',
        items: [
          'Lifecycle citation and support deadline for the selected EKS version.',
          'Control-plane support-tier cost model and delay assumptions.',
          'Deprecated API scanner output and selected add-on validation record.',
          'Fleet row and cluster counts for context, while per-row execution stays in the Planner.',
          'Explicit local-only limitations for reviewers and approvers.',
        ],
      },
      {
        heading: 'Review use',
        items: [
          'Paste the change packet into change review, security review, or platform governance workflows.',
          'Treat the report as a planning artifact and verify live-cluster state before approving production upgrades.',
        ],
      },
    ],
  }),
  ...publicEksVersions.map(versionRoute),
  ...publicAddons.map(addonRoute),
];

export function normalizeSiteUrl(value) {
  const raw = value || defaultSiteUrl;
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`SITE_URL must use http or https, received ${raw}`);
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function envFlagEnabled(value) {
  return enabledFlags.has(String(value || '').trim().toLowerCase());
}

export function isLocalSiteUrl(siteUrl) {
  const { hostname } = new URL(normalizeSiteUrl(siteUrl));
  const host = hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host);
}

export function requireProductionSiteUrl(siteUrl, env = process.env) {
  const normalized = normalizeSiteUrl(siteUrl);
  const productionGuard = env.SITE_URL_BUILD_MODE === 'production';
  if (productionGuard && isLocalSiteUrl(normalized) && !envFlagEnabled(env.SITE_URL_ALLOW_LOCALHOST)) {
    throw new Error('Production builds require SITE_URL to be a public http(s) origin. Set SITE_URL_ALLOW_LOCALHOST=true only for local/demo builds.');
  }
  return normalized;
}

export function absoluteUrl(siteUrl, routePath) {
  return `${siteUrl}${routePath === '/' ? '/' : routePath}`;
}

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function renderSitemap(siteUrl, lastmod = '') {
  const urls = publicRoutes.map((publicRoute) => {
    const lastmodTag = lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : '';
    return `  <url><loc>${escapeXml(absoluteUrl(siteUrl, publicRoute.path))}</loc>${lastmodTag}<priority>${publicRoute.priority}</priority></url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function renderRobots(siteUrl) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl(siteUrl, '/sitemap.xml')}\n`;
}

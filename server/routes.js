const APP_HTML_ROUTES = [
  '/',
  '/app',
  '/eks/versions',
  '/eks/extended-support-cost-calculator',
  '/eks/upgrade-planner',
  '/eks/deprecated-api-scanner',
  '/eks/addons',
  '/eks/evidence-pack',
];

const EKS_GUIDE_ROUTES = [
  '/eks/1-35-upgrade-guide',
  '/eks/1-34-upgrade-guide',
  '/eks/1-33-upgrade-guide',
  '/eks/1-32-upgrade-guide',
  '/eks/1-31-upgrade-guide',
  '/eks/1-30-upgrade-guide',
  '/eks/1-29-upgrade-guide',
  '/eks/1-28-upgrade-guide',
];

const ADDON_COMPATIBILITY_ROUTES = [
  '/addons/vpc-cni/eks-compatibility',
  '/addons/coredns/eks-compatibility',
  '/addons/kube-proxy/eks-compatibility',
  '/addons/ebs-csi/eks-compatibility',
  '/addons/aws-load-balancer-controller/eks-compatibility',
  '/addons/karpenter/eks-compatibility',
  '/addons/cert-manager/eks-compatibility',
  '/addons/ingress-nginx/eks-compatibility',
  '/addons/argo-cd/eks-compatibility',
  '/addons/kube-prometheus-stack/eks-compatibility',
];

export const KNOWN_HTML_ROUTES = new Set([
  ...APP_HTML_ROUTES,
  ...EKS_GUIDE_ROUTES,
  ...ADDON_COMPATIBILITY_ROUTES,
]);

const KNOWN_ROUTES = new Set([
  ...KNOWN_HTML_ROUTES,
  '/healthz',
  '/readyz',
  '/metrics',
  '/favicon.svg',
  '/icons.svg',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.webmanifest',
]);

function envFlagDisabled(value) {
  if (value === false) return true;
  return ['0', 'false', 'no', 'off'].includes(String(value || '').trim().toLowerCase());
}

export function designExplorationsEnabled(env = process.env) {
  if (envFlagDisabled(env.ENABLE_DESIGN_EXPLORATIONS) || envFlagDisabled(env.VITE_ENABLE_DESIGN_EXPLORATIONS)) return false;
  if (env.NODE_ENV === 'production') return false;
  return true;
}

function isDesignPath(pathname) {
  return /^\/(?:[1-9]|10)$/.test(pathname);
}

function cleanRoutePath(pathname) {
  if (!pathname || pathname === '/') return '/';
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function isVersionGuidePath(pathname) {
  return /^\/eks\/[0-9]+-[0-9]+-upgrade-guide$/.test(pathname);
}

function isAddonCompatibilityPath(pathname) {
  return /^\/addons\/[^/]+\/eks-compatibility$/.test(pathname);
}

function acceptsHtml(acceptHeader = '') {
  const accept = String(acceptHeader).toLowerCase();
  if (accept.includes('application/json') && !accept.includes('text/html')) return false;
  return accept.includes('text/html');
}

export function shouldSendHtmlNotFound(acceptHeader = '') {
  return acceptsHtml(acceptHeader);
}

export function isKnownHtmlRoute(pathname, options = {}) {
  const cleanPath = cleanRoutePath(pathname);
  const allowDesignExplorations = options.allowDesignExplorations ?? designExplorationsEnabled(options.env);

  if (KNOWN_HTML_ROUTES.has(cleanPath)) return true;
  if (isDesignPath(cleanPath) && allowDesignExplorations) return true;
  return false;
}

export function normalizeRoute(pathname, options = {}) {
  const cleanPath = cleanRoutePath(pathname);
  const allowDesignExplorations = options.allowDesignExplorations ?? designExplorationsEnabled(options.env);

  if (isDesignPath(cleanPath) && allowDesignExplorations) return '/:design';
  if (isVersionGuidePath(cleanPath) && KNOWN_HTML_ROUTES.has(cleanPath)) return '/eks/:version-upgrade-guide';
  if (isAddonCompatibilityPath(cleanPath) && KNOWN_HTML_ROUTES.has(cleanPath)) return '/addons/:addon/eks-compatibility';
  if (KNOWN_ROUTES.has(cleanPath)) return cleanPath;
  if (cleanPath.startsWith('/assets/')) return '/assets/*';
  if (/\.[a-z0-9]+$/i.test(cleanPath)) return '/static/*';

  return '/not-found';
}

export function shouldServeSpaFallback(method, pathname, acceptHeader = '', options = {}) {
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (pathname.startsWith('/api/')) return false;
  if (/\.[a-z0-9]+$/i.test(pathname)) return false;
  if (!acceptsHtml(acceptHeader) && acceptHeader !== '' && !acceptHeader.includes('*/*')) return false;
  return isKnownHtmlRoute(pathname, options);
}

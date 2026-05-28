const KNOWN_ROUTES = new Set([
  '/',
  '/app',
  '/eks/versions',
  '/eks/extended-support-cost-calculator',
  '/eks/upgrade-planner',
  '/eks/deprecated-api-scanner',
  '/eks/addons',
  '/eks/evidence-pack',
  '/healthz',
  '/readyz',
  '/metrics',
  '/favicon.svg',
  '/icons.svg',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.webmanifest',
]);

export function normalizeRoute(pathname) {
  if (!pathname || pathname === '/') return '/';
  const cleanPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  if (KNOWN_ROUTES.has(cleanPath)) return cleanPath;
  if (/^\/[0-9]+$/.test(cleanPath)) return '/:design';
  if (/^\/eks\/[0-9]+-[0-9]+-upgrade-guide$/.test(cleanPath)) return '/eks/:version-upgrade-guide';
  if (/^\/addons\/[^/]+\/eks-compatibility$/.test(cleanPath)) return '/addons/:addon/eks-compatibility';
  if (cleanPath.startsWith('/assets/')) return '/assets/*';
  if (/\.[a-z0-9]+$/i.test(cleanPath)) return '/static/*';

  return '/spa-fallback';
}

export function shouldServeSpaFallback(method, pathname, acceptHeader = '') {
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (pathname.startsWith('/api/')) return false;
  if (/\.[a-z0-9]+$/i.test(pathname)) return false;
  return acceptHeader.includes('text/html') || acceptHeader.includes('*/*') || acceptHeader === '';
}

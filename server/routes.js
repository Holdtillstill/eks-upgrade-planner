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

export function normalizeRoute(pathname, options = {}) {
  if (!pathname || pathname === '/') return '/';
  const cleanPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const allowDesignExplorations = options.allowDesignExplorations ?? designExplorationsEnabled(options.env);

  if (KNOWN_ROUTES.has(cleanPath)) return cleanPath;
  if (isDesignPath(cleanPath) && allowDesignExplorations) return '/:design';
  if (/^\/eks\/[0-9]+-[0-9]+-upgrade-guide$/.test(cleanPath)) return '/eks/:version-upgrade-guide';
  if (/^\/addons\/[^/]+\/eks-compatibility$/.test(cleanPath)) return '/addons/:addon/eks-compatibility';
  if (cleanPath.startsWith('/assets/')) return '/assets/*';
  if (/\.[a-z0-9]+$/i.test(cleanPath)) return '/static/*';

  return '/spa-fallback';
}

export function shouldServeSpaFallback(method, pathname, acceptHeader = '', options = {}) {
  if (method !== 'GET' && method !== 'HEAD') return false;
  const cleanPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const allowDesignExplorations = options.allowDesignExplorations ?? designExplorationsEnabled(options.env);
  if (isDesignPath(cleanPath) && !allowDesignExplorations) return false;
  if (pathname.startsWith('/api/')) return false;
  if (/\.[a-z0-9]+$/i.test(pathname)) return false;
  return acceptHeader.includes('text/html') || acceptHeader.includes('*/*') || acceptHeader === '';
}

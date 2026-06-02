import { publicRoutes } from './public-routes.js';

const WEB_BASE = normalizeBase(process.env.WEB_BASE || process.env.SITE_URL || 'https://eks-upgrade-planner.bozhi.dev');
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 15000);
const EXPECT_SECURITY_HEADERS = process.env.SMOKE_EXPECT_SECURITY_HEADERS !== 'false';

function normalizeBase(value) {
  return value.replace(/\/+$/, '');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchText(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${WEB_BASE}${path}`, {
      ...options,
      signal: controller.signal,
    });
    return {
      body: await response.text(),
      contentType: response.headers.get('content-type') || '',
      headers: Object.fromEntries(response.headers.entries()),
      status: response.status,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function requireHeader(headers, name, expected) {
  const value = headers[name.toLowerCase()] || '';
  assert(value, `Expected ${name} security header on ${WEB_BASE}`);
  if (expected instanceof RegExp) assert(expected.test(value), `Expected ${name} to match ${expected}, got "${value}"`);
  if (typeof expected === 'string') assert(value === expected, `Expected ${name} to be "${expected}", got "${value}"`);
  return value;
}

function assertSecurityHeaders(result) {
  if (!EXPECT_SECURITY_HEADERS) return;

  const csp = requireHeader(result.headers, 'content-security-policy', /default-src 'self'/);
  for (const requiredDirective of [
    "base-uri 'self'",
    "connect-src 'self' https://on-demand-demos.bozhi.dev",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self' https://on-demand-demos.bozhi.dev",
    "style-src 'self'",
  ]) {
    assert(csp.includes(requiredDirective), `CSP should include ${requiredDirective}`);
  }
  assert(!csp.includes("'unsafe-inline'"), 'CSP should not allow unsafe-inline');

  requireHeader(result.headers, 'strict-transport-security', /max-age=31536000/);
  requireHeader(result.headers, 'x-content-type-options', 'nosniff');
  requireHeader(result.headers, 'x-frame-options', 'DENY');
  requireHeader(result.headers, 'referrer-policy', 'strict-origin-when-cross-origin');
}

function isAppShell(result) {
  return result.status === 200 && result.body.includes('<div id="root"></div>');
}

async function assertPublicRoute(route) {
  const result = await fetchText(route.path);
  assert(result.status === 200, `${route.path} should return 200, got ${result.status}`);
  assert(result.contentType.toLowerCase().includes('text/html'), `${route.path} should return HTML, got ${result.contentType}`);
  if (route.path !== '/') {
    const cacheHeader = result.headers['x-cache'] || '';
    assert(!/error from cloudfront/i.test(cacheHeader), `${route.path} should use clean CloudFront routing, got x-cache="${cacheHeader}"`);
  }
  assert(result.body.includes(`data-prerendered-route="${route.path}"`), `${route.path} should include prerender marker`);
  assert(result.body.includes('src="https://on-demand-demos.bozhi.dev/visitor.js"'), `${route.path} should include visitor script`);
  assert(result.body.includes('data-project="eks-upgrade-planner"'), `${route.path} should include visitor project id`);
  if (route.path === '/') assertSecurityHeaders(result);
}

async function assertRejectedRoute(path) {
  const result = await fetchText(path, { headers: { accept: 'application/json' } });
  assert(result.status === 404, `${path} should return 404, got ${result.status}`);
  assert(!isAppShell(result), `${path} should not return the app shell`);

  const contentType = result.contentType.toLowerCase();
  if (contentType.includes('application/json')) {
    assert(result.body.includes('not_found'), `${path} JSON 404 should describe not_found`);
    return;
  }

  assert(contentType.includes('text/html'), `${path} should return JSON or HTML 404, got ${result.contentType}`);
  assert(result.body.includes('noindex,nofollow'), `${path} HTML 404 should be noindex`);
  assert(result.body.includes('Not Found'), `${path} HTML 404 should include Not Found copy`);
}

for (const route of publicRoutes) {
  await assertPublicRoute(route);
}

for (const path of ['/missing-route', '/api/health']) {
  await assertRejectedRoute(path);
}

console.log(`Static host smoke passed for ${WEB_BASE} across ${publicRoutes.length} public routes.`);

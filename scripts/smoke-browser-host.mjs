import { chromium } from '@playwright/test';

const WEB_BASE = normalizeBase(process.env.WEB_BASE || process.env.SITE_URL || 'https://eks-upgrade-planner.bozhi.dev');
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 20000);

const routes = [
  { path: '/', markers: ['EKS Upgrade Planner', 'Fleet risk summary'] },
  { path: '/app', markers: ['EKS Upgrade Planner', 'Fleet risk summary'] },
  { path: '/eks/deprecated-api-scanner', markers: ['Local manifest scan', 'static ruleset'] },
  { path: '/eks/1-35-upgrade-guide', markers: ['EKS 1.35', 'lifecycle brief'] },
];

function normalizeBase(value) {
  return value.replace(/\/+$/, '');
}

function isSameOriginApi(url) {
  try {
    const target = new URL(url);
    const base = new URL(WEB_BASE);
    return target.origin === base.origin && target.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

async function visitRoute(page, route) {
  const errors = [];
  const failedRequests = [];
  const unexpectedApiCalls = [];

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (isSameOriginApi(request.url())) unexpectedApiCalls.push(request.url());
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    const resourceType = request.resourceType();
    if (resourceType !== 'image' && resourceType !== 'font') {
      failedRequests.push(`${request.url()} ${failure?.errorText || 'failed'}`);
    }
  });

  await page.route('https://on-demand-demos.bozhi.dev/api/events', (routeToFulfill) => {
    routeToFulfill.fulfill({ status: 202, contentType: 'application/json', body: '{}' });
  });

  const response = await page.goto(`${WEB_BASE}${route.path}`, {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT_MS,
  });
  if (!response || response.status() < 200 || response.status() >= 400) {
    throw new Error(`${route.path} returned HTTP ${response?.status() || 'unknown'}`);
  }

  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  const bodyText = await page.locator('body').innerText({ timeout: TIMEOUT_MS });
  for (const marker of route.markers) {
    if (!bodyText.includes(marker)) throw new Error(`${route.path} missing marker: ${marker}`);
  }

  if (errors.length) throw new Error(`${route.path} console/page errors:\n${errors.join('\n')}`);
  if (failedRequests.length) throw new Error(`${route.path} failed requests:\n${failedRequests.join('\n')}`);
  if (unexpectedApiCalls.length) throw new Error(`${route.path} made same-origin API calls:\n${unexpectedApiCalls.join('\n')}`);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    colorScheme: 'dark',
    userAgent: 'eks-upgrade-planner-browser-smoke-bot/1.0',
    viewport: { width: 1440, height: 900 },
  });

  for (const route of routes) {
    const page = await context.newPage();
    await visitRoute(page, route);
    await page.close();
  }

  console.log(`Browser host smoke passed for ${WEB_BASE} across ${routes.length} route(s).`);
} finally {
  await browser.close();
}

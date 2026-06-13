import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WEB_BASE = normalizeBase(process.env.WEB_BASE || process.env.SITE_URL || 'https://eks-upgrade-planner.bozhi.dev');
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 20000);
const VISITOR_ENDPOINT = 'https://on-demand-demos.bozhi.dev/api/events';
const VISITOR_ENDPOINTS = Array.from(new Set([VISITOR_ENDPOINT, `${WEB_BASE}/api/events`]));

const routes = [
  { path: '/', markers: ['EKS Upgrade Planner', 'Upgrade path'] },
  { path: '/app', markers: ['EKS Upgrade Planner', 'Upgrade path'] },
  { path: '/eks/deprecated-api-scanner', markers: ['Local manifest scan', 'static ruleset'] },
  { path: '/eks/1-35-upgrade-guide', markers: ['EKS 1.35', 'lifecycle brief'] },
  { path: '/eks/addons', markers: ['Add-on readiness checklist', 'Amazon VPC CNI'] },
  { path: '/addons/karpenter/eks-compatibility', markers: ['Karpenter', 'Node provisioning APIs'] },
];

const profiles = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 },
];

function normalizeBase(value) {
  return value.replace(/\/+$/, '');
}

function isSameOriginApi(url) {
  try {
    const target = new URL(url);
    const base = new URL(WEB_BASE);
    if (target.origin === base.origin && target.pathname === '/api/events') return false;
    return target.origin === base.origin && target.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

async function installVisitorStub(page, visitorEvents) {
  const handler = async (interceptedRoute) => {
    const request = interceptedRoute.request();
    try {
      visitorEvents.push(JSON.parse(request.postData() || '{}'));
    } catch {
      visitorEvents.push({ parseError: true, raw: request.postData() || '' });
    }
    await interceptedRoute.fulfill({ status: 202, contentType: 'application/json', body: '{}' });
  };
  for (const endpoint of VISITOR_ENDPOINTS) {
    await page.route(endpoint, handler);
  }
}

async function visitRoute(page, route, profileName) {
  const errors = [];
  const failedRequests = [];
  const unexpectedApiCalls = [];
  const visitorEvents = [];

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

  await installVisitorStub(page, visitorEvents);

  const response = await page.goto(`${WEB_BASE}${route.path}`, {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT_MS,
  });
  if (!response || response.status() < 200 || response.status() >= 400) {
    throw new Error(`${profileName} ${route.path} returned HTTP ${response?.status() || 'unknown'}`);
  }

  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(250);
  const bodyText = await page.locator('body').innerText({ timeout: TIMEOUT_MS });
  for (const marker of route.markers) {
    if (!bodyText.includes(marker)) throw new Error(`${profileName} ${route.path} missing marker: ${marker}`);
  }

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (horizontalOverflow > 2) {
    throw new Error(`${profileName} ${route.path} has ${horizontalOverflow}px horizontal overflow`);
  }

  await assertNoSeriousA11yViolations(page, `${profileName} ${route.path}`);

  const pageview = visitorEvents.find((event) => event.project === 'eks-upgrade-planner' && event.eventType === 'pageview');
  if (!pageview) {
    throw new Error(`${profileName} ${route.path} did not send a first-party visitor pageview`);
  }
  if (pageview.path !== route.path) {
    throw new Error(`${profileName} ${route.path} sent visitor path ${pageview.path}`);
  }
  if (!['initial', 'manual'].includes(pageview.navigationType)) {
    throw new Error(`${profileName} ${route.path} sent unexpected navigation type ${pageview.navigationType}`);
  }

  if (errors.length) throw new Error(`${profileName} ${route.path} console/page errors:\n${errors.join('\n')}`);
  if (failedRequests.length) throw new Error(`${profileName} ${route.path} failed requests:\n${failedRequests.join('\n')}`);
  if (unexpectedApiCalls.length) throw new Error(`${profileName} ${route.path} made same-origin API calls:\n${unexpectedApiCalls.join('\n')}`);
}

async function assertNoSeriousA11yViolations(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const violations = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact || ''));
  if (violations.length) {
    throw new Error(
      `${label} has serious accessibility violations:\n${violations
        .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length} node(s))`)
        .join('\n')}`,
    );
  }
}

async function verifyPrivacySignals(browser) {
  const context = await browser.newContext({
    colorScheme: 'dark',
    userAgent: 'eks-upgrade-planner-privacy-smoke-bot/1.0',
    viewport: { width: 1440, height: 900 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'doNotTrack', { configurable: true, get: () => '1' });
    Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, get: () => true });
    Object.defineProperty(window, 'doNotTrack', { configurable: true, get: () => '1' });
  });

  const page = await context.newPage();
  const visitorEvents = [];
  await installVisitorStub(page, visitorEvents);
  try {
    await page.goto(`${WEB_BASE}/`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    if (visitorEvents.length) {
      throw new Error(`privacy signals should suppress visitor telemetry, saw ${visitorEvents.length} event(s)`);
    }
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  for (const profile of profiles) {
    const { name, ...contextOptions } = profile;
    const context = await browser.newContext({
      colorScheme: 'dark',
      userAgent: 'eks-upgrade-planner-browser-smoke-bot/1.0',
      ...contextOptions,
    });

    for (const route of routes) {
      const page = await context.newPage();
      await visitRoute(page, route, name);
      await page.close();
    }

    await context.close();
  }

  await verifyPrivacySignals(browser);

  console.log(
    `Browser host smoke passed for ${WEB_BASE} across ${routes.length} route(s), ${profiles.length} viewport(s), privacy telemetry checks, and serious/critical accessibility checks.`,
  );
} finally {
  await browser.close();
}

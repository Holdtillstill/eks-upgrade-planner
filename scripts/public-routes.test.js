import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { addons } from '../src/data/addons.ts';
import { eksVersions } from '../src/data/versions.ts';
import { addonCompatibilityPath } from '../src/lib/addonLookup.ts';
import { versionGuidePath } from '../src/lib/routes.ts';
import { KNOWN_HTML_ROUTES } from '../server/routes.js';
import { isLocalSiteUrl, publicAddons, publicEksVersions, publicRoutes, requireProductionSiteUrl } from './public-routes.js';
import { renderRouteHtml, renderSeoBody, routeOutputFile } from './prerender-static.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const baseRoutes = [
  '/',
  '/app',
  '/eks/versions',
  '/eks/extended-support-cost-calculator',
  '/eks/upgrade-planner',
  '/eks/deprecated-api-scanner',
  '/eks/addons',
  '/eks/evidence-pack',
];

const baseHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <!--app-meta-start-->
    <title>Generic shell</title>
    <!--app-meta-end-->
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/index.js"></script>
  </body>
</html>`;

function textContent(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function walkFiles(startPath) {
  const stat = fs.statSync(startPath);
  if (stat.isFile()) return [startPath];
  return fs.readdirSync(startPath, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') return [];
    return walkFiles(path.join(startPath, entry.name));
  });
}

describe('public SEO routes', () => {
  it('matches the public metadata route set from app data', () => {
    const expectedRoutes = [
      ...baseRoutes,
      ...eksVersions.map((version) => versionGuidePath(version.version)),
      ...addons.map((addon) => addonCompatibilityPath(addon)),
    ];

    expect(publicRoutes.map((route) => route.path)).toEqual(expectedRoutes);
    expect(publicEksVersions).toEqual(eksVersions);
    expect(publicAddons).toEqual(addons);
    expect([...KNOWN_HTML_ROUTES].sort()).toEqual(expectedRoutes.toSorted());
  });

  it('has route-specific metadata and crawlable body copy for every route', () => {
    for (const route of publicRoutes) {
      const html = renderRouteHtml(baseHtml, route, 'https://eks-upgrade-planner.bozhi.dev');
      const body = renderSeoBody(route);

      expect(html).toContain(`<title>${route.title}</title>`);
      expect(html).toContain(`content="${route.description}"`);
      expect(html).toContain(`data-prerendered-route="${route.path}"`);
      expect(body).toContain(`<h1>${route.heading}</h1>`);
      expect(textContent(body).split(/\s+/).length).toBeGreaterThan(45);
    }
  });

  it('renders route-specific canonical and social metadata', () => {
    const guide = publicRoutes.find((route) => route.path === '/eks/1-35-upgrade-guide');
    expect(guide).toBeDefined();

    const html = renderRouteHtml(baseHtml, guide, 'https://eks-upgrade-planner.bozhi.dev/');

    expect(html).toContain('<link rel="canonical" href="https://eks-upgrade-planner.bozhi.dev/eks/1-35-upgrade-guide" />');
    expect(html).toContain('<meta property="og:title" content="EKS 1.35 Upgrade Guide | Lifecycle, Cost, APIs, and Add-ons" />');
    expect(html).toContain('<meta name="twitter:description" content="Source-cited EKS 1.35 upgrade guide');
    expect(html).toContain('<h1>EKS 1.35 upgrade guide</h1>');
    expect(textContent(html)).toContain('Standard support ends: 2027-03-27.');
  });

  it('writes extensionless routes as directory index files', () => {
    expect(routeOutputFile('/tmp/dist', '/')).toBe(path.join('/tmp/dist', 'index.html'));
    expect(routeOutputFile('/tmp/dist', '/eks/versions')).toBe(path.join('/tmp/dist', 'eks', 'versions', 'index.html'));
    expect(routeOutputFile('/tmp/dist', '/addons/karpenter/eks-compatibility')).toBe(path.join('/tmp/dist', 'addons', 'karpenter', 'eks-compatibility', 'index.html'));
  });

  it('can re-render an already-prerendered route file', () => {
    const route = publicRoutes.find((candidate) => candidate.path === '/app');
    const firstPass = renderRouteHtml(baseHtml, route, 'https://eks-upgrade-planner.bozhi.dev');
    const secondPass = renderRouteHtml(firstPass, route, 'https://eks-upgrade-planner.bozhi.dev');

    expect(secondPass).toContain('data-prerendered-route="/app"');
    expect(secondPass.match(/data-prerendered-route=/g)).toHaveLength(1);
    expect(secondPass).toContain('<title>EKS Upgrade Planner App | Fleet Planning Workspace</title>');
  });

  it('keeps prerendered HTML compatible with a strict style-src self CSP', () => {
    const route = publicRoutes.find((candidate) => candidate.path === '/eks/extended-support-cost-calculator');
    const html = renderRouteHtml(baseHtml, route, 'https://eks-upgrade-planner.bozhi.dev');

    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toContain("'unsafe-inline'");
  });

  it('rejects localhost SITE_URL for production builds unless explicitly allowed', () => {
    expect(isLocalSiteUrl('http://localhost:8080')).toBe(true);
    expect(isLocalSiteUrl('http://127.0.0.1:8080')).toBe(true);
    expect(isLocalSiteUrl('http://[::1]:8080')).toBe(true);
    expect(isLocalSiteUrl('https://eks-upgrade-planner.bozhi.dev')).toBe(false);
    expect(() => requireProductionSiteUrl('http://localhost:8080', { SITE_URL_BUILD_MODE: 'production' })).toThrow(/Production builds require SITE_URL/);
    expect(requireProductionSiteUrl('http://localhost:8080', { SITE_URL_BUILD_MODE: 'production', SITE_URL_ALLOW_LOCALHOST: 'true' })).toBe('http://localhost:8080');
    expect(requireProductionSiteUrl('https://eks-upgrade-planner.bozhi.dev', { SITE_URL_BUILD_MODE: 'production' })).toBe('https://eks-upgrade-planner.bozhi.dev');
  });
});

describe('inline style guard', () => {
  it('does not ship inline style attributes or style tags in source HTML, TSX, or SVG assets', () => {
    const files = [
      path.join(rootDir, 'index.html'),
      ...walkFiles(path.join(rootDir, 'src')),
      ...walkFiles(path.join(rootDir, 'public')),
    ].filter((filePath) => ['.html', '.tsx', '.ts', '.svg'].includes(path.extname(filePath)));

    const offenders = files.filter((filePath) => {
      const source = fs.readFileSync(filePath, 'utf8');
      return /\sstyle=/i.test(source) || /<style\b/i.test(source);
    }).map((filePath) => path.relative(rootDir, filePath));

    expect(offenders).toEqual([]);
  });
});

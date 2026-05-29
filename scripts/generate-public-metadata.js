import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

const defaultSiteUrl = 'http://localhost:8080';

const routes = [
  { path: '/', priority: '1.0' },
  { path: '/app', priority: '1.0' },
  { path: '/eks/versions', priority: '0.9' },
  { path: '/eks/extended-support-cost-calculator', priority: '0.9' },
  { path: '/eks/upgrade-planner', priority: '0.9' },
  { path: '/eks/deprecated-api-scanner', priority: '0.8' },
  { path: '/eks/addons', priority: '0.8' },
  { path: '/eks/evidence-pack', priority: '0.8' },
  ...['1-35', '1-34', '1-33', '1-32', '1-31', '1-30', '1-29', '1-28'].map((version, index) => ({
    path: `/eks/${version}-upgrade-guide`,
    priority: index < 6 ? '0.8' : '0.7',
  })),
  ...[
    'vpc-cni',
    'coredns',
    'kube-proxy',
    'ebs-csi',
    'aws-load-balancer-controller',
    'karpenter',
    'cert-manager',
    'ingress-nginx',
    'argo-cd',
    'kube-prometheus-stack',
  ].map((addon) => ({ path: `/addons/${addon}/eks-compatibility`, priority: '0.7' })),
];

function normalizeSiteUrl(value) {
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

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function absoluteUrl(siteUrl, routePath) {
  return `${siteUrl}${routePath === '/' ? '/' : routePath}`;
}

function renderSitemap(siteUrl, lastmod) {
  const urls = routes.map((route) => {
    const lastmodTag = lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : '';
    return `  <url><loc>${escapeXml(absoluteUrl(siteUrl, route.path))}</loc>${lastmodTag}<priority>${route.priority}</priority></url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

function renderRobots(siteUrl) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl(siteUrl, '/sitemap.xml')}\n`;
}

const siteUrl = normalizeSiteUrl(process.env.SITE_URL || process.env.VITE_SITE_URL);
const lastmod = process.env.SITEMAP_LASTMOD || '';

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), renderSitemap(siteUrl, lastmod));
fs.writeFileSync(path.join(publicDir, 'robots.txt'), renderRobots(siteUrl));

console.log(`Generated public metadata for ${siteUrl}`);

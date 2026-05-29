import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { absoluteUrl, normalizeSiteUrl, publicRoutes, siteName, socialImagePath } from './public-routes.js';

export const metaStartMarker = '<!--app-meta-start-->';
export const metaEndMarker = '<!--app-meta-end-->';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function metaTag(name, content) {
  return `<meta name="${escapeHtml(name)}" content="${escapeHtml(content)}" />`;
}

function propertyTag(property, content) {
  return `<meta property="${escapeHtml(property)}" content="${escapeHtml(content)}" />`;
}

export function renderManagedMeta(route, siteUrl) {
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  const canonical = absoluteUrl(normalizedSiteUrl, route.path);
  const image = absoluteUrl(normalizedSiteUrl, socialImagePath);
  const twitterTitle = route.twitterTitle || route.title;
  const twitterDescription = route.twitterDescription || route.description;

  return [
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
    '<link rel="manifest" href="/manifest.webmanifest" />',
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    metaTag('viewport', 'width=device-width, initial-scale=1.0'),
    metaTag('theme-color', '#0f172a'),
    metaTag('description', route.description),
    metaTag('robots', 'index,follow'),
    propertyTag('og:type', route.ogType || 'website'),
    propertyTag('og:site_name', siteName),
    propertyTag('og:title', route.title),
    propertyTag('og:description', route.description),
    propertyTag('og:url', canonical),
    propertyTag('og:image', image),
    metaTag('twitter:card', route.twitterCard || 'summary'),
    metaTag('twitter:title', twitterTitle),
    metaTag('twitter:description', twitterDescription),
    `<title>${escapeHtml(route.title)}</title>`,
  ].join('\n    ');
}

export function renderSeoBody(route) {
  const sections = route.sections.map((section) => {
    const items = section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n        ');
    return `<section>
      <h2>${escapeHtml(section.heading)}</h2>
      <ul>
        ${items}
      </ul>
    </section>`;
  }).join('\n\n    ');

  return `<main class="seo-prerender" data-prerendered-route="${escapeHtml(route.path)}" aria-label="${escapeHtml(route.heading)}">
    <article>
      <p>${escapeHtml(route.eyebrow)}</p>
      <h1>${escapeHtml(route.heading)}</h1>
      <p>${escapeHtml(route.lead)}</p>
    </article>

    ${sections}
  </main>`;
}

export function renderRouteHtml(baseHtml, route, siteUrl) {
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  const startIndex = baseHtml.indexOf(metaStartMarker);
  const endIndex = baseHtml.indexOf(metaEndMarker);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(`Missing ${metaStartMarker} / ${metaEndMarker} markers in dist/index.html`);
  }

  const metaBlock = `${metaStartMarker}\n    ${renderManagedMeta(route, normalizedSiteUrl)}\n    ${metaEndMarker}`;
  const beforeMeta = baseHtml.slice(0, startIndex).replaceAll('__SITE_URL__', normalizedSiteUrl);
  const afterMeta = baseHtml.slice(endIndex + metaEndMarker.length).replaceAll('__SITE_URL__', normalizedSiteUrl);
  const withMeta = `${beforeMeta}${metaBlock}${afterMeta}`;
  const rootHtml = `<div id="root">\n${renderSeoBody(route)}\n    </div>`;
  const rootPattern = /<div id="root">[\s\S]*?<\/div>\s*(?=<script\b|<\/body>)/;

  if (!rootPattern.test(withMeta)) {
    throw new Error('Expected a <div id="root">...</div> before the app script in dist/index.html');
  }

  return withMeta.replace(rootPattern, rootHtml);
}

export function routeOutputFile(distDir, routePath) {
  if (routePath === '/') return path.join(distDir, 'index.html');
  const relativePath = path.posix.join(routePath.replace(/^\/+/, ''), 'index.html');
  return path.join(distDir, ...relativePath.split('/'));
}

export async function prerenderStaticRoutes({
  distDir = path.join(rootDir, 'dist'),
  siteUrl = normalizeSiteUrl(process.env.SITE_URL || process.env.VITE_SITE_URL),
} = {}) {
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  const baseHtmlPath = path.join(distDir, 'index.html');
  const baseHtml = await fs.promises.readFile(baseHtmlPath, 'utf8');

  for (const route of publicRoutes) {
    const outputFile = routeOutputFile(distDir, route.path);
    await fs.promises.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.promises.writeFile(outputFile, renderRouteHtml(baseHtml, route, normalizedSiteUrl));
  }

  return { count: publicRoutes.length, distDir, siteUrl: normalizedSiteUrl };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  prerenderStaticRoutes()
    .then(({ count, distDir, siteUrl }) => {
      console.log(`Prerendered ${count} route HTML files in ${distDir} for ${siteUrl}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSiteUrl, renderRobots, renderSitemap } from './public-routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

const siteUrl = normalizeSiteUrl(process.env.SITE_URL || process.env.VITE_SITE_URL);
const lastmod = process.env.SITEMAP_LASTMOD || '';

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), renderSitemap(siteUrl, lastmod));
fs.writeFileSync(path.join(publicDir, 'robots.txt'), renderRobots(siteUrl));

console.log(`Generated public metadata for ${siteUrl}`);

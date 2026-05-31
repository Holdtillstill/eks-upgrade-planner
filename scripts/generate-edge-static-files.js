import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentSecurityPolicy } from '../server/security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(process.env.DIST_DIR || path.join(rootDir, 'dist'));

function requireDist() {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error(`Expected built app at ${distDir}. Run npm run build before generating edge static files.`);
  }
}

function writeFile(relativePath, contents) {
  const target = path.join(distDir, relativePath);
  fs.writeFileSync(target, `${contents.trim()}\n`);
  console.log(`Wrote ${path.relative(rootDir, target)}`);
}

function staticNotFoundHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex,nofollow" />
    <title>Not Found | EKS Upgrade Planner</title>
  </head>
  <body>
    <main>
      <h1>Not Found</h1>
      <p>No EKS Upgrade Planner route exists at this URL.</p>
      <p><a href="/app">Open the planner</a></p>
    </main>
  </body>
</html>`;
}

function cloudflareHeaders() {
  return `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Content-Security-Policy: ${contentSecurityPolicy}
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/robots.txt
  Cache-Control: public, max-age=300

/sitemap.xml
  Cache-Control: public, max-age=300

/manifest.webmanifest
  Cache-Control: public, max-age=300

/404.html
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store`;
}

requireDist();
writeFile('404.html', staticNotFoundHtml());
writeFile('_headers', cloudflareHeaders());

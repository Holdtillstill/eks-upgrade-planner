import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { publicRoutes } from './public-routes.js';
import { routeOutputFile } from './prerender-static.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(process.env.DIST_DIR || path.join(rootDir, 'dist'));
const cloudFrontFunctionPath = path.join(rootDir, 'infra', 'cloudfront', 'clean-url-rewrite.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readRequired(relativePath) {
  const filePath = path.join(distDir, relativePath);
  assert(fs.existsSync(filePath), `Expected ${path.relative(rootDir, filePath)} to exist`);
  return fs.readFileSync(filePath, 'utf8');
}

function loadCloudFrontHandler() {
  const source = fs.readFileSync(cloudFrontFunctionPath, 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source}\nhandler;`, context, { filename: cloudFrontFunctionPath });
  assert(typeof context.handler === 'function', 'Expected CloudFront clean URL handler to be defined');
  return context.handler;
}

function rewriteUri(handler, uri) {
  return handler({ request: { uri } }).uri;
}

const handler = loadCloudFrontHandler();
const notFoundHtml = readRequired('404.html');
const headers = readRequired('_headers');
const sitemap = readRequired('sitemap.xml');

assert(notFoundHtml.includes('<meta name="robots" content="noindex,nofollow" />'), '404.html must include noindex metadata');
assert(headers.includes("Content-Security-Policy: default-src 'self'"), '_headers must include the strict CSP');
assert(headers.includes("style-src 'self'"), '_headers must keep style-src self-only');
assert(!headers.includes("'unsafe-inline'"), '_headers must not allow unsafe-inline');

for (const route of publicRoutes) {
  const outputFile = routeOutputFile(distDir, route.path);
  assert(fs.existsSync(outputFile), `Expected prerendered HTML for ${route.path}`);

  const html = fs.readFileSync(outputFile, 'utf8');
  assert(html.includes(`data-prerendered-route="${route.path}"`), `Expected prerender marker for ${route.path}`);
  assert(html.includes('<meta name="robots" content="index,follow" />'), `Expected indexable robots metadata for ${route.path}`);

  const expectedRewrite = route.path === '/' ? '/index.html' : `${route.path}/index.html`;
  assert(rewriteUri(handler, route.path) === expectedRewrite, `Expected CloudFront rewrite ${route.path} -> ${expectedRewrite}`);

  const encodedPath = route.path === '/' ? '' : route.path;
  assert(sitemap.includes(encodedPath), `Expected sitemap to include ${route.path}`);
}

assert(rewriteUri(handler, '/assets/index.js') === '/assets/index.js', 'CloudFront rewrite must not touch asset paths');
assert(rewriteUri(handler, '/robots.txt') === '/robots.txt', 'CloudFront rewrite must not touch static files');
assert(rewriteUri(handler, '/missing-route') === '/missing-route/index.html', 'Unknown extensionless paths should fall through to S3 miss + CloudFront 404 mapping');

console.log(`Static hosting validation passed for ${publicRoutes.length} public routes.`);

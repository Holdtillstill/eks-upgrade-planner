import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { createMetrics } from './metrics.js';
import { createLogger, createTracer } from './observability.js';
import { normalizeRoute, shouldServeSpaFallback } from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(process.env.DIST_DIR || path.join(rootDir, 'dist'));
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

const config = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 8080),
  serviceName: process.env.OTEL_SERVICE_NAME || 'eks-upgrade-planner',
  version: process.env.APP_VERSION || packageJson.version || '0.0.0',
  commit: process.env.SOURCE_VERSION || process.env.GIT_SHA || process.env.COMMIT_SHA || 'unknown',
  buildTime: process.env.BUILD_TIME || 'unknown',
};

const logger = createLogger({ serviceName: config.serviceName, version: config.version });
const tracer = createTracer({ logger, serviceName: config.serviceName, version: config.version });
const metrics = createMetrics({ version: config.version, commit: config.commit, buildTime: config.buildTime });

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function isCompressible(contentType) {
  return /^(text\/|application\/(javascript|json|manifest\+json|xml))/.test(contentType) || contentType.includes('svg+xml');
}

function setSecurityHeaders(res) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('cross-origin-opener-policy', 'same-origin');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader(
    'content-security-policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "connect-src 'self'",
      "font-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self'",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
    ].join('; '),
  );
  if (process.env.ENABLE_HSTS !== 'false') {
    res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }
}

function sendJson(req, res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  if (req.method === 'HEAD') res.end();
  else res.end(body);
}

function safeStaticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const relativePath = path.posix.normalize(decoded).replace(/^\/+/, '');
  if (relativePath.startsWith('../')) return null;
  const filePath = path.resolve(distDir, relativePath || 'index.html');
  if (filePath !== distDir && !filePath.startsWith(`${distDir}${path.sep}`)) return null;
  return filePath;
}

function cacheControlFor(filePath) {
  const relative = path.relative(distDir, filePath).replaceAll(path.sep, '/');
  if (relative === 'index.html') return 'no-cache';
  if (relative.startsWith('assets/')) return 'public, max-age=31536000, immutable';
  if (relative === 'sitemap.xml' || relative === 'robots.txt' || relative === 'manifest.webmanifest') {
    return 'public, max-age=300';
  }
  return 'public, max-age=3600';
}

async function serveFile(req, res, filePath) {
  let stat;
  try {
    stat = await fs.promises.stat(filePath);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
  if (!stat.isFile()) return false;

  const contentType = contentTypeFor(filePath);
  const etag = `W/"${stat.size}-${Math.trunc(stat.mtimeMs)}"`;
  const headers = {
    'content-type': contentType,
    'cache-control': cacheControlFor(filePath),
    etag,
    'last-modified': stat.mtime.toUTCString(),
  };

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return true;
  }

  const acceptsGzip = String(req.headers['accept-encoding'] || '').includes('gzip');
  const compress = acceptsGzip && stat.size > 1024 && isCompressible(contentType);
  if (compress) headers['content-encoding'] = 'gzip';
  else headers['content-length'] = stat.size;

  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }

  const stream = fs.createReadStream(filePath);
  stream.on('error', (error) => {
    logger.error('static stream failed', { error: error.message, filePath });
    if (!res.headersSent) sendJson(req, res, 500, { status: 'error' });
    else res.destroy(error);
  });
  if (compress) stream.pipe(zlib.createGzip()).pipe(res);
  else stream.pipe(res);
  return true;
}

async function distReady() {
  try {
    await fs.promises.access(path.join(distDir, 'index.html'), fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function safeRequestUrl(req) {
  const requestUrl = req.url || '/';
  const host = req.headers.host || 'localhost';
  try {
    return new URL(requestUrl, `http://${host}`);
  } catch {
    return new URL(requestUrl, 'http://localhost');
  }
}

function metricsAuthorized(req) {
  const token = process.env.METRICS_BEARER_TOKEN;
  if (!token) return true;
  return req.headers.authorization === `Bearer ${token}`;
}

async function handleRequest(req, res) {
  const startedAt = Date.now();
  const requestId = req.headers['x-request-id'] && String(req.headers['x-request-id']).length <= 128
    ? String(req.headers['x-request-id'])
    : crypto.randomUUID();
  const url = safeRequestUrl(req);
  const route = normalizeRoute(url.pathname);
  const finishMetrics = metrics.startRequest(req.method || 'GET', route);
  const span = tracer.startSpan({ request: req, route, requestId });

  setSecurityHeaders(res);
  res.setHeader('x-request-id', requestId);
  res.setHeader('traceparent', span.traceparent);

  res.on('finish', () => {
    const durationSeconds = finishMetrics(res.statusCode);
    logger.info('request completed', {
      requestId,
      traceId: span.traceId,
      method: req.method,
      path: url.pathname,
      route,
      statusCode: res.statusCode,
      durationMs: Math.round(durationSeconds * 1000),
      userAgent: req.headers['user-agent'],
      remoteAddress: req.socket.remoteAddress,
    });
    span.finish({ statusCode: res.statusCode, durationSeconds });
  });

  try {
    if (url.pathname === '/healthz') {
      sendJson(req, res, 200, {
        status: 'ok',
        service: config.serviceName,
        version: config.version,
        uptimeSeconds: Math.round(process.uptime()),
      });
      return;
    }

    if (url.pathname === '/readyz') {
      const ready = await distReady();
      sendJson(req, res, ready ? 200 : 503, {
        status: ready ? 'ready' : 'not_ready',
        distDir,
      });
      return;
    }

    if (url.pathname === '/metrics') {
      if (!metricsAuthorized(req)) {
        sendJson(req, res, 404, { status: 'not_found' });
        return;
      }
      const body = metrics.render();
      res.writeHead(200, {
        'content-type': 'text/plain; version=0.0.4; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(body),
      });
      if (req.method === 'HEAD') res.end();
      else res.end(body);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('allow', 'GET, HEAD');
      sendJson(req, res, 405, { status: 'method_not_allowed' });
      return;
    }

    const staticPath = safeStaticPath(url.pathname);
    if (staticPath && await serveFile(req, res, staticPath)) return;

    if (shouldServeSpaFallback(req.method || 'GET', url.pathname, String(req.headers.accept || ''))) {
      await serveFile(req, res, path.join(distDir, 'index.html'));
      return;
    }

    sendJson(req, res, 404, { status: 'not_found' });
  } catch (error) {
    logger.error('request failed', {
      requestId,
      method: req.method,
      path: url.pathname,
      route,
      error: error.message,
      durationMs: Date.now() - startedAt,
    });
    if (!res.headersSent) sendJson(req, res, 500, { status: 'error', requestId });
    else res.destroy(error);
  }
}

const server = http.createServer(handleRequest);
server.headersTimeout = 65_000;
server.requestTimeout = 60_000;
server.keepAliveTimeout = 5_000;

server.on('error', (error) => {
  logger.error('server failed to start', {
    host: config.host,
    port: config.port,
    error: error.message,
    code: error.code,
  });
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  logger.info('server started', {
    host: config.host,
    port: config.port,
    distDir,
    version: config.version,
    commit: config.commit,
    buildTime: config.buildTime,
    otlpTracing: tracer.enabled,
  });
});

function shutdown(signal) {
  logger.info('shutdown requested', { signal });
  server.close((error) => {
    if (error) {
      logger.error('shutdown failed', { error: error.message });
      process.exit(1);
    }
    logger.info('server stopped');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('shutdown timed out');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

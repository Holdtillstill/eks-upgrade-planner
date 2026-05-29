import { describe, expect, it } from 'vitest';
import { metricsAuthRequired, validateMetricsAuthConfig } from './metrics.js';
import { designExplorationsEnabled, isKnownHtmlRoute, normalizeRoute, shouldSendHtmlNotFound, shouldServeSpaFallback } from './routes.js';
import { contentSecurityPolicy } from './security.js';

describe('server route helpers', () => {
  it('allows design exploration routes outside production by default', () => {
    expect(designExplorationsEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(normalizeRoute('/1', { env: { NODE_ENV: 'development' } })).toBe('/:design');
    expect(shouldServeSpaFallback('GET', '/1', 'text/html', { env: { NODE_ENV: 'development' } })).toBe(true);
  });

  it('blocks design exploration routes in production or when explicitly disabled', () => {
    expect(designExplorationsEnabled({ NODE_ENV: 'production', ENABLE_DESIGN_EXPLORATIONS: 'true' })).toBe(false);
    expect(designExplorationsEnabled({ NODE_ENV: 'development', ENABLE_DESIGN_EXPLORATIONS: 'false' })).toBe(false);
    expect(normalizeRoute('/1', { env: { NODE_ENV: 'production' } })).toBe('/not-found');
    expect(shouldServeSpaFallback('GET', '/10', 'text/html', { env: { NODE_ENV: 'production' } })).toBe(false);
    expect(shouldServeSpaFallback('GET', '/1', 'text/html', { env: { NODE_ENV: 'development', ENABLE_DESIGN_EXPLORATIONS: 'false' } })).toBe(false);
  });

  it('serves HTML fallback only for known app and prerendered routes', () => {
    expect(isKnownHtmlRoute('/eks/versions')).toBe(true);
    expect(isKnownHtmlRoute('/eks/1-35-upgrade-guide')).toBe(true);
    expect(isKnownHtmlRoute('/addons/karpenter/eks-compatibility')).toBe(true);
    expect(shouldServeSpaFallback('GET', '/eks/versions', 'text/html')).toBe(true);
    expect(shouldServeSpaFallback('HEAD', '/eks/1-35-upgrade-guide', '*/*')).toBe(true);
    expect(normalizeRoute('/eks/1-35-upgrade-guide')).toBe('/eks/:version-upgrade-guide');
    expect(normalizeRoute('/addons/karpenter/eks-compatibility')).toBe('/addons/:addon/eks-compatibility');
  });

  it('does not soft-404 unknown extensionless routes as SPA fallback', () => {
    expect(isKnownHtmlRoute('/does-not-exist')).toBe(false);
    expect(isKnownHtmlRoute('/eks/9-99-upgrade-guide')).toBe(false);
    expect(shouldServeSpaFallback('GET', '/does-not-exist', 'text/html')).toBe(false);
    expect(shouldServeSpaFallback('GET', '/eks/9-99-upgrade-guide', 'text/html')).toBe(false);
    expect(shouldServeSpaFallback('GET', '/api/does-not-exist', 'text/html')).toBe(false);
    expect(shouldServeSpaFallback('GET', '/missing.json', 'text/html')).toBe(false);
    expect(normalizeRoute('/does-not-exist')).toBe('/not-found');
  });

  it('negotiates noindex 404 responses as HTML only when requested', () => {
    expect(shouldSendHtmlNotFound('text/html,application/xhtml+xml')).toBe(true);
    expect(shouldSendHtmlNotFound('application/json')).toBe(false);
    expect(shouldSendHtmlNotFound('*/*')).toBe(false);
  });
});

describe('metrics auth config', () => {
  it('requires metrics bearer token in production unless explicitly opted out', () => {
    expect(metricsAuthRequired({ NODE_ENV: 'production' })).toBe(true);
    expect(() => validateMetricsAuthConfig({ NODE_ENV: 'production' })).toThrow(/METRICS_BEARER_TOKEN/);
    expect(metricsAuthRequired({ NODE_ENV: 'production', METRICS_BEARER_TOKEN: 'secret' })).toBe(true);
    expect(() => validateMetricsAuthConfig({ NODE_ENV: 'production', METRICS_BEARER_TOKEN: 'secret' })).not.toThrow();
    expect(metricsAuthRequired({ NODE_ENV: 'production', METRICS_ALLOW_UNAUTHENTICATED: 'true' })).toBe(false);
    expect(metricsAuthRequired({ NODE_ENV: 'development' })).toBe(false);
  });
});

describe('security headers', () => {
  it('keeps style sources self-only without unsafe-inline', () => {
    expect(contentSecurityPolicy).toContain("style-src 'self'");
    expect(contentSecurityPolicy).not.toContain("'unsafe-inline'");
  });
});

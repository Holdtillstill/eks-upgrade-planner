import { describe, expect, it } from 'vitest';
import { designExplorationsEnabled, normalizeRoute, shouldServeSpaFallback } from './routes.js';

describe('server route helpers', () => {
  it('allows design exploration routes outside production by default', () => {
    expect(designExplorationsEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(normalizeRoute('/1', { env: { NODE_ENV: 'development' } })).toBe('/:design');
    expect(shouldServeSpaFallback('GET', '/1', 'text/html', { env: { NODE_ENV: 'development' } })).toBe(true);
  });

  it('blocks design exploration routes in production or when explicitly disabled', () => {
    expect(designExplorationsEnabled({ NODE_ENV: 'production', ENABLE_DESIGN_EXPLORATIONS: 'true' })).toBe(false);
    expect(designExplorationsEnabled({ NODE_ENV: 'development', ENABLE_DESIGN_EXPLORATIONS: 'false' })).toBe(false);
    expect(normalizeRoute('/1', { env: { NODE_ENV: 'production' } })).toBe('/spa-fallback');
    expect(shouldServeSpaFallback('GET', '/10', 'text/html', { env: { NODE_ENV: 'production' } })).toBe(false);
    expect(shouldServeSpaFallback('GET', '/1', 'text/html', { env: { NODE_ENV: 'development', ENABLE_DESIGN_EXPLORATIONS: 'false' } })).toBe(false);
  });
});

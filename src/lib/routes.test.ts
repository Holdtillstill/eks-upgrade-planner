import { describe, expect, it } from 'vitest';
import { addonCompatibilityPath, findAddonBySlug } from './addonLookup';
import { productTabs, resolveAppRoute, versionGuidePath } from './routes';
import { addons } from '../data/addons';

describe('route helpers', () => {
  it('maps root and deep links to product tabs', () => {
    expect(resolveAppRoute('/')).toMatchObject({ kind: 'product', tab: 'overview', canonicalPath: '/app' });
    expect(resolveAppRoute('/eks/versions')).toMatchObject({ kind: 'product', tab: 'versions' });
    expect(resolveAppRoute('/eks/extended-support-cost-calculator')).toMatchObject({ kind: 'product', tab: 'cost' });
    expect(resolveAppRoute('/eks/upgrade-planner')).toMatchObject({ kind: 'product', tab: 'planner' });
    expect(resolveAppRoute('/eks/deprecated-api-scanner')).toMatchObject({ kind: 'product', tab: 'scanner' });
    expect(resolveAppRoute('/eks/addons')).toMatchObject({ kind: 'product', tab: 'addons' });
    expect(resolveAppRoute('/eks/evidence-pack')).toMatchObject({ kind: 'product', tab: 'evidence' });
  });

  it('preserves design exploration routes', () => {
    expect(resolveAppRoute('/1')).toEqual({ kind: 'design', route: '/1' });
    expect(resolveAppRoute('/10')).toEqual({ kind: 'design', route: '/10' });
  });

  it('resolves version guide and addon detail routes', () => {
    expect(versionGuidePath('1.31')).toBe('/eks/1-31-upgrade-guide');
    expect(resolveAppRoute('/eks/1-31-upgrade-guide')).toMatchObject({
      kind: 'product',
      tab: 'guides',
      detail: { type: 'version-guide', version: '1.31' },
    });
    expect(resolveAppRoute('/addons/karpenter/eks-compatibility')).toMatchObject({
      kind: 'product',
      tab: 'addons',
      detail: { type: 'addon', addonId: 'karpenter' },
    });
  });

  it('keeps product tab metadata routable', () => {
    expect(productTabs.map((tab) => tab.id)).toEqual([
      'overview',
      'versions',
      'cost',
      'planner',
      'scanner',
      'guides',
      'addons',
      'evidence',
    ]);
  });
});

describe('addon lookup helpers', () => {
  it('finds add-ons by id or display-name slug', () => {
    expect(findAddonBySlug('vpc-cni')?.name).toBe('Amazon VPC CNI');
    expect(findAddonBySlug('amazon-vpc-cni')?.id).toBe('vpc-cni');
    expect(addonCompatibilityPath(addons.find((addon) => addon.id === 'karpenter')!)).toBe('/addons/karpenter/eks-compatibility');
  });
});

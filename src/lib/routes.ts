import { addons } from '../data/addons';
import { eksVersions } from '../data/versions';
import { findAddonBySlug } from './addonLookup';

export const designRoutes = ['/1', '/2', '/3', '/4', '/5', '/6', '/7', '/8', '/9', '/10'] as const;
export type DesignRoute = (typeof designRoutes)[number];

export type ProductTab = 'overview' | 'versions' | 'cost' | 'planner' | 'scanner' | 'guides' | 'addons' | 'evidence';

export type ProductDetail =
  | { type: 'version-guide'; version: string }
  | { type: 'addon'; addonId: string };

export type AppRoute =
  | { kind: 'design'; route: DesignRoute }
  | { kind: 'product'; tab: ProductTab; canonicalPath: string; detail?: ProductDetail };

export const productTabs: { id: ProductTab; label: string; path: string }[] = [
  { id: 'overview', label: 'Overview', path: '/app' },
  { id: 'versions', label: 'Versions', path: '/eks/versions' },
  { id: 'cost', label: 'Cost', path: '/eks/extended-support-cost-calculator' },
  { id: 'planner', label: 'Planner', path: '/eks/upgrade-planner' },
  { id: 'scanner', label: 'Scanner', path: '/eks/deprecated-api-scanner' },
  { id: 'guides', label: 'Guides', path: `/eks/${versionToSlug(eksVersions[0].version)}-upgrade-guide` },
  { id: 'addons', label: 'Addons', path: '/eks/addons' },
  { id: 'evidence', label: 'Evidence', path: '/eks/evidence-pack' },
];

export const productRouteTabs: Record<string, ProductTab> = {
  '/': 'overview',
  '/app': 'overview',
  '/eks/versions': 'versions',
  '/eks/extended-support-cost-calculator': 'cost',
  '/eks/upgrade-planner': 'planner',
  '/eks/deprecated-api-scanner': 'scanner',
  '/eks/addons': 'addons',
  '/eks/evidence-pack': 'evidence',
};

export function normalizePath(pathname: string): string {
  const path = pathname || '/';
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path;
}

export function isDesignRoute(pathname: string): pathname is DesignRoute {
  return designRoutes.includes(pathname as DesignRoute);
}

export function versionToSlug(version: string): string {
  return version.replace(/\./g, '-');
}

export function slugToVersion(slug: string): string {
  return slug.replace(/-/g, '.');
}

export function versionGuidePath(version: string): string {
  return `/eks/${versionToSlug(version)}-upgrade-guide`;
}

export function resolveAppRoute(pathname: string): AppRoute {
  const path = normalizePath(pathname);
  if (isDesignRoute(path)) return { kind: 'design', route: path };

  const tab = productRouteTabs[path];
  if (tab) {
    return {
      kind: 'product',
      tab,
      canonicalPath: tab === 'overview' ? '/app' : path,
    };
  }

  const guideMatch = path.match(/^\/eks\/([0-9]+-[0-9]+)-upgrade-guide$/);
  if (guideMatch) {
    const version = slugToVersion(guideMatch[1]);
    if (eksVersions.some((item) => item.version === version)) {
      return {
        kind: 'product',
        tab: 'guides',
        canonicalPath: versionGuidePath(version),
        detail: { type: 'version-guide', version },
      };
    }
  }

  const addonMatch = path.match(/^\/addons\/([^/]+)\/eks-compatibility$/);
  if (addonMatch) {
    const addon = findAddonBySlug(decodeURIComponent(addonMatch[1]), addons);
    if (addon) {
      return {
        kind: 'product',
        tab: 'addons',
        canonicalPath: `/addons/${addon.id}/eks-compatibility`,
        detail: { type: 'addon', addonId: addon.id },
      };
    }
  }

  return { kind: 'product', tab: 'overview', canonicalPath: '/app' };
}

import { addons, type Addon } from '../data/addons';

export function slugifyAddon(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function findAddonBySlug(slug: string, list: Addon[] = addons): Addon | undefined {
  const normalized = slugifyAddon(slug);
  return list.find((addon) => addon.id === normalized || slugifyAddon(addon.name) === normalized);
}

export function addonCompatibilityPath(addon: Addon): string {
  return `/addons/${addon.id}/eks-compatibility`;
}

export function addonValidationChecklist(addon: Addon): string[] {
  return [
    `Confirm ${addon.name} is installed and owned by the expected delivery mechanism.`,
    ...addon.checks,
    `Review ${addon.sourceLabel} before applying a production upgrade.`,
    'Run workload smoke tests that exercise this add-on after each control-plane hop.',
  ];
}

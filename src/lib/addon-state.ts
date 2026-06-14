export interface AddonChecklistEntry {
  checked: number[];
  targetVersion: string | null;
  dataCheckedAt: string | null;
  capturedAt: string | null;
}

export type AddonChecklistState = Record<string, AddonChecklistEntry>;

export const ADDON_CHECKLIST_STORAGE_KEY = 'eks-upgrade-planner:addon-checklist';

function normalizeAddonChecklistEntry(value: unknown): AddonChecklistEntry {
  if (Array.isArray(value)) {
    return {
      checked: value.filter(item => Number.isInteger(item) && item >= 0),
      targetVersion: null,
      dataCheckedAt: null,
      capturedAt: null,
    };
  }
  const entry = value && typeof value === 'object' ? value as Partial<AddonChecklistEntry> : {};
  return {
    checked: Array.isArray(entry.checked) ? entry.checked.filter(item => Number.isInteger(item) && item >= 0) : [],
    targetVersion: typeof entry.targetVersion === 'string' ? entry.targetVersion : null,
    dataCheckedAt: typeof entry.dataCheckedAt === 'string' ? entry.dataCheckedAt : null,
    capturedAt: typeof entry.capturedAt === 'string' ? entry.capturedAt : null,
  };
}

export function normalizeAddonChecklistState(value: unknown): AddonChecklistState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value).map(([addonId, entry]) => [addonId, normalizeAddonChecklistEntry(entry)]));
}

export function readAddonChecklistState(): AddonChecklistState {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const stored = window.localStorage.getItem(ADDON_CHECKLIST_STORAGE_KEY);
    if (!stored) {
      return {};
    }
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return normalizeAddonChecklistState(parsed);
  } catch {
    return {};
  }
}

export function writeAddonChecklistState(next: AddonChecklistState) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(ADDON_CHECKLIST_STORAGE_KEY, JSON.stringify(normalizeAddonChecklistState(next)));
}

export function addonCheckedSet(state: AddonChecklistState, addonId: string) {
  return new Set(state[addonId]?.checked ?? []);
}

export function addonChecklistProgress(state: AddonChecklistState, addonId: string, total: number) {
  const checked = addonCheckedSet(state, addonId);
  return {
    checked,
    checkedCount: Math.min(checked.size, total),
    total,
    complete: total > 0 && checked.size >= total,
  };
}

export function updateAddonChecklistEntry(
  state: AddonChecklistState,
  addonId: string,
  checked: number[],
  targetVersion: string,
  dataCheckedAt: string,
): AddonChecklistState {
  return {
    ...state,
    [addonId]: {
      checked: [...new Set(checked)].sort((a, b) => a - b),
      targetVersion,
      dataCheckedAt,
      capturedAt: new Date().toISOString(),
    },
  };
}

export function addonEvidenceIsStale(state: AddonChecklistState, addonId: string, targetVersion: string, dataCheckedAt: string) {
  const entry = state[addonId];
  if (!entry || entry.checked.length === 0) return false;
  return entry.targetVersion !== targetVersion || entry.dataCheckedAt !== dataCheckedAt;
}

export function addonEvidenceMeta(state: AddonChecklistState, addonId: string) {
  const entry = state[addonId];
  if (!entry) return '';
  const parts = [];
  if (entry.capturedAt) parts.push(`captured ${entry.capturedAt.slice(0, 10)}`);
  if (entry.targetVersion) parts.push(`target EKS ${entry.targetVersion}`);
  if (entry.dataCheckedAt) parts.push(`data ${entry.dataCheckedAt}`);
  return parts.join(' · ');
}

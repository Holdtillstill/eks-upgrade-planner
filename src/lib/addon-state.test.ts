import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADDON_CHECKLIST_STORAGE_KEY,
  addonChecklistProgress,
  addonEvidenceIsStale,
  addonEvidenceMeta,
  readAddonChecklistState,
  updateAddonChecklistEntry,
  writeAddonChecklistState,
} from './addon-state';

describe('addon-state', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it('loads legacy array checklist state with empty freshness metadata', () => {
    window.localStorage.setItem(ADDON_CHECKLIST_STORAGE_KEY, JSON.stringify({
      coredns: [0, 2],
    }));

    const state = readAddonChecklistState();

    expect(state.coredns).toEqual({
      checked: [0, 2],
      targetVersion: null,
      dataCheckedAt: null,
      capturedAt: null,
    });
    expect(addonChecklistProgress(state, 'coredns', 4).checkedCount).toBe(2);
  });

  it('records target and data snapshot with add-on validation evidence', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));

    const state = updateAddonChecklistEntry({}, 'coredns', [2, 1, 1], '1.35', '2026-06-14');

    expect(state.coredns).toEqual({
      checked: [1, 2],
      targetVersion: '1.35',
      dataCheckedAt: '2026-06-14',
      capturedAt: '2026-06-14T12:00:00.000Z',
    });
    expect(addonEvidenceIsStale(state, 'coredns', '1.35', '2026-06-14')).toBe(false);
    expect(addonEvidenceIsStale(state, 'coredns', '1.36', '2026-06-14')).toBe(true);
    expect(addonEvidenceIsStale(state, 'coredns', '1.35', '2026-06-15')).toBe(true);
    expect(addonEvidenceMeta(state, 'coredns')).toContain('target EKS 1.35');
  });

  it('persists normalized add-on checklist evidence', () => {
    const state = updateAddonChecklistEntry({}, 'vpc-cni', [0], '1.35', '2026-06-14');

    writeAddonChecklistState(state);

    expect(readAddonChecklistState()['vpc-cni']).toMatchObject({
      checked: [0],
      targetVersion: '1.35',
      dataCheckedAt: '2026-06-14',
    });
  });
});

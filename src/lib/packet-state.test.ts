import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PACKET_STATE,
  PACKET_STATE_STORAGE_KEY,
  maintenanceGateDetail,
  maintenanceGateStatus,
  normalizePacketState,
  readPacketState,
  waiverIsAccepted,
  waiverIsRecorded,
  writePacketState,
} from './packet-state';

describe('packet-state', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('normalizes malformed packet state back to safe defaults', () => {
    expect(normalizePacketState({ maintenance: { status: 'done' }, waiver: { accepted: true } })).toEqual({
      maintenance: DEFAULT_PACKET_STATE.maintenance,
      waiver: {
        ...DEFAULT_PACKET_STATE.waiver,
        accepted: true,
      },
    });
  });

  it('persists maintenance and waiver state for packet and overview screens', () => {
    const next = {
      maintenance: {
        ...DEFAULT_PACKET_STATE.maintenance,
        start: '2026-06-20T21:00',
        end: '2026-06-20T23:00',
        status: 'approved' as const,
        approver: 'change-board',
      },
      waiver: {
        owner: 'platform',
        reason: 'temporary add-on exception',
        approver: 'ops-lead',
        accepted: true,
        acceptedAt: '2026-06-14T12:00:00.000Z',
      },
    };

    writePacketState(next);

    expect(window.localStorage.getItem(PACKET_STATE_STORAGE_KEY)).toContain('change-board');
    expect(readPacketState()).toEqual(next);
    expect(maintenanceGateStatus(readPacketState().maintenance)).toBe('passed');
    expect(maintenanceGateDetail(readPacketState().maintenance)).toContain('Approved by change-board');
  });

  it('separates recorded waivers from accepted waivers', () => {
    expect(waiverIsRecorded({ owner: 'platform', reason: 'risk accepted', approver: '', accepted: false, acceptedAt: null })).toBe(true);
    expect(waiverIsAccepted({ owner: 'platform', reason: 'risk accepted', approver: '', accepted: true, acceptedAt: null })).toBe(false);
    expect(waiverIsAccepted({ owner: 'platform', reason: 'risk accepted', approver: 'ops-lead', accepted: true, acceptedAt: null })).toBe(true);
  });
});

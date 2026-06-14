import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSampleWorkspaceSnapshot, buildWorkspaceSnapshot, parseWorkspaceSnapshot, workspaceSnapshotToJson, applyWorkspaceSnapshot } from './workspace-state';
import { readPlannerState } from './planner-state';

describe('workspace-state', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  it('exports a complete workspace snapshot', () => {
    const snapshot = buildWorkspaceSnapshot();

    expect(snapshot).toMatchObject({
      schema: 'eks-upgrade-planner-workspace',
      schemaVersion: 1,
      exportedAt: '2026-06-14T12:00:00.000Z',
    });
    expect(JSON.parse(workspaceSnapshotToJson(snapshot)).planner.fleetRows.length).toBeGreaterThan(0);
  });

  it('parses and applies workspace snapshots', () => {
    const snapshot = buildWorkspaceSnapshot();
    snapshot.planner.fleetRows = [{ id: 'qa', name: 'qa', from: '1.32', to: '1.35', clusters: 2 }];

    const result = parseWorkspaceSnapshot(JSON.stringify(snapshot));

    expect(result.snapshot?.planner.fleetRows[0]).toMatchObject({ name: 'qa', clusters: 2 });
    applyWorkspaceSnapshot(result.snapshot!);
    expect(readPlannerState().fleetRows[0]).toMatchObject({ name: 'qa', clusters: 2 });
  });

  it('rejects non-workspace JSON', () => {
    const result = parseWorkspaceSnapshot('{"fleetRows":[]}');

    expect(result.snapshot).toBeNull();
    expect(result.warnings[0]).toContain('not an EKS Upgrade Planner workspace snapshot');
  });

  it('builds a full sample scenario workspace', () => {
    const snapshot = buildSampleWorkspaceSnapshot();

    expect(snapshot.planner.fleetRows.length).toBeGreaterThan(3);
    expect(snapshot.scannerEvidence.status).toBe('findings');
    expect(snapshot.packet.maintenance.status).toBe('approved');
    expect(snapshot.packet.waiver.accepted).toBe(true);
    expect(snapshot.execution.history.length).toBeGreaterThan(0);
  });
});

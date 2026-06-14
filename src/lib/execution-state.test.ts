import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXECUTION_STATE_STORAGE_KEY,
  DEFAULT_EXECUTION_STATE,
  executionMarkdown,
  executionHistoryMarkdown,
  executionProgress,
  normalizeExecutionState,
  readExecutionState,
  updateExecutionStep,
  writeExecutionState,
} from './execution-state';

describe('execution-state', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it('normalizes missing and malformed execution state', () => {
    expect(normalizeExecutionState({ steps: [{ id: 'preflight', status: 'wat' }] }).steps[0]).toMatchObject({
      id: 'preflight',
      status: 'pending',
      label: DEFAULT_EXECUTION_STATE.steps[0].label,
    });
  });

  it('updates a step and reports progress', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));

    const state = updateExecutionStep(DEFAULT_EXECUTION_STATE, 'preflight', { status: 'done', notes: 'ticket attached' });

    expect(state.updatedAt).toBe('2026-06-14T12:00:00.000Z');
    expect(state.steps[0]).toMatchObject({ status: 'done', notes: 'ticket attached' });
    expect(state.history[0]).toMatchObject({
      stepId: 'preflight',
      fromStatus: 'pending',
      toStatus: 'done',
    });
    expect(executionProgress(state)).toMatchObject({ done: 1, pending: DEFAULT_EXECUTION_STATE.steps.length - 1, complete: false });
    expect(executionMarkdown(state)).toContain('[x] Preflight evidence attached');
    expect(executionHistoryMarkdown(state)).toContain('Preflight evidence attached');
  });

  it('persists execution state in local storage', () => {
    const state = updateExecutionStep(DEFAULT_EXECUTION_STATE, 'addons', { status: 'running', owner: 'platform-oncall' });

    writeExecutionState(state);

    expect(window.localStorage.getItem(EXECUTION_STATE_STORAGE_KEY)).toContain('platform-oncall');
    expect(readExecutionState().steps.find(step => step.id === 'addons')).toMatchObject({
      status: 'running',
      owner: 'platform-oncall',
    });
  });
});

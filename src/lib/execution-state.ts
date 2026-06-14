export type ExecutionStepStatus = 'pending' | 'running' | 'done' | 'blocked';

export interface ExecutionStep {
  id: string;
  label: string;
  owner: string;
  status: ExecutionStepStatus;
  notes: string;
  updatedAt: string | null;
}

export interface ExecutionHistoryEntry {
  id: string;
  stepId: string;
  stepLabel: string;
  at: string;
  fromStatus: ExecutionStepStatus;
  toStatus: ExecutionStepStatus;
  owner: string;
  notes: string;
}

export interface ExecutionState {
  steps: ExecutionStep[];
  updatedAt: string | null;
  history: ExecutionHistoryEntry[];
}

export const NODE_MODEL_STORAGE_KEY = 'eks-upgrade-planner:node-model';
export const EXECUTION_STATE_STORAGE_KEY = 'eks-upgrade-planner:execution-state';

export const EXECUTION_STATUS_OPTIONS: { value: ExecutionStepStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
  { value: 'done', label: 'Done' },
  { value: 'blocked', label: 'Blocked' },
];

export const DEFAULT_EXECUTION_STATE: ExecutionState = {
  updatedAt: null,
  history: [],
  steps: [
    { id: 'preflight', label: 'Preflight evidence attached', owner: 'Platform', status: 'pending', notes: '', updatedAt: null },
    { id: 'control-plane', label: 'Control plane hop completed', owner: 'Platform', status: 'pending', notes: '', updatedAt: null },
    { id: 'node-capacity', label: 'Node capacity replaced', owner: 'SRE', status: 'pending', notes: '', updatedAt: null },
    { id: 'addons', label: 'Add-ons reconciled', owner: 'Platform', status: 'pending', notes: '', updatedAt: null },
    { id: 'workload-validation', label: 'Workloads validated', owner: 'Service owners', status: 'pending', notes: '', updatedAt: null },
    { id: 'monitoring', label: 'Post-upgrade monitoring clean', owner: 'SRE', status: 'pending', notes: '', updatedAt: null },
    { id: 'rollback', label: 'Rollback path confirmed', owner: 'Change owner', status: 'pending', notes: '', updatedAt: null },
  ],
};

function normalizeStatus(value: unknown): ExecutionStepStatus {
  return value === 'running' || value === 'done' || value === 'blocked' ? value : 'pending';
}

function normalizeStep(value: unknown, fallback: ExecutionStep): ExecutionStep {
  const source = value && typeof value === 'object' ? value as Partial<ExecutionStep> : {};
  return {
    id: typeof source.id === 'string' && source.id.trim().length > 0 ? source.id : fallback.id,
    label: typeof source.label === 'string' && source.label.trim().length > 0 ? source.label : fallback.label,
    owner: typeof source.owner === 'string' ? source.owner : fallback.owner,
    status: normalizeStatus(source.status),
    notes: typeof source.notes === 'string' ? source.notes : '',
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null,
  };
}

function normalizeHistoryEntry(value: unknown, index: number): ExecutionHistoryEntry | null {
  const source = value && typeof value === 'object' ? value as Partial<ExecutionHistoryEntry> : {};
  if (typeof source.stepId !== 'string' || typeof source.stepLabel !== 'string' || typeof source.at !== 'string') {
    return null;
  }
  return {
    id: typeof source.id === 'string' && source.id.trim().length > 0 ? source.id : `history-${index}`,
    stepId: source.stepId,
    stepLabel: source.stepLabel,
    at: source.at,
    fromStatus: normalizeStatus(source.fromStatus),
    toStatus: normalizeStatus(source.toStatus),
    owner: typeof source.owner === 'string' ? source.owner : '',
    notes: typeof source.notes === 'string' ? source.notes : '',
  };
}

export function normalizeExecutionState(value: unknown): ExecutionState {
  const source = value && typeof value === 'object' ? value as Partial<ExecutionState> : {};
  const rawSteps = Array.isArray(source.steps) ? source.steps : [];
  const stepsById = new Map(rawSteps.map(step => {
    const item = step && typeof step === 'object' ? step as Partial<ExecutionStep> : {};
    return [typeof item.id === 'string' ? item.id : '', step] as const;
  }));
  const steps = DEFAULT_EXECUTION_STATE.steps.map(fallback => normalizeStep(stepsById.get(fallback.id), fallback));
  const customSteps = rawSteps
    .filter(step => {
      const item = step && typeof step === 'object' ? step as Partial<ExecutionStep> : {};
      return typeof item.id === 'string' && item.id.trim().length > 0 && !DEFAULT_EXECUTION_STATE.steps.some(defaultStep => defaultStep.id === item.id);
    })
    .map((step, index) => normalizeStep(step, {
      id: `custom-${index}`,
      label: `Custom step ${index + 1}`,
      owner: '',
      status: 'pending',
      notes: '',
      updatedAt: null,
    }));

  return {
    steps: [...steps, ...customSteps],
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null,
    history: Array.isArray(source.history)
      ? source.history.map(normalizeHistoryEntry).filter((entry): entry is ExecutionHistoryEntry => Boolean(entry)).slice(-50)
      : [],
  };
}

export function readExecutionState(): ExecutionState {
  if (typeof window === 'undefined') return DEFAULT_EXECUTION_STATE;
  try {
    const raw = window.localStorage.getItem(EXECUTION_STATE_STORAGE_KEY);
    return raw ? normalizeExecutionState(JSON.parse(raw)) : DEFAULT_EXECUTION_STATE;
  }
  catch {
    return DEFAULT_EXECUTION_STATE;
  }
}

export function writeExecutionState(state: ExecutionState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(EXECUTION_STATE_STORAGE_KEY, JSON.stringify(normalizeExecutionState(state)));
}

export function updateExecutionStep(
  state: ExecutionState,
  stepId: string,
  patch: Partial<Omit<ExecutionStep, 'id' | 'label'>>,
  now = new Date(),
): ExecutionState {
  const updatedAt = now.toISOString();
  const currentStep = state.steps.find(step => step.id === stepId);
  const nextStep = currentStep ? { ...currentStep, ...patch, updatedAt } : null;
  const changed = currentStep && nextStep && (
    currentStep.status !== nextStep.status
    || currentStep.owner !== nextStep.owner
    || currentStep.notes !== nextStep.notes
  );
  const historyEntry: ExecutionHistoryEntry | null = currentStep && nextStep && changed
    ? {
      id: `${stepId}-${now.getTime()}`,
      stepId,
      stepLabel: currentStep.label,
      at: updatedAt,
      fromStatus: currentStep.status,
      toStatus: nextStep.status,
      owner: nextStep.owner,
      notes: nextStep.notes,
    }
    : null;
  return normalizeExecutionState({
    ...state,
    updatedAt,
    steps: state.steps.map(step => step.id === stepId
      ? { ...step, ...patch, updatedAt }
      : step),
    history: historyEntry ? [...state.history, historyEntry] : state.history,
  });
}

export function executionProgress(state: ExecutionState) {
  const counts = state.steps.reduce<Record<ExecutionStepStatus, number>>((acc, step) => {
    acc[step.status] += 1;
    return acc;
  }, { pending: 0, running: 0, done: 0, blocked: 0 });
  return {
    ...counts,
    total: state.steps.length,
    complete: state.steps.length > 0 && counts.done === state.steps.length,
  };
}

export function executionStatusLabel(status: ExecutionStepStatus) {
  return EXECUTION_STATUS_OPTIONS.find(option => option.value === status)?.label ?? 'Pending';
}

export function executionStatusVariant(status: ExecutionStepStatus): 'queued' | 'running' | 'passed' | 'blocked' {
  if (status === 'done') return 'passed';
  if (status === 'blocked') return 'blocked';
  if (status === 'running') return 'running';
  return 'queued';
}

export function executionMarkdown(state: ExecutionState) {
  return state.steps.map(step => {
    const owner = step.owner.trim() || 'unassigned';
    const notes = step.notes.trim() ? ` - ${step.notes.trim()}` : '';
    return `- [${step.status === 'done' ? 'x' : ' '}] ${step.label} (${executionStatusLabel(step.status)}, owner: ${owner})${notes}`;
  }).join('\n');
}

export function executionHistoryMarkdown(state: ExecutionState) {
  if (state.history.length === 0) {
    return '- No execution status changes recorded yet.';
  }
  return [...state.history].reverse().map(entry => {
    const owner = entry.owner.trim() || 'unassigned';
    const notes = entry.notes.trim() ? ` - ${entry.notes.trim()}` : '';
    return `- ${entry.at.slice(0, 16).replace('T', ' ')}Z · ${entry.stepLabel}: ${executionStatusLabel(entry.fromStatus)} -> ${executionStatusLabel(entry.toStatus)} · owner: ${owner}${notes}`;
  }).join('\n');
}

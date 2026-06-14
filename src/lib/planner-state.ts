import { eksVersions } from '../data/versions';

export type PlannerFleetRow = {
  id: string;
  name: string;
  from: string;
  to: string;
  clusters: number;
};

export type CostScenarioId = 'accelerate' | 'bridge' | 'defer';
export type PacketStepId = 'cost' | 'plan' | 'scanner' | 'guides' | 'packet';

export interface PlannerState {
  fleetRows: PlannerFleetRow[];
  delayMonths: number;
  activeFleetRowId: string;
  costScenarioId: CostScenarioId;
  completedPacketSteps: PacketStepId[];
}

export const PLANNER_STATE_STORAGE_KEY = 'eks-upgrade-planner:planner-state';

function versionRank(version: string) {
  return Number(version.split('.').at(-1) ?? 0);
}

export function compareVersionsAsc(a: string, b: string) {
  return versionRank(a) - versionRank(b);
}

export const ALL_EKS_VERSIONS = [...eksVersions]
  .map(version => version.version)
  .sort(compareVersionsAsc);

export const PACKET_STEPS: { id: PacketStepId; label: string; screen: string }[] = [
  { id: 'cost', label: 'Open cost model', screen: 'cost' },
  { id: 'plan', label: 'Draft change plan', screen: 'plan' },
  { id: 'scanner', label: 'Run deprecated API scan', screen: 'scanner' },
  { id: 'guides', label: 'Open EKS guide', screen: 'guides' },
  { id: 'packet', label: 'Assemble change packet', screen: 'packet' },
];

export const DEFAULT_PLANNER_STATE: PlannerState = {
  fleetRows: [
    { id: '1', name: 'prod-payments', from: '1.31', to: '1.35', clusters: 5 },
    { id: '2', name: 'shared-platform', from: '1.30', to: '1.35', clusters: 3 },
    { id: '3', name: 'dev-sandboxes', from: '1.33', to: '1.35', clusters: 4 },
  ],
  delayMonths: 4,
  activeFleetRowId: '1',
  costScenarioId: 'bridge',
  completedPacketSteps: [],
};

function isPacketStepId(value: unknown): value is PacketStepId {
  return typeof value === 'string' && PACKET_STEPS.some(step => step.id === value);
}

function normalizeVersion(value: unknown, fallback: string) {
  return typeof value === 'string' && ALL_EKS_VERSIONS.includes(value) ? value : fallback;
}

function normalizeFleetRow(value: unknown, index: number): PlannerFleetRow | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Partial<PlannerFleetRow>;
  const from = normalizeVersion(row.from, DEFAULT_PLANNER_STATE.fleetRows[index]?.from ?? '1.31');
  const fallbackTo = DEFAULT_PLANNER_STATE.fleetRows[index]?.to ?? '1.35';
  const to = ALL_EKS_VERSIONS.indexOf(normalizeVersion(row.to, fallbackTo)) < ALL_EKS_VERSIONS.indexOf(from)
    ? from
    : normalizeVersion(row.to, fallbackTo);
  const clusters = Number.isFinite(Number(row.clusters)) ? Math.max(1, Math.round(Number(row.clusters))) : 1;

  return {
    id: typeof row.id === 'string' && row.id.length > 0 ? row.id : `${Date.now()}-${index}`,
    name: typeof row.name === 'string' && row.name.trim().length > 0 ? row.name.trim() : `scope-${index + 1}`,
    from,
    to,
    clusters,
  };
}

export function normalizePlannerState(value: unknown): PlannerState {
  const raw = value && typeof value === 'object' ? value as Partial<PlannerState> : {};
  const fleetRows = Array.isArray(raw.fleetRows)
    ? raw.fleetRows.map(normalizeFleetRow).filter((row): row is PlannerFleetRow => Boolean(row))
    : DEFAULT_PLANNER_STATE.fleetRows;
  const safeFleetRows = fleetRows.length > 0 ? fleetRows : DEFAULT_PLANNER_STATE.fleetRows;
  const activeFleetRowId = typeof raw.activeFleetRowId === 'string'
    && safeFleetRows.some(row => row.id === raw.activeFleetRowId)
    ? raw.activeFleetRowId
    : safeFleetRows[0].id;
  const costScenarioId = raw.costScenarioId === 'accelerate' || raw.costScenarioId === 'defer'
    ? raw.costScenarioId
    : 'bridge';
  const completedPacketSteps = Array.isArray(raw.completedPacketSteps)
    ? raw.completedPacketSteps.filter(isPacketStepId)
    : [];
  const delayMonths = Number.isFinite(Number(raw.delayMonths))
    ? Math.min(12, Math.max(0, Math.round(Number(raw.delayMonths))))
    : DEFAULT_PLANNER_STATE.delayMonths;

  return {
    fleetRows: safeFleetRows,
    delayMonths,
    activeFleetRowId,
    costScenarioId,
    completedPacketSteps: [...new Set(completedPacketSteps)],
  };
}

export function readPlannerState(): PlannerState {
  if (typeof window === 'undefined') {
    return DEFAULT_PLANNER_STATE;
  }
  try {
    const stored = window.localStorage.getItem(PLANNER_STATE_STORAGE_KEY);
    return stored ? normalizePlannerState(JSON.parse(stored)) : DEFAULT_PLANNER_STATE;
  } catch {
    return DEFAULT_PLANNER_STATE;
  }
}

export function writePlannerState(next: PlannerState) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(PLANNER_STATE_STORAGE_KEY, JSON.stringify(normalizePlannerState(next)));
}

export function updatePlannerState(patch: Partial<PlannerState>) {
  const next = normalizePlannerState({ ...readPlannerState(), ...patch });
  writePlannerState(next);
  return next;
}

export function targetOptionsFor(from: string) {
  const start = Math.max(0, ALL_EKS_VERSIONS.indexOf(from));
  return ALL_EKS_VERSIONS.slice(start);
}

export function versionPath(from: string, to: string) {
  const fromIdx = ALL_EKS_VERSIONS.indexOf(from);
  const toIdx = ALL_EKS_VERSIONS.indexOf(to);
  if (fromIdx < 0 || toIdx < fromIdx) {
    return [from, to];
  }
  return ALL_EKS_VERSIONS.slice(fromIdx, toIdx + 1);
}

export function versionHopCount(from: string, to: string) {
  return Math.max(0, versionPath(from, to).length - 1);
}

export function totalClusters(rows: PlannerFleetRow[]) {
  return rows.reduce((sum, row) => sum + row.clusters, 0);
}

export function highestTargetVersion(rows: PlannerFleetRow[]) {
  return [...rows]
    .map(row => row.to)
    .sort(compareVersionsAsc)
    .at(-1) ?? DEFAULT_PLANNER_STATE.fleetRows[0].to;
}

export function activeTargetVersion(state: PlannerState) {
  return state.fleetRows.find(row => row.id === state.activeFleetRowId)?.to ?? highestTargetVersion(state.fleetRows);
}

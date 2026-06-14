import { normalizeAddonChecklistState, readAddonChecklistState, updateAddonChecklistEntry, writeAddonChecklistState, type AddonChecklistState } from './addon-state';
import { DEFAULT_EXECUTION_STATE, NODE_MODEL_STORAGE_KEY, normalizeExecutionState, readExecutionState, updateExecutionStep, writeExecutionState, type ExecutionState } from './execution-state';
import { DEFAULT_PACKET_STATE, normalizePacketState, readPacketState, writePacketState, type PacketState } from './packet-state';
import { DEFAULT_PLANNER_STATE, normalizePlannerState, readPlannerState, writePlannerState, type PlannerState } from './planner-state';
import { buildScannerEvidence, DEFAULT_SCANNER_EVIDENCE, writeStoredScannerEvidence, readStoredScannerEvidence, type ScannerEvidence } from './scanner-state';
import { dataFreshness } from '../data/versions';

export interface WorkspaceSnapshot {
  schema: 'eks-upgrade-planner-workspace';
  schemaVersion: 1;
  exportedAt: string;
  dataCheckedAt: string;
  planner: PlannerState;
  scannerEvidence: ScannerEvidence;
  addonChecklist: AddonChecklistState;
  packet: PacketState;
  execution: ExecutionState;
  nodeModel: string | null;
}

export interface WorkspaceImportResult {
  snapshot: WorkspaceSnapshot | null;
  warnings: string[];
}

export function readNodeModel() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(NODE_MODEL_STORAGE_KEY);
}

export function writeNodeModel(value: string | null) {
  if (typeof window === 'undefined') return;
  if (value === 'rolling' || value === 'bluegreen') {
    window.localStorage.setItem(NODE_MODEL_STORAGE_KEY, value);
  }
  else {
    window.localStorage.removeItem(NODE_MODEL_STORAGE_KEY);
  }
}

function normalizeScannerEvidence(value: unknown): ScannerEvidence {
  const source = value && typeof value === 'object' ? value as Partial<ScannerEvidence> : {};
  const status = source.status === 'empty_input' || source.status === 'clean' || source.status === 'findings' || source.status === 'scan_error'
    ? source.status
    : 'not_scanned';
  return {
    ...DEFAULT_SCANNER_EVIDENCE,
    status,
    scannedAt: typeof source.scannedAt === 'string' ? source.scannedAt : null,
    manifestLineCount: typeof source.manifestLineCount === 'number' ? source.manifestLineCount : 0,
    manifestHash: typeof source.manifestHash === 'string' ? source.manifestHash : null,
    targetVersion: typeof source.targetVersion === 'string' ? source.targetVersion : null,
    rulesCheckedAt: typeof source.rulesCheckedAt === 'string' ? source.rulesCheckedAt : null,
    ruleCount: typeof source.ruleCount === 'number' ? source.ruleCount : DEFAULT_SCANNER_EVIDENCE.ruleCount,
    inputSource: source.inputSource === 'manifest' || source.inputSource === 'kubent' || source.inputSource === 'pluto' || source.inputSource === 'external' ? source.inputSource : undefined,
    sourceLabel: typeof source.sourceLabel === 'string' ? source.sourceLabel : undefined,
    findings: Array.isArray(source.findings) ? source.findings as ScannerEvidence['findings'] : [],
    errorMessage: typeof source.errorMessage === 'string' ? source.errorMessage : undefined,
  };
}

export function buildWorkspaceSnapshot(now = new Date()): WorkspaceSnapshot {
  return {
    schema: 'eks-upgrade-planner-workspace',
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    dataCheckedAt: dataFreshness.checkedAt,
    planner: readPlannerState(),
    scannerEvidence: readStoredScannerEvidence(),
    addonChecklist: readAddonChecklistState(),
    packet: readPacketState(),
    execution: readExecutionState(),
    nodeModel: readNodeModel(),
  };
}

export function workspaceSnapshotToJson(snapshot = buildWorkspaceSnapshot()) {
  return JSON.stringify(snapshot, null, 2);
}

const SAMPLE_MANIFEST = `apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: restricted
---
apiVersion: autoscaling/v2beta2
kind: HorizontalPodAutoscaler
metadata:
  name: payments-hpa
  namespace: prod
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments-api
  namespace: prod`;

export function buildSampleWorkspaceSnapshot(now = new Date()): WorkspaceSnapshot {
  const planner: PlannerState = {
    ...DEFAULT_PLANNER_STATE,
    fleetRows: [
      { id: 'prod-payments', name: 'prod-payments', from: '1.31', to: '1.35', clusters: 5 },
      { id: 'shared-platform', name: 'shared-platform', from: '1.30', to: '1.35', clusters: 3 },
      { id: 'ml-platform', name: 'ml-platform', from: '1.32', to: '1.35', clusters: 2 },
      { id: 'dev-sandboxes', name: 'dev-sandboxes', from: '1.33', to: '1.35', clusters: 4 },
    ],
    delayMonths: 3,
    activeFleetRowId: 'prod-payments',
    costScenarioId: 'bridge',
    completedPacketSteps: ['cost', 'plan', 'scanner', 'guides'],
  };
  let addonChecklist: AddonChecklistState = {};
  addonChecklist = updateAddonChecklistEntry(addonChecklist, 'vpc-cni', [0, 1, 2, 3], '1.35', dataFreshness.checkedAt);
  addonChecklist = updateAddonChecklistEntry(addonChecklist, 'coredns', [0, 1], '1.35', dataFreshness.checkedAt);
  addonChecklist = updateAddonChecklistEntry(addonChecklist, 'kube-proxy', [0, 1, 2, 3], '1.35', dataFreshness.checkedAt);
  addonChecklist = updateAddonChecklistEntry(addonChecklist, 'ebs-csi', [0, 1, 2], '1.35', dataFreshness.checkedAt);
  addonChecklist = updateAddonChecklistEntry(addonChecklist, 'aws-lb-controller', [0, 1, 2], '1.35', dataFreshness.checkedAt);
  addonChecklist = updateAddonChecklistEntry(addonChecklist, 'karpenter', [0, 1, 2, 4], '1.35', dataFreshness.checkedAt);

  const packet: PacketState = {
    maintenance: {
      start: '2026-06-21T22:00',
      end: '2026-06-22T02:00',
      timezone: 'America/Phoenix',
      impactedServices: 'payments-api, shared ingress, batch workers',
      commsChannel: '#platform-changes',
      changeOwner: 'platform-upgrades',
      approver: 'sre-lead',
      rollbackOwner: 'payments-oncall',
      status: 'approved',
    },
    waiver: {
      owner: 'platform-upgrades',
      reason: 'PodSecurityPolicy and legacy HPA manifests are owned by two app teams; waiver accepted for CAB review while replacements are tracked before execution.',
      approver: 'sre-lead',
      accepted: true,
      acceptedAt: now.toISOString(),
    },
  };

  const execution = updateExecutionStep(
    updateExecutionStep(DEFAULT_EXECUTION_STATE, 'preflight', { status: 'done', notes: 'Evidence packet and CAB ticket attached' }, now),
    'control-plane',
    { status: 'running', notes: 'prod-payments 1.31 -> 1.32 in maintenance window' },
    now,
  );

  return {
    schema: 'eks-upgrade-planner-workspace',
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    dataCheckedAt: dataFreshness.checkedAt,
    planner,
    scannerEvidence: buildScannerEvidence(SAMPLE_MANIFEST, now, { targetVersion: '1.35', rulesCheckedAt: dataFreshness.checkedAt }),
    addonChecklist,
    packet,
    execution,
    nodeModel: 'bluegreen',
  };
}

export function normalizeWorkspaceSnapshot(value: unknown, now = new Date()): WorkspaceSnapshot | null {
  const source = value && typeof value === 'object' ? value as Partial<WorkspaceSnapshot> & Record<string, unknown> : null;
  if (!source) return null;
  const looksLikeWorkspace = source.schema === 'eks-upgrade-planner-workspace'
    || source.schemaVersion === 1
    || Boolean(source.planner)
    || Boolean(source.packet)
    || Boolean(source.execution)
    || Boolean(source.scannerEvidence)
    || Boolean(source.addonChecklist);
  if (!looksLikeWorkspace) return null;

  return {
    schema: 'eks-upgrade-planner-workspace',
    schemaVersion: 1,
    exportedAt: typeof source.exportedAt === 'string' ? source.exportedAt : now.toISOString(),
    dataCheckedAt: typeof source.dataCheckedAt === 'string' ? source.dataCheckedAt : dataFreshness.checkedAt,
    planner: normalizePlannerState(source.planner ?? DEFAULT_PLANNER_STATE),
    scannerEvidence: normalizeScannerEvidence(source.scannerEvidence ?? DEFAULT_SCANNER_EVIDENCE),
    addonChecklist: normalizeAddonChecklistState(source.addonChecklist ?? {}),
    packet: normalizePacketState(source.packet ?? DEFAULT_PACKET_STATE),
    execution: normalizeExecutionState(source.execution ?? DEFAULT_EXECUTION_STATE),
    nodeModel: source.nodeModel === 'rolling' || source.nodeModel === 'bluegreen' ? source.nodeModel : null,
  };
}

export function parseWorkspaceSnapshot(raw: string): WorkspaceImportResult {
  const warnings: string[] = [];
  try {
    const parsed = JSON.parse(raw);
    const snapshot = normalizeWorkspaceSnapshot(parsed);
    if (!snapshot) {
      return { snapshot: null, warnings: ['Input is not an EKS Upgrade Planner workspace snapshot.'] };
    }
    if (snapshot.dataCheckedAt !== dataFreshness.checkedAt) {
      warnings.push(`Workspace data snapshot ${snapshot.dataCheckedAt}; current app data snapshot ${dataFreshness.checkedAt}.`);
    }
    return { snapshot, warnings };
  }
  catch {
    return { snapshot: null, warnings: ['Workspace import requires JSON.'] };
  }
}

export function applyWorkspaceSnapshot(snapshot: WorkspaceSnapshot) {
  writePlannerState(snapshot.planner);
  writeStoredScannerEvidence(snapshot.scannerEvidence);
  writeAddonChecklistState(snapshot.addonChecklist);
  writePacketState(snapshot.packet);
  writeExecutionState(snapshot.execution);
  writeNodeModel(snapshot.nodeModel);
}

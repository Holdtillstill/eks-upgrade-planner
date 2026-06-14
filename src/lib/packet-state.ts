export type MaintenanceStatus = 'missing' | 'scheduled' | 'approved';
export type PacketGateStatus = 'passed' | 'blocked';

export interface MaintenanceWindow {
  start: string;
  end: string;
  timezone: string;
  impactedServices: string;
  commsChannel: string;
  changeOwner: string;
  approver: string;
  rollbackOwner: string;
  status: MaintenanceStatus;
}

export interface WaiverState {
  owner: string;
  reason: string;
  approver: string;
  accepted: boolean;
  acceptedAt: string | null;
}

export interface PacketState {
  maintenance: MaintenanceWindow;
  waiver: WaiverState;
}

export const PACKET_STATE_STORAGE_KEY = 'eks-upgrade-planner:packet-state';

export const DEFAULT_PACKET_STATE: PacketState = {
  maintenance: {
    start: '',
    end: '',
    timezone: 'America/Phoenix',
    impactedServices: '',
    commsChannel: '',
    changeOwner: '',
    approver: '',
    rollbackOwner: '',
    status: 'missing',
  },
  waiver: {
    owner: '',
    reason: '',
    approver: '',
    accepted: false,
    acceptedAt: null,
  },
};

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeMaintenance(value: unknown): MaintenanceWindow {
  const source = typeof value === 'object' && value !== null ? value as Partial<MaintenanceWindow> : {};
  const status = source.status === 'scheduled' || source.status === 'approved' ? source.status : 'missing';
  return {
    start: stringValue(source.start),
    end: stringValue(source.end),
    timezone: stringValue(source.timezone, DEFAULT_PACKET_STATE.maintenance.timezone),
    impactedServices: stringValue(source.impactedServices),
    commsChannel: stringValue(source.commsChannel),
    changeOwner: stringValue(source.changeOwner),
    approver: stringValue(source.approver),
    rollbackOwner: stringValue(source.rollbackOwner),
    status,
  };
}

function normalizeWaiver(value: unknown): WaiverState {
  const source = typeof value === 'object' && value !== null ? value as Partial<WaiverState> : {};
  return {
    owner: stringValue(source.owner),
    reason: stringValue(source.reason),
    approver: stringValue(source.approver),
    accepted: source.accepted === true,
    acceptedAt: typeof source.acceptedAt === 'string' ? source.acceptedAt : null,
  };
}

export function normalizePacketState(value: unknown): PacketState {
  const source = typeof value === 'object' && value !== null ? value as Partial<PacketState> : {};
  return {
    maintenance: normalizeMaintenance(source.maintenance),
    waiver: normalizeWaiver(source.waiver),
  };
}

export function readPacketState(): PacketState {
  if (typeof window === 'undefined') return DEFAULT_PACKET_STATE;
  try {
    const raw = window.localStorage.getItem(PACKET_STATE_STORAGE_KEY);
    return raw ? normalizePacketState(JSON.parse(raw)) : DEFAULT_PACKET_STATE;
  }
  catch {
    return DEFAULT_PACKET_STATE;
  }
}

export function writePacketState(next: PacketState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PACKET_STATE_STORAGE_KEY, JSON.stringify(normalizePacketState(next)));
  }
  catch {
    // Packet state is an approval aid; failing to persist should not block page use.
  }
}

export function maintenanceGateStatus(maintenance: MaintenanceWindow): PacketGateStatus {
  return maintenance.status === 'approved' ? 'passed' : 'blocked';
}

export function maintenanceGateDetail(maintenance: MaintenanceWindow) {
  if (maintenance.status === 'approved') {
    return `Approved by ${maintenance.approver || 'approver'} - ${maintenance.start || 'start TBD'} to ${maintenance.end || 'end TBD'} ${maintenance.timezone}`;
  }
  if (maintenance.status === 'scheduled') {
    return `Scheduled, approver sign-off required - ${maintenance.start || 'start TBD'} to ${maintenance.end || 'end TBD'} ${maintenance.timezone}`;
  }
  return 'Missing maintenance window approval';
}

export function maintenanceStatusLabel(maintenance: MaintenanceWindow) {
  if (maintenance.status === 'approved') return 'Approved';
  if (maintenance.status === 'scheduled') return 'Approval required';
  return 'Missing';
}

export function maintenanceMd(maintenance: MaintenanceWindow) {
  return `Status            : ${maintenance.status}
Start             : ${maintenance.start || 'TBD'}
End               : ${maintenance.end || 'TBD'}
Timezone          : ${maintenance.timezone || 'TBD'}
Impacted services : ${maintenance.impactedServices || 'TBD'}
Comms channel     : ${maintenance.commsChannel || 'TBD'}
Change owner      : ${maintenance.changeOwner || 'TBD'}
Approver          : ${maintenance.approver || 'TBD'}
Rollback owner    : ${maintenance.rollbackOwner || 'TBD'}`;
}

export function waiverIsRecorded(waiver: WaiverState) {
  return waiver.owner.trim().length > 0 && waiver.reason.trim().length > 0;
}

export function waiverIsAccepted(waiver: WaiverState) {
  return waiverIsRecorded(waiver) && waiver.approver.trim().length > 0 && waiver.accepted;
}

export function waiverAcceptedDate(waiver: WaiverState) {
  return waiver.acceptedAt ? waiver.acceptedAt.slice(0, 10) : 'not recorded';
}

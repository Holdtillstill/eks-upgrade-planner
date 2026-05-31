import { addons } from '../data/addons';
import { eksVersions } from '../data/versions';
import { calculateEksSupportExposure, compareEksVersions, daysUntil, getSupportStatus } from '../lib/planner';
import { nodeModelLabels, type NodeModel } from '../lib/reports';

export type FleetItem = {
  id: string;
  label: string;
  version: string;
  targetVersion: string;
  clusters: number;
};

export const defaultFleetItems: FleetItem[] = [
  { id: 'prod-payments', label: 'prod-payments', version: '1.31', targetVersion: '1.35', clusters: 5 },
  { id: 'shared-platform', label: 'shared-platform', version: '1.30', targetVersion: '1.35', clusters: 3 },
  { id: 'dev-sandboxes', label: 'dev-sandboxes', version: '1.33', targetVersion: '1.35', clusters: 4 },
];

export type FleetSummary = {
  totalClusters: number;
  unsupportedClusters: number;
  extendedClusters: number;
  endingSoonClusters: number;
  exposureTotal: number;
  nextDeadline: { version: string; label: string; days: number } | null;
};

export function versionForFleetItem(item: FleetItem) {
  return eksVersions.find((version) => version.version === item.version) ?? eksVersions[0];
}

export function fleetItemClusters(item: FleetItem) {
  return Math.max(1, Math.floor(Number(item.clusters) || 1));
}

export function normalizedFleetItem(item: FleetItem): FleetItem {
  const targetVersion = compareEksVersions(item.targetVersion, item.version) < 0 ? item.version : item.targetVersion;
  return { ...item, targetVersion, clusters: fleetItemClusters(item) };
}

export function summarizeFleet(items: FleetItem[], monthsDelayed: number): FleetSummary {
  return items.reduce<FleetSummary>((summary, rawItem) => {
    const item = normalizedFleetItem(rawItem);
    const version = versionForFleetItem(item);
    const clusters = fleetItemClusters(item);
    const status = getSupportStatus(version);
    const exposure = calculateEksSupportExposure(version, clusters, monthsDelayed);
    const deadlineDate = status === 'standard' || status === 'standard-ending-soon'
      ? version.standardSupportEnd
      : version.extendedSupportEnd;
    const deadlineDays = daysUntil(deadlineDate);
    const deadlineLabel = status === 'standard' || status === 'standard-ending-soon'
      ? `EKS ${version.version} standard support ends ${deadlineDate}`
      : `EKS ${version.version} extended support ends ${deadlineDate}`;
    const nextDeadline = deadlineDays >= 0 && (!summary.nextDeadline || deadlineDays < summary.nextDeadline.days)
      ? { version: version.version, label: deadlineLabel, days: deadlineDays }
      : summary.nextDeadline;

    return {
      totalClusters: summary.totalClusters + clusters,
      unsupportedClusters: summary.unsupportedClusters + (status === 'expired' ? clusters : 0),
      extendedClusters: summary.extendedClusters + (status === 'extended' || status === 'extended-ending-soon' ? clusters : 0),
      endingSoonClusters: summary.endingSoonClusters + (status === 'standard-ending-soon' ? clusters : 0),
      exposureTotal: summary.exposureTotal + (exposure.isPastExtendedSupport ? 0 : exposure.extraTotal),
      nextDeadline,
    };
  }, {
    totalClusters: 0,
    unsupportedClusters: 0,
    extendedClusters: 0,
    endingSoonClusters: 0,
    exposureTotal: 0,
    nextDeadline: null,
  });
}

export const defaultSelectedAddons = Object.fromEntries(addons.map((addon) => [
  addon.id,
  ['vpc-cni', 'coredns', 'kube-proxy', 'karpenter', 'aws-load-balancer-controller'].includes(addon.id),
])) as Record<string, boolean>;

export const nodeModelIds = Object.keys(nodeModelLabels) as NodeModel[];

export function selectedAddonIdsFrom(record: Record<string, boolean>) {
  return addons.filter((addon) => record[addon.id]).map((addon) => addon.id);
}

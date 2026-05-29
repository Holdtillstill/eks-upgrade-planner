import { addons } from '../data/addons';
import { nodeModelLabels, type NodeModel } from '../lib/reports';

export const defaultSelectedAddons = Object.fromEntries(addons.map((addon) => [
  addon.id,
  ['vpc-cni', 'coredns', 'kube-proxy', 'karpenter', 'aws-load-balancer-controller'].includes(addon.id),
])) as Record<string, boolean>;

export const nodeModelIds = Object.keys(nodeModelLabels) as NodeModel[];

export function selectedAddonIdsFrom(record: Record<string, boolean>) {
  return addons.filter((addon) => record[addon.id]).map((addon) => addon.id);
}

import { eksPricing } from '../data/pricing';
import { eksVersions, type EksVersion } from '../data/versions';
import { calculateEksSupportExposure, daysUntil, formatCurrency, getSupportStatus } from './planner';

export const defaultManifest = `apiVersion: networking.k8s.io/v1beta1
kind: Ingress
metadata:
  name: legacy-web
---
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: privileged
---
apiVersion: flowcontrol.apiserver.k8s.io/v1beta3
kind: FlowSchema
metadata:
  name: noisy-tenants`;

export function statusTone(version: EksVersion) {
  const status = getSupportStatus(version);
  if (status === 'standard') return 'ok';
  if (status === 'standard-ending-soon') return 'warn';
  return 'bad';
}

export function costSummary(version: string, clusters: number, months: number, now = new Date()) {
  const selected = eksVersions.find((v) => v.version === version) ?? eksVersions[0];
  const cost = calculateEksSupportExposure(selected, clusters, months, now);
  const alreadyExtended = getSupportStatus(selected, now).includes('extended') || getSupportStatus(selected, now) === 'expired';
  const label = alreadyExtended ? 'current extended-support exposure' : 'modeled exposure before standard support ends';
  const exposureLine = cost.billableDays > 0
    ? `${cost.billableDays} billable extended-support day(s) inside the ${months}-month window`
    : `No extended-support billing inside the ${months}-month window`;
  const text = `EKS ${version} · ${clusters} cluster(s) · ${months} month(s)\nStandard support ends: ${selected.standardSupportEnd}\nExtended support ends: ${selected.extendedSupportEnd}\nStandard monthly: ${formatCurrency(cost.standardMonthly)}\nExtended monthly: ${formatCurrency(cost.extendedMonthly)}\nMonthly rate delta if extended support is reached: ${formatCurrency(cost.extraMonthly)}\n${exposureLine}\nModeled ${months}-month exposure: ${formatCurrency(cost.extraTotal)}\nSource: ${eksPricing.sourceUrl}`;
  return { selected, cost, label, text };
}

export function dialFillClass(extraMonthly: number) {
  const percent = Math.min(100, Math.max(8, extraMonthly / 25));
  if (percent >= 100) return 'fill-100';
  if (percent >= 75) return 'fill-75';
  if (percent >= 50) return 'fill-50';
  if (percent >= 25) return 'fill-25';
  return 'fill-08';
}

export function deadlineCopy(version: EksVersion) {
  const standardDays = daysUntil(version.standardSupportEnd);
  const extendedDays = daysUntil(version.extendedSupportEnd);
  if (standardDays >= 0) return `${standardDays}d until standard support ends`;
  if (extendedDays >= 0) return `${Math.abs(standardDays)}d in extended support`;
  return `${Math.abs(extendedDays)}d past extended support`;
}

export function toggleRecord(record: Record<string, boolean>, key: string) {
  return { ...record, [key]: !record[key] };
}

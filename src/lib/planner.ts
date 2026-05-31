import { eksPricing } from '../data/pricing';
import { deprecations, type DeprecationRule } from '../data/deprecations';
import type { EksVersion } from '../data/versions';

export type SupportStatus = 'standard' | 'standard-ending-soon' | 'extended' | 'extended-ending-soon' | 'expired';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysUntil(date: string, now = new Date()): number {
  const target = new Date(`${date}T00:00:00Z`).getTime();
  const current = billingDay(now).getTime();
  return Math.ceil((target - current) / MS_PER_DAY);
}

export function getSupportStatus(version: EksVersion, now = new Date()): SupportStatus {
  const standardDays = daysUntil(version.standardSupportEnd, now);
  const extendedDays = daysUntil(version.extendedSupportEnd, now);
  if (standardDays > 90) return 'standard';
  if (standardDays > 0) return 'standard-ending-soon';
  if (extendedDays > 90) return 'extended';
  if (extendedDays > 0) return 'extended-ending-soon';
  return 'expired';
}

export function statusLabel(status: SupportStatus): string {
  return {
    standard: 'Standard support',
    'standard-ending-soon': 'Standard support ending soon',
    extended: 'Extended support billing',
    'extended-ending-soon': 'Extended support ending soon',
    expired: 'Past extended support',
  }[status];
}

function billingDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addBillingMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

function dateFromIsoDay(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function calculateEksSupportCost(clusterCount: number, months: number) {
  const standardMonthly = eksPricing.standardPerClusterHour * eksPricing.hoursPerMonth * clusterCount;
  const extendedMonthly = eksPricing.extendedPerClusterHour * eksPricing.hoursPerMonth * clusterCount;
  const extraMonthly = extendedMonthly - standardMonthly;
  return {
    standardMonthly,
    extendedMonthly,
    extraMonthly,
    standardTotal: standardMonthly * months,
    extendedTotal: extendedMonthly * months,
    extraTotal: extraMonthly * months,
    billableHours: eksPricing.hoursPerMonth * months,
    billableMonths: months,
  };
}

export function calculateEksSupportExposure(version: EksVersion, clusterCount: number, months: number, now = new Date()) {
  const rateCard = calculateEksSupportCost(clusterCount, months);
  const start = billingDay(now);
  const end = addBillingMonths(start, months);
  const extendedStart = dateFromIsoDay(version.standardSupportEnd);
  const extendedEnd = dateFromIsoDay(version.extendedSupportEnd);
  // Treat lifecycle ranges as half-open UTC billing days: [standard end, extended end).
  const billableStart = new Date(Math.max(start.getTime(), extendedStart.getTime()));
  const billableEnd = new Date(Math.min(end.getTime(), extendedEnd.getTime()));
  const modeledDays = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / MS_PER_DAY));
  const billableDays = Math.max(0, Math.ceil((billableEnd.getTime() - billableStart.getTime()) / MS_PER_DAY));
  const billableHours = billableDays * 24;
  const billableMonths = billableHours / eksPricing.hoursPerMonth;
  const extraHourly = (eksPricing.extendedPerClusterHour - eksPricing.standardPerClusterHour) * clusterCount;
  const isPastExtendedSupport = start.getTime() >= extendedEnd.getTime();
  const daysPastExtendedSupport = isPastExtendedSupport
    ? Math.max(0, Math.ceil((start.getTime() - extendedEnd.getTime()) / MS_PER_DAY))
    : 0;
  const postExtendedSupportStart = new Date(Math.max(start.getTime(), extendedEnd.getTime()));
  const postExtendedSupportDays = Math.max(0, Math.ceil((end.getTime() - postExtendedSupportStart.getTime()) / MS_PER_DAY));
  const billableWindowClippedByExtendedEnd = billableDays > 0 && postExtendedSupportDays > 0;

  return {
    ...rateCard,
    modeledDays,
    billableDays,
    billableHours,
    billableMonths,
    isPastExtendedSupport,
    daysPastExtendedSupport,
    postExtendedSupportDays,
    postExtendedSupportHours: postExtendedSupportDays * 24,
    billableWindowClippedByExtendedEnd,
    modelStart: isoDay(start),
    modelEnd: isoDay(end),
    billableStart: billableDays ? isoDay(billableStart) : null,
    billableEnd: billableDays ? isoDay(billableEnd) : null,
    standardTotal: eksPricing.standardPerClusterHour * billableHours * clusterCount,
    extendedTotal: eksPricing.extendedPerClusterHour * billableHours * clusterCount,
    extraTotal: extraHourly * billableHours,
  };
}

export function generateHopSequence(current: string, target: string): string[] {
  const [majorA, minorA] = current.split('.').map(Number);
  const [majorB, minorB] = target.split('.').map(Number);
  if (majorA !== majorB || Number.isNaN(minorA) || Number.isNaN(minorB) || minorB < minorA) return [current];
  return Array.from({ length: minorB - minorA + 1 }, (_, i) => `${majorA}.${minorA + i}`);
}

export type ScanFinding = DeprecationRule & { line: number; excerpt: string };

export function scanDeprecatedApis(input: string): ScanFinding[] {
  const lines = input.split(/\r?\n/);
  const findings: ScanFinding[] = [];
  for (const rule of deprecations) {
    for (let i = 0; i < lines.length; i += 1) {
      if (!lines[i].includes(rule.apiVersion)) continue;
      const window = lines.slice(i, Math.min(lines.length, i + 8));
      const kindLine = window.find((line) => new RegExp(`kind:\\s*["']?${rule.kind}["']?`, 'i').test(line));
      if (kindLine) findings.push({ ...rule, line: i + 1, excerpt: window.join('\n') });
    }
  }
  return findings;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export function formatHourlyCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function compareEksVersions(a: string, b: string): number {
  const [majorA, minorA] = a.split('.').map(Number);
  const [majorB, minorB] = b.split('.').map(Number);
  if (majorA !== majorB) return majorA - majorB;
  return minorA - minorB;
}

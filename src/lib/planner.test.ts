import { describe, expect, it } from 'vitest';
import { calculateEksSupportCost, calculateEksSupportExposure, compareEksVersions, formatHourlyCurrency, generateHopSequence, getSupportStatus, scanDeprecatedApis } from './planner';
import { eksVersions } from '../data/versions';

describe('planner utilities', () => {
  it('calculates extended support delta', () => {
    const result = calculateEksSupportCost(2, 3);
    expect(result.standardMonthly).toBe(146);
    expect(result.extendedMonthly).toBe(876);
    expect(result.extraTotal).toBe(2190);
  });

  it('calculates date-aware extended support exposure', () => {
    const now = new Date('2026-05-29T12:00:00Z');
    const version = (value: string) => {
      const found = eksVersions.find((item) => item.version === value);
      if (!found) throw new Error(`missing EKS ${value}`);
      return found;
    };

    expect(calculateEksSupportExposure(version('1.35'), 12, 4, now).extraTotal).toBe(0);
    expect(calculateEksSupportExposure(version('1.35'), 12, 4, now).billableDays).toBe(0);

    const crossingStandardEnd = calculateEksSupportExposure(version('1.33'), 12, 4, now);
    expect(crossingStandardEnd.billableDays).toBe(62);
    expect(crossingStandardEnd.extraTotal).toBe(8928);

    const alreadyExtended = calculateEksSupportExposure(version('1.31'), 12, 4, now);
    expect(alreadyExtended.billableDays).toBe(123);
    expect(alreadyExtended.extraTotal).toBe(17712);

    const endingExtendedSupport = calculateEksSupportExposure(version('1.30'), 12, 8, now);
    expect(endingExtendedSupport.billableDays).toBe(55);
    expect(endingExtendedSupport.extraTotal).toBe(7920);
    expect(endingExtendedSupport.billableWindowClippedByExtendedEnd).toBe(true);
    expect(endingExtendedSupport.postExtendedSupportDays).toBe(190);

    const pastExtendedSupport = calculateEksSupportExposure(version('1.29'), 12, 4, now);
    expect(pastExtendedSupport.isPastExtendedSupport).toBe(true);
    expect(pastExtendedSupport.daysPastExtendedSupport).toBe(67);
    expect(pastExtendedSupport.postExtendedSupportDays).toBe(123);
    expect(pastExtendedSupport.billableDays).toBe(0);
    expect(pastExtendedSupport.extraTotal).toBe(0);
  });

  it('uses the AWS UTC billing day for support exposure windows', () => {
    const latePhoenixDayAfterUtcMidnight = new Date('2026-05-30T05:00:00Z');
    const version = (value: string) => {
      const found = eksVersions.find((item) => item.version === value);
      if (!found) throw new Error(`missing EKS ${value}`);
      return found;
    };

    const nearExtendedEndAccelerate = calculateEksSupportExposure(version('1.30'), 1, 1, latePhoenixDayAfterUtcMidnight);
    expect(nearExtendedEndAccelerate.modelStart).toBe('2026-05-30');
    expect(nearExtendedEndAccelerate.modelEnd).toBe('2026-06-30');
    expect(nearExtendedEndAccelerate.billableDays).toBe(31);
    expect(nearExtendedEndAccelerate.postExtendedSupportDays).toBe(0);
    expect(nearExtendedEndAccelerate.extraTotal).toBe(372);

    const nearExtendedEndBridge = calculateEksSupportExposure(version('1.30'), 1, 2, latePhoenixDayAfterUtcMidnight);
    expect(nearExtendedEndBridge.billableDays).toBe(54);
    expect(nearExtendedEndBridge.postExtendedSupportDays).toBe(7);
    expect(nearExtendedEndBridge.extraTotal).toBe(648);
    expect(nearExtendedEndBridge.billableWindowClippedByExtendedEnd).toBe(true);

    const nearExtendedEndDefer = calculateEksSupportExposure(version('1.30'), 1, 6, latePhoenixDayAfterUtcMidnight);
    expect(nearExtendedEndDefer.billableDays).toBe(54);
    expect(nearExtendedEndDefer.postExtendedSupportDays).toBe(130);
    expect(nearExtendedEndDefer.extraTotal).toBe(648);

    const extendedDefer = calculateEksSupportExposure(version('1.31'), 1, 6, latePhoenixDayAfterUtcMidnight);
    expect(extendedDefer.billableDays).toBe(180);
    expect(extendedDefer.postExtendedSupportDays).toBe(4);
    expect(extendedDefer.extraTotal).toBe(2160);

    const extendedNotClipped = calculateEksSupportExposure(version('1.32'), 1, 6, latePhoenixDayAfterUtcMidnight);
    expect(extendedNotClipped.billableDays).toBe(184);
    expect(extendedNotClipped.extraTotal).toBe(2208);
  });

  it('classifies lifecycle boundary dates consistently with billable support windows', () => {
    const version = eksVersions.find((item) => item.version === '1.31');
    if (!version) throw new Error('missing EKS 1.31');

    expect(getSupportStatus(version, new Date('2025-11-25T12:00:00Z'))).toBe('standard-ending-soon');
    expect(getSupportStatus(version, new Date('2025-11-26T12:00:00Z'))).toBe('extended');
    expect(getSupportStatus(version, new Date('2026-11-26T12:00:00Z'))).toBe('expired');
  });

  it('generates minor-version hops', () => {
    expect(generateHopSequence('1.30', '1.33')).toEqual(['1.30', '1.31', '1.32', '1.33']);
  });

  it('formats hourly rates with cents', () => {
    expect(formatHourlyCurrency(0.1)).toBe('$0.10');
    expect(compareEksVersions('1.35', '1.34')).toBeGreaterThan(0);
  });

  it('detects deprecated apiVersion/kind pairs', () => {
    const manifest = `apiVersion: networking.k8s.io/v1beta1\nkind: Ingress\nmetadata:\n  name: old`;
    const findings = scanDeprecatedApis(manifest);
    expect(findings).toHaveLength(1);
    expect(findings[0].replacement).toContain('networking.k8s.io/v1');
  });
});

import { describe, expect, it } from 'vitest';
import { calculateEksSupportCost, calculateEksSupportExposure, compareEksVersions, formatHourlyCurrency, generateHopSequence, scanDeprecatedApis } from './planner';
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

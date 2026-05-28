import { describe, expect, it } from 'vitest';
import { calculateEksSupportCost, compareEksVersions, formatHourlyCurrency, generateHopSequence, scanDeprecatedApis } from './planner';

describe('planner utilities', () => {
  it('calculates extended support delta', () => {
    const result = calculateEksSupportCost(2, 3);
    expect(result.standardMonthly).toBe(146);
    expect(result.extendedMonthly).toBe(876);
    expect(result.extraTotal).toBe(2190);
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

import { describe, expect, it } from 'vitest';
import { buildVersionGuide, generateCostReport, generateEvidenceReport, generatePlannerMarkdown, scanExampleManifest, scanManifest } from './reports';

describe('report helpers', () => {
  it('builds source-linked version guide markdown', () => {
    const guide = buildVersionGuide('1.31');
    expect(guide.hops[0]).toBe('1.31');
    expect(guide.markdown).toContain('# EKS 1.31 upgrade guide');
    expect(guide.markdown).toContain('Standard support ends: 2025-11-26');
    expect(guide.markdown).toContain('https://endoflife.date/amazon-eks');
    expect(guide.markdown).toContain('Deprecated API checks');
  });

  it('generates cost reports with pricing limits and date-aware exposure', () => {
    const report = generateCostReport('1.35', 2, 3, new Date('2026-05-29T12:00:00Z'));
    expect(report).toContain('Monthly rate delta if extended support is reached: $730');
    expect(report).toContain('Billable extended-support days in modeled window: 0');
    expect(report).toContain('Modeled support-tier exposure: $0');
    expect(report).toContain('Worker nodes, Fargate, EBS');
  });

  it('generates planner and evidence markdown from shared inputs', () => {
    const scannerFindings = scanManifest(scanExampleManifest());
    const input = {
      currentVersion: '1.31',
      targetVersion: '1.33',
      clusterCount: 4,
      monthsDelayed: 2,
      nodeModel: 'karpenter' as const,
      selectedAddonIds: ['vpc-cni', 'karpenter'],
      scannerFindings,
    };

    const planner = generatePlannerMarkdown(input);
    expect(planner).toContain('Node model: Karpenter');
    expect(planner).toContain('EKS 1.31');
    expect(planner).toContain('EKS 1.33');
    expect(planner).toContain('Amazon VPC CNI');
    expect(planner).toContain('line 1');

    const evidence = generateEvidenceReport({ ...input, evidenceVersion: 'test' });
    expect(evidence).toContain('# EKS evidence pack');
    expect(evidence).toContain('Explicit limitations');
    expect(evidence).toContain('does not call AWS APIs');
  });
});

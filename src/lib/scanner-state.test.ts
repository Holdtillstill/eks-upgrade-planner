import { describe, expect, it } from 'vitest';
import { buildExternalScannerEvidence, buildScannerEvidence, findingBlocksTarget, scanManifest, scannerCoverageSummary, scannerEvidenceIsStale } from './scanner-state';

describe('scanner-state', () => {
  it('reports canonical Kubernetes API removal versions', () => {
    const findings = scanManifest(`apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: restricted
---
apiVersion: autoscaling/v2beta2
kind: HorizontalPodAutoscaler
metadata:
  name: payments-hpa`);

    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      apiVersion: 'policy/v1beta1',
      kind: 'PodSecurityPolicy',
      removedIn: 'k8s 1.25',
      lineNumber: 1,
    });
    expect(findings[1]).toMatchObject({
      apiVersion: 'autoscaling/v2beta2',
      kind: 'HorizontalPodAutoscaler',
      removedIn: 'k8s 1.26',
      lineNumber: 6,
    });
  });

  it('does not report current autoscaling/v2 HPAs', () => {
    const findings = scanManifest(`apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: current-hpa`);

    expect(findings).toHaveLength(0);
  });

  it('distinguishes empty, clean, and finding evidence states', () => {
    const now = new Date('2026-06-14T12:00:00Z');

    expect(buildScannerEvidence('', now)).toMatchObject({
      status: 'empty_input',
      manifestLineCount: 0,
      findings: [],
    });

    expect(buildScannerEvidence('apiVersion: apps/v1\nkind: Deployment', now)).toMatchObject({
      status: 'clean',
      manifestLineCount: 2,
      findings: [],
    });

    const withFindings = buildScannerEvidence('apiVersion: policy/v1beta1\nkind: PodSecurityPolicy', now);
    expect(withFindings.status).toBe('findings');
    expect(withFindings.findings[0].removedIn).toBe('k8s 1.25');
  });

  it('summarizes rules that block the selected target version', () => {
    const hpaFinding = scanManifest('apiVersion: autoscaling/v2beta2\nkind: HorizontalPodAutoscaler')[0];

    expect(findingBlocksTarget(hpaFinding, '1.25')).toBe(false);
    expect(findingBlocksTarget(hpaFinding, '1.26')).toBe(true);
    const coverage = scannerCoverageSummary('1.35');
    expect(coverage.targetVersion).toBe('1.35');
    expect(coverage.ruleCount).toBeGreaterThan(0);
    expect(coverage.blockingRuleCount).toBe(coverage.ruleCount);
  });

  it('marks reusable evidence stale when target or rule snapshot changes', () => {
    const evidence = buildScannerEvidence(
      'apiVersion: apps/v1\nkind: Deployment',
      new Date('2026-06-14T12:00:00Z'),
      { targetVersion: '1.35', rulesCheckedAt: '2026-06-04', ruleCount: 11 },
    );

    expect(scannerEvidenceIsStale(evidence, '1.35', '2026-06-04', 11)).toBe(false);
    expect(scannerEvidenceIsStale(evidence, '1.36', '2026-06-04', 11)).toBe(true);
    expect(scannerEvidenceIsStale(evidence, '1.35', '2026-06-14', 11)).toBe(true);
    expect(scannerEvidenceIsStale(evidence, '1.35', '2026-06-04', 12)).toBe(true);
    expect(scannerEvidenceIsStale(buildScannerEvidence('', new Date('2026-06-14T12:00:00Z')), '1.35', '2026-06-04', 11)).toBe(false);
  });

  it('imports external scanner JSON as evidence with provenance', () => {
    const result = buildExternalScannerEvidence(JSON.stringify({
      tool: 'kubent',
      findings: [
        {
          apiVersion: 'policy/v1beta1',
          kind: 'PodSecurityPolicy',
          name: 'restricted',
          namespace: 'prod',
          removedIn: '1.25',
          replacement: 'Pod Security Admission',
        },
      ],
    }), new Date('2026-06-14T12:00:00Z'), { targetVersion: '1.35', rulesCheckedAt: '2026-06-14', ruleCount: 11 });

    expect(result.sourceType).toBe('kubent');
    expect(result.evidence).toMatchObject({
      status: 'findings',
      inputSource: 'kubent',
      sourceLabel: 'kube-no-trouble import',
      targetVersion: '1.35',
    });
    expect(result.evidence.findings[0]).toMatchObject({
      apiVersion: 'policy/v1beta1',
      kind: 'PodSecurityPolicy',
      removedIn: 'k8s 1.25',
    });
  });
});

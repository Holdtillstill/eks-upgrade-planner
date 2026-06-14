import { deprecations } from '../data/deprecations';

export interface ScannerFinding {
  id: string;
  severity: 'error' | 'warning' | 'info';
  apiVersion: string;
  kind: string;
  removedIn: string;
  replacement: string;
  sourceUrl: string;
  sourceLabel: string;
  lineNumber: number;
  excerpt: string;
}

type DeprecatedApiRule = Omit<ScannerFinding, 'id' | 'lineNumber' | 'excerpt'>;

export type ScanStatus = 'not_scanned' | 'empty_input' | 'clean' | 'findings' | 'scan_error';

export interface ScannerEvidence {
  status: ScanStatus;
  scannedAt: string | null;
  manifestLineCount: number;
  manifestHash: string | null;
  targetVersion: string | null;
  rulesCheckedAt: string | null;
  ruleCount: number;
  inputSource?: 'manifest' | 'kubent' | 'pluto' | 'external';
  sourceLabel?: string;
  findings: ScannerFinding[];
  errorMessage?: string;
}

export interface ScannerEvidenceContext {
  targetVersion?: string | null;
  rulesCheckedAt?: string | null;
  ruleCount?: number;
}

export interface ExternalScannerImportResult {
  evidence: ScannerEvidence;
  sourceType: 'kubent' | 'pluto' | 'external_json' | 'text';
  warnings: string[];
}

export const SCANNER_EVIDENCE_STORAGE_KEY = 'eks-upgrade-planner:scanner-evidence';
export const SCANNER_FINDINGS_STORAGE_KEY = 'eks-upgrade-planner:scanner-findings';

export const DEPRECATED_API_RULES: DeprecatedApiRule[] = deprecations.map(rule => ({
  severity: rule.severity === 'critical' ? 'error' : 'warning',
  apiVersion: rule.apiVersion,
  kind: rule.kind,
  removedIn: `k8s ${rule.removedIn}`,
  replacement: rule.replacement,
  sourceUrl: rule.migrationGuide,
  sourceLabel: rule.sourceLabel,
}));

export const DEFAULT_SCANNER_EVIDENCE: ScannerEvidence = {
  status: 'not_scanned',
  scannedAt: null,
  manifestLineCount: 0,
  manifestHash: null,
  targetVersion: null,
  rulesCheckedAt: null,
  ruleCount: DEPRECATED_API_RULES.length,
  findings: [],
};

export function eksMinor(version: string) {
  const match = /(\d+)\.(\d+)/.exec(version);
  return match ? Number(match[2]) : 0;
}

export function removedMinor(value: string) {
  const match = /(\d+)\.(\d+)/.exec(value);
  return match ? Number(match[2]) : 0;
}

export function findingBlocksTarget(finding: Pick<ScannerFinding, 'removedIn'>, targetVersion: string) {
  return removedMinor(finding.removedIn) <= eksMinor(targetVersion);
}

export function scannerCoverageSummary(targetVersion: string) {
  const blockingRuleCount = DEPRECATED_API_RULES.filter(rule => findingBlocksTarget(rule, targetVersion)).length;
  return {
    ruleCount: DEPRECATED_API_RULES.length,
    blockingRuleCount,
    targetVersion,
  };
}

function scannerContext(context: ScannerEvidenceContext = {}) {
  return {
    targetVersion: context.targetVersion ?? null,
    rulesCheckedAt: context.rulesCheckedAt ?? null,
    ruleCount: context.ruleCount ?? DEPRECATED_API_RULES.length,
  };
}

function yamlScalar(line: string, key: string) {
  const match = new RegExp(`^\\s*${key}:\\s*['"]?([^'"#]+)`).exec(line);
  return match?.[1]?.trim();
}

export function scanManifest(manifest: string): ScannerFinding[] {
  const lines = manifest.split(/\r?\n/);
  const findings: ScannerFinding[] = [];

  lines.forEach((line, index) => {
    const apiVersion = yamlScalar(line, 'apiVersion');
    if (!apiVersion) return;

    let kind = '';
    for (let i = index + 1; i < Math.min(lines.length, index + 12); i += 1) {
      if (/^\s*---\s*$/.test(lines[i]) || yamlScalar(lines[i], 'apiVersion')) break;
      kind = yamlScalar(lines[i], 'kind') ?? kind;
      if (kind) break;
    }

    const rule = DEPRECATED_API_RULES.find(item => item.apiVersion === apiVersion && item.kind === kind);
    if (!rule) return;

    findings.push({
      ...rule,
      id: `${rule.apiVersion}-${rule.kind}-${index + 1}`,
      lineNumber: index + 1,
      excerpt: [line.trim(), kind ? `kind: ${kind}` : 'kind: unknown'].join('\n'),
    });
  });

  return findings;
}

function stringFromRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
}

function normalizeApiVersion(value: string) {
  return value.replace(/^v(?=\d+\.)/, '').trim();
}

function normalizeRemovedIn(value: string) {
  const clean = value.replace(/^v/i, '').replace(/^k8s\s*/i, '').trim();
  const match = /(\d+\.\d+)/.exec(clean);
  return match ? `k8s ${match[1]}` : value;
}

function scannerRecordToFinding(record: Record<string, unknown>, index: number, sourceLabel: string): ScannerFinding | null {
  const apiVersion = normalizeApiVersion(stringFromRecord(record, [
    'apiVersion',
    'api_version',
    'api-version',
    'api',
    'deprecatedAPI',
    'deprecated_api',
  ]));
  const kind = stringFromRecord(record, ['kind', 'resourceKind', 'resource-kind']);
  if (!apiVersion || !kind) return null;

  const rule = DEPRECATED_API_RULES.find(item => item.apiVersion === apiVersion && item.kind === kind);
  const removedIn = normalizeRemovedIn(stringFromRecord(record, [
    'removedIn',
    'removed-in',
    'removed',
    'removedVersion',
    'removed_version',
    'removed-in-version',
  ]) || rule?.removedIn || 'k8s unknown');
  const replacement = stringFromRecord(record, [
    'replacement',
    'replacementApi',
    'replacementAPI',
    'replacement-api',
    'replacement_api',
    'replaceWith',
  ]) || rule?.replacement || 'Review upstream migration guide';
  const name = stringFromRecord(record, ['name', 'resourceName', 'resource-name']);
  const namespace = stringFromRecord(record, ['namespace', 'ns']);
  const fileName = stringFromRecord(record, ['file', 'filename', 'fileName', 'path']);
  const lineNumber = Number(stringFromRecord(record, ['line', 'lineNumber', 'line-number'])) || index + 1;
  const severity: ScannerFinding['severity'] = rule?.severity ?? 'warning';
  const sourceUrl = stringFromRecord(record, ['sourceUrl', 'source', 'url']) || rule?.sourceUrl || 'https://kubernetes.io/docs/reference/using-api/deprecation-guide/';

  return {
    id: `external-${apiVersion}-${kind}-${index + 1}`,
    severity,
    apiVersion,
    kind,
    removedIn,
    replacement,
    sourceUrl,
    sourceLabel: rule?.sourceLabel || sourceLabel,
    lineNumber,
    excerpt: [
      fileName ? `file: ${fileName}` : '',
      namespace ? `namespace: ${namespace}` : '',
      name ? `name: ${name}` : '',
      `apiVersion: ${apiVersion}`,
      `kind: ${kind}`,
    ].filter(Boolean).join('\n'),
  };
}

function collectScannerRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectScannerRecords);
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  const record = value as Record<string, unknown>;
  const direct = stringFromRecord(record, ['apiVersion', 'api_version', 'api-version', 'api', 'deprecatedAPI'])
    && stringFromRecord(record, ['kind', 'resourceKind', 'resource-kind']);
  const nested = ['findings', 'items', 'results', 'Reports', 'reports', 'DeprecatedAPIs', 'deprecatedAPIs']
    .flatMap(key => collectScannerRecords(record[key]));
  return direct ? [record, ...nested] : nested;
}

function sourceTypeFromJson(value: unknown): ExternalScannerImportResult['sourceType'] {
  const text = JSON.stringify(value).toLowerCase();
  if (text.includes('kubent') || text.includes('kube-no-trouble')) return 'kubent';
  if (text.includes('pluto')) return 'pluto';
  return 'external_json';
}

function hasScannerContainer(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.length === 0 || value.some(hasScannerContainer);
  const record = value as Record<string, unknown>;
  if (['findings', 'items', 'results', 'Reports', 'reports', 'DeprecatedAPIs', 'deprecatedAPIs'].some(key => key in record)) {
    return true;
  }
  if (stringFromRecord(record, ['apiVersion', 'api_version', 'api-version', 'api', 'deprecatedAPI'])
    && stringFromRecord(record, ['kind', 'resourceKind', 'resource-kind'])) {
    return true;
  }
  return Object.values(record).some(hasScannerContainer);
}

function sourceLabelFor(type: ExternalScannerImportResult['sourceType']) {
  if (type === 'kubent') return 'kube-no-trouble import';
  if (type === 'pluto') return 'Fairwinds Pluto import';
  if (type === 'external_json') return 'External scanner JSON import';
  return 'External scanner text import';
}

function findingsFromExternalText(raw: string, sourceLabel: string) {
  const findings: ScannerFinding[] = [];
  raw.split(/\r?\n/).forEach((line, index) => {
    const api = /(?:^|\s)([a-z0-9.-]+\/v(?:\d+|[a-z0-9]+)(?:beta\d+|alpha\d+)?)(?:\s|$)/i.exec(line)?.[1];
    if (!api) return;
    const rule = DEPRECATED_API_RULES.find(item => line.includes(item.kind) && item.apiVersion === api);
    const kind = rule?.kind ?? /\b([A-Z][A-Za-z]+(?:[A-Z][A-Za-z]+)*)\b/.exec(line)?.[1] ?? '';
    if (!kind) return;
    findings.push({
      ...(rule ?? {
        severity: 'warning' as const,
        apiVersion: api,
        kind,
        removedIn: normalizeRemovedIn(/(?:removed|deleted)[^\d]*(\d+\.\d+)/i.exec(line)?.[1] ?? 'k8s unknown'),
        replacement: 'Review upstream migration guide',
        sourceUrl: 'https://kubernetes.io/docs/reference/using-api/deprecation-guide/',
        sourceLabel,
      }),
      id: `external-text-${api}-${kind}-${index + 1}`,
      lineNumber: index + 1,
      excerpt: line.trim(),
    });
  });
  return findings;
}

export function manifestLineCount(manifest: string) {
  return manifest.trim().length === 0 ? 0 : manifest.split(/\r?\n/).length;
}

export function manifestHash(manifest: string) {
  if (manifest.trim().length === 0) return null;
  let hash = 0x811c9dc5;
  for (let i = 0; i < manifest.length; i += 1) {
    hash ^= manifest.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function buildScannerEvidence(manifest: string, now = new Date(), context: ScannerEvidenceContext = {}): ScannerEvidence {
  const lineCount = manifestLineCount(manifest);
  const hash = manifestHash(manifest);
  const evidenceContext = scannerContext(context);
  if (!hash) {
    return {
      status: 'empty_input',
      scannedAt: now.toISOString(),
      manifestLineCount: 0,
      manifestHash: null,
      ...evidenceContext,
      inputSource: 'manifest',
      sourceLabel: 'Pasted manifest',
      findings: [],
    };
  }

  try {
    const findings = scanManifest(manifest);
    return {
      status: findings.length > 0 ? 'findings' : 'clean',
      scannedAt: now.toISOString(),
      manifestLineCount: lineCount,
      manifestHash: hash,
      ...evidenceContext,
      inputSource: 'manifest',
      sourceLabel: 'Pasted manifest',
      findings,
    };
  }
  catch (error) {
    return {
      status: 'scan_error',
      scannedAt: now.toISOString(),
      manifestLineCount: lineCount,
      manifestHash: hash,
      ...evidenceContext,
      inputSource: 'manifest',
      sourceLabel: 'Pasted manifest',
      findings: [],
      errorMessage: error instanceof Error ? error.message : 'Scan failed',
    };
  }
}

export function buildExternalScannerEvidence(raw: string, now = new Date(), context: ScannerEvidenceContext = {}): ExternalScannerImportResult {
  const input = raw.trim();
  const evidenceContext = scannerContext(context);
  if (!input) {
    return {
      sourceType: 'text',
      warnings: ['No scanner output provided.'],
      evidence: {
        status: 'empty_input',
        scannedAt: now.toISOString(),
        manifestLineCount: 0,
        manifestHash: null,
        ...evidenceContext,
        inputSource: 'external',
        sourceLabel: 'External scanner import',
        findings: [],
      },
    };
  }

  try {
    const parsed = JSON.parse(input);
    const sourceType = sourceTypeFromJson(parsed);
    const sourceLabel = sourceLabelFor(sourceType);
    const findings = collectScannerRecords(parsed)
      .map((record, index) => scannerRecordToFinding(record, index, sourceLabel))
      .filter((finding): finding is ScannerFinding => Boolean(finding));
    const recognized = hasScannerContainer(parsed);
    return {
      sourceType,
      warnings: findings.length === 0
        ? [recognized ? 'Scanner JSON imported with zero deprecated API findings.' : 'Input JSON did not look like kubent, Pluto, or deprecated API scanner output.']
        : [],
      evidence: {
        status: findings.length > 0 ? 'findings' : recognized ? 'clean' : 'scan_error',
        scannedAt: now.toISOString(),
        manifestLineCount: manifestLineCount(input),
        manifestHash: manifestHash(input),
        ...evidenceContext,
        inputSource: sourceType === 'kubent' || sourceType === 'pluto' ? sourceType : 'external',
        sourceLabel,
        findings,
        errorMessage: recognized ? undefined : 'Unrecognized scanner JSON shape',
      },
    };
  }
  catch {
    const sourceType = 'text';
    const sourceLabel = sourceLabelFor(sourceType);
    const findings = findingsFromExternalText(input, sourceLabel);
    return {
      sourceType,
      warnings: findings.length === 0 ? ['No deprecated API rows were detected in the imported scanner text.'] : [],
      evidence: {
        status: findings.length > 0 ? 'findings' : 'clean',
        scannedAt: now.toISOString(),
        manifestLineCount: manifestLineCount(input),
        manifestHash: manifestHash(input),
        ...evidenceContext,
        inputSource: 'external',
        sourceLabel,
        findings,
      },
    };
  }
}

export function scannerEvidenceForUnscannedManifest(manifest: string, context: ScannerEvidenceContext = {}): ScannerEvidence {
  return {
    status: 'not_scanned',
    scannedAt: null,
    manifestLineCount: manifestLineCount(manifest),
    manifestHash: manifestHash(manifest),
    ...scannerContext(context),
    findings: [],
  };
}

function parseStoredEvidence(raw: string | null): ScannerEvidence | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ScannerEvidence> | ScannerFinding[];
    if (Array.isArray(parsed)) {
      return parsed.length > 0
        ? {
          status: 'findings',
          scannedAt: null,
          manifestLineCount: 0,
          manifestHash: null,
          targetVersion: null,
          rulesCheckedAt: null,
          ruleCount: DEPRECATED_API_RULES.length,
          findings: parsed,
        }
        : DEFAULT_SCANNER_EVIDENCE;
    }
    if (
      parsed &&
      typeof parsed.status === 'string' &&
      Array.isArray(parsed.findings)
    ) {
      return {
        status: parsed.status as ScanStatus,
        scannedAt: typeof parsed.scannedAt === 'string' ? parsed.scannedAt : null,
        manifestLineCount: typeof parsed.manifestLineCount === 'number' ? parsed.manifestLineCount : 0,
        manifestHash: typeof parsed.manifestHash === 'string' ? parsed.manifestHash : null,
        targetVersion: typeof parsed.targetVersion === 'string' ? parsed.targetVersion : null,
        rulesCheckedAt: typeof parsed.rulesCheckedAt === 'string' ? parsed.rulesCheckedAt : null,
        ruleCount: typeof parsed.ruleCount === 'number' ? parsed.ruleCount : DEPRECATED_API_RULES.length,
        inputSource: parsed.inputSource === 'manifest' || parsed.inputSource === 'kubent' || parsed.inputSource === 'pluto' || parsed.inputSource === 'external' ? parsed.inputSource : undefined,
        sourceLabel: typeof parsed.sourceLabel === 'string' ? parsed.sourceLabel : undefined,
        findings: parsed.findings,
        errorMessage: typeof parsed.errorMessage === 'string' ? parsed.errorMessage : undefined,
      };
    }
    return null;
  }
  catch {
    return null;
  }
}

export function readStoredScannerEvidence(): ScannerEvidence {
  if (typeof window === 'undefined') return DEFAULT_SCANNER_EVIDENCE;
  const evidence = parseStoredEvidence(window.localStorage.getItem(SCANNER_EVIDENCE_STORAGE_KEY));
  if (evidence) return evidence;
  return parseStoredEvidence(window.localStorage.getItem(SCANNER_FINDINGS_STORAGE_KEY)) ?? DEFAULT_SCANNER_EVIDENCE;
}

export function writeStoredScannerEvidence(evidence: ScannerEvidence) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SCANNER_EVIDENCE_STORAGE_KEY, JSON.stringify(evidence));
  window.localStorage.removeItem(SCANNER_FINDINGS_STORAGE_KEY);
}

export function readStoredScannerFindings(): ScannerFinding[] {
  return readStoredScannerEvidence().findings;
}

export function writeStoredScannerFindings(findings: ScannerFinding[]) {
  writeStoredScannerEvidence({
    status: findings.length > 0 ? 'findings' : 'clean',
    scannedAt: new Date().toISOString(),
    manifestLineCount: 0,
    manifestHash: null,
    targetVersion: null,
    rulesCheckedAt: null,
    ruleCount: DEPRECATED_API_RULES.length,
    findings,
  });
}

function canReuseEvidence(evidence: ScannerEvidence) {
  return evidence.status === 'clean' || evidence.status === 'findings';
}

export function scannerEvidenceIsStale(evidence: ScannerEvidence, targetVersion: string, rulesCheckedAt: string, ruleCount = DEPRECATED_API_RULES.length) {
  if (!canReuseEvidence(evidence)) return false;
  return evidence.targetVersion !== targetVersion || evidence.rulesCheckedAt !== rulesCheckedAt || evidence.ruleCount !== ruleCount;
}

export function scannerSummary(findings: ScannerFinding[] | ScannerEvidence) {
  const count = Array.isArray(findings) ? findings.length : findings.findings.length;
  return `${count} deprecated API${count === 1 ? '' : 's'}`;
}

export function scannerEvidenceSummary(evidence: ScannerEvidence) {
  switch (evidence.status) {
    case 'not_scanned':
      return 'No manifest scanned';
    case 'empty_input':
      return 'Empty manifest - no evidence captured';
    case 'clean':
      return `Clean scan - ${evidence.manifestLineCount} lines`;
    case 'findings':
      return `${scannerSummary(evidence.findings)} - unresolved`;
    case 'scan_error':
      return 'Scanner error';
  }
}

export function scannerEvidenceMeta(evidence: ScannerEvidence) {
  const parts = [];
  if (evidence.scannedAt) parts.push(`scanned ${evidence.scannedAt.slice(0, 10)}`);
  if (evidence.targetVersion) parts.push(`target EKS ${evidence.targetVersion}`);
  if (evidence.rulesCheckedAt) parts.push(`rules ${evidence.rulesCheckedAt}`);
  if (evidence.ruleCount > 0) parts.push(`${evidence.ruleCount} rules`);
  if (evidence.sourceLabel) parts.push(evidence.sourceLabel);
  if (evidence.manifestLineCount > 0) parts.push(`${evidence.manifestLineCount} lines`);
  if (evidence.manifestHash) parts.push(evidence.manifestHash);
  return parts.join(' · ');
}

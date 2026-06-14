import { ALL_EKS_VERSIONS, DEFAULT_PLANNER_STATE, type PlannerFleetRow } from './planner-state';

export interface FleetImportResult {
  rows: PlannerFleetRow[];
  sourceType: 'json' | 'csv' | 'text';
  warnings: string[];
}

type RowLike = Partial<PlannerFleetRow> & {
  version?: unknown;
  currentVersion?: unknown;
  fromVersion?: unknown;
  targetVersion?: unknown;
  toVersion?: unknown;
  clusterName?: unknown;
  cluster?: unknown;
  arn?: unknown;
  region?: unknown;
};

function normalizeVersion(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const clean = value.replace(/^v/, '').replace(/^EKS\s+/i, '').trim();
  const minor = /^(\d+)\.(\d+)/.exec(clean);
  const version = minor ? `${minor[1]}.${minor[2]}` : clean;
  return ALL_EKS_VERSIONS.includes(version) ? version : fallback;
}

function normalizeRow(value: RowLike, index: number, warnings: string[]): PlannerFleetRow | null {
  if (value.cluster && typeof value.cluster === 'object' && !Array.isArray(value.cluster)) {
    return normalizeRow(value.cluster as RowLike, index, warnings);
  }
  const fallback = DEFAULT_PLANNER_STATE.fleetRows[index] ?? DEFAULT_PLANNER_STATE.fleetRows[0];
  const nameSource = value.name ?? value.clusterName;
  const region = typeof value.region === 'string' && value.region.trim().length > 0 ? value.region.trim() : '';
  const name = typeof nameSource === 'string' && nameSource.trim().length > 0
    ? `${nameSource.trim()}${region ? ` (${region})` : ''}`
    : `imported-scope-${index + 1}`;
  const from = normalizeVersion(value.from ?? value.fromVersion ?? value.version ?? value.currentVersion, fallback.from);
  const to = normalizeVersion(value.to ?? value.toVersion ?? value.targetVersion, DEFAULT_PLANNER_STATE.fleetRows[0].to);
  const clusters = Number.isFinite(Number(value.clusters)) ? Math.max(1, Math.round(Number(value.clusters))) : 1;
  if (from === fallback.from && value.from !== fallback.from && value.version !== fallback.from && value.currentVersion !== fallback.from && value.fromVersion !== fallback.from) {
    warnings.push(`${name}: source version missing or unsupported; defaulted to EKS ${from}`);
  }
  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id.trim() : `import-${Date.now()}-${index}`,
    name,
    from,
    to: ALL_EKS_VERSIONS.indexOf(to) < ALL_EKS_VERSIONS.indexOf(from) ? from : to,
    clusters,
  };
}

function rowsFromJson(parsed: unknown, warnings: string[]) {
  const candidate = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(candidate.fleetRows)
      ? candidate.fleetRows
      : Array.isArray(candidate.rows)
        ? candidate.rows
        : Array.isArray(candidate.items)
          ? candidate.items
        : Array.isArray(candidate.clusters)
          ? candidate.clusters.map(item => typeof item === 'string' ? { name: item } : item)
          : candidate.cluster
            ? [candidate.cluster]
            : [];
  return rows
    .map((row, index) => normalizeRow(row as RowLike, index, warnings))
    .filter((row): row is PlannerFleetRow => Boolean(row));
}

function splitDelimitedLine(line: string) {
  return line.includes('\t') ? line.split('\t') : line.split(',');
}

function rowsFromDelimited(raw: string, warnings: string[]) {
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const header = splitDelimitedLine(lines[0]).map(cell => cell.trim().toLowerCase());
  const hasHeader = header.some(cell => ['name', 'group', 'route group', 'from', 'current', 'version', 'to', 'target', 'clusters'].includes(cell));
  const body = hasHeader ? lines.slice(1) : lines;
  const columns = hasHeader ? header : ['name', 'from', 'to', 'clusters'];
  return body.map((line, index) => {
    const cells = splitDelimitedLine(line).map(cell => cell.trim());
    const row: RowLike = {};
    cells.forEach((cell, cellIndex) => {
      const column = columns[cellIndex] ?? '';
      if (['name', 'group', 'route group', 'cluster', 'cluster name'].includes(column)) row.name = cell;
      if (['from', 'source', 'current', 'version', 'current version'].includes(column)) row.from = cell;
      if (['to', 'target', 'target version'].includes(column)) row.to = cell;
      if (['clusters', 'cluster count', 'count'].includes(column)) row.clusters = Number(cell);
    });
    if (!row.name && cells[0]) row.name = cells[0];
    if (!row.from && cells[1]) row.from = cells[1];
    if (!row.to && cells[2]) row.to = cells[2];
    if (!row.clusters && cells[3]) row.clusters = Number(cells[3]);
    return normalizeRow(row, index, warnings);
  }).filter((row): row is PlannerFleetRow => Boolean(row));
}

function rowsFromText(raw: string, warnings: string[]) {
  const describeMatches = [...raw.matchAll(/"name"\s*:\s*"([^"]+)"[\s\S]{0,900}?"version"\s*:\s*"([^"]+)"/g)];
  if (describeMatches.length > 0) {
    return describeMatches.map((match, index) => normalizeRow({ name: match[1], version: match[2] }, index, warnings))
      .filter((row): row is PlannerFleetRow => Boolean(row));
  }
  const serverVersion = /Server Version:\s*v?(\d+\.\d+)/i.exec(raw);
  if (serverVersion) {
    return [normalizeRow({ name: 'kubectl-context', version: serverVersion[1] }, 0, warnings)]
      .filter((row): row is PlannerFleetRow => Boolean(row));
  }
  const awsCliRows = [...raw.matchAll(/([\w./:-]+)\s+(?:ACTIVE|CREATING|UPDATING|DELETING|FAILED)?\s*v?(\d+\.\d+)/gi)];
  if (awsCliRows.length > 0) {
    return awsCliRows
      .filter(match => !/version:?$/i.test(match[1]))
      .map((match, index) => normalizeRow({ name: match[1], version: match[2] }, index, warnings))
      .filter((row): row is PlannerFleetRow => Boolean(row));
  }
  return rowsFromDelimited(raw, warnings);
}

export function parseFleetImport(raw: string): FleetImportResult {
  const input = raw.trim();
  const warnings: string[] = [];
  if (!input) return { rows: [], sourceType: 'text', warnings: ['No input provided.'] };
  try {
    const rows = rowsFromJson(JSON.parse(input), warnings);
    return { rows, sourceType: 'json', warnings };
  }
  catch {
    const looksDelimited = input.includes(',') || input.includes('\t');
    const rows = looksDelimited ? rowsFromDelimited(input, warnings) : rowsFromText(input, warnings);
    return { rows, sourceType: looksDelimited ? 'csv' : 'text', warnings };
  }
}

export function fleetToCsv(rows: PlannerFleetRow[]) {
  return [
    'name,from,to,clusters',
    ...rows.map(row => `${row.name},${row.from},${row.to},${row.clusters}`),
  ].join('\n');
}

export function fleetToJson(rows: PlannerFleetRow[]) {
  return JSON.stringify({ fleetRows: rows }, null, 2);
}

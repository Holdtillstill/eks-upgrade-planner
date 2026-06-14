import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const AWS_LIFECYCLE_URL = 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.md';
export const AWS_PLATFORM_URL = 'https://docs.aws.amazon.com/eks/latest/userguide/platform-versions.md';
export const AWS_LIFECYCLE_HTML_URL = 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html';
export const AWS_PLATFORM_HTML_URL = 'https://docs.aws.amazon.com/eks/latest/userguide/platform-versions.html';
export const ENDOFLIFE_EKS_URL = 'https://endoflife.date/api/amazon-eks.json';

class SourceFetchError extends Error {
  constructor(message, { url, status, cause } = {}) {
    super(message);
    this.name = 'SourceFetchError';
    this.url = url;
    this.status = status;
    this.cause = cause;
  }
}

const END_OF_LIFE_SOURCE_LABEL = 'endoflife.date Amazon EKS lifecycle archive';
const END_OF_LIFE_SOURCE_URL = 'https://endoflife.date/amazon-eks';
const AWS_SOURCE_LABEL = 'AWS EKS Kubernetes version lifecycle';
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSIONS_TS_PATH = path.join(ROOT_DIR, 'src/data/versions.ts');
const PUBLIC_ROUTES_PATH = path.join(ROOT_DIR, 'scripts/public-routes.js');
const SERVER_ROUTES_PATH = path.join(ROOT_DIR, 'server/routes.js');
const monthIndexes = new Map([
  ['January', '01'],
  ['February', '02'],
  ['March', '03'],
  ['April', '04'],
  ['May', '05'],
  ['June', '06'],
  ['July', '07'],
  ['August', '08'],
  ['September', '09'],
  ['October', '10'],
  ['November', '11'],
  ['December', '12'],
]);

function usage() {
  return [
    'Usage: node scripts/sync-eks-data.js --check|--write',
    '',
    '--check  Validate static EKS lifecycle data against live source docs and fail on drift.',
    '--write  Update EKS data and route metadata when source docs drift.',
  ].join('\n');
}

function normalizeCell(value) {
  return value.replaceAll('\\+', '+').replace(/\s+/g, ' ').trim();
}

function decodeHtml(value) {
  return value
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function htmlText(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function htmlRows(source) {
  return [...source.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
}

function htmlCells(row) {
  return [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => htmlText(match[1]));
}

export function dateToIso(value) {
  const normalized = normalizeCell(value);
  const match = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})$/.exec(normalized);
  if (!match) throw new Error(`Expected exact Month D, YYYY date, received "${value}"`);
  const [, month, day, year] = match;
  return `${year}-${monthIndexes.get(month)}-${day.padStart(2, '0')}`;
}

export function compareEksVersions(a, b) {
  const [aMajor, aMinor] = a.split('.').map(Number);
  const [bMajor, bMinor] = b.split('.').map(Number);
  return aMajor === bMajor ? aMinor - bMinor : aMajor - bMajor;
}

export function parseAwsLifecycleMarkdown(markdown) {
  const versions = new Map();
  const rowPattern = /\|\s*`(?<version>1\.\d+)`\s*\|\s*(?<upstream>[^|]+)\|\s*(?<release>[^|]+)\|\s*(?<standard>[^|]+)\|\s*(?<extended>[^|]+)\|/g;
  for (const match of markdown.matchAll(rowPattern)) {
    const { version, release, standard, extended } = match.groups;
    versions.set(version, {
      version,
      releaseDate: dateToIso(release),
      standardSupportEnd: dateToIso(standard),
      extendedSupportEnd: dateToIso(extended),
      sourceLabel: AWS_SOURCE_LABEL,
      sourceUrl: AWS_LIFECYCLE_HTML_URL,
    });
  }
  if (versions.size === 0) throw new Error('Could not parse any EKS lifecycle rows from AWS documentation');
  return versions;
}

export function parseAwsLifecycleHtml(html) {
  const versions = new Map();
  for (const row of htmlRows(html)) {
    const cells = htmlCells(row);
    if (cells.length < 5 || !/^1\.\d+$/.test(cells[0])) continue;
    versions.set(cells[0], {
      version: cells[0],
      releaseDate: dateToIso(cells[2]),
      standardSupportEnd: dateToIso(cells[3]),
      extendedSupportEnd: dateToIso(cells[4]),
      sourceLabel: AWS_SOURCE_LABEL,
      sourceUrl: AWS_LIFECYCLE_HTML_URL,
    });
  }
  if (versions.size === 0) throw new Error('Could not parse any EKS lifecycle rows from AWS HTML documentation');
  return versions;
}

export function parseAwsPlatformMarkdown(markdown) {
  const platforms = new Map();
  const sectionPattern = /## Kubernetes version `(?<version>1\.\d+)`[\s\S]*?(?=\n## Kubernetes version `|$)/g;
  for (const sectionMatch of markdown.matchAll(sectionPattern)) {
    const { version } = sectionMatch.groups;
    const section = sectionMatch[0];
    const rowMatch = /\|\s*`1\.\d+\.\d+`\s*\|\s*`eks\.(?<platform>\d+)`\s*\|/.exec(section);
    if (rowMatch?.groups?.platform) {
      platforms.set(version, `${version}-eks-${rowMatch.groups.platform}`);
    }
  }
  if (platforms.size === 0) throw new Error('Could not parse any EKS platform rows from AWS documentation');
  return platforms;
}

export function parseAwsPlatformHtml(html) {
  const platforms = new Map();
  const sectionPattern = /<h2\b[^>]*>\s*Kubernetes version\s*<code\b[^>]*>(?<version>1\.\d+)<\/code><\/h2>(?<section>[\s\S]*?)(?=<h2\b[^>]*>\s*Kubernetes version\s*<code\b|$)/gi;
  for (const sectionMatch of html.matchAll(sectionPattern)) {
    const { version, section } = sectionMatch.groups;
    for (const row of htmlRows(section)) {
      const cells = htmlCells(row);
      const platformMatch = /^eks\.(\d+)$/.exec(cells[1] || '');
      if (cells[0]?.startsWith(`${version}.`) && platformMatch) {
        platforms.set(version, `${version}-eks-${platformMatch[1]}`);
        break;
      }
    }
  }
  if (platforms.size === 0) throw new Error('Could not parse any EKS platform rows from AWS HTML documentation');
  return platforms;
}

export function parseEndOfLifeData(json) {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('endoflife.date response was not an array');
  return new Map(parsed.map((item) => [item.cycle, item]));
}

function extractArrayLiteral(source, exportName) {
  const expression = new RegExp(`(?:export\\s+)?const ${exportName}(?::[^=]+)? = (\\[[\\s\\S]*?\\n\\]);`);
  const match = expression.exec(source);
  if (!match) throw new Error(`Could not find ${exportName} array`);
  return match[1];
}

export function parseStaticVersions(source, exportName = 'eksVersions') {
  const literal = extractArrayLiteral(source, exportName);
  return Function(`"use strict"; return (${literal});`)();
}

function formatVersionObject(version) {
  const entries = [
    `version: '${version.version}'`,
    `releaseDate: '${version.releaseDate}'`,
    `standardSupportEnd: '${version.standardSupportEnd}'`,
    `extendedSupportEnd: '${version.extendedSupportEnd}'`,
    version.latestPlatform ? `latestPlatform: '${version.latestPlatform}'` : null,
    `sourceLabel: '${version.sourceLabel}'`,
    `sourceUrl: '${version.sourceUrl}'`,
    version.notesUrl ? `notesUrl: '${version.notesUrl}'` : null,
    version.releaseUrl ? `releaseUrl: '${version.releaseUrl}'` : null,
  ].filter(Boolean);
  return `  { ${entries.join(', ')} }`;
}

function formatVersionsArray(versions) {
  return `[\n${versions.map(formatVersionObject).join(',\n')},\n]`;
}

function formatStringArray(values) {
  return `[\n${values.map((value) => `  '${value}'`).join(',\n')},\n]`;
}

function replaceVersionsArray(source, exportName, versions) {
  const literal = extractArrayLiteral(source, exportName);
  return source.replace(literal, formatVersionsArray(versions));
}

export function parseStringArray(source, exportName) {
  const literal = extractArrayLiteral(source, exportName);
  const value = Function(`"use strict"; return (${literal});`)();
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${exportName} must be an array of strings`);
  }
  return value;
}

function replaceStringArray(source, exportName, values) {
  const literal = extractArrayLiteral(source, exportName);
  return source.replace(literal, formatStringArray(values));
}

function replaceCheckedAt(source, checkedAt) {
  return source.replace(/checkedAt: '\d{4}-\d{2}-\d{2}'/, `checkedAt: '${checkedAt}'`);
}

function sourceCheckedAt() {
  return process.env.DATA_CHECKED_AT || new Date().toISOString().slice(0, 10);
}

export function buildExpectedVersions(existingVersions, lifecycleVersions, platformVersions, endOfLifeVersions) {
  const existingByVersion = new Map(existingVersions.map((version) => [version.version, version]));
  const liveVersions = [...lifecycleVersions.values()].sort((a, b) => compareEksVersions(b.version, a.version));
  const archivedExistingVersions = existingVersions
    .filter((version) => !lifecycleVersions.has(version.version))
    .sort((a, b) => compareEksVersions(b.version, a.version));

  return [...liveVersions, ...archivedExistingVersions].map((version) => {
    const existing = existingByVersion.get(version.version) ?? {};
    if (lifecycleVersions.has(version.version)) {
      return {
        ...existing,
        ...version,
        latestPlatform: platformVersions.get(version.version) ?? existing.latestPlatform,
        sourceLabel: AWS_SOURCE_LABEL,
        sourceUrl: AWS_LIFECYCLE_HTML_URL,
      };
    }

    const archived = endOfLifeVersions.get(version.version);
    if (!archived) throw new Error(`Version ${version.version} is not in AWS current docs or endoflife.date archive`);
    if (archived.extendedSupport === false) throw new Error(`Version ${version.version} has no extendedSupport date in endoflife.date`);
    return {
      ...existing,
      version: version.version,
      releaseDate: archived.releaseDate,
      standardSupportEnd: archived.eol,
      extendedSupportEnd: archived.extendedSupport,
      latestPlatform: archived.latest,
      sourceLabel: END_OF_LIFE_SOURCE_LABEL,
      sourceUrl: END_OF_LIFE_SOURCE_URL,
    };
  });
}

function diffVersions(existing, expected) {
  const diffs = [];
  const max = Math.max(existing.length, expected.length);
  for (let index = 0; index < max; index += 1) {
    const current = existing[index];
    const next = expected[index];
    if (!current) {
      diffs.push(`+ EKS ${next.version} should be added`);
      continue;
    }
    if (!next) {
      diffs.push(`- EKS ${current.version} should be removed`);
      continue;
    }
    if (current.version !== next.version) {
      diffs.push(`~ row ${index + 1}: expected EKS ${next.version}, found EKS ${current.version}`);
      continue;
    }
    for (const key of ['releaseDate', 'standardSupportEnd', 'extendedSupportEnd', 'latestPlatform', 'sourceLabel', 'sourceUrl', 'notesUrl', 'releaseUrl']) {
      if ((current[key] ?? null) !== (next[key] ?? null)) {
        diffs.push(`~ EKS ${current.version} ${key}: ${current[key] ?? 'missing'} -> ${next[key] ?? 'missing'}`);
      }
    }
  }
  return diffs;
}

function versionGuideRoute(version) {
  return `/eks/${version.version.replaceAll('.', '-')}-upgrade-guide`;
}

function buildExpectedGuideRoutes(versions) {
  return versions.map(versionGuideRoute);
}

function diffStringArray(existing, expected) {
  const diffs = [];
  const max = Math.max(existing.length, expected.length);
  for (let index = 0; index < max; index += 1) {
    const current = existing[index];
    const next = expected[index];
    if (!current) {
      diffs.push(`+ route ${next} should be added`);
      continue;
    }
    if (!next) {
      diffs.push(`- route ${current} should be removed`);
      continue;
    }
    if (current !== next) {
      diffs.push(`~ route ${index + 1}: expected ${next}, found ${current}`);
    }
  }
  return diffs;
}

async function fetchText(url) {
  if (process.env.EKS_DATA_FORCE_FETCH_FAILURE === '1') {
    throw new SourceFetchError(`Forced source fetch failure for ${url}`, { url });
  }
  let response;
  try {
    response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; eks-upgrade-planner-data-sync/1.0; +https://eks-upgrade-planner.bozhi.dev)',
        accept: 'text/markdown,text/html,application/json,text/plain;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
      },
    });
  } catch (error) {
    throw new SourceFetchError(`Failed to fetch ${url}: ${error.message}`, { url, cause: error });
  }
  if (!response.ok) {
    throw new SourceFetchError(`Failed to fetch ${url}: ${response.status} ${response.statusText}`, {
      url,
      status: response.status,
    });
  }
  return response.text();
}

async function fetchSource(primaryUrl, fallbackUrl) {
  try {
    return { format: 'markdown', text: await fetchText(primaryUrl) };
  } catch (primaryError) {
    if (!fallbackUrl) throw primaryError;
    try {
      const fallbackText = await fetchText(fallbackUrl);
      return { format: 'html', text: fallbackText };
    } catch (fallbackError) {
      throw new SourceFetchError(
        `Failed to fetch ${primaryUrl} or fallback ${fallbackUrl}: ${primaryError.message}; ${fallbackError.message}`,
        { url: fallbackUrl, status: fallbackError.status, cause: fallbackError },
      );
    }
  }
}

async function loadLiveSources() {
  const [lifecycleSource, platformSource, endOfLifeJson] = await Promise.all([
    fetchSource(AWS_LIFECYCLE_URL, AWS_LIFECYCLE_HTML_URL),
    fetchSource(AWS_PLATFORM_URL, AWS_PLATFORM_HTML_URL),
    fetchText(ENDOFLIFE_EKS_URL),
  ]);
  return {
    lifecycleVersions: lifecycleSource.format === 'html'
      ? parseAwsLifecycleHtml(lifecycleSource.text)
      : parseAwsLifecycleMarkdown(lifecycleSource.text),
    platformVersions: platformSource.format === 'html'
      ? parseAwsPlatformHtml(platformSource.text)
      : parseAwsPlatformMarkdown(platformSource.text),
    endOfLifeVersions: parseEndOfLifeData(endOfLifeJson),
  };
}

export async function syncEksData({ write = false } = {}) {
  const [versionsSource, publicRoutesSource, serverRoutesSource] = await Promise.all([
    fs.readFile(VERSIONS_TS_PATH, 'utf8'),
    fs.readFile(PUBLIC_ROUTES_PATH, 'utf8'),
    fs.readFile(SERVER_ROUTES_PATH, 'utf8'),
  ]);
  const sourceVersions = parseStaticVersions(versionsSource, 'eksVersions');
  const publicVersions = parseStaticVersions(publicRoutesSource, 'publicEksVersions');
  const serverGuideRoutes = parseStringArray(serverRoutesSource, 'EKS_GUIDE_ROUTES');
  let liveSources;
  try {
    liveSources = await loadLiveSources();
  } catch (error) {
    if (error instanceof SourceFetchError) {
      return {
        changed: false,
        diffs: [],
        expectedVersions: sourceVersions,
        skipped: true,
        warnings: [
          `EKS live source check skipped: ${error.message}`,
          'Checked-in static data was left unchanged. Data drift will be detected when the public sources are reachable again.',
        ],
      };
    }
    throw error;
  }
  const expectedVersions = buildExpectedVersions(
    sourceVersions,
    liveSources.lifecycleVersions,
    liveSources.platformVersions,
    liveSources.endOfLifeVersions,
  );
  const sourceDiffs = diffVersions(sourceVersions, expectedVersions);
  const publicDiffs = diffVersions(publicVersions, expectedVersions);
  const expectedGuideRoutes = buildExpectedGuideRoutes(expectedVersions);
  const serverRouteDiffs = diffStringArray(serverGuideRoutes, expectedGuideRoutes);
  const diffs = [
    ...sourceDiffs.map((diff) => `src/data/versions.ts ${diff}`),
    ...publicDiffs.map((diff) => `scripts/public-routes.js ${diff}`),
    ...serverRouteDiffs.map((diff) => `server/routes.js ${diff}`),
  ];

  if (!write) {
    if (diffs.length > 0) {
      throw new Error(`EKS static data drift detected:\n${diffs.join('\n')}\nRun npm run data:update to refresh the checked-in dataset.`);
    }
    return { changed: false, diffs, expectedVersions };
  }

  if (diffs.length === 0) {
    return { changed: false, diffs, expectedVersions };
  }

  const checkedAt = sourceCheckedAt();
  const nextVersionsSource = replaceCheckedAt(
    replaceVersionsArray(versionsSource, 'eksVersions', expectedVersions),
    checkedAt,
  );
  const nextPublicRoutesSource = replaceVersionsArray(publicRoutesSource, 'publicEksVersions', expectedVersions);
  const nextServerRoutesSource = replaceStringArray(serverRoutesSource, 'EKS_GUIDE_ROUTES', expectedGuideRoutes);
  await Promise.all([
    fs.writeFile(VERSIONS_TS_PATH, nextVersionsSource),
    fs.writeFile(PUBLIC_ROUTES_PATH, nextPublicRoutesSource),
    fs.writeFile(SERVER_ROUTES_PATH, nextServerRoutesSource),
  ]);
  return { changed: true, diffs, expectedVersions };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const write = args.has('--write');
  const check = args.has('--check');
  if (write === check) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  const result = await syncEksData({ write });
  if (write) {
    if (result.skipped) {
      console.warn(result.warnings.join('\n'));
      console.log('Skipped EKS data refresh because live sources were unavailable.');
      return;
    }
    console.log(result.changed ? 'Updated EKS static data from live sources.' : 'EKS static data already matches live sources.');
    return;
  }
  if (result.skipped) {
    console.warn(result.warnings.join('\n'));
    console.log('Skipped EKS static data drift check because live sources were unavailable.');
    return;
  }
  console.log('EKS static data matches live sources.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

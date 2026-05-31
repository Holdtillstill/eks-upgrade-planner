import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const AWS_LIFECYCLE_URL = 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.md';
export const AWS_PLATFORM_URL = 'https://docs.aws.amazon.com/eks/latest/userguide/platform-versions.md';
export const AWS_LIFECYCLE_HTML_URL = 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html';
export const ENDOFLIFE_EKS_URL = 'https://endoflife.date/api/amazon-eks.json';

const END_OF_LIFE_SOURCE_LABEL = 'endoflife.date Amazon EKS lifecycle archive';
const END_OF_LIFE_SOURCE_URL = 'https://endoflife.date/amazon-eks';
const AWS_SOURCE_LABEL = 'AWS EKS Kubernetes version lifecycle';
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSIONS_TS_PATH = path.join(ROOT_DIR, 'src/data/versions.ts');
const PUBLIC_ROUTES_PATH = path.join(ROOT_DIR, 'scripts/public-routes.js');
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
    '--write  Update src/data/versions.ts and scripts/public-routes.js when source docs drift.',
  ].join('\n');
}

function normalizeCell(value) {
  return value.replaceAll('\\+', '+').replace(/\s+/g, ' ').trim();
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

export function parseEndOfLifeData(json) {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('endoflife.date response was not an array');
  return new Map(parsed.map((item) => [item.cycle, item]));
}

function extractArrayLiteral(source, exportName) {
  const expression = new RegExp(`export const ${exportName}(?::[^=]+)? = (\\[[\\s\\S]*?\\n\\]);`);
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
    version.releaseUrl ? `releaseUrl: '${version.releaseUrl}'` : null,
  ].filter(Boolean);
  return `  { ${entries.join(', ')} }`;
}

function formatVersionsArray(versions) {
  return `[\n${versions.map(formatVersionObject).join(',\n')},\n]`;
}

function replaceVersionsArray(source, exportName, versions) {
  const literal = extractArrayLiteral(source, exportName);
  return source.replace(literal, formatVersionsArray(versions));
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
    for (const key of ['releaseDate', 'standardSupportEnd', 'extendedSupportEnd', 'latestPlatform', 'sourceLabel', 'sourceUrl', 'releaseUrl']) {
      if ((current[key] ?? null) !== (next[key] ?? null)) {
        diffs.push(`~ EKS ${current.version} ${key}: ${current[key] ?? 'missing'} -> ${next[key] ?? 'missing'}`);
      }
    }
  }
  return diffs;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'eks-upgrade-planner-data-sync/1.0',
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  return response.text();
}

async function loadLiveSources() {
  const [lifecycleMarkdown, platformMarkdown, endOfLifeJson] = await Promise.all([
    fetchText(AWS_LIFECYCLE_URL),
    fetchText(AWS_PLATFORM_URL),
    fetchText(ENDOFLIFE_EKS_URL),
  ]);
  return {
    lifecycleVersions: parseAwsLifecycleMarkdown(lifecycleMarkdown),
    platformVersions: parseAwsPlatformMarkdown(platformMarkdown),
    endOfLifeVersions: parseEndOfLifeData(endOfLifeJson),
  };
}

export async function syncEksData({ write = false } = {}) {
  const [versionsSource, publicRoutesSource] = await Promise.all([
    fs.readFile(VERSIONS_TS_PATH, 'utf8'),
    fs.readFile(PUBLIC_ROUTES_PATH, 'utf8'),
  ]);
  const sourceVersions = parseStaticVersions(versionsSource, 'eksVersions');
  const publicVersions = parseStaticVersions(publicRoutesSource, 'publicEksVersions');
  const liveSources = await loadLiveSources();
  const expectedVersions = buildExpectedVersions(
    sourceVersions,
    liveSources.lifecycleVersions,
    liveSources.platformVersions,
    liveSources.endOfLifeVersions,
  );
  const sourceDiffs = diffVersions(sourceVersions, expectedVersions);
  const publicDiffs = diffVersions(publicVersions, expectedVersions);
  const diffs = [
    ...sourceDiffs.map((diff) => `src/data/versions.ts ${diff}`),
    ...publicDiffs.map((diff) => `scripts/public-routes.js ${diff}`),
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
  await Promise.all([
    fs.writeFile(VERSIONS_TS_PATH, nextVersionsSource),
    fs.writeFile(PUBLIC_ROUTES_PATH, nextPublicRoutesSource),
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
    console.log(result.changed ? 'Updated EKS static data from live sources.' : 'EKS static data already matches live sources.');
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

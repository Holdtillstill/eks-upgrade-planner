import { describe, expect, it } from 'vitest';
import {
  buildExpectedVersions,
  parseAwsLifecycleHtml,
  parseAwsLifecycleMarkdown,
  parseAwsPlatformHtml,
  parseAwsPlatformMarkdown,
  parseEndOfLifeData,
  parseStringArray,
} from './sync-eks-data.js';

describe('EKS data sync helpers', () => {
  it('parses AWS lifecycle table rows into ISO dates', () => {
    const parsed = parseAwsLifecycleMarkdown(`
| Kubernetes version | Upstream release | Amazon EKS release | End of standard support | End of extended support |
| --- | --- | --- | --- | --- |
|  \`1.35\`  | December 17, 2025 | January 27, 2026 | March 27, 2027 | March 27, 2028 |
`);

    expect(parsed.get('1.35')).toMatchObject({
      version: '1.35',
      releaseDate: '2026-01-27',
      standardSupportEnd: '2027-03-27',
      extendedSupportEnd: '2028-03-27',
    });
  });

  it('parses AWS lifecycle HTML table rows into ISO dates', () => {
    const parsed = parseAwsLifecycleHtml(`
<table>
  <tr>
    <td><p><code class="code">1.36</code></p></td>
    <td><p>April 22, 2026</p></td>
    <td><p>June 2, 2026</p></td>
    <td><p>August 2, 2027</p></td>
    <td><p>August 2, 2028</p></td>
  </tr>
</table>
`);

    expect(parsed.get('1.36')).toMatchObject({
      version: '1.36',
      releaseDate: '2026-06-02',
      standardSupportEnd: '2027-08-02',
      extendedSupportEnd: '2028-08-02',
    });
  });

  it('uses the newest platform row from each AWS platform section', () => {
    const parsed = parseAwsPlatformMarkdown(`
## Kubernetes version \`1.35\`

| Kubernetes version | EKS platform version | Release notes | Release date |
| --- | --- | --- | --- |
|  \`1.35.4\`  |  \`eks.13\`  | New platform version. | May 19, 2026 |
|  \`1.35.2\`  |  \`eks.9\`  | New platform version. | April 3, 2026 |

## Kubernetes version \`1.34\`

| Kubernetes version | EKS platform version | Release notes | Release date |
| --- | --- | --- | --- |
|  \`1.34.7\`  |  \`eks.23\`  | New platform version. | May 19, 2026 |
`);

    expect(parsed.get('1.35')).toBe('1.35-eks-13');
    expect(parsed.get('1.34')).toBe('1.34-eks-23');
  });

  it('uses the newest platform row from each AWS platform HTML section', () => {
    const parsed = parseAwsPlatformHtml(`
<h2 id="platform-versions-1-36">Kubernetes version <code class="code">1.36</code></h2>
<table>
  <tr>
    <td><p><code class="code">1.36.1</code></p></td>
    <td><p><code class="code">eks.3</code></p></td>
    <td><p>Initial release.</p></td>
    <td><p>June 2, 2026</p></td>
  </tr>
</table>
<h2 id="platform-versions-1-35">Kubernetes version <code class="code">1.35</code></h2>
<table>
  <tr>
    <td><p><code class="code">1.35.4</code></p></td>
    <td><p><code class="code">eks.13</code></p></td>
    <td><p>New platform version.</p></td>
    <td><p>May 19, 2026</p></td>
  </tr>
  <tr>
    <td><p><code class="code">1.35.2</code></p></td>
    <td><p><code class="code">eks.9</code></p></td>
    <td><p>Older platform version.</p></td>
    <td><p>April 3, 2026</p></td>
  </tr>
</table>
`);

    expect(parsed.get('1.36')).toBe('1.36-eks-3');
    expect(parsed.get('1.35')).toBe('1.35-eks-13');
  });

  it('parses non-exported server route arrays', () => {
    const parsed = parseStringArray(`
const EKS_GUIDE_ROUTES = [
  '/eks/1-36-upgrade-guide',
  '/eks/1-35-upgrade-guide',
];
`, 'EKS_GUIDE_ROUTES');

    expect(parsed).toEqual(['/eks/1-36-upgrade-guide', '/eks/1-35-upgrade-guide']);
  });

  it('builds expected current AWS rows and archived endoflife rows', () => {
    const lifecycle = parseAwsLifecycleMarkdown(`
| Kubernetes version | Upstream release | Amazon EKS release | End of standard support | End of extended support |
| --- | --- | --- | --- | --- |
|  \`1.35\`  | December 17, 2025 | January 27, 2026 | March 27, 2027 | March 27, 2028 |
`);
    const platforms = parseAwsPlatformMarkdown(`
## Kubernetes version \`1.35\`

| Kubernetes version | EKS platform version | Release notes | Release date |
| --- | --- | --- | --- |
|  \`1.35.4\`  |  \`eks.13\`  | New platform version. | May 19, 2026 |
`);
    const archives = parseEndOfLifeData(JSON.stringify([
      {
        cycle: '1.29',
        releaseDate: '2024-01-23',
        eol: '2025-03-23',
        extendedSupport: '2026-03-23',
        latest: '1.29-eks-66',
      },
    ]));

    const expected = buildExpectedVersions([
      { version: '1.35', releaseDate: 'old', standardSupportEnd: 'old', extendedSupportEnd: 'old' },
      { version: '1.29', releaseDate: 'old', standardSupportEnd: 'old', extendedSupportEnd: 'old' },
    ], lifecycle, platforms, archives);

    expect(expected).toEqual([
      expect.objectContaining({ version: '1.35', latestPlatform: '1.35-eks-13' }),
      expect.objectContaining({ version: '1.29', sourceLabel: 'endoflife.date Amazon EKS lifecycle archive' }),
    ]);
  });
});

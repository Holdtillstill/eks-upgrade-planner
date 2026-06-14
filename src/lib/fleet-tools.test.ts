import { describe, expect, it } from 'vitest';
import { fleetToCsv, fleetToJson, parseFleetImport } from './fleet-tools';

describe('fleet-tools', () => {
  it('parses CSV fleet rows and keeps targets at or above the source version', () => {
    const result = parseFleetImport(`name,from,to,clusters
legacy-payments,1.33,1.31,2
shared,1.30,1.35,3`);

    expect(result.sourceType).toBe('csv');
    expect(result.rows).toMatchObject([
      { name: 'legacy-payments', from: '1.33', to: '1.33', clusters: 2 },
      { name: 'shared', from: '1.30', to: '1.35', clusters: 3 },
    ]);
  });

  it('parses AWS describe-cluster JSON into one fleet row', () => {
    const result = parseFleetImport(JSON.stringify({
      cluster: {
        name: 'prod-control-plane',
        version: '1.32',
      },
    }));

    expect(result.sourceType).toBe('json');
    expect(result.rows).toMatchObject([
      { name: 'prod-control-plane', from: '1.32', to: '1.35', clusters: 1 },
    ]);
  });

  it('parses exported AWS describe-cluster batches', () => {
    const result = parseFleetImport(JSON.stringify([
      { cluster: { name: 'payments-a', version: '1.31' } },
      { cluster: { name: 'platform-a', version: '1.33' } },
    ]));

    expect(result.rows).toMatchObject([
      { name: 'payments-a', from: '1.31', to: '1.35', clusters: 1 },
      { name: 'platform-a', from: '1.33', to: '1.35', clusters: 1 },
    ]);
  });

  it('parses kubectl version output as a text import', () => {
    const result = parseFleetImport('Client Version: v1.35.0\nServer Version: v1.31.9-eks-a1b2c3');

    expect(result.sourceType).toBe('text');
    expect(result.rows).toMatchObject([
      { name: 'kubectl-context', from: '1.31', to: '1.35', clusters: 1 },
    ]);
  });

  it('exports fleet rows as CSV and JSON for browser-local handoff', () => {
    const rows = parseFleetImport('name,from,to,clusters\nprod,1.31,1.35,5').rows;

    expect(fleetToCsv(rows)).toBe('name,from,to,clusters\nprod,1.31,1.35,5');
    expect(JSON.parse(fleetToJson(rows)).fleetRows[0]).toMatchObject({
      name: 'prod',
      from: '1.31',
      to: '1.35',
      clusters: 5,
    });
  });
});

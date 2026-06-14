import { describe, expect, it } from 'vitest';
import { calculateFleetExtendedSupportFees } from './eks-data';

describe('app-v2 EKS support exposure', () => {
    it('separates remaining billable fees from unsupported days after EOL', () => {
        const now = new Date('2026-06-14T12:00:00Z');
        const fleetWith132 = calculateFleetExtendedSupportFees([
            { from: '1.32', clusters: 5 },
            { from: '1.30', clusters: 3 },
            { from: '1.33', clusters: 4 },
            { from: '1.31', clusters: 1 },
        ], 6, now);
        const fleetWith131 = calculateFleetExtendedSupportFees([
            { from: '1.31', clusters: 5 },
            { from: '1.30', clusters: 3 },
            { from: '1.33', clusters: 4 },
            { from: '1.31', clusters: 1 },
        ], 6, now);

        expect(fleetWith132.billableClusterDays).toBe(1749);
        expect(fleetWith132.unsupportedClusterDays).toBe(450);
        expect(Math.round(fleetWith132.totalFees)).toBe(25186);

        expect(fleetWith131.billableClusterDays).toBe(1659);
        expect(fleetWith131.unsupportedClusterDays).toBe(540);
        expect(Math.round(fleetWith131.totalFees)).toBe(23890);
        expect(fleetWith131.totalFees).toBeLessThan(fleetWith132.totalFees);
        expect(fleetWith131.unsupportedClusterDays).toBeGreaterThan(fleetWith132.unsupportedClusterDays);
    });
});

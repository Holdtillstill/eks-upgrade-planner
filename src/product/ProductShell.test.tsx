import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductShell } from './ProductShell';
import { resolveAppRoute, type AppRoute } from '../lib/routes';

type ProductRoute = Extract<AppRoute, { kind: 'product' }>;

function routeFor(path: string, options: Parameters<typeof resolveAppRoute>[1] = {}): ProductRoute {
  const route = resolveAppRoute(path, options);
  if (route.kind !== 'product') throw new Error(`${path} did not resolve to a product route`);
  return route;
}

function renderProductRoute(path: string) {
  return render(
    <ProductShell
      route={routeFor(path)}
      setRoute={vi.fn()}
    />,
  );
}

describe('ProductShell integration', () => {
  it('hides design exploration navigation when production routing blocks design routes', () => {
    const route = routeFor('/1', { env: { PROD: true, VITE_ENABLE_DESIGN_EXPLORATIONS: 'true' } });

    render(<ProductShell route={route} setRoute={vi.fn()}/>);

    expect(screen.queryByRole('button', { name: /design explorations/i })).toBeNull();
    expect(screen.getByRole('heading', { name: /upgrade plan/i })).toBeTruthy();
  });

  it('renders the cost calculator and shows zero remaining fees for a release still safely in standard support', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-29T19:00:00Z'));
    try {
      renderProductRoute('/eks/extended-support-cost-calculator');

      expect(screen.getByRole('heading', { name: /support fees and deadline risk/i })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /^single release$/i }));
      fireEvent.change(screen.getByLabelText('Scenario EKS version'), { target: { value: '1.35' } });

      expect(screen.getByRole('button', { name: /bridge[\s\S]*\$0[\s\S]*4 mo window/i })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getAllByText('$0').length).toBeGreaterThan(0);
      expect(screen.getAllByText(/no extended-support billing in the 4-month window/i).length).toBeGreaterThan(0);
      expect((screen.getByLabelText('Copyable Cost Model') as HTMLTextAreaElement).value).toContain('Remaining support fees: $0');

      fireEvent.change(screen.getByLabelText('Scenario clusters'), { target: { value: '3' } });
      fireEvent.change(screen.getByLabelText(/bridge delay:/i), { target: { value: '2' } });

      expect(screen.getByRole('button', { name: /bridge[\s\S]*\$0[\s\S]*2 mo window/i })).toBeTruthy();
      expect((screen.getByLabelText('Copyable Cost Model') as HTMLTextAreaElement).value).toContain('Billable extended-support window: no extended-support billing in the 2-month window');
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks releases past extended support as unsupported instead of zero-cost', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-29T19:00:00Z'));
    try {
      renderProductRoute('/eks/extended-support-cost-calculator');

      fireEvent.click(screen.getByRole('button', { name: /^single release$/i }));
      fireEvent.change(screen.getByLabelText('Scenario EKS version'), { target: { value: '1.29' } });

      expect(screen.getByRole('button', { name: /bridge[\s\S]*past support[\s\S]*automatic-upgrade risk/i })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getAllByText(/past support/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/automatic-upgrade risk, not a zero-cost state/i)).toBeTruthy();
      expect((screen.getByLabelText('Copyable Cost Model') as HTMLTextAreaElement).value).toContain('Remaining support fees: Not applicable - release is past extended support');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps overview fleet-first and shows the selected row as read-only context', () => {
    renderProductRoute('/app');

    expect(screen.queryByLabelText('Scenario current release')).toBeNull();
    expect(screen.queryByLabelText('Scenario target release')).toBeNull();
    expect(screen.getByLabelText(/delay: 4 month\(s\)/i)).toBeTruthy();
    expect(screen.getByText(/prod-payments\s*·\s*1\.31\s*->\s*1\.35/i)).toBeTruthy();
    expect(screen.getByText(/prod-payments:\s*EKS\s*1\.31\s*->\s*EKS\s*1\.35/i)).toBeTruthy();
    expect(screen.getAllByText(/^5 cluster\(s\)$/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/^active scope$/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /refresh tools/i })).toBeNull();

    fireEvent.click(within(screen.getByLabelText('Fleet scope prod-payments')).getByRole('button', { name: /^remove$/i }));
    expect(screen.getByText(/shared-platform\s*·\s*1\.30\s*->\s*1\.35/i)).toBeTruthy();
  });

  it('lets fleet rows feed the selected scenario tools', () => {
    renderProductRoute('/app');

    expect(screen.getByRole('heading', { name: /fleet scope/i })).toBeTruthy();
    expect((screen.getByLabelText('Fleet item prod-payments clusters') as HTMLInputElement).value).toBe('5');

    fireEvent.click(screen.getByRole('button', { name: /use in tools for shared-platform/i }));

    expect(screen.getByText(/shared-platform\s*·\s*1\.30\s*->\s*1\.35/i)).toBeTruthy();
    expect(screen.getAllByText(/^3 cluster\(s\)$/i).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText(/delay: 4 month\(s\)/i), { target: { value: '2' } });
    expect(screen.getByLabelText(/delay: 2 month\(s\)/i)).toBeTruthy();
  });

  it('carries fleet cost scope into the cost calculator', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-29T19:00:00Z'));
    try {
      renderProductRoute('/eks/extended-support-cost-calculator');

      expect(screen.getByRole('heading', { name: /fleet cost scope/i })).toBeTruthy();
      expect(screen.getByText(/12 clusters · 3 scope rows/i)).toBeTruthy();
      const costScope = screen.getByLabelText('Fleet cost scope');
      expect(within(costScope).getByText(/modeled unsupported/i)).toBeTruthy();
      expect(within(costScope).getByText('204')).toBeTruthy();
      expect(screen.getByRole('button', { name: /fleet aggregate/i })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getAllByText(/\$12,336/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/1028 cluster-day\(s\) \/ 24672 cluster-hour\(s\)/i)).toBeTruthy();
      expect(screen.getByText(/204 cluster-day\(s\) in this modeled window fall after an extended-support end date/i)).toBeTruthy();
      expect(screen.getByText(/selected fleet case:\s*bridge,\s*4-month completion window,\s*\$12,336 remaining support fees/i)).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: /shared-platform[\s\S]*model this row/i }));

      expect(screen.getByText(/shared-platform\s*·\s*1\.30\s*->\s*1\.35/i)).toBeTruthy();
      expect((screen.getByLabelText('Scenario clusters') as HTMLInputElement).value).toBe('3');
      expect((screen.getByLabelText('Copyable Cost Model') as HTMLTextAreaElement).value).toContain('Scope: shared-platform');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows billable days and clipped-window risk when defer extends past extended support', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-30T05:00:00Z'));
    try {
      renderProductRoute('/eks/extended-support-cost-calculator');

      fireEvent.click(screen.getByRole('button', { name: /^single release$/i }));
      fireEvent.change(screen.getByLabelText('Scenario EKS version'), { target: { value: '1.30' } });
      fireEvent.change(screen.getByLabelText('Scenario clusters'), { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText(/bridge delay:/i), { target: { value: '2' } });

      expect(screen.getByRole('button', { name: /accelerate[\s\S]*\$372[\s\S]*1 mo window/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /bridge[\s\S]*7d unsupported[\s\S]*\$648[\s\S]*2 mo window/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /defer[\s\S]*130d unsupported[\s\S]*\$648[\s\S]*6 mo window/i })).toBeTruthy();
      expect(screen.getByText(/selected case:\s*bridge,\s*2-month completion window,\s*\$648 remaining support fees/i)).toBeTruthy();
      expect(screen.getAllByText(/misses extended end by 7d/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/misses extended end by 130d/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText('54d').length).toBeGreaterThan(0);
      expect(screen.getAllByText(/AWS UTC calendar day/i).length).toBeGreaterThan(0);
      expect((screen.getByLabelText('Copyable Cost Model') as HTMLTextAreaElement).value).toContain('Comparison note: Defer may not add remaining support fees after 2026-07-23');
    } finally {
      vi.useRealTimers();
    }
  });

  it('loads scanner example manifests and renders deprecated API findings', () => {
    renderProductRoute('/eks/deprecated-api-scanner');

    fireEvent.click(screen.getByRole('button', { name: /load example/i }));

    const terminal = screen.getByLabelText('local scanner');
    expect(within(terminal).getByText(/findings: 2/i)).toBeTruthy();
    expect(screen.getByText(/line 1: Ingress/i)).toBeTruthy();
    expect(screen.getByText(/line 6: PodSecurityPolicy/i)).toBeTruthy();
  });

  it('renders a fleet planner by default and can open one row as a single release plan', () => {
    renderProductRoute('/eks/upgrade-planner');

    expect(screen.getByRole('heading', { name: /upgrade change plan/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /fleet change plan/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: /fleet plan inputs/i })).toBeTruthy();
    expect(screen.getByText(/12 clusters · 3 row\(s\)/i)).toBeTruthy();
    expect(screen.getAllByText(/EKS 1\.30\s*->\s*EKS 1\.35/i).length).toBeGreaterThan(0);

    const fleetPlan = screen.getByLabelText('Copyable Fleet Change Markdown') as HTMLTextAreaElement;
    expect(fleetPlan.value).toContain('# EKS fleet upgrade change plan');
    expect(fleetPlan.value).toContain('prod-payments');
    expect(fleetPlan.value).toContain('shared-platform');

    fireEvent.click(screen.getByRole('button', { name: /open row plan for shared-platform/i }));

    expect(screen.getByRole('button', { name: /single release/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /managed node groups/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /set target to EKS 1\.32/i })).toBeTruthy();
    expect((screen.getByLabelText('Current version') as HTMLSelectElement).value).toBe('1.30');
    expect((screen.getByLabelText('Clusters') as HTMLInputElement).value).toBe('3');

    const rfc = screen.getByLabelText('Copyable Change Markdown') as HTMLTextAreaElement;
    expect(rfc.value).toContain('Current version: EKS 1.30');
    expect(rfc.value).toContain('Target version: EKS 1.35');
    expect(rfc.value).toContain('Amazon VPC CNI');
  });

  it('renders lifecycle table semantics and selected release state', () => {
    renderProductRoute('/eks/versions');

    const table = screen.getByRole('table', { name: /amazon eks lifecycle registry/i });
    expect(table).toBeTruthy();
    expect(within(table).getByRole('columnheader', { name: /status/i })).toBeTruthy();
    expect(within(table).getByRole('rowheader', { name: /eks 1\.31/i })).toBeTruthy();
    expect(within(table).getByRole('button', { name: /select eks 1\.31/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses distinct source rail labels when links point to different source pages', () => {
    const { container } = renderProductRoute('/app');

    const sourceRail = container.querySelector('[aria-label="Dataset snapshot and source links"]');
    if (!(sourceRail instanceof HTMLElement)) throw new Error('source rail not found');
    const links = within(sourceRail).getAllByRole('link');
    const labelToHrefs = new Map<string, Set<string>>();

    expect(within(sourceRail).getByText(/data/i)).toBeTruthy();
    expect(within(sourceRail).getByText(/^privacy$/i)).toBeTruthy();
    expect(within(sourceRail).getByText(/inputs stay in the browser/i)).toBeTruthy();

    for (const link of links) {
      const label = link.textContent ?? '';
      if (!labelToHrefs.has(label)) labelToHrefs.set(label, new Set());
      labelToHrefs.get(label)?.add(link.getAttribute('href') ?? '');
    }

    expect(within(sourceRail).getByRole('link', { name: /amazon vpc cni add-on docs/i })).toBeTruthy();
    expect(within(sourceRail).getByRole('link', { name: /amazon eks coredns add-on docs/i })).toBeTruthy();
    expect(within(sourceRail).getByRole('link', { name: /kubernetes podsecuritypolicy v1\.25 deprecation guide/i })).toBeTruthy();
    expect(within(sourceRail).queryByRole('link', { name: /^open source: amazon eks add-ons documentation$/i })).toBeNull();

    for (const [label, hrefs] of labelToHrefs) {
      expect(hrefs.size, `${label} should not point to multiple URLs`).toBe(1);
    }
  });
});

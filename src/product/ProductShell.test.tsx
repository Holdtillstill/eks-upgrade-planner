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
    expect(screen.getByRole('heading', { name: /upgrade control board/i })).toBeTruthy();
  });

  it('renders the cost calculator and updates the bridge scenario output', () => {
    renderProductRoute('/eks/extended-support-cost-calculator');

    expect(screen.getByRole('heading', { name: /support-tier scenario ledger/i })).toBeTruthy();
    expect(screen.getAllByText('$17,520').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Clusters'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/months delayed:/i), { target: { value: '2' } });

    expect(screen.getAllByText('$2,190').length).toBeGreaterThan(0);
    expect((screen.getByLabelText('Copyable Cost Brief') as HTMLTextAreaElement).value).toContain('Monthly support-tier delta: $1,095');
  });

  it('loads scanner example manifests and renders deprecated API findings', () => {
    renderProductRoute('/eks/deprecated-api-scanner');

    fireEvent.click(screen.getByRole('button', { name: /load example/i }));

    const terminal = screen.getByLabelText('local scanner');
    expect(within(terminal).getByText(/findings: 2/i)).toBeTruthy();
    expect(screen.getByText(/line 1: Ingress/i)).toBeTruthy();
    expect(screen.getByText(/line 6: PodSecurityPolicy/i)).toBeTruthy();
  });

  it('renders the planner hop path and copyable RFC output', () => {
    renderProductRoute('/eks/upgrade-planner');

    expect(screen.getByRole('heading', { name: /release train RFC builder/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /set target to EKS 1\.32/i })).toBeTruthy();

    const rfc = screen.getByLabelText('Copyable Jira/RFC Markdown') as HTMLTextAreaElement;
    expect(rfc.value).toContain('Current version: EKS 1.31');
    expect(rfc.value).toContain('Target version: EKS 1.35');
    expect(rfc.value).toContain('Amazon VPC CNI');
  });
});

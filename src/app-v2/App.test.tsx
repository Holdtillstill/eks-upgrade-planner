import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

function renderRoute(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

describe('V2 app shell', () => {
  it('renders the packet route with the printable packet action', async () => {
    renderRoute('/eks/evidence-pack');

    expect(await screen.findByRole('heading', { name: 'Change packet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).toBeNull();
  });

  it('renders overview workspace import/export controls', async () => {
    renderRoute('/app');

    expect(await screen.findByRole('button', { name: 'Copy workspace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
  });
});

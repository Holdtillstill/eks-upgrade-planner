import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('EKS Upgrade Planner render error', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return <main className="app-error" role="alert">
      <section>
        <span className="eyebrow">Planner Recovery</span>
        <h1>Something failed while rendering the workspace.</h1>
        <p>Reload the planner to restore the default local state. Pasted manifest text and form edits may need to be re-entered.</p>
        <button type="button" onClick={() => window.location.assign('/app')}>Reload planner</button>
      </section>
    </main>;
  }
}

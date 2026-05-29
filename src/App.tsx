import { Suspense, lazy, useEffect, useState } from 'react';
import './App.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProductShell } from './product/ProductShell';
import { navigate } from './lib/navigation';
import { resolveAppRoute, type AppRoute } from './lib/routes';

const disabledDesignFlags = ['0', 'false', 'no', 'off'];
const designExplorationsAvailable = import.meta.env.DEV &&
  !disabledDesignFlags.includes(String(import.meta.env.VITE_ENABLE_DESIGN_EXPLORATIONS ?? '').trim().toLowerCase());

const LazyDesignExplorations = designExplorationsAvailable
  ? lazy(() => import('./design/DesignExplorations'))
  : null;

function routeFromLocation(): AppRoute {
  return resolveAppRoute(window.location.pathname, { allowDesignExplorations: designExplorationsAvailable });
}

export function AppView() {
  const [route, setRoute] = useState<AppRoute>(routeFromLocation());
  const designNavLink = designExplorationsAvailable
    ? <button className="design-link" type="button" onClick={() => navigate('/1', setRoute)}>Design explorations</button>
    : undefined;

  useEffect(() => {
    const onPop = () => setRoute(routeFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (route.kind === 'design') {
    if (LazyDesignExplorations) {
      return <Suspense fallback={<main className="page"><p>Loading design exploration...</p></main>}>
        <LazyDesignExplorations route={route.route} setRoute={setRoute}/>
      </Suspense>;
    }

    return <ProductShell
      route={{ kind: 'product', tab: 'overview', canonicalPath: '/app' }}
      setRoute={setRoute}
      afterTabs={designNavLink}
    />;
  }

  return <ProductShell route={route} setRoute={setRoute} afterTabs={designNavLink}/>;
}

function App() {
  return <ErrorBoundary>
    <AppView/>
  </ErrorBoundary>;
}

export default App;

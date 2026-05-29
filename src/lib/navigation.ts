import { resolveAppRoute, type AppRoute } from './routes';

export function navigate(path: string, setRoute: (route: AppRoute) => void) {
  window.history.pushState({}, '', path);
  setRoute(resolveAppRoute(path));
}

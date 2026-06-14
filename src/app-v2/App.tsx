import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { NavRail } from './components/layout/NavRail';
import { TopBar } from './components/layout/TopBar';
import { resolveAppRoute } from '../lib/routes';
type Screen = 'overview' | 'lifecycle' | 'cost' | 'plan' | 'scanner' | 'guides' | 'addons' | 'packet';
const OverviewScreen = lazy(() => import('./components/screens/OverviewScreen').then(module => ({ default: module.OverviewScreen })));
const LifecycleScreen = lazy(() => import('./components/screens/LifecycleScreen').then(module => ({ default: module.LifecycleScreen })));
const CostScreen = lazy(() => import('./components/screens/CostScreen').then(module => ({ default: module.CostScreen })));
const PlanScreen = lazy(() => import('./components/screens/PlanScreen').then(module => ({ default: module.PlanScreen })));
const ScannerScreen = lazy(() => import('./components/screens/ScannerScreen').then(module => ({ default: module.ScannerScreen })));
const GuidesScreen = lazy(() => import('./components/screens/GuidesScreen').then(module => ({ default: module.GuidesScreen })));
const AddonsScreen = lazy(() => import('./components/screens/AddonsScreen').then(module => ({ default: module.AddonsScreen })));
const PacketScreen = lazy(() => import('./components/screens/PacketScreen').then(module => ({ default: module.PacketScreen })));
const SCREEN_LABELS: Record<Screen, string> = {
    overview: 'Overview', lifecycle: 'Lifecycle', cost: 'Cost',
    plan: 'Plan', scanner: 'Scanner', guides: 'Guides', addons: 'Add-ons', packet: 'Packet',
};
const MOBILE_TABS: Screen[] = ['overview', 'lifecycle', 'cost', 'plan'];
const PATH_BY_SCREEN: Record<Screen, string> = {
    overview: '/app',
    lifecycle: '/eks/versions',
    cost: '/eks/extended-support-cost-calculator',
    plan: '/eks/upgrade-planner',
    scanner: '/eks/deprecated-api-scanner',
    guides: '/eks/1-31-upgrade-guide',
    addons: '/eks/addons',
    packet: '/eks/evidence-pack',
};
function screenFromPath(pathname: string): Screen {
    const route = resolveAppRoute(pathname);
    if (route.kind !== 'product')
        return 'overview';
    if (route.detail?.type === 'version-guide')
        return 'guides';
    if (route.detail?.type === 'addon')
        return 'addons';
    switch (route.tab) {
        case 'versions':
            return 'lifecycle';
        case 'planner':
            return 'plan';
        case 'evidence':
            return 'packet';
        default:
            return route.tab;
    }
}
function isScreen(value: string): value is Screen {
    return value in PATH_BY_SCREEN;
}
function ScreenFallback() {
    return (<div className="p-5">
      <div className="h-24 rounded-xl border border-border bg-card card-shadow"/>
    </div>);
}
function useMobileViewport() {
    const [isMobileViewport, setIsMobileViewport] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1023px)').matches);
    useEffect(() => {
        if (typeof window.matchMedia !== 'function')
            return undefined;
        const query = window.matchMedia('(max-width: 1023px)');
        const update = () => setIsMobileViewport(query.matches);
        update();
        query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);
    return isMobileViewport;
}
export default function App({ workspaceControls }: {
    workspaceControls?: ReactNode;
}) {
    const [screen, setScreen] = useState<Screen>(() => screenFromPath(window.location.pathname));
    const [collapsed, setCollapsed] = useState(false);
    const [mobileNav, setMobileNav] = useState(false);
    const isMobileViewport = useMobileViewport();
    useEffect(() => {
        const onPop = () => setScreen(screenFromPath(window.location.pathname));
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);
    useEffect(() => {
        document.title = `${SCREEN_LABELS[screen]} - EKS Upgrade Planner`;
    }, [screen]);
    const navigate = (s: string) => {
        if (!isScreen(s))
            return;
        setScreen(s);
        if (window.location.pathname !== PATH_BY_SCREEN[s])
            window.history.pushState({}, '', PATH_BY_SCREEN[s]);
        setMobileNav(false);
    };
    return (<div className="v2-app flex h-screen overflow-hidden bg-background font-sans">
      {/* MARKER-MAKE-KIT-INVOKED */}

      {/* Mobile backdrop */}
      {mobileNav && (<div className="lg:hidden fixed inset-0 z-20 bg-black/60" onClick={() => setMobileNav(false)}/>)}

      {/* Nav rail */}
      <div className={`
        lg:relative lg:flex lg:shrink-0
        fixed inset-y-0 left-0 z-30
        transition-transform duration-200 ease-in-out
        ${mobileNav ? 'translate-x-0 visible' : '-translate-x-full invisible lg:translate-x-0 lg:visible'}
      `}>
        <NavRail active={screen} onNavigate={navigate} collapsed={collapsed} onToggleCollapsed={() => setCollapsed(c => !c)}/>
      </div>

      {/* Right column */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">

        {/* Top bar — dark chrome */}
        <TopBar onMobileMenuToggle={() => setMobileNav(o => !o)} controls={workspaceControls}/>

        {/* Breadcrumb / page title */}
        <nav aria-label="Breadcrumb" className="flex h-[34px] items-center gap-2 px-5 shrink-0 border-b bg-card border-border">
          <span className="text-[11px] font-semibold text-foreground">
            {SCREEN_LABELS[screen]}
          </span>
          <span className="text-border">/</span>
          <span className="text-[11px] text-muted-foreground">EKS Upgrade Planner</span>
        </nav>

        {/* Main workspace */}
        <main className="flex-1 overflow-y-auto bg-background">
          <h1 className="sr-only">{SCREEN_LABELS[screen]} - EKS Upgrade Planner</h1>
          <Suspense fallback={<ScreenFallback />}>
            {screen === 'overview' && <OverviewScreen onNavigate={navigate}/>}
            {screen === 'lifecycle' && <LifecycleScreen />}
            {screen === 'cost' && <CostScreen />}
            {screen === 'plan' && <PlanScreen onNavigate={navigate}/>}
            {screen === 'scanner' && <ScannerScreen />}
            {screen === 'guides' && <GuidesScreen />}
            {screen === 'addons' && <AddonsScreen />}
            {screen === 'packet' && <PacketScreen onNavigate={navigate}/>}
          </Suspense>
        </main>

        {/* Mobile bottom tabs */}
        {isMobileViewport && (<nav aria-label="Mobile navigation" className="flex shrink-0 border-t bg-card border-border">
          {MOBILE_TABS.map(s => (<button key={s} type="button" onClick={() => navigate(s)} aria-current={screen === s ? 'page' : undefined} className={`flex-1 py-3 text-[11px] font-semibold transition-colors ${screen === s ? 'text-primary' : 'text-muted-foreground'}`}>
              {SCREEN_LABELS[s]}
            </button>))}
          <button type="button" onClick={() => setMobileNav(true)} className="flex-1 py-3 text-[11px] font-semibold text-muted-foreground">
            More…
          </button>
        </nav>)}
      </div>
    </div>);
}

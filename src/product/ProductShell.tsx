import { useMemo, useState, type ReactNode } from 'react';
import { eksVersions } from '../data/versions';
import { compareEksVersions } from '../lib/planner';
import { scanManifest, type NodeModel } from '../lib/reports';
import { navigate } from '../lib/navigation';
import { type AppRoute } from '../lib/routes';
import { defaultManifest } from '../lib/ui';
import { StatusPill } from '../components/shared';
import { AddonsSection, CostSection, EvidenceSection, GuidesSection, OverviewSection, PlannerSection, ScannerSection, VersionsSection } from './sections';
import { ProductTabs, SourceRail } from './components';
import { defaultSelectedAddons, selectedAddonIdsFrom } from './state';

export function ProductShell({ route, setRoute, afterTabs }: { route: Extract<AppRoute, { kind: 'product' }>; setRoute: (route: AppRoute) => void; afterTabs?: ReactNode }) {
  const routeGuideVersion = route.detail?.type === 'version-guide' ? route.detail.version : '1.31';
  const routeAddonId = route.detail?.type === 'addon' ? route.detail.addonId : 'vpc-cni';
  const [currentVersion, setCurrentVersion] = useState(routeGuideVersion);
  const [targetVersion, setTargetVersion] = useState(eksVersions[0].version);
  const [guideVersion, setGuideVersion] = useState(routeGuideVersion);
  const [activeAddonId, setActiveAddonId] = useState(routeAddonId);
  const [clusterCount, setClusterCount] = useState(12);
  const [monthsDelayed, setMonthsDelayed] = useState(4);
  const [nodeModel, setNodeModel] = useState<NodeModel>('managed-node-groups');
  const [manifest, setManifest] = useState(defaultManifest);
  const [selectedAddons, setSelectedAddons] = useState<Record<string, boolean>>(defaultSelectedAddons);

  const scannerFindings = useMemo(() => scanManifest(manifest), [manifest]);
  const selectedAddonIds = selectedAddonIdsFrom(selectedAddons);
  const selectedVersion = eksVersions.find((version) => version.version === currentVersion) ?? eksVersions[0];
  const effectiveTarget = compareEksVersions(targetVersion, currentVersion) < 0 ? currentVersion : targetVersion;
  const displayedGuideVersion = route.detail?.type === 'version-guide' ? route.detail.version : guideVersion;
  const displayedAddonId = route.detail?.type === 'addon' ? route.detail.addonId : activeAddonId;

  return <main className="product-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="product-rail">
      <a className="product-brand" href="/app" onClick={(event) => { event.preventDefault(); navigate('/app', setRoute); }}>
        <span/>
        <strong>EKS Upgrade Planner</strong>
        <em>release train workspace</em>
      </a>
      <ProductTabs active={route.tab} guideVersion={displayedGuideVersion} setRoute={setRoute}/>
      {afterTabs}
    </aside>

    <div className="product-main" id="main-content" tabIndex={-1}>
      <header className="product-topbar">
        <div>
          <span className="eyebrow">Local SPA · No AWS Account Access</span>
          <strong>Release train: EKS {currentVersion} → EKS {effectiveTarget}</strong>
        </div>
        <div className="topbar-status">
          <StatusPill version={selectedVersion}/>
          <span>{selectedVersion.standardSupportEnd} standard end</span>
          <span>{scannerFindings.length} API finding(s)</span>
        </div>
      </header>

      {route.tab === 'overview' && <OverviewSection currentVersion={currentVersion} targetVersion={effectiveTarget} clusterCount={clusterCount} monthsDelayed={monthsDelayed} scannerFindings={scannerFindings} selectedAddonIds={selectedAddonIds} setCurrentVersion={setCurrentVersion} setRoute={setRoute}/>}
      {route.tab === 'versions' && <VersionsSection currentVersion={currentVersion} setCurrentVersion={setCurrentVersion} setRoute={setRoute}/>}
      {route.tab === 'cost' && <CostSection currentVersion={currentVersion} clusterCount={clusterCount} monthsDelayed={monthsDelayed} setCurrentVersion={setCurrentVersion} setClusterCount={setClusterCount} setMonthsDelayed={setMonthsDelayed}/>}
      {route.tab === 'planner' && <PlannerSection currentVersion={currentVersion} targetVersion={effectiveTarget} clusterCount={clusterCount} monthsDelayed={monthsDelayed} nodeModel={nodeModel} selectedAddons={selectedAddons} scannerFindings={scannerFindings} setCurrentVersion={setCurrentVersion} setTargetVersion={setTargetVersion} setClusterCount={setClusterCount} setMonthsDelayed={setMonthsDelayed} setNodeModel={setNodeModel} setSelectedAddons={setSelectedAddons}/>}
      {route.tab === 'scanner' && <ScannerSection manifest={manifest} setManifest={setManifest} scannerFindings={scannerFindings}/>}
      {route.tab === 'guides' && <GuidesSection guideVersion={displayedGuideVersion} setGuideVersion={setGuideVersion} setRoute={setRoute}/>}
      {route.tab === 'addons' && <AddonsSection activeAddonId={displayedAddonId} setActiveAddonId={setActiveAddonId} setRoute={setRoute}/>}
      {route.tab === 'evidence' && <EvidenceSection currentVersion={currentVersion} targetVersion={effectiveTarget} clusterCount={clusterCount} monthsDelayed={monthsDelayed} nodeModel={nodeModel} selectedAddonIds={selectedAddonIds} scannerFindings={scannerFindings}/>}
    </div>

    <SourceRail currentVersion={currentVersion} scannerFindings={scannerFindings.length}/>
  </main>;
}

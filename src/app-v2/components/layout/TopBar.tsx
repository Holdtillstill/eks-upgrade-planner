import type { ReactNode } from 'react';
import { AlertTriangle, ExternalLink, RefreshCw, Menu } from 'lucide-react';
import { dataFreshness } from '../../../data/versions';
import { getEksVersion } from '../../data/eks-data';

interface TopBarProps {
    onMobileMenuToggle?: () => void;
    controls?: ReactNode;
}

const snapshotDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
}).format(new Date(`${dataFreshness.checkedAt}T00:00:00Z`));
const baselineVersion = getEksVersion('1.31');

function Dot() {
    return <span className="w-1.5 h-1.5 rounded-full shrink-0 inline-block bg-warning"/>;
}
function Divider() {
    return <span className="hidden sm:block w-px h-4 shrink-0 bg-chrome-border"/>;
}
export function TopBar({ onMobileMenuToggle, controls }: TopBarProps) {
    return (<header className="flex h-[48px] items-center gap-3 px-4 shrink-0 z-10 border-b bg-chrome text-chrome-muted border-chrome-border">
      {/* Mobile menu */}
      <button className="lg:hidden mr-1 text-chrome-muted transition-colors hover:text-chrome-text" onClick={onMobileMenuToggle} aria-label="Open navigation">
        <Menu size={18}/>
      </button>

      <span className="lg:hidden text-[12px] font-semibold text-chrome-text">EKS Planner</span>

      {/* Status indicators — hidden on small screens */}
      <div className="hidden sm:flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-warning-border bg-warning-bg text-[11px] font-medium text-warning">
          <Dot />
          Extended support
        </div>
      </div>

      <div className="hidden md:flex items-center gap-2 text-[11px] text-chrome-muted">
        <span>EKS 1.31 extended support ends</span>
        <span className="font-mono text-chrome-text">{baselineVersion?.extendedEnd ?? 'unknown'}</span>
      </div>

      <Divider />

      {/* Scanner mode badge */}
      <div className="hidden md:flex items-center gap-1.5 text-[11px] text-danger">
        <AlertTriangle size={11}/>
        <span className="font-medium">Local scanner · no upload</span>
      </div>

      {/* Spacer */}
      <div className="flex-1"/>

      {controls}

      {/* Freshness */}
      <details className="group relative block">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded px-2 py-1 text-[11px] text-chrome-muted transition-colors hover:bg-chrome-hover hover:text-chrome-text [&::-webkit-details-marker]:hidden">
          <RefreshCw size={11}/>
          <span className="hidden sm:inline">Snapshot {snapshotDate}</span>
          <span className="sm:hidden">Snapshot</span>
        </summary>
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(320px,calc(100vw-2rem))] rounded-xl border border-border bg-card p-4 text-[11px] text-foreground shadow-xl">
          <p className="text-[12px] font-semibold">Data snapshot &amp; source check</p>
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Committed snapshot</p>
              <p className="mt-0.5 font-mono text-[12px]">{snapshotDate}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Scheduled source check</p>
              <p className="mt-0.5 font-mono text-[12px]">{dataFreshness.refreshSchedule}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Mechanism</p>
              <p className="mt-0.5 leading-relaxed text-muted-foreground">{dataFreshness.verificationCadence}</p>
              <a href={dataFreshness.refreshWorkflowUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold text-primary transition-opacity hover:opacity-70">
                {dataFreshness.refreshWorkflow}
                <ExternalLink size={10}/>
              </a>
            </div>
            <a href={dataFreshness.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-primary transition-opacity hover:opacity-70">
              {dataFreshness.sourceLabel}
              <ExternalLink size={11}/>
            </a>
          </div>
        </div>
      </details>
    </header>);
}

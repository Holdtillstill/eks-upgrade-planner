import { LayoutDashboard, Calendar, CircleDollarSign, GitBranch, ScanLine, BookOpen, Package, FileText, ChevronLeft, ChevronRight, Layers, type LucideIcon } from 'lucide-react';
type Screen = 'overview' | 'lifecycle' | 'cost' | 'plan' | 'scanner' | 'guides' | 'addons' | 'packet';
interface NavRailProps {
    active: Screen;
    onNavigate: (s: Screen) => void;
    collapsed: boolean;
    onToggleCollapsed: () => void;
}
const NAV_ITEMS: {
    id: Screen;
    label: string;
    Icon: LucideIcon;
}[] = [
    { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
    { id: 'lifecycle', label: 'Lifecycle', Icon: Calendar },
    { id: 'cost', label: 'Cost', Icon: CircleDollarSign },
    { id: 'plan', label: 'Plan', Icon: GitBranch },
    { id: 'scanner', label: 'Scanner', Icon: ScanLine },
    { id: 'guides', label: 'Guides', Icon: BookOpen },
    { id: 'addons', label: 'Add-ons', Icon: Package },
    { id: 'packet', label: 'Packet', Icon: FileText },
];
export function NavRail({ active, onNavigate, collapsed, onToggleCollapsed }: NavRailProps) {
    return (<nav aria-label="Primary navigation" className={`flex flex-col h-full shrink-0 overflow-hidden border-r bg-chrome text-chrome-muted border-chrome-border transition-all duration-200 ${collapsed ? 'w-[52px]' : 'w-[204px]'}`}>
      {/* Logo — matches topbar height */}
      <div className="flex h-[48px] items-center shrink-0 px-3.5">
        <div className="flex size-[26px] items-center justify-center rounded-md shrink-0 bg-primary">
          <Layers size={14} className="text-white" strokeWidth={2.5}/>
        </div>
        {!collapsed && (<div className="ml-2.5 overflow-hidden">
            <p className="text-[12px] font-semibold leading-none text-chrome-text">
              EKS Planner
            </p>
            <p className="text-[10px] mt-0.5 leading-none text-chrome-muted">
              Upgrade workspace
            </p>
          </div>)}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-2">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
            const isActive = active === id;
            return (<button key={id} type="button" onClick={() => onNavigate(id)} title={collapsed ? label : undefined} aria-label={collapsed ? label : undefined} aria-current={isActive ? 'page' : undefined} className={`relative flex h-[36px] w-full items-center gap-2.5 px-3 transition-colors duration-100 group ${collapsed ? 'justify-center' : 'justify-start'} ${isActive ? 'bg-chrome-active text-chrome-text' : 'text-chrome-muted hover:bg-chrome-hover hover:text-chrome-text'}`}>
              {/* Active left-edge indicator */}
              {isActive && (<span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-primary-light"/>)}
              <Icon size={15}/>
              {!collapsed && (<span className="text-[12px] font-medium">{label}</span>)}
            </button>);
        })}
      </div>

      {/* Collapse toggle */}
      <button type="button" onClick={onToggleCollapsed} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} className="flex h-9 shrink-0 items-center justify-center border-t border-chrome-border text-chrome-muted transition-colors hover:text-chrome-text" title={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
        {collapsed ? <ChevronRight size={14}/> : <ChevronLeft size={14}/>}
      </button>
    </nav>);
}

type Accent = 'default' | 'warning' | 'danger' | 'success' | 'teal';
interface MetricTileProps {
    label: string;
    value: string | number;
    sublabel?: string;
    accent?: Accent;
    className?: string;
    onClick?: () => void;
    actionLabel?: string;
}
const VALUE_COLOR: Record<Accent, string> = {
    default: 'text-foreground',
    warning: 'text-warning',
    danger: 'text-danger',
    success: 'text-success',
    teal: 'text-primary',
};
export function MetricTile({ label, value, sublabel, accent = 'default', className = '', onClick, actionLabel }: MetricTileProps) {
    const valueColor = VALUE_COLOR[accent];
    const body = (<>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={`text-2xl font-semibold font-mono leading-none ${valueColor}`}>
        {value}
      </p>
      {sublabel && (<p className="text-[11px] text-muted-foreground">{sublabel}</p>)}
      {actionLabel && (<span className="mt-1 text-[10px] font-semibold text-primary">{actionLabel}</span>)}
    </>);
    if (onClick) {
        return (<button type="button" onClick={onClick} className={`bg-card rounded-lg border border-transparent p-4 flex flex-col gap-1 card-shadow text-left transition-all hover:-translate-y-0.5 hover:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${className}`} aria-label={`${label}: ${value}. ${actionLabel ?? 'Open details'}`}>
          {body}
        </button>);
    }
    return (<div className={`bg-card rounded-lg p-4 flex flex-col gap-1 card-shadow ${className}`}>
      {body}
    </div>);
}

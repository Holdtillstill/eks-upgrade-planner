type PillVariant = 'standard' | 'extended' | 'eol' | 'latest' | 'upcoming' | 'passed' | 'warning' | 'blocked' | 'running' | 'queued' | 'info';
interface StatusPillProps {
    variant: PillVariant;
    label?: string;
    size?: 'xs' | 'sm' | 'md';
    showIcon?: boolean;
    className?: string;
}
const CFG: Record<PillVariant, {
    tone: string;
    dot: string;
    defaultLabel: string;
}> = {
    standard: { tone: 'border-success-border bg-success-bg text-success', dot: 'bg-success', defaultLabel: 'Standard' },
    extended: { tone: 'border-warning-border bg-warning-bg text-warning', dot: 'bg-warning', defaultLabel: 'Extended' },
    eol: { tone: 'border-danger-border bg-danger-bg text-danger', dot: 'bg-danger', defaultLabel: 'End of life' },
    latest: { tone: 'border-primary-light bg-eks-teal-bg text-primary', dot: 'bg-primary', defaultLabel: 'Latest' },
    upcoming: { tone: 'border-info-border bg-info-bg text-info', dot: 'bg-info', defaultLabel: 'Upcoming' },
    passed: { tone: 'border-success-border bg-success-bg text-success', dot: 'bg-success', defaultLabel: 'Passed' },
    warning: { tone: 'border-warning-border bg-warning-bg text-warning', dot: 'bg-warning', defaultLabel: 'Warning' },
    blocked: { tone: 'border-danger-border bg-danger-bg text-danger', dot: 'bg-danger', defaultLabel: 'Blocked' },
    running: { tone: 'border-info-border bg-info-bg text-info', dot: 'bg-info', defaultLabel: 'Running' },
    queued: { tone: 'border-border-solid bg-muted text-muted-foreground', dot: 'bg-muted-foreground', defaultLabel: 'Queued' },
    info: { tone: 'border-info-border bg-info-bg text-info', dot: 'bg-info', defaultLabel: 'Info' },
};
const SIZE: Record<NonNullable<StatusPillProps['size']>, string> = {
    xs: 'px-1.5 py-0.5 text-[10px] gap-1',
    sm: 'px-2 py-0.5 text-[11px] gap-1.5',
    md: 'px-2.5 py-1 text-xs gap-1.5',
};
export function StatusPill({ variant, label, size = 'sm', showIcon = true, className = '' }: StatusPillProps) {
    const c = CFG[variant];
    return (<span className={`inline-flex items-center rounded-full border font-medium tracking-tight ${c.tone} ${SIZE[size]} ${className}`}>
      {showIcon && (<span className={`size-1.5 rounded-full shrink-0 ${c.dot}`}/>)}
      {label ?? c.defaultLabel}
    </span>);
}

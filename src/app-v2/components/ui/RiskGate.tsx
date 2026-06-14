import { CheckCircle2, XCircle, AlertTriangle, Clock, Circle, type LucideIcon } from 'lucide-react';
export type GateStatus = 'passed' | 'blocked' | 'warning' | 'running' | 'queued';
const CFG: Record<GateStatus, {
    Icon: LucideIcon;
    tone: string;
    card: string;
    label: string;
}> = {
    passed: { Icon: CheckCircle2, tone: 'text-success', card: 'border-success-border bg-success-bg text-success', label: 'Passed' },
    blocked: { Icon: XCircle, tone: 'text-danger', card: 'border-danger-border bg-danger-bg text-danger', label: 'Blocked' },
    warning: { Icon: AlertTriangle, tone: 'text-warning', card: 'border-warning-border bg-warning-bg text-warning', label: 'Warning' },
    running: { Icon: Clock, tone: 'text-info', card: 'border-info-border bg-info-bg text-info', label: 'Running' },
    queued: { Icon: Circle, tone: 'text-muted-foreground', card: 'border-border bg-muted text-muted-foreground', label: 'Queued' },
};
interface RiskGateProps {
    label: string;
    status: GateStatus;
    detail?: string;
    actionLabel?: string;
    onAction?: () => void;
}
export function GateRow({ label, status, detail, actionLabel, onAction }: RiskGateProps) {
    const { Icon, tone, label: statusLabel } = CFG[status];
    return (<div className="flex items-center gap-3 py-2 border-b last:border-0">
      <Icon size={14} className={tone}/>
      <span className="flex-1 text-[12px] text-foreground">{label}</span>
      {detail && (<span className="text-[11px] hidden sm:block text-muted-foreground">{detail}</span>)}
      {onAction && (<button type="button" onClick={onAction} aria-label={`${actionLabel ?? 'Open'} ${label}`} className="rounded border border-border bg-card px-2 py-1 text-[10px] font-semibold text-primary transition-colors hover:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
        {actionLabel ?? 'Open'}
      </button>)}
      <span className={`text-[10px] font-semibold shrink-0 ${tone}`}>{statusLabel}</span>
    </div>);
}
/* Card variant for individual gate display */
export function RiskGate({ label, status, detail }: RiskGateProps) {
    const { Icon, card, label: statusLabel } = CFG[status];
    return (<div className={`flex items-start gap-2.5 rounded-lg p-3 border ${card}`}>
      <Icon size={14}/>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold">{label}</p>
        {detail && <p className="text-[11px] mt-0.5 opacity-80">{detail}</p>}
      </div>
      <span className="text-[10px] font-bold shrink-0">{statusLabel}</span>
    </div>);
}

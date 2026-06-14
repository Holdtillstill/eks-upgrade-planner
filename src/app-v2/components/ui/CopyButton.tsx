import { useRef, useState } from 'react';
import { Copy, Check, AlertTriangle, X } from 'lucide-react';
export function CopyButton({ text, label, size = 'sm', className = '', }: {
    text: string;
    label?: string;
    size?: 'sm' | 'md';
    className?: string;
}) {
    const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
    const [fallbackOpen, setFallbackOpen] = useState(false);
    const fallbackRef = useRef<HTMLTextAreaElement>(null);
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setState('copied');
            setFallbackOpen(false);
            setTimeout(() => setState('idle'), 2000);
        }
        catch {
            setState('failed');
            setFallbackOpen(true);
            window.setTimeout(() => {
                fallbackRef.current?.focus();
                fallbackRef.current?.select();
            }, 0);
            setTimeout(() => setState('idle'), 3500);
        }
    };
    const copied = state === 'copied';
    const failed = state === 'failed';
    const pad = size === 'sm' ? 'px-2 py-1 text-[11px] gap-1' : 'px-3 py-1.5 text-xs gap-1.5';
    const buttonTone = copied
        ? 'border-success-border bg-success-bg text-success'
        : failed
            ? 'border-danger-border bg-danger-bg text-danger'
            : 'border-border-solid bg-card text-muted-foreground hover:border-primary hover:text-primary';
    const accessibleLabel = copied
        ? 'Copied to clipboard'
        : failed
            ? 'Copy failed - select text manually'
            : label ?? 'Copy to clipboard';
    return (<>
    <button onClick={handleCopy} aria-label={accessibleLabel} className={`inline-flex items-center rounded border font-medium transition-all duration-150 ${buttonTone} ${pad} ${className}`} title={copied ? 'Copied!' : failed ? 'Copy failed - select text manually' : 'Copy to clipboard'}>
      {copied ? <Check size={11}/> : failed ? <AlertTriangle size={11}/> : <Copy size={11}/>}
      {label && <span>{copied ? 'Copied!' : failed ? 'Copy failed' : label}</span>}
    </button>
    {state !== 'idle' && (<span role="status" className={`fixed bottom-4 right-4 z-50 rounded-lg border px-3 py-2 text-[12px] font-semibold shadow-lg ${copied ? 'border-success-border bg-success-bg text-success' : 'border-danger-border bg-danger-bg text-danger'}`}>
      {copied ? 'Copied to clipboard' : 'Copy failed - select text manually'}
    </span>)}
    {fallbackOpen && (<div role="dialog" aria-label="Manual copy fallback" className="fixed bottom-4 left-4 z-50 w-[min(520px,calc(100vw-2rem))] rounded-xl border border-danger-border bg-card shadow-xl">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-[12px] font-semibold text-danger">Copy manually</p>
        <button type="button" onClick={() => setFallbackOpen(false)} className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Close manual copy fallback">
          <X size={13}/>
        </button>
      </div>
      <div className="p-3">
        <textarea ref={fallbackRef} value={text} readOnly onFocus={event => event.currentTarget.select()} className="h-36 w-full resize-none rounded-lg border border-border bg-muted p-3 font-mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-danger"/>
        <p className="mt-2 text-[11px] text-muted-foreground">Select the text above and copy it with Cmd+C.</p>
      </div>
    </div>)}
  </>);
}

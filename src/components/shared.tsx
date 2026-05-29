import { useEffect, useId, useRef, useState } from 'react';
import { type EksVersion } from '../data/versions';
import { getSupportStatus, statusLabel } from '../lib/planner';
import { statusTone } from '../lib/ui';

export function Source({ label, url }: { label: string; url: string }) {
  return <a className="source" href={url} target="_blank" rel="noreferrer" aria-label={`Open source: ${label}`}>{label}</a>;
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const statusId = useId();
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
  }, []);

  async function copy() {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(text);
      setStatus('success');
    } catch {
      setStatus('error');
    }
    resetTimer.current = window.setTimeout(() => setStatus('idle'), 1800);
  }

  const message = status === 'success'
    ? `${label} copied to clipboard`
    : status === 'error'
      ? `${label} could not be copied`
      : '';

  return <>
    <button className="copy" type="button" onClick={copy} aria-label={label} aria-describedby={message ? statusId : undefined}>{status === 'success' ? 'Copied' : status === 'error' ? 'Copy failed' : label}</button>
    <span id={statusId} className="sr-only" role="status" aria-live="polite" aria-atomic="true">{message}</span>
  </>;
}

export function StatusPill({ version }: { version: EksVersion }) {
  return <span className={`pill ${statusTone(version)}`}>{statusLabel(getSupportStatus(version))}</span>;
}

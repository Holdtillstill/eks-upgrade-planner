import { useState } from 'react';
import { type EksVersion } from '../data/versions';
import { getSupportStatus, statusLabel } from '../lib/planner';
import { statusTone } from '../lib/ui';

export function Source({ label, url }: { label: string; url: string }) {
  return <a className="source" href={url} target="_blank" rel="noreferrer" aria-label={`Open source: ${label}`}>{label}</a>;
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return <button className="copy" type="button" onClick={copy} aria-label={label}>{copied ? 'Copied' : label}</button>;
}

export function StatusPill({ version }: { version: EksVersion }) {
  return <span className={`pill ${statusTone(version)}`}>{statusLabel(getSupportStatus(version))}</span>;
}

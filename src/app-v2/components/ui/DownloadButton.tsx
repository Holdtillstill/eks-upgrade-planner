import { Download } from 'lucide-react';
import { downloadTextFile } from '../../../lib/download';

export function DownloadButton({ text, filename, label = 'Download', mimeType = 'text/plain;charset=utf-8', size = 'sm', className = '' }: {
    text: string;
    filename: string;
    label?: string;
    mimeType?: string;
    size?: 'sm' | 'md';
    className?: string;
}) {
    const pad = size === 'sm' ? 'px-2 py-1 text-[11px] gap-1' : 'px-3 py-1.5 text-xs gap-1.5';
    return (<button type="button" onClick={() => downloadTextFile(filename, text, mimeType)} className={`inline-flex items-center rounded border border-border-solid bg-card font-medium text-muted-foreground transition-all duration-150 hover:border-primary hover:text-primary ${pad} ${className}`}>
      <Download size={11}/>
      <span>{label}</span>
    </button>);
}

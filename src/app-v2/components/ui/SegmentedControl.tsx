interface SegmentedControlProps<T extends string> {
    options: {
        label: string;
        value: T;
    }[];
    value: T;
    onChange: (v: T) => void;
    size?: 'sm' | 'md';
}
export function SegmentedControl<T extends string>({ options, value, onChange, size = 'sm' }: SegmentedControlProps<T>) {
    const pad = size === 'sm' ? 'px-3 py-1 text-[11px]' : 'px-4 py-1.5 text-xs';
    return (<div className="inline-flex rounded-lg border border-border bg-muted p-0.5 gap-0.5" role="tablist">
      {options.map(opt => (<button key={opt.value} role="tab" aria-selected={value === opt.value} onClick={() => onChange(opt.value)} className={`${pad} rounded-md font-medium transition-all duration-150 ${value === opt.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
          {opt.label}
        </button>))}
    </div>);
}

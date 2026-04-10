import React from 'react';

export interface SummaryMetricItem {
    key: string;
    label: React.ReactNode;
    value: React.ReactNode;
    helper?: React.ReactNode;
    tone: string;
    labelClassName?: string;
    valueClassName?: string;
    helperClassName?: string;
}

interface SummaryMetricGridProps {
    items: SummaryMetricItem[];
    className?: string;
    cardClassName?: string;
}

export const SummaryMetricGrid: React.FC<SummaryMetricGridProps> = ({
    items,
    className = 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4',
    cardClassName = 'rounded-2xl border px-4 py-3',
}) => {
    return (
        <div className={className}>
            {items.map((item) => (
                <div key={item.key} className={`${cardClassName} ${item.tone}`}>
                    <p className={item.labelClassName || 'text-[10px] font-black uppercase tracking-[0.18em] text-slate-500'}>{item.label}</p>
                    <div className={item.valueClassName || 'mt-1 text-2xl font-black text-slate-900'}>{item.value}</div>
                    {item.helper ? (
                        <div className={item.helperClassName || 'mt-1 text-xs font-bold text-slate-600'}>{item.helper}</div>
                    ) : null}
                </div>
            ))}
        </div>
    );
};
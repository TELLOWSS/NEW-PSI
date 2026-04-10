import React from 'react';

export interface WhyThisResultPanelEntry {
    key: string;
    content: React.ReactNode;
}

interface WhyThisResultPanelProps {
    title: React.ReactNode;
    badge?: React.ReactNode;
    entries: WhyThisResultPanelEntry[];
    emptyState?: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
    headerClassName?: string;
    titleClassName?: string;
    listClassName?: string;
    emptyStateClassName?: string;
}

export const WhyThisResultPanel: React.FC<WhyThisResultPanelProps> = ({
    title,
    badge,
    entries,
    emptyState,
    children,
    className = 'rounded-[18px] border p-3.5 shadow-sm min-h-0',
    headerClassName = 'flex items-center justify-between gap-2',
    titleClassName = 'text-[11px] font-black uppercase tracking-[0.16em]',
    listClassName = 'mt-3 space-y-1.5',
    emptyStateClassName = 'rounded-2xl border border-dashed px-3 py-3 text-[9px] font-bold',
}) => {
    return (
        <section className={className}>
            <div className={headerClassName}>
                <h3 className={titleClassName}>{title}</h3>
                {badge}
            </div>
            <div className={listClassName}>
                {entries.length > 0
                    ? entries.map((entry) => <React.Fragment key={entry.key}>{entry.content}</React.Fragment>)
                    : emptyState
                        ? <p className={emptyStateClassName}>{emptyState}</p>
                        : null}
            </div>
            {children}
        </section>
    );
};

import React from 'react';

export interface NextActionChecklistItem {
    key: string;
    content: React.ReactNode;
}

interface NextActionChecklistProps {
    title: React.ReactNode;
    items: NextActionChecklistItem[];
    emptyState?: React.ReactNode;
    className?: string;
    titleClassName?: string;
    listClassName?: string;
    itemClassName?: string;
    bulletClassName?: string;
    emptyStateClassName?: string;
}

export const NextActionChecklist: React.FC<NextActionChecklistProps> = ({
    title,
    items,
    emptyState,
    className = 'mt-1 overflow-hidden border-t border-slate-100 pt-1',
    titleClassName = 'mb-1 text-[7px] font-black uppercase tracking-[0.14em] text-slate-400',
    listClassName = 'space-y-1 text-[8px] leading-[1.3] text-slate-700',
    itemClassName = 'flex items-start gap-1',
    bulletClassName = 'mt-[2px] text-violet-500',
    emptyStateClassName = 'text-[8px] font-bold text-slate-400',
}) => {
    return (
        <div className={className}>
            <p className={titleClassName}>{title}</p>
            {items.length > 0 ? (
                <ul className={listClassName}>
                    {items.map((item) => (
                        <li key={item.key} className={itemClassName}>
                            <span className={bulletClassName}>•</span>
                            <span>{item.content}</span>
                        </li>
                    ))}
                </ul>
            ) : emptyState ? (
                <p className={emptyStateClassName}>{emptyState}</p>
            ) : null}
        </div>
    );
};

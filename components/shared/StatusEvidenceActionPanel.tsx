import React from 'react';
import { InsightGrid } from '../common/InsightGrid';

export interface StatusEvidenceActionItem {
    key: string;
    eyebrow: string;
    title: React.ReactNode;
    description?: React.ReactNode;
    content?: React.ReactNode;
    tone: string;
    eyebrowClassName?: string;
}

interface StatusEvidenceActionPanelProps {
    items: StatusEvidenceActionItem[];
    className?: string;
    cardClassName?: string;
    titleClassName?: string;
    descriptionClassName?: string;
}

export const StatusEvidenceActionPanel: React.FC<StatusEvidenceActionPanelProps> = ({
    items,
    className = 'grid grid-cols-1 gap-3 md:grid-cols-3',
    cardClassName = 'rounded-2xl border px-3.5 py-3',
    titleClassName = 'mt-2 text-sm font-black text-slate-900',
    descriptionClassName = 'mt-2 text-xs font-semibold leading-relaxed text-slate-600',
}) => {
    return (
        <InsightGrid
            items={items}
            className={className}
            cardClassName={cardClassName}
            eyebrowClassName="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500"
            titleClassName={titleClassName}
            descriptionClassName={descriptionClassName}
        />
    );
};

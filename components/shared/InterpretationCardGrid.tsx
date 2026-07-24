import React from 'react';
import { InsightGrid } from '../common/InsightGrid';
import { MOBILE_CARD_GRID_ITEM_CLASS } from './cardTokens';

export interface InterpretationCardItem {
    key?: string;
    eyebrow: string;
    title: string;
    description: string;
    tone?: string;
}

interface InterpretationCardGridProps {
    items: InterpretationCardItem[];
    className?: string;
    cardClassName?: string;
    eyebrowClassName?: string;
    titleClassName?: string;
    descriptionClassName?: string;
}

export const InterpretationCardGrid: React.FC<InterpretationCardGridProps> = ({
    items,
    className = 'grid grid-cols-1 xl:grid-cols-3 gap-3',
    cardClassName = MOBILE_CARD_GRID_ITEM_CLASS,
    eyebrowClassName = 'text-[10px] font-black uppercase tracking-[0.22em] text-slate-500',
    titleClassName = 'mt-2 text-sm font-black text-slate-900',
    descriptionClassName = 'mt-2 text-[12px] font-semibold text-slate-600 leading-relaxed',
}) => {
    return (
        <InsightGrid
            items={items.map((card) => ({ ...card, key: card.key || `${card.eyebrow}:${card.title}` }))}
            className={className}
            cardClassName={cardClassName}
            eyebrowClassName={eyebrowClassName}
            titleClassName={titleClassName}
            descriptionClassName={descriptionClassName}
        />
    );
};

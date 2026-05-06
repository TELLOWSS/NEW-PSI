import React from 'react';
import { MOBILE_CARD_LIST_ITEM_CLASS } from './cardTokens';

interface ControlPanelCardProps {
    label?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    labelClassName?: string;
    contentClassName?: string;
}

export const ControlPanelCard: React.FC<ControlPanelCardProps> = ({
    label,
    children,
    className = `${MOBILE_CARD_LIST_ITEM_CLASS} border-slate-200 bg-slate-50`,
    labelClassName = 'text-[11px] font-black text-slate-500 uppercase tracking-wider',
    contentClassName,
}) => {
    const resolvedContentClassName = contentClassName ?? (label ? 'mt-2' : '');

    return (
        <div className={className}>
            {label ? <label className={labelClassName}>{label}</label> : null}
            <div className={resolvedContentClassName}>{children}</div>
        </div>
    );
};
import React from 'react';
import { PanelFrame } from '../common/PanelFrame';
import { SECTION_PANEL_TONE_STYLES, SectionPanelToneVariant } from './toneVariants';

interface SectionPanelCardProps {
    variant?: SectionPanelToneVariant;
    eyebrow?: React.ReactNode;
    title?: React.ReactNode;
    description?: React.ReactNode;
    headerAction?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    headerClassName?: string;
    headerContentClassName?: string;
    eyebrowClassName?: string;
    titleClassName?: string;
    descriptionClassName?: string;
    bodyClassName?: string;
}

export const SectionPanelCard: React.FC<SectionPanelCardProps> = ({
    variant = 'slate',
    eyebrow,
    title,
    description,
    headerAction,
    children,
    className = '',
    headerClassName = '',
    headerContentClassName = 'min-w-0',
    eyebrowClassName = 'text-[10px] font-black uppercase tracking-[0.18em] text-slate-500',
    titleClassName = 'text-xs font-black text-slate-800',
    descriptionClassName = 'mt-1 text-[11px] font-bold text-slate-500',
    bodyClassName = 'mt-4',
}) => {
    const toneStyles = SECTION_PANEL_TONE_STYLES[variant] || SECTION_PANEL_TONE_STYLES.slate;

    return (
        <PanelFrame
            className={`${toneStyles.container}${className ? ` ${className}` : ''}`}
            bodyClassName={bodyClassName}
            header={(eyebrow || title || description || headerAction) ? (
                <div className={headerClassName}>
                    <div className={headerContentClassName}>
                        {eyebrow ? <div className={eyebrowClassName}>{eyebrow}</div> : null}
                        {title ? <div className={titleClassName}>{title}</div> : null}
                        {description ? <div className={descriptionClassName}>{description}</div> : null}
                    </div>
                    {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
                </div>
            ) : null}
        >
            {children}
        </PanelFrame>
    );
};

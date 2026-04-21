import React from 'react';
import { OPERATIONAL_PREVIEW_TONE_STYLES, OperationalPreviewToneVariant } from './toneVariants';

interface OperationalPreviewCardProps {
    variant?: OperationalPreviewToneVariant;
    eyebrow?: React.ReactNode;
    leading?: React.ReactNode;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    badge?: React.ReactNode;
    body?: React.ReactNode;
    footer?: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
    headerClassName?: string;
    contentClassName?: string;
    eyebrowClassName?: string;
    titleClassName?: string;
    subtitleClassName?: string;
    bodyClassName?: string;
    footerClassName?: string;
    actionsClassName?: string;
}

export const OperationalPreviewCard: React.FC<OperationalPreviewCardProps> = ({
    variant = 'whiteCompact',
    eyebrow,
    leading,
    title,
    subtitle,
    badge,
    body,
    footer,
    actions,
    className = '',
    headerClassName = 'flex items-start justify-between gap-3',
    contentClassName = 'min-w-0',
    eyebrowClassName = 'text-[10px] font-black uppercase tracking-[0.18em] text-slate-500',
    titleClassName = 'text-lg font-black text-slate-900',
    subtitleClassName = 'mt-1 text-[11px] font-bold text-slate-500',
    bodyClassName = 'mt-3',
    footerClassName = 'mt-3 text-[11px] font-bold text-slate-500',
    actionsClassName = 'mt-3 flex flex-wrap gap-2',
}) => {
    const toneStyles = OPERATIONAL_PREVIEW_TONE_STYLES[variant] || OPERATIONAL_PREVIEW_TONE_STYLES.whiteCompact;

    return (
        <div className={`${toneStyles.container}${className ? ` ${className}` : ''}`}>
            <div className={headerClassName}>
                <div className={contentClassName}>
                    {leading ? <div className="mb-2">{leading}</div> : null}
                    {eyebrow ? <div className={eyebrowClassName}>{eyebrow}</div> : null}
                    {title ? <div className={titleClassName}>{title}</div> : null}
                    {subtitle ? <div className={subtitleClassName}>{subtitle}</div> : null}
                </div>
                {badge ? <div className="shrink-0">{badge}</div> : null}
            </div>
            {body ? <div className={bodyClassName}>{body}</div> : null}
            {footer ? <div className={footerClassName}>{footer}</div> : null}
            {actions ? <div className={actionsClassName}>{actions}</div> : null}
        </div>
    );
};
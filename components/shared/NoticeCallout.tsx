import React from 'react';
import { NOTICE_CALLOUT_TONE_STYLES, type NoticeToneVariant } from './toneVariants';

interface NoticeCalloutProps {
    eyebrow?: React.ReactNode;
    title: React.ReactNode;
    description?: React.ReactNode;
    action?: React.ReactNode;
    variant?: NoticeToneVariant;
    className?: string;
    eyebrowClassName?: string;
    titleClassName?: string;
    descriptionClassName?: string;
    bodyClassName?: string;
    actionWrapperClassName?: string;
}

export const NoticeCallout: React.FC<NoticeCalloutProps> = ({
    eyebrow,
    title,
    description,
    action,
    variant = 'white',
    className,
    eyebrowClassName,
    titleClassName,
    descriptionClassName,
    bodyClassName = 'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between',
    actionWrapperClassName,
}) => {
    const styles = NOTICE_CALLOUT_TONE_STYLES[variant];

    return (
        <div className={className ?? `w-full rounded-2xl border px-4 py-3 ${styles.container}`}>
            <div className={bodyClassName}>
                <div>
                    {eyebrow ? <div className={eyebrowClassName ?? `text-[11px] font-black uppercase tracking-[0.18em] ${styles.eyebrow}`}>{eyebrow}</div> : null}
                    <div className={titleClassName ?? `text-sm font-black ${styles.title}`}>{title}</div>
                    {description ? <div className={descriptionClassName ?? `mt-1 text-xs font-bold ${styles.description}`}>{description}</div> : null}
                </div>
                {action ? <div className={actionWrapperClassName ?? styles.actionWrapper}>{action}</div> : null}
            </div>
        </div>
    );
};
import React from 'react';
import { EmptyState } from '../common/EmptyState';
import { EMPTY_STATE_TONE_STYLES, type EmptyStateToneVariant } from './toneVariants';

interface EmptyStatePanelProps {
    title: React.ReactNode;
    description?: React.ReactNode;
    variant?: EmptyStateToneVariant;
    className?: string;
    titleClassName?: string;
    descriptionClassName?: string;
}

export const EmptyStatePanel: React.FC<EmptyStatePanelProps> = ({
    title,
    description,
    variant = 'slate',
    className,
    titleClassName,
    descriptionClassName,
}) => {
    const styles = EMPTY_STATE_TONE_STYLES[variant];

    return (
        <EmptyState
            title={title}
            description={description}
            className={className ?? `${styles.container} px-4 py-8`}
            titleClassName={titleClassName ?? styles.title}
            descriptionClassName={descriptionClassName ?? styles.description}
            unstyled
        />
    );
};

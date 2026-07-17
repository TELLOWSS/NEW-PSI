import React from 'react';

interface BadgeProps {
    children: React.ReactNode;
    className: string;
    ariaLabel?: string;
    title?: string;
    showDot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
    children,
    className,
    ariaLabel,
    title,
    showDot = false,
}) => (
    <span className={`inline-flex items-center rounded-full border ${className}`} aria-label={ariaLabel} title={title}>
        {showDot ? <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
        {children}
    </span>
);

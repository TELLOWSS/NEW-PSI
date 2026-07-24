import React from 'react';

interface ReportActionBarProps {
    ariaLabel: string;
    children: React.ReactNode;
    className?: string;
}

export const ReportActionBar: React.FC<ReportActionBarProps> = ({
    ariaLabel,
    children,
    className = '',
}) => (
    <div role="toolbar" aria-label={ariaLabel} className={className}>
        {children}
    </div>
);

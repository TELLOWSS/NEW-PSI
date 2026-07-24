import React from 'react';

interface PanelFrameProps {
    as?: 'section' | 'div';
    ariaLabel?: string;
    className?: string;
    header?: React.ReactNode;
    bodyClassName?: string;
    children: React.ReactNode;
}

export const PanelFrame: React.FC<PanelFrameProps> = ({
    as = 'div',
    ariaLabel,
    className = '',
    header,
    bodyClassName = '',
    children,
}) => React.createElement(
    as,
    { className, 'aria-label': ariaLabel },
    <>
        {header}
        <div className={bodyClassName}>{children}</div>
    </>,
);

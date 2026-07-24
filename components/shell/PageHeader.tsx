import React from 'react';

interface PageHeaderProps {
    show?: boolean;
    title: string;
    description?: string;
    groupLabel?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
    show = true,
    title,
    description,
    groupLabel,
}) => {
    if (!show) return null;

    return (
        <section className="psi-page-header mb-5">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    {groupLabel ? (
                        <span className="psi-status-badge">
                            {groupLabel}
                        </span>
                    ) : null}
                    <h1 className="psi-page-title">{title}</h1>
                </div>
                {description ? (
                    <p className="psi-body-compact mt-1.5 max-w-4xl">{description}</p>
                ) : null}
            </div>
        </section>
    );
};

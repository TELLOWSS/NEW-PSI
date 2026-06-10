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
            <div className="flex min-w-0 items-start gap-3">
                <span aria-hidden="true" className="mt-1 h-10 w-1 shrink-0 rounded-full bg-gradient-to-b from-blue-500 to-cyan-400" />
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        {groupLabel ? (
                            <span className="psi-status-badge">
                                {groupLabel}
                            </span>
                        ) : null}
                        <h1 className="text-lg font-black tracking-tight sm:text-xl">{title}</h1>
                    </div>
                    {description ? (
                        <p className="mt-1.5 max-w-4xl text-xs font-semibold leading-5 psi-copy-muted sm:text-sm">{description}</p>
                    ) : null}
                </div>
            </div>
        </section>
    );
};

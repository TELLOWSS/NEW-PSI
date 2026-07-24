import React from 'react';

export interface InsightGridItem {
    key: string;
    eyebrow: React.ReactNode;
    title: React.ReactNode;
    description?: React.ReactNode;
    content?: React.ReactNode;
    tone?: string;
    eyebrowClassName?: string;
}

interface InsightGridProps {
    items: InsightGridItem[];
    className: string;
    cardClassName: string;
    eyebrowClassName: string;
    titleClassName: string;
    descriptionClassName: string;
}

export const InsightGrid: React.FC<InsightGridProps> = ({
    items,
    className,
    cardClassName,
    eyebrowClassName,
    titleClassName,
    descriptionClassName,
}) => (
    <div className={className}>
        {items.map((item) => (
            <article key={item.key} className={`${cardClassName} ${item.tone || ''}`}>
                <p className={item.eyebrowClassName || eyebrowClassName}>{item.eyebrow}</p>
                <div className={titleClassName}>{item.title}</div>
                {item.description ? <div className={descriptionClassName}>{item.description}</div> : null}
                {item.content}
            </article>
        ))}
    </div>
);

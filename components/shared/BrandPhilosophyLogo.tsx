import React, { useId } from 'react';

interface BrandPhilosophyLogoProps {
    className?: string;
}

export const BrandPhilosophyLogo: React.FC<BrandPhilosophyLogoProps> = ({ className = 'w-10 h-10' }) => {
    const gradientId = useId();

    return (
        <svg className={className} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-label="PSI 브랜드 철학 로고">
            <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4f46e5" />
                    <stop offset="100%" stopColor="#4338ca" />
                </linearGradient>
            </defs>
            <path d="M8 14 L40 6 V22 C40 34 33 42 24 44 C15 42 8 34 8 22 Z" fill={`url(#${gradientId})`} />
            <circle cx="24" cy="25" r="7" stroke="white" strokeWidth="2.5" fill="none" />
            <circle cx="24" cy="25" r="3" fill="white" />
            <path d="M24 6 V16" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        </svg>
    );
};

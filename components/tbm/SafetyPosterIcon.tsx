import React from 'react';

export type SafetyPosterIconName =
    | 'action'
    | 'boots'
    | 'calendar'
    | 'check'
    | 'clock'
    | 'focus'
    | 'gloves'
    | 'goggles'
    | 'harness'
    | 'hearing'
    | 'helmet'
    | 'mask'
    | 'report'
    | 'reassess'
    | 'shield'
    | 'stop'
    | 'warning';

interface SafetyPosterIconProps {
    name: SafetyPosterIconName;
    className?: string;
    label?: string;
}

/**
 * Print-safe, fixed SVG symbols used by the A4 safety poster.
 *
 * The component intentionally accepts a closed icon name union. It never renders
 * AI-generated or remote imagery, so the symbol set stays deterministic in print.
 */
const SafetyPosterIcon: React.FC<SafetyPosterIconProps> = ({ name, className = 'h-6 w-6', label }) => {
    const accessibilityProps = label
        ? { role: 'img' as const, 'aria-label': label }
        : { 'aria-hidden': true as const };

    const commonProps = {
        className,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.9,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
        focusable: false,
        ...accessibilityProps,
    };

    switch (name) {
        case 'action':
            return (
                <svg {...commonProps}>
                    <path d="M13 2 4.5 13h6L10 22l9-12h-6l0-8Z" />
                </svg>
            );
        case 'boots':
            return (
                <svg {...commonProps}>
                    <path d="M5 3h6v8.4l3.3 2.1H20c1.1 0 2 .9 2 2v2.8H4V12h1V3Z" />
                    <path d="M4 18.3V21h18v-2.7M7 6h4M7 9h4" />
                </svg>
            );
        case 'calendar':
            return (
                <svg {...commonProps}>
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <path d="M16 3v4M8 3v4M3 10h18M7 14h3M14 14h3M7 17h3" />
                </svg>
            );
        case 'check':
            return (
                <svg {...commonProps}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="m8 12 2.6 2.7L16.5 9" />
                </svg>
            );
        case 'clock':
            return (
                <svg {...commonProps}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3.5 2" />
                </svg>
            );
        case 'focus':
            return (
                <svg {...commonProps}>
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
                </svg>
            );
        case 'gloves':
            return (
                <svg {...commonProps}>
                    <path d="M7.3 12.4V5.5a1.3 1.3 0 0 1 2.6 0v4.1-6a1.3 1.3 0 0 1 2.6 0v6-4.8a1.3 1.3 0 0 1 2.6 0v5.4-3.5a1.3 1.3 0 0 1 2.6 0v7c0 4.6-2.5 7.3-6.6 7.3-3.3 0-5.1-1.6-6.2-4.4L3.2 12a1.4 1.4 0 0 1 2.5-1.2l1.6 1.6Z" />
                </svg>
            );
        case 'goggles':
            return (
                <svg {...commonProps}>
                    <path d="M3 10.5 5 8h14l2 2.5M4.2 10.5l.8 5A2 2 0 0 0 7 17h2a2 2 0 0 0 2-2v-3.5M19.8 10.5l-.8 5a2 2 0 0 1-2 1.5h-2a2 2 0 0 1-2-2v-3.5M11 13h2" />
                </svg>
            );
        case 'harness':
            return (
                <svg {...commonProps}>
                    <circle cx="12" cy="4.5" r="2.5" />
                    <path d="M8 9 5 12M16 9l3 3M9 8l3 5 3-5M12 13v8M8 21l4-8 4 8M8 9l1 8h6l1-8" />
                </svg>
            );
        case 'hearing':
            return (
                <svg {...commonProps}>
                    <path d="M5 13V9a7 7 0 0 1 14 0v4M5 12H3.5A1.5 1.5 0 0 0 2 13.5v4A1.5 1.5 0 0 0 3.5 19H6v-7H5ZM19 12h1.5a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5H18v-7h1Z" />
                </svg>
            );
        case 'helmet':
            return (
                <svg {...commonProps}>
                    <path d="M4 15a8 8 0 0 1 16 0M3 15h18v3H3v-3ZM9 7v5M15 7v5M12 5v7" />
                </svg>
            );
        case 'mask':
            return (
                <svg {...commonProps}>
                    <path d="M5 9c4-3 10-3 14 0v7c-4 3-10 3-14 0V9Z" />
                    <path d="M5 10 2 9v5l3 1M19 10l3-1v5l-3 1M9 11h6M9 14h6" />
                </svg>
            );
        case 'report':
            return (
                <svg {...commonProps}>
                    <path d="M4 4h16v12H8l-4 4V4Z" />
                    <path d="M8 8h8M8 12h5" />
                </svg>
            );
        case 'reassess':
            return (
                <svg {...commonProps}>
                    <path d="M20 7V3h-4M20 3l-4.3 4.3A7 7 0 1 0 18 16" />
                    <path d="m9 12 2 2 4-4" />
                </svg>
            );
        case 'shield':
            return (
                <svg {...commonProps}>
                    <path d="M12 2 4.5 5v6.2c0 5 3 8.5 7.5 10.8 4.5-2.3 7.5-5.8 7.5-10.8V5L12 2Z" />
                    <path d="m8.5 12 2.2 2.2 4.8-5" />
                </svg>
            );
        case 'stop':
            return (
                <svg {...commonProps}>
                    <path d="m8 2-6 6v8l6 6h8l6-6V8l-6-6H8Z" />
                    <path d="M12 7v6M12 17h.01" />
                </svg>
            );
        case 'warning':
        default:
            return (
                <svg {...commonProps}>
                    <path d="M12 3 2.5 20h19L12 3Z" />
                    <path d="M12 9v5M12 17.5h.01" />
                </svg>
            );
    }
};

export default SafetyPosterIcon;

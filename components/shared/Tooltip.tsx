import React, { useId, useState } from 'react';

interface TooltipProps {
    text: string;
    children: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ text, children }) => {
    const tooltipId = useId();
    const [isHovered, setIsHovered] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);
    const isVisible = (isHovered || isFocused) && !isDismissed;

    const handleEscape = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Escape' || !isVisible) return;
        event.preventDefault();
        event.stopPropagation();
        setIsDismissed(true);
    };

    return (
        <div
            className="relative flex items-center"
            tabIndex={0}
            aria-label="추가 설명"
            aria-describedby={isVisible ? tooltipId : undefined}
            onMouseEnter={() => {
                setIsHovered(true);
                setIsDismissed(false);
            }}
            onMouseLeave={() => setIsHovered(false)}
            onFocus={() => {
                setIsFocused(true);
                setIsDismissed(false);
            }}
            onBlur={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                setIsFocused(false);
                setIsDismissed(false);
            }}
            onKeyDown={handleEscape}
        >
            {children}
            {isVisible && (
                <div
                    id={tooltipId}
                    role="tooltip"
                    className="absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-xs -translate-x-1/2 rounded-md bg-slate-800 p-2.5 text-xs font-semibold text-white shadow-lg"
                >
                    {text}
                    <span
                        aria-hidden="true"
                        className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-slate-800"
                    />
                </div>
            )}
        </div>
    );
};

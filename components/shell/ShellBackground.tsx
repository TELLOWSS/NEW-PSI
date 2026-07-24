import React from 'react';

interface ShellBackgroundProps {
    isDark?: boolean;
}

export const ShellBackground: React.FC<ShellBackgroundProps> = () => {
    return (
        <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10"
            style={{ background: 'var(--psi-canvas)' }}
        />
    );
};

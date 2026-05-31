import React from 'react';

interface ShellBackgroundProps {
    isDark?: boolean;
}

export const ShellBackground: React.FC<ShellBackgroundProps> = ({ isDark = true }) => {
    return (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div
                className={`absolute inset-0 ${
                    isDark
                        ? 'bg-[radial-gradient(circle_at_20%_15%,rgba(59,130,246,0.12),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(16,185,129,0.08),transparent_34%),linear-gradient(180deg,#0f172a_0%,#111827_45%,#0b1220_100%)]'
                        : 'bg-[radial-gradient(circle_at_20%_15%,rgba(59,130,246,0.09),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(16,185,129,0.07),transparent_34%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_45%,#e2e8f0_100%)]'
                }`}
            />
            <div
                className={`absolute inset-0 ${
                    isDark
                        ? 'bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] opacity-25'
                        : 'bg-[linear-gradient(rgba(51,65,85,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(51,65,85,0.06)_1px,transparent_1px)] opacity-35'
                } bg-[size:34px_34px]`}
            />
        </div>
    );
};

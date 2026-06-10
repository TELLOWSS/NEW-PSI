import React from 'react';

export type ActionButtonVariant =
    | 'slate'
    | 'slateSoft'
    | 'slateSolid'
    | 'glassDark'
    | 'indigo'
    | 'indigoSolid'
    | 'sky'
    | 'emerald'
    | 'emeraldSoft'
    | 'emeraldSolid'
    | 'rose'
    | 'roseSoft'
    | 'amber'
    | 'amberSoft';

const ACTION_BUTTON_TONE_STYLES: Record<ActionButtonVariant, string> = {
    slate: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
    slateSoft: 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
    slateSolid: 'border-slate-900 bg-slate-900 text-white hover:bg-black dark:border-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500',
    glassDark: 'border-white/20 bg-white/10 text-white hover:bg-white/20 backdrop-blur-md',
    indigo: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200 dark:hover:bg-blue-500/20',
    indigoSolid: 'border-blue-700 bg-blue-700 text-white hover:bg-blue-600 dark:border-blue-500 dark:bg-blue-600 dark:hover:bg-blue-500',
    sky: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100',
    emerald: 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50',
    emeraldSoft: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    emeraldSolid: 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700',
    rose: 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50',
    roseSoft: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
    amber: 'border-amber-200 bg-white text-amber-700 hover:bg-amber-100',
    amberSoft: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
};

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ActionButtonVariant;
    fullWidth?: boolean;
}

export const ActionButton: React.FC<ActionButtonProps> = ({
    variant = 'slate',
    fullWidth = false,
    className = '',
    type = 'button',
    children,
    ...props
}) => {
    return (
        <button
            type={type}
            className={`${fullWidth ? 'flex w-full items-center justify-center' : 'inline-flex items-center justify-center'} min-h-10 rounded-xl border px-3 py-2 text-xs font-black transition-colors disabled:opacity-50 ${ACTION_BUTTON_TONE_STYLES[variant]}${className ? ` ${className}` : ''}`}
            {...props}
        >
            {children}
        </button>
    );
};

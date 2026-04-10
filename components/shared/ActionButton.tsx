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
    slate: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    slateSoft: 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100',
    slateSolid: 'border-slate-900 bg-slate-900 text-white hover:bg-black',
    glassDark: 'border-white/20 bg-white/10 text-white hover:bg-white/20 backdrop-blur-md',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
    indigoSolid: 'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-500',
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
            className={`${fullWidth ? 'w-full' : 'inline-flex items-center justify-center'} rounded-xl border px-3 py-2 text-xs font-black disabled:opacity-60 ${ACTION_BUTTON_TONE_STYLES[variant]}${className ? ` ${className}` : ''}`}
            {...props}
        >
            {children}
        </button>
    );
};
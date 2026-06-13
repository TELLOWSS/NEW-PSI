import React from 'react';

export const Footer: React.FC = () => {
    return (
        <footer className="pointer-events-none fixed bottom-0 lg:left-72 right-0 z-20 hidden border-t border-slate-200 bg-white/90 py-2 text-center text-[11px] font-medium text-slate-600 backdrop-blur-sm transition-colors dark:border-slate-800 dark:bg-slate-950/90 dark:text-slate-400 lg:block">
            ⓒ 2026 PSI (Proactive Safety Intelligence). All rights reserved. | 특허 출원 절차 진행 중
        </footer>
    );
};

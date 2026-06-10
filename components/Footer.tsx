import React from 'react';

export const Footer: React.FC = () => {
    return (
        <footer className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/90 py-2 text-center text-[11px] font-medium text-slate-600 backdrop-blur-sm transition-colors pointer-events-none dark:border-slate-800 dark:bg-slate-950/90 dark:text-slate-400">
            ⓒ 2026 PSI (Proactive Safety Intelligence). All rights reserved. | 특허출원 제10-2026-0039151호
        </footer>
    );
};

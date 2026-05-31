import React from 'react';

interface AppShellProps {
    desktopSidebar: React.ReactNode;
    mobileSidebarOverlay?: React.ReactNode;
    topBar: React.ReactNode;
    content: React.ReactNode;
    mobileBottomNav?: React.ReactNode;
    scrollTopButton?: React.ReactNode;
    footer?: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
    desktopSidebar,
    mobileSidebarOverlay,
    topBar,
    content,
    mobileBottomNav,
    scrollTopButton,
    footer,
}) => {
    return (
        <div className="flex h-screen bg-slate-950 text-slate-100 transition-colors duration-200">
            <div className="no-print hidden h-full lg:block">{desktopSidebar}</div>
            {mobileSidebarOverlay}

            <div className="flex w-full flex-1 flex-col overflow-hidden">
                {topBar}
                {content}
                {mobileBottomNav}
                {scrollTopButton}
            </div>

            {footer}
        </div>
    );
};

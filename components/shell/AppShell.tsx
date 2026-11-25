import React from 'react';

interface AppShellProps {
    desktopSidebar: React.ReactNode;
    mobileDialogOpen?: boolean;
    mobileSidebarOverlay?: React.ReactNode;
    topBar: React.ReactNode;
    content: React.ReactNode;
    mobileBottomNav?: React.ReactNode;
    scrollTopButton?: React.ReactNode;
    footer?: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
    desktopSidebar,
    mobileDialogOpen = false,
    mobileSidebarOverlay,
    topBar,
    content,
    mobileBottomNav,
    scrollTopButton,
    footer,
}) => {
    return (
        <div className="psi-app-shell psi-platform-field-canvas flex h-screen transition-colors duration-200">
            <a
                href="#psi-main-content"
                inert={mobileDialogOpen}
                className="fixed left-4 top-3 z-[500] -translate-y-20 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-xl transition-transform focus:translate-y-0"
            >
                본문으로 바로가기
            </a>
            <div data-psi-desktop-sidebar inert={mobileDialogOpen} className="no-print hidden h-full lg:block">{desktopSidebar}</div>
            {mobileSidebarOverlay}

            <div data-psi-shell-background inert={mobileDialogOpen} className="flex w-full flex-1 flex-col overflow-hidden">
                {topBar}
                {content}
                {mobileBottomNav}
                {scrollTopButton}
            </div>

            {footer}
        </div>
    );
};

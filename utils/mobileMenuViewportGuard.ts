/**
 * Close the phone-only navigation dialog whenever the app reaches the
 * lg desktop breakpoint. Otherwise the CSS-hidden dialog can retain its
 * focus trap and document.body scroll lock after rotation/window resize.
 *
 * This helper has no storage/network behavior and never changes route
 * visibility, RBAC, or the user's custom sidebar composition.
 */
export const MOBILE_NAV_DESKTOP_QUERY = '(min-width: 1024px)';

type ViewportQuery = Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>;

/** Returns cleanup. Handles already-desktop opening as well as live resize. */
export const closeMobileMenuOnDesktop = (
    createQuery: (query: string) => ViewportQuery,
    close: () => void,
): (() => void) => {
    const viewport = createQuery(MOBILE_NAV_DESKTOP_QUERY);
    const check = () => { if (viewport.matches) close(); };
    viewport.addEventListener('change', check);
    // Avoid trapping focus/scroll if the viewport is already desktop.
    check();
    return () => viewport.removeEventListener('change', check);
};

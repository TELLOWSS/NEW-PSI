import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it,vi} from 'vitest';
import {closeMobileMenuOnDesktop,MOBILE_NAV_DESKTOP_QUERY} from '../utils/mobileMenuViewportGuard';

// A synthetic MediaQueryList, with no device/screen access or external requests.
const mockViewport = (desktopInitially=false) => {
    let desktop=desktopInitially;
    const listeners=new Set<EventListenerOrEventListenerObject>();
    const query={
        get matches(){return desktop;},
        addEventListener(_type:string,listener:EventListenerOrEventListenerObject){
            listeners.add(listener);
        },
        removeEventListener(_type:string,listener:EventListenerOrEventListenerObject){
            listeners.delete(listener);
        },
    } as unknown as Pick<MediaQueryList,'matches'|'addEventListener'|'removeEventListener'>;
    const resizeTo = (next:boolean) => {
        desktop=next;
        const event=new Event('change');
        for(const listener of listeners){
            if(typeof listener==='function') listener(event);
            else listener.handleEvent(event);
        }
    };
    return {query,resizeTo,listenerCount:()=>listeners.size};
};

describe('mobile navigation desktop-breakpoint focus/scroll release',()=>{
    it('uses the same 1024px breakpoint as the lg:hidden dialog',()=>{
        expect(MOBILE_NAV_DESKTOP_QUERY).toBe('(min-width: 1024px)');
    });
    it('does not close an open drawer when still in mobile viewport',()=>{
        const window=mockViewport(false);
        const close=vi.fn();
        const cleanup=closeMobileMenuOnDesktop(()=>window.query,close);
        expect(close).not.toHaveBeenCalled();
        window.resizeTo(false);
        expect(close).not.toHaveBeenCalled();
        cleanup();
    });
    it('closes immediately when a previously open drawer is mounted at desktop size',()=>{
        const window=mockViewport(true);
        const close=vi.fn();
        const cleanup=closeMobileMenuOnDesktop(()=>window.query,close);
        expect(close).toHaveBeenCalledTimes(1);
        cleanup();
    });
    it('closes a phone drawer after rotation or desktop resize crosses 1024px',()=>{
        const window=mockViewport(false);
        const close=vi.fn();
        const cleanup=closeMobileMenuOnDesktop(()=>window.query,close);
        window.resizeTo(true);
        expect(close).toHaveBeenCalledTimes(1);
        cleanup();
    });
    it('does not reopen a closed drawer or fire handlers after unmount cleanup',()=>{
        const window=mockViewport(false);
        const close=vi.fn();
        const cleanup=closeMobileMenuOnDesktop(()=>window.query,close);
        expect(window.listenerCount()).toBe(1);
        cleanup();
        expect(window.listenerCount()).toBe(0);
        window.resizeTo(true);
        expect(close).not.toHaveBeenCalled();
    });
    it('keeps the modal focus trap and opener descriptions in the real shell',()=>{
        const layout=readFileSync(resolve('components/Layout.tsx'),'utf8');
        const topBar=readFileSync(resolve('components/shell/TopBar.tsx'),'utf8');
        expect(layout).toContain('return closeMobileMenuOnDesktop(');
        expect(layout).toContain('id="psi-mobile-navigation-dialog"');
        expect(layout).toContain('aria-modal="true"');
        expect(layout).toContain("mobileMenuPreviousFocusRef.current = null");
        expect(layout).toContain("document.body.style.overflow = previousOverflow");
        expect(layout).toContain("const canFocus = (element: HTMLElement | null)");
        expect(layout).toContain("'[data-psi-desktop-sidebar] [aria-current=\"page\"]'");
        const appShell=readFileSync(resolve('components/shell/AppShell.tsx'),'utf8');
        expect(appShell).toContain('data-psi-desktop-sidebar');
        expect(layout).toContain("aria-controls={tab.id === 'more' ? 'psi-mobile-navigation-dialog'");
        expect(topBar).toContain('aria-controls="psi-mobile-navigation-dialog"');
    });
});
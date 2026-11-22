import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
import {AppShell} from '../components/shell/AppShell';

const renderShell=(opened?:boolean)=>renderToStaticMarkup(
  React.createElement(AppShell,{
    desktopSidebar:React.createElement('button',null,'desktop navigation'),
    mobileSidebarOverlay:React.createElement('div',{'role':'dialog'},'mobile navigation'),
    topBar:React.createElement('button',null,'open navigation'),
    content:React.createElement('main',{id:'psi-main-content'},'visible page'),
    footer:React.createElement('footer',null,'static copyright'),
    mobileDialogOpen:opened,
  }),
);

describe('L21 phone modal navigation makes the app background genuinely inert',()=>{
  it('marks the complete underlying topbar and content container inert while open',()=>{
    const html=renderShell(true);
    expect(html).toMatch(/<div[^>]+data-psi-shell-background[^>]+inert=""/);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('mobile navigation');
    // The dialog is a sibling of the inert background, never inside it.
    expect(html.indexOf('mobile navigation')).toBeLessThan(html.indexOf('data-psi-shell-background'));
  });
  it('prevents the desktop navigation and skip-link from escaping the modal',()=>{
    const html=renderShell(true);
    expect(html).toMatch(/<div[^>]+data-psi-desktop-sidebar[^>]+inert=""/);
    expect(html).toMatch(/<a[^>]+href="#psi-main-content"[^>]+inert=""/);
  });
  it('restores normal background interaction and skip-link by removing inert',()=>{
    const html=renderShell(false);
    expect(html).toContain('data-psi-shell-background');
    expect(html).toContain('data-psi-desktop-sidebar');
    expect(html).not.toContain(' inert=""');
  });
  it('defaults to nonmodal rendering without a breaking required prop',()=>{
    const html=renderShell();
    expect(html).not.toContain(' inert=""');
    expect(html).toContain('psi-main-content');
  });
  it('binds the real dialog open state and retains Tab/Escape focus handling',()=>{
    const layout=readFileSync(resolve('components/Layout.tsx'),'utf8');
    expect(layout).toContain('mobileDialogOpen={isMobileMenuOpen}');
    expect(layout).toContain('aria-modal="true"');
    expect(layout).toContain("event.key === 'Escape'");
    expect(layout).toContain('document.body.style.overflow = previousOverflow');
  });
});
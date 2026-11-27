import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readRepoFile = (relPath: string): string =>
  readFileSync(resolve(process.cwd(), relPath), 'utf8');

describe('deep audit integration and UI/UX hardening', () => {
  it('removes permanent translateY forwards trap from fade-in-up animation', () => {
    const tailwindConfig = readRepoFile('tailwind.config.cjs');
    expect(tailwindConfig).not.toContain("fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards");
    expect(tailwindConfig).toContain("transform: 'none'");
  });

  it('keeps slim hub bar visible on mobile and tightens 3-tab drawer layout', () => {
    const css = readRepoFile('styles/psi-platform-workspaces.css');
    expect(css).toContain('.psi-connected-decision-shell.is-slim-hub-bar .psi-cd-compact-bar');
    expect(css).toContain('@media(max-width:520px)');
  });

  it('fixes dead sunlight selector and dark-mode contrast rules across stylesheets', () => {
    const bigdataCss = readRepoFile('styles/psi-accident-bigdata.css');
    expect(bigdataCss).not.toContain('data-psi-sunlight="high"');
    expect(bigdataCss).toContain('data-psi-sunlight="true"');
    expect(bigdataCss).toContain('.psi-ab-file-chip.is-err');

    const registerCss = readRepoFile('components/inspector/inspector-global-register.css');
    expect(registerCss).not.toContain('@media(prefers-color-scheme:dark)');
    expect(registerCss).toContain('html.dark .si-global-register');

    const radarCss = readRepoFile('components/inspector/inspector-action-radar.css');
    expect(radarCss).not.toContain('@media (prefers-color-scheme:dark)');
    expect(radarCss).toContain('html.dark .si-correction-schedule');

    const mainCss = readRepoFile('styles.css');
    expect(mainCss).toContain('html.dark .bg-emerald-100');
    expect(mainCss).toContain('html.dark .text-sky-950');
  });

  it('wires modal closing, unsaved inspector warning, fallback UI, and full reset in App.tsx', () => {
    const app = readRepoFile('App.tsx');
    expect(app).toContain("onOpenReport={(r) => { setModalState({type:null}); setReportReturnPage(currentPage);");
    expect(app).toContain('<SafetyInspector onUnsavedChange={(dirty) => { inspectorDirtyRef.current = dirty; }} />');
    expect(app).toContain('<Settings workerRecords={workerRecords} onResetAllData={handleDeleteAll} />');
    expect(app).toContain('선택된 근로자 리포트가 없습니다.');
  });

  it('protects incoming handoffs in AdminTraining and fixes mobile RecordDetailModal sizing', () => {
    const adminTraining = readRepoFile('pages/AdminTraining.tsx');
    expect(adminTraining).toContain("psi_tbm_package_handoff_pending_v1");
    expect(adminTraining).toContain('if (hasIncomingHandoff)');

    const detailModal = readRepoFile('components/modals/RecordDetailModal.tsx');
    expect(detailModal).toContain('h-[100dvh]');
    expect(detailModal).toContain('max-h-[38dvh]');
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { shouldShowPageHeader } from '../config/routeMeta';

const readRepoFile = (relPath: string): string =>
  readFileSync(resolve(process.cwd(), relPath), 'utf8');

describe('cross-feature integration and UX hardening', () => {
  it('hides duplicate common page header on self-headed safety-inspector page', () => {
    expect(shouldShowPageHeader('safety-inspector')).toBe(false);
    expect(shouldShowPageHeader('accident-bigdata')).toBe(false);
  });

  it('subscribes ConnectedPageDecisionBanner to bigdata and site-issue events and enables slim hub bar', () => {
    const banner = readRepoFile('components/shell/ConnectedPageDecisionBanner.tsx');
    expect(banner).toContain('ACCIDENT_BIGDATA_UPDATED_EVENT');
    expect(banner).toContain('SITE_ISSUES_UPDATED_EVENT');
    expect(banner).toContain('isSelfHeadedHub');
    expect(banner).toContain('is-slim-hub-bar');
  });

  it('integrates server inspector actions and local site issues inside PsiUniversalInspectorDrawer', () => {
    const drawer = readRepoFile('components/shell/PsiUniversalInspectorDrawer.tsx');
    expect(drawer).toContain("activeTab === 'field-actions'");
    expect(drawer).toContain('사진점검 · 이슈');
    expect(drawer).toContain("op: 'global-action-register'");
    expect(drawer).toContain('SITE_ISSUES_STORAGE_KEY');
    expect(drawer).toContain('SITE_ISSUES_UPDATED_EVENT');
  });

  it('supports direct worker detail navigation and complete core page list in PsiGlobalQuickJump', () => {
    const quickJump = readRepoFile('components/shell/PsiGlobalQuickJump.tsx');
    expect(quickJump).toContain('onOpenWorkerRecord');
    expect(quickJump).toContain("page: 'a4-education-material'");
    expect(quickJump).toContain("page: 'worker-management'");
    expect(quickJump).toContain("page: 'site-issue-management'");
    expect(quickJump).toContain("page: 'reports'");
    expect(quickJump).not.toContain('건설기계 사용전 사진점검 및 현장 개선 등록');
  });

  it('exposes direct mobile 사진점검 tab and quick return bar in Layout.tsx', () => {
    const layout = readRepoFile('components/Layout.tsx');
    expect(layout).toContain("label: '사진점검'");
    expect(layout).toContain('aria-label="사진점검 빠른 화면 이동"');
    expect(layout).toContain('onOpenWorkerRecord={onOpenWorkerRecord}');
  });

  it('removes 프리셋 jargon from InspectorNexus3AxisBridge user-facing copy', () => {
    const bridge = readRepoFile('components/inspector/InspectorNexus3AxisBridge.tsx');
    expect(bridge).not.toContain('프리셋');
  });
});

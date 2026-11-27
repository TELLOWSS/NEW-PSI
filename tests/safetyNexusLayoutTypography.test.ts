import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const readText = (relPath: string): string =>
  fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8');

describe('SafetyNexus lower-scroll grid, typography, and component consistency', () => {
  const css = readText('pages/SafetyNexus.css');
  const nexusTsx = readText('pages/SafetyNexus.tsx');
  const practiceTsx = readText('components/shared/PracticeEvidencePanel.tsx');
  const scoreEvidenceTsx = readText('components/shared/ScoreMetricEvidencePanel.tsx');

  it('aligns top-level SafetyNexus sections on a unified --nexus-gutter variable across breakpoints', () => {
    expect(css).toContain('--nexus-gutter: 24px;');

    const alignedSelectors = [
      '.nexus-priority-summary',
      '.nexus-header',
      '.nexus-pipeline-section',
      '.nexus-workbench',
      '.nexus-metrics',
      '.nexus-score-evidence-panel',
      '.nexus-followup',
      '.nexus-bento-board',
      '.nexus-context-rail',
      '.nexus-hq-bi-view',
      '.nexus-field-morning-bar',
      '.nexus-compliance-panel',
      '.nexus-hq-morning-bar',
      '.nexus-decision-brief',
    ];

    for (const selector of alignedSelectors) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const blockMatch = css.match(new RegExp(`${escaped}\\s*\\{[^}]*margin:[^;]*var\\(--nexus-gutter\\)`));
      expect(blockMatch, `${selector} should use var(--nexus-gutter) for horizontal margin`).not.toBeNull();
    }
  });

  it('removes brittle hardcoded grid-row: 3/4/5 placement inside @media (max-width:1250px) .nexus-detail', () => {
    const mediaBlockMatch = css.match(/@media\s*\(max-width:1250px\)\s*\{([\s\S]*?)\n@media\(max-width:1100px\)/);
    expect(mediaBlockMatch).not.toBeNull();
    const mediaBody = mediaBlockMatch![1];
    expect(mediaBody).not.toMatch(/grid-row:\s*[345]/);
    expect(mediaBody).toContain('.nexus-detail>.nexus-seed-panel');
    expect(mediaBody).toContain('.nexus-detail>.nexus-detail-handoff-row');
  });

  it('keeps Korean typography legible without bare system-ui override or invisible .18 opacity captions', () => {
    expect(css).toMatch(/\.nexus-brand h1\s*\{[^}]*"Pretendard"/);
    expect(css).not.toMatch(/\.nexus-caption-sub\s*\{[^}]*opacity:\s*\.18/);
    expect(css).not.toMatch(/\.nexus-caption-sub\s*\{[^}]*font-size:\s*8\.5px/);
  });

  it('upgrades PracticeEvidencePanel to theme-aware semantic cards while preserving ARIA and honest disclaimers', () => {
    expect(practiceTsx).toContain('aria-label="교육·현장 확인 근거"');
    expect(practiceTsx).toContain('className="nexus-practice-evidence-panel"');
    expect(practiceTsx).toContain('nexus-practice-evidence-card');
    expect(practiceTsx).not.toContain('bg-slate-900');
    expect(practiceTsx).not.toContain('bg-slate-800');
  });

  it('upgrades ScoreMetricEvidencePanel to aligned SafetyNexus evidence cards while preserving ARIA and boundary text', () => {
    expect(scoreEvidenceTsx).toContain('aria-label="기존 평가점수 근거"');
    expect(scoreEvidenceTsx).toContain('className="nexus-score-evidence-panel"');
    expect(scoreEvidenceTsx).toContain('nexus-score-evidence-grid');
    expect(scoreEvidenceTsx).not.toContain('psi-industrial-panel');
  });

  it('styles the 6-perspective metrics CTA button and question breakdown cleanly in SafetyNexus.tsx and both dark/light themes', () => {
    expect(nexusTsx).toContain('className="nexus-metrics-report-btn"');
    expect(nexusTsx).toContain('className="nexus-followup-q-list"');
    expect(nexusTsx).toContain('className="nexus-metrics-caption-head"');

    expect(css).toContain('.nexus-metrics-report-btn');
    expect(css).toContain('.safety-nexus[data-nexus-theme="light"] .nexus-score-evidence-panel');
    expect(css).toContain('.safety-nexus[data-nexus-theme="light"] .nexus-practice-evidence-card.is-selected');
    expect(css).toContain('.safety-nexus[data-nexus-theme="light"] .nexus-metrics-report-btn');
    expect(css).toContain('.safety-nexus[data-nexus-sunlight="true"] .nexus-score-evidence-panel');
    expect(css).not.toContain('section[aria-label="교육·현장 확인 근거"] [class*="bg-slate-"]');
  });
});

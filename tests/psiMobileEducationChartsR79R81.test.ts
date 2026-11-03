import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createEducationWorkflowSvg } from '../utils/educationVisualExports';
import type { TbmEducationDraft } from '../utils/tbmEducationStudio';

const source = (path: string) => readFileSync(path, 'utf8');
const workspace = source('styles/psi-platform-workspaces.css');
const survey = source('pages/SurveyIntelligence.tsx');
const studio = source('pages/A4EducationMaterial.tsx');

const draft: TbmEducationDraft = {
    month: '2026-11',
    workType: '형틀',
    title: '현장 안전교육',
    coreMessage: '현장 위험 공유',
    opening: '작업 전 위험 확인',
    risks: [],
    videoScenes: [],
    accidentCases: [],
    focusPoints: [],
    notices: [],
    checklist: [],
    confirmationQuestions: [],
    closingCommitment: '작업 전 확인',
    sourceCount: 0,
    generatedAt: '2026-11-03T00:00:00.000Z',
};

describe('PSI R79–R81: operator mobile, education visuals, chart context', () => {
    it('keeps phone editing controls in the operator-only workspace, outside printable A4 output', () => {
        expect(studio).toContain('data-psi-screen="a4-education-studio"');
        expect(studio).toContain('aria-label="교육자료 제작 단계"');
        expect(workspace).toContain('@media(max-width:720px)');
        expect(workspace).toContain('env(safe-area-inset-bottom,0px)');
        expect(workspace).toContain('>.psi-segmented-nav.no-print>button:last-child');
        expect(workspace).toContain('>.psi-enterprise-panel.no-print :is(input,select)');
        expect(workspace).toContain('min-height:48px');
        expect(workspace).not.toContain('[data-report-page] :is(input,select)');
    });
    it('aligns the offline 5-step diagram with FIELD CANVAS and preserves explicit review state', () => {
        const svg = createEducationWorkflowSvg(draft);
        expect(svg).toContain('<title>NEW-PSI 위험성평가 5단계 교육 흐름</title>');
        expect(svg).toContain('<desc>');
        expect(svg).toContain('fill="#102d3e"');
        expect(svg).toContain('stroke="#d6e5e4"');
        expect(svg).toContain('상등급 근거 미확인');
        expect(svg).toContain('관리자가 확인해야 합니다.');
        expect(svg).not.toContain('<foreignObject');
        expect(svg).not.toContain('https://');
    });
    it('shows comparable counts and denominator instead of turning missing baselines into zero', () => {
        expect(survey).toContain('data-psi-survey="coverage"');
        expect(survey).toContain('data.comparableResponseCount.toLocaleString()');
        expect(survey).toContain('data.totalRiskResponseCount.toLocaleString()');
        expect(survey).toContain('data.baselineCoverage');
        expect(survey).toContain('표본 부족 응답은 임의로 0점이나 양호로 처리하지 않습니다');
        expect(survey).toContain('role="region" aria-label="공종별 위험 인식 차이 표');
        expect(survey).not.toContain('비계·추락 방지 설비 긴급 점검 실시');
        expect(workspace).toContain('[data-psi-survey="coverage"]');
    });
});

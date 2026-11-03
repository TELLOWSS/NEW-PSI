import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { averageAvailableSurveyScores, getRiskGapChartHeight } from '../utils/surveyChartDisplay';

const read = (path: string) => readFileSync(path, 'utf8');
const studio = read('pages/A4EducationMaterial.tsx');
const survey = read('pages/SurveyIntelligence.tsx');
const styles = read('styles/psi-platform-workspaces.css');

describe('PSI R82–R84 mobile, preview and chart truthfulness', () => {
    it('does not turn a no-response trade or month into 0 points', () => {
        expect(averageAvailableSurveyScores([])).toBeNull();
        expect(averageAvailableSurveyScores([null, undefined, Number.NaN])).toBeNull();
        expect(averageAvailableSurveyScores([4, null, 5])).toBe(4.5);
        expect(averageAvailableSurveyScores([1, 2, Number.POSITIVE_INFINITY])).toBe(1.5);
        expect(averageAvailableSurveyScores([0, 2])).toBe(1);
        expect(survey).toContain('averageAvailableSurveyScores(topTrades.map');
        expect(survey).toContain(': null;');
        expect(survey).toContain('비교할 두 달의 응답 부족');
        expect(survey).toContain('value={data.avgSpecificityLatest === null ?');
    });
    it('allocates legible room for real trade counts', () => {
        expect(getRiskGapChartHeight(0)).toBe(260);
        expect(getRiskGapChartHeight(4)).toBe(260);
        expect(getRiskGapChartHeight(10)).toBe(450);
        expect(getRiskGapChartHeight(Number.NaN)).toBe(260);
        expect(survey).toContain('getRiskGapChartHeight(data.gapData.length)');
        expect(survey).toContain('width={88}');
        expect(survey).toContain('data-psi-chart="risk-gap"');
        expect(styles).toContain('[data-psi-chart="risk-gap"]');
    });
    it('marks current education step and keeps A4 unscaled inside an accessible phone scroller', () => {
        expect(studio).toContain("aria-current={activeTab === id ? 'step' : undefined}");
        expect(studio).toContain('aria-describedby="psi-studio-stage-status"');
        expect(studio).toContain('data-psi-studio-progress="true"');
        expect(studio).toContain('data-psi-a4-preview-scroll="true"');
        expect(studio).toContain('ref={sheetRef} data-report-template-root="true"');
        expect(styles).toContain('overscroll-behavior-x:contain');
        expect(styles).toContain('@media print');
        expect(styles).toContain('overflow:visible!important');
    });
    it('does not equate text score rises with verified behavior or automate decisions', () => {
        expect(survey).not.toContain('마인드셋을 개조하는 도구');
        expect(survey).not.toContain('수동적 상태 → 능동적 분석 사고');
        expect(survey).not.toContain('현장 설비 긴급 점검 + 관리자 보고');
        expect(survey).toContain('실제 행동 변화의 증거는 아닙니다');
        expect(survey).toContain('자동 조치 아님');
    });
});

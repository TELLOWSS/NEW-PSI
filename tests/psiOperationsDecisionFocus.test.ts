import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildOperationsDecisionFocus, type OperationsDecisionFocusInput } from '../utils/operationsDecisionFocus';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const input = (overrides: Partial<OperationsDecisionFocusInput> = {}): OperationsDecisionFocusInput => ({
    selectedCount: 9,
    protectionPriorityCount: 0,
    pendingReviewCount: 0,
    inProgressCount: 0,
    sourceReviewCount: 0,
    ...overrides,
});

describe('L05 decision focus is evidence-scoped and human-reviewed', () => {
    it('never treats no records as a safe site or a completed action', () => {
        const actual = buildOperationsDecisionFocus(input({ selectedCount: 0 }));
        expect(actual.status).toContain('기록 없음');
        expect(actual.guidance).toContain('위험이 없다는 뜻이 아닙니다');
        expect(actual.actionPage).toBe('ocr-analysis');
        expect(actual.tone).toBe('neutral');
    });
    it('prioritizes protection signals without declaring a work stoppage on its own', () => {
        const actual = buildOperationsDecisionFocus(input({
            protectionPriorityCount: 2,
            pendingReviewCount: 3,
            sourceReviewCount: 4,
        }));
        expect(actual.headline).toContain('2건');
        expect(actual.actionPage).toBe('safety-compliance-hub');
        expect(actual.guidance).toContain('담당자가');
        expect(actual.guidance).not.toContain('작업 중지 확정');
    });
    it('asks for manager review before source OCR or in-progress items', () => {
        const actual = buildOperationsDecisionFocus(input({
            pendingReviewCount: 2,
            sourceReviewCount: 4,
            inProgressCount: 1,
        }));
        expect(actual.actionPage).toBe('ocr-analysis');
        expect(actual.headline).toContain('검토 대기 2건');
        expect(actual.guidance).toContain('승인 완료로 보지 않습니다');
    });
    it('supports explicit OCR source review when no higher-priority signal exists', () => {
        const actual = buildOperationsDecisionFocus(input({ sourceReviewCount: 3 }));
        expect(actual.status).toBe('원문 확인 필요');
        expect(actual.headline).toContain('3건');
        expect(actual.actionPage).toBe('ocr-analysis');
    });
    it('does not present an analysis in progress as approved', () => {
        const actual = buildOperationsDecisionFocus(input({ inProgressCount: 5 }));
        expect(actual.tone).toBe('progress');
        expect(actual.guidance).toContain('완료를 의미하지 않습니다');
    });
    it('guides an apparently clear record set into education without implying all-clear', () => {
        const actual = buildOperationsDecisionFocus(input());
        expect(actual.tone).toBe('neutral');
        expect(actual.actionPage).toBe('education-return');
        expect(actual.guidance).toContain('위험 해소나 작업 재개가 확정된 것은 아닙니다');
    });
    it('uses existing filtered records, existing pages and no external service', () => {
        const board = source('components/dashboard/PrecisionOperationsBoard.tsx');
        const panel = source('components/dashboard/OperationsDecisionFocus.tsx');
        const focus = source('utils/operationsDecisionFocus.ts');
        const css = source('styles/psi-living-motion.css');
        expect(board).toContain('selectedCount={filteredRecords.length}');
        expect(board).toContain('protectionPriorityCount={statusCounts.immediate}');
        expect(board).toContain('pendingReviewCount={statusCounts.pending}');
        expect(board).toContain('inProgressCount={statusCounts.progress}');
        expect(board).toContain('sourceReviewCount={sourceReviewCount}');
        expect(board).toContain('periodLabel={periodScopeLabel[periodFilter]}');
        expect(board).toContain('tradeLabel={tradeFilter ===');
        expect(panel).toContain('onClick={() => onNavigate(model.actionPage)}');
        expect(panel).toContain('해당 기록의 분류 상태이며 현장 위험 해소 판정이 아닙니다.');
        expect(css).toContain('psi-living-decision-focus');
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
        expect(css).toContain('@media print');
        expect(focus).not.toMatch(/fetch\s*\(|setInterval\s*\(|localStorage|sessionStorage|indexedDB/i);
        expect(panel).not.toMatch(/fetch\s*\(|setInterval\s*\(|localStorage|sessionStorage|indexedDB/i);
    });
});

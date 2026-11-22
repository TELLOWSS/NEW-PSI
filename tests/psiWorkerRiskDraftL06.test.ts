import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PSI_FORM_QUESTIONS } from '../config/psiFormMaster';
import { checkWorkerRiskDraft, emptyWorkerRiskDraft, printableWorkerRiskDraft } from '../utils/workerRiskDraftL06';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('L06 Q1-Q5 worker self-writing pilot without submission', () => {
    it('follows the existing five-question form master without introducing Q6', () => {
        expect(PSI_FORM_QUESTIONS.map(question => question.key)).toEqual(['Q1','Q2','Q3','Q4','Q5']);
        const draft = emptyWorkerRiskDraft();
        expect(Object.keys(draft.answers)).toEqual(['Q1','Q2','Q3','Q4','Q5']);
        expect(checkWorkerRiskDraft(draft).missing).toEqual(['Q1','Q2','Q3','Q4','Q5']);
    });

    it('accepts self-reported single-character Q3 but no unfilled Q1, Q2, Q4, Q5', () => {
        const draft = emptyWorkerRiskDraft();
        draft.grade = '상';
        draft.answers.Q3 = '상';
        let result = checkWorkerRiskDraft(draft);
        expect(result.completedCount).toBe(1);
        expect(result.missing).toEqual(['Q1','Q2','Q4','Q5']);
        for (const key of ['Q1','Q2','Q4','Q5'] as const) draft.answers[key] = '확인';
        result = checkWorkerRiskDraft(draft);
        expect(result.readyForReview).toBe(true);
        expect(result.completedCount).toBe(5);
        expect(result.submitted).toBe(false);
        expect(result.serverReceived).toBe(false);
        expect(result.approved).toBe(false);
    });

    it('prints only the entered five answers without adding identity or approving a risk level', () => {
        const draft = emptyWorkerRiskDraft();
        draft.answers.Q1 = '슬라브 보 철근';
        draft.grade = '중';
        draft.gradeReason = '상부 낙하 우려';
        const rows = printableWorkerRiskDraft(draft);
        expect(rows).toHaveLength(5);
        expect(rows[0].answer).toBe('슬라브 보 철근');
        expect(rows[2].answer).toBe('중 · 상부 낙하 우려');
        expect(rows.map(item => item.key)).toEqual(['Q1','Q2','Q3','Q4','Q5']);
    });

    it('remains explicitly identity-free, in-memory and unconnected to submission APIs', () => {
        const ui = source('pages/WorkerRiskDraft.tsx');
        const helper = source('utils/workerRiskDraftL06.ts');
        const entry = source('index.tsx');
        expect(entry).toContain("'/worker-risk-draft'");
        expect(entry).toContain('<WorkerRiskDraft />');
        expect(ui).toContain('저장·제출 기능 없음');
        expect(ui).toContain('정식 근로자 제출');
        expect(ui).toContain('작성 내용 확인');
        expect(ui).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|indexedDB|localStorage|sessionStorage|supabase|worker\.authenticate|requestTenantWorkspace/);
        expect(helper).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|indexedDB|localStorage|sessionStorage|supabase/);
    });
});

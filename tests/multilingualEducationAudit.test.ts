import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildEducationLanguageAudit } from '../utils/multilingualEducationAudit';
import type { TbmEducationDraft } from '../utils/tbmEducationStudio';
import type { EducationPosterTranslation } from '../utils/educationPosterTranslation';

const draft = (): TbmEducationDraft => ({
    month: '2026-11', workType: '형틀', title: '현장 안전교육',
    coreMessage: '위험 발생 시 즉시 작업중지', opening: '확인',
    risks: [{
        id: 'risk-1', risk: '추락', action: '안전대 체결', score: 90,
        owner: '관리자', managerConfirmed: true, evidenceLabels: ['회의자료 상등급'],
    }],
    videoScenes: [{ id: 'a', seconds: 300, title: '사전 안전', narration: '작업중지', visualGuide: '난간 확인' }],
    accidentCases: [], focusPoints: ['작업발판 확인'], notices: ['작업 전 확인'],
    checklist: [], confirmationQuestions: ['작업중지 기준 이해?'],
    closingCommitment: '즉시 작업중지', sourceCount: 0,
    generatedAt: '2026-10-26T00:00:00Z',
});
const translation = (): EducationPosterTranslation => ({
    workType: 'Formwork', title: 'Safety', opening: 'Check',
    coreMessage: 'Stop work immediately',
    video: [{ title: 'Safety', narration: 'Stop work', visualGuide: 'Check railing' }],
    accident: [], risks: [{ risk: 'Fall', action: 'Attach harness', owner: 'Manager' }],
    focus: ['Platform check'], notices: ['Pre-start check'],
    questions: ['Understand stop conditions?'], closingCommitment: 'Stop work immediately',
});
const sample = () => ({
    draft: draft(), sourceText: 'Current Korean source', savedSourceText: 'Current Korean source',
    translatedTexts: {} as Record<string, string>,
    structuredTranslations: {} as Record<string, EducationPosterTranslation>,
});

describe('ATLAS 11-language education structural checks', () => {
    it('shows Korean source and all ten site foreign languages', () => {
        const result = buildEducationLanguageAudit(sample());
        expect(result.total).toBe(11);
        expect(result.targetLanguages).toBe(10);
        expect(result.missing).toBe(10);
        expect(result.semanticReviewRequired).toBe(true);
        expect(result.rows.map(x => x.code)).toEqual([
            'ko-KR', 'vi-VN', 'cmn-CN', 'mn-MN', 'id-ID', 'ru-RU',
            'kk-KZ', 'uz-UZ', 'th-TH', 'km-KH', 'my-MM',
        ]);
    });
    it('recognizes shorthand structured Chinese while never asserting semantic approval', () => {
        const input = sample();
        input.structuredTranslations.zh = translation();
        const result = buildEducationLanguageAudit(input);
        expect(result.rows.find(x => x.code === 'cmn-CN')?.status).toBe('format-checked');
        expect(result.formatChecked).toBe(1);
        expect(result.semanticReviewRequired).toBe(true);
    });
    it('flags missing and excess high grade items, protecting source authority', () => {
        const input = sample();
        const target = translation();
        target.risks = [];
        input.structuredTranslations['vi-VN'] = target;
        let result = buildEducationLanguageAudit(input);
        expect(result.rows.find(x => x.code === 'vi-VN')?.issues.join(' ')).toContain('상등급');
        input.structuredTranslations['vi-VN'] = {
            ...translation(), risks: [...translation().risks, ...translation().risks],
        };
        result = buildEducationLanguageAudit(input);
        expect(result.rows.find(x => x.code === 'vi-VN')?.status).toBe('review');
    });
    it('recognizes stale saved translations and keeps legacy text in review', () => {
        const input = sample();
        input.structuredTranslations['vi-VN'] = translation();
        input.savedSourceText = 'Old Korean source';
        expect(buildEducationLanguageAudit(input).rows.find(x => x.code === 'vi-VN')?.status).toBe('stale');
        const older = sample();
        older.translatedTexts.uz = 'Prior text translation';
        expect(buildEducationLanguageAudit(older).rows.find(x => x.code === 'uz-UZ')?.status).toBe('review');
    });
    it('does not add APIs or cron jobs and retains hobby function duration gates', () => {
        const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
            fluid: boolean; functions: Record<string, {maxDuration: number}>; crons?: unknown[];
        };
        expect(config.fluid).toBe(true);
        expect(config.crons || []).toEqual([]);
        expect(Object.keys(config.functions).sort()).toEqual(
            ['api/admin.ts', 'api/gateway.ts', 'api/inspection-share.ts'].sort(),
        );
        expect(Object.values(config.functions).every(value => value.maxDuration <= 300)).toBe(true);
        const page = readFileSync('pages/A4EducationMaterial.tsx', 'utf8');
        expect(page).toContain('MultilingualEducationAuditPanel');
        for (const file of ['utils/multilingualEducationAudit.ts', 'components/tbm/MultilingualEducationAuditPanel.tsx']) {
            const content = readFileSync(file, 'utf8');
            expect(content).not.toMatch(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|\/api\/|onnxruntime|remoteInference/i);
        }
    });
});

import { describe, expect, it } from 'vitest';
import {
    createEducationSceneManifest,
    createEducationWorkflowSvg,
} from '../utils/educationVisualExports';
import type { TbmEducationDraft } from '../utils/tbmEducationStudio';

const sample = (): TbmEducationDraft => ({
    month: '2026-11',
    workType: '형틀',
    title: '안전교육',
    coreMessage: '위험 확인',
    opening: '작업 전 점검',
    risks: [],
    videoScenes: [
        { id: 'a', title: '예방', seconds: 120, narration: '작업 전 확인', visualGuide: '고정된 안전난간' },
        { id: 'b', title: '점검', seconds: 180, narration: '작업중지', visualGuide: '점검 장면' },
    ],
    accidentCases: [],
    focusPoints: [],
    notices: [],
    checklist: [],
    confirmationQuestions: [],
    closingCommitment: '작업 전 확인',
    sourceCount: 0,
    generatedAt: '2026-10-26T00:00:00.000Z',
});

describe('local education visual export', () => {
    it('exports reviewed 300-second storyboard with deterministic timeline and no worker records', () => {
        const manifest = createEducationSceneManifest(sample());
        expect(manifest.scenes.map((scene) => scene.startSeconds)).toEqual([0, 120]);
        expect(manifest.durationSeconds).toBe(300);
        expect(manifest.humanReviewRequired).toBe(true);
        expect(JSON.stringify(manifest)).not.toContain('sourceCount');
    });
    it('blocks incomplete, inaccurate or unreviewed video scene structures', () => {
        const draft = sample();
        draft.videoScenes[1].seconds = 50;
        expect(() => createEducationSceneManifest(draft)).toThrow('300초');
        draft.videoScenes[1].seconds = 180;
        draft.videoScenes[1].visualGuide = '';
        expect(() => createEducationSceneManifest(draft)).toThrow('화면 지시');
    });
    it('does not promote unconfirmed risks or inject unsafe markup into the standalone svg', () => {
        const draft = sample();
        draft.workType = '<svg onload="alert(1)">';
        draft.risks = [{
            id: 'risk', risk: '<script>alert(1)</script>', action: '조치',
            score: 90, owner: '관리자', managerConfirmed: false,
            evidenceLabels: ['회의자료 상등급'],
        }];
        const svg = createEducationWorkflowSvg(draft);
        expect(svg).toContain('&lt;svg onload=&quot;alert(1)&quot;&gt;');
        expect(svg).toContain('&lt;script&gt;');
        expect(svg).toContain('관리자 확인 필요');
        expect(svg).not.toContain('<script>');
        expect(svg).not.toContain('<foreignObject');
        expect(svg).not.toContain('https://');
    });
    it('shows an explicit absence instead of inventing high grade risks', () => {
        expect(createEducationWorkflowSvg(sample())).toContain('상등급 근거 미확인');
    });
});

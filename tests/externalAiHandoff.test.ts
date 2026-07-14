import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import {
    DEFAULT_EXTERNAL_AI_LANGUAGES,
    buildExternalAiPrompt,
    parseExternalAiResult,
} from '../utils/externalAiHandoff';
import { buildTbmEducationDraft, type TbmEvidenceSource } from '../utils/tbmEducationStudio';

const sources: TbmEvidenceSource[] = [{
    id: 'manual-1',
    kind: 'manual',
    title: '7월 철골 작업계획',
    text: '상등급 기록 2026-06-30 / 철골 | 위험요인: 추락 | Q3 위험수준 근거: 상',
    createdAt: '2026-06-10T00:00:00.000Z',
}];

const highGradeWorker = (): WorkerRecord => ({
    id: 'record-1',
    name: '테스트 근로자',
    jobField: '철골',
    date: '2026-06-30',
    nationality: 'KR',
    language: 'ko-KR',
    handwrittenAnswers: [
        { questionNumber: '2', answerText: '개구부 추락', koreanTranslation: '', nativeTranslation: '' },
        { questionNumber: '3', answerText: '상', koreanTranslation: '', nativeTranslation: '' },
    ],
    fullText: '',
    koreanTranslation: '',
    safetyScore: 70,
    safetyLevel: '중급',
    strengths: [],
    strengths_native: [],
    weakAreas: ['추락'],
    weakAreas_native: [],
    improvement: '',
    improvement_native: '',
    suggestions: [],
    suggestions_native: [],
    aiInsights: '',
    aiInsights_native: '',
    selfAssessedRiskLevel: '상',
});

describe('external AI handoff', () => {
    it('includes Cambodian and Uzbek in the default language selection', () => {
        expect(DEFAULT_EXTERNAL_AI_LANGUAGES).toContain('km-KH');
        expect(DEFAULT_EXTERNAL_AI_LANGUAGES).toContain('uz-UZ');
    });

    it('builds a source-bound five-stage prompt with requested languages', () => {
        const prompt = buildExternalAiPrompt({
            sources,
            month: '2026-07',
            workType: '철골',
            languageCodes: ['vi-VN', 'en-US', 'km-KH', 'uz-UZ'],
        });

        expect(prompt).toContain('5분 핵심 동영상');
        expect(prompt).toContain('공지사항');
        expect(prompt).toContain('정확히 300초');
        expect(prompt).toContain('[출처 1] 7월 철골 작업계획');
        expect(prompt).toContain('베트남어(vi-VN)');
        expect(prompt).toContain('크메르어(km-KH)');
        expect(prompt).toContain('우즈베크어(uz-UZ)');
        expect(prompt).toContain('상등급 근거가 없는 추천 위험을 만들거나');
    });

    it('parses fenced JSON but keeps only matching high-grade risk items', () => {
        const current = buildTbmEducationDraft({
            workerRecords: [highGradeWorker()],
            sources,
            month: '2026-07',
            workType: '철골',
        });
        const raw = `\`\`\`json
        {
          "draft": {
            "title": "7월 철골 TBM",
            "coreMessage": "개구부 두 곳을 확인하고 작업한다.",
            "videoScenes": [
              {"title":"도입","seconds":60,"narration":"도입","visualGuide":"현장"},
              {"title":"핵심","seconds":240,"narration":"핵심","visualGuide":"개구부"}
            ],
            "risks": [
              {"risk":"추락","action":"개구부 덮개와 안전대를 확인한다.","owner":"철골팀"},
              {"risk":"감전","action":"전선 피복을 확인한다.","owner":"전기팀"}
            ],
            "accidentCases": [
              {"title":"관리자 확인 필요","occurredAt":"","source":"관리자 확인 필요","summary":"","siteRelevance":"개구부 작업","lesson":"작업 전 확인"}
            ],
            "focusPoints":["개구부 덮개 확인"],
            "notices":["작업구역 변경 시 재평가"],
            "checklist":["덮개 확인"],
            "confirmationQuestions":["무엇을 확인합니까?"],
            "closingCommitment":"조건이 다르면 작업을 중지한다."
          },
          "translations": {"vi-VN":"Nội dung đào tạo"}
        }
        \`\`\``;

        const result = parseExternalAiResult(raw, current);

        expect(result.draft.title).toBe('7월 철골 TBM');
        expect(result.draft.risks).toHaveLength(1);
        expect(result.draft.risks[0]).toMatchObject({
            id: 'risk-1',
            risk: '추락',
            action: '개구부 덮개와 안전대를 확인한다.',
            owner: '철골팀',
            managerConfirmed: true,
        });
        expect(result.draft.videoScenes.reduce((sum, scene) => sum + scene.seconds, 0)).toBe(300);
        expect(result.translations['vi-VN']).toContain('Nội dung');
    });

    it('drops AI-created risk items when the current draft has no high-grade risk evidence', () => {
        const current = buildTbmEducationDraft({
            workerRecords: [],
            sources: [],
        });
        const raw = '{"draft":{"risks":[{"risk":"추락","action":"안전대 확인"}]},"translations":{}}';

        expect(parseExternalAiResult(raw, current).draft.risks).toHaveLength(0);
    });

    it('rejects non-JSON output with an actionable message', () => {
        const current = buildTbmEducationDraft({
            workerRecords: [],
            sources: [],
        });

        expect(() => parseExternalAiResult('일반 설명문입니다.', current))
            .toThrow('JSON 객체만 다시 출력');
    });
});

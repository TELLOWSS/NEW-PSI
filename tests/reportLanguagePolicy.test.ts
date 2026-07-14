import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import {
    getNativeJobFieldLabel,
    getNativeReportReadabilityIssues,
    getReportLanguagePolicy,
    hasHangul,
    REPORT_LANGUAGE_POLICIES,
    type ReportLanguageCode,
} from '../utils/reportLanguagePolicy';
import {
    buildFallbackNativeCoachingText,
    buildFallbackNativeGuidanceText,
    buildFallbackNativeVerdictText,
} from '../utils/ocrVerificationLanguageUtils';
import { buildWorkerReportTargets } from '../utils/workerReportTargets';

const languageCases: Array<{ code: ReportLanguageCode; nationality: string; language: string }> = [
    { code: 'ko', nationality: '대한민국', language: 'ko' },
    { code: 'vi', nationality: '베트남', language: 'vi' },
    { code: 'zh', nationality: '중국', language: 'zh' },
    { code: 'th', nationality: '태국', language: 'th' },
    { code: 'my', nationality: '미얀마', language: 'my' },
    { code: 'uz', nationality: '우즈베키스탄', language: 'uz' },
    { code: 'km', nationality: '캄보디아', language: 'km' },
    { code: 'id', nationality: '인도네시아', language: 'id' },
    { code: 'ms', nationality: '말레이시아', language: 'ms' },
    { code: 'mn', nationality: '몽골', language: 'mn' },
    { code: 'ru', nationality: '러시아', language: 'ru' },
    { code: 'kk', nationality: '카자흐스탄', language: 'kk' },
    { code: 'ne', nationality: '네팔', language: 'ne' },
    { code: 'en', nationality: '필리핀', language: 'en' },
];

const buildRecord = (patch: Partial<WorkerRecord>): WorkerRecord => ({
    id: 'record',
    worker_uuid: 'worker-1',
    workerUuid: 'worker-1',
    name: '테스트 근로자',
    jobField: '형틀',
    date: '2026-06-20',
    nationality: '대한민국',
    language: 'ko',
    handwrittenAnswers: [],
    fullText: '',
    koreanTranslation: '',
    safetyScore: 80,
    safetyLevel: '고급',
    strengths: [],
    strengths_native: [],
    weakAreas: ['추락 위험'],
    weakAreas_native: [],
    improvement: '',
    improvement_native: '',
    suggestions: [],
    suggestions_native: [],
    aiInsights: '형틀 작업 전 추락 위험을 확인합니다.',
    aiInsights_native: '',
    selfAssessedRiskLevel: '중',
    ...patch,
});

describe('worker report language policy', () => {
    it('covers every report language with complete native labels and fonts', () => {
        expect(Object.keys(REPORT_LANGUAGE_POLICIES).sort()).toEqual(languageCases.map((item) => item.code).sort());

        languageCases.forEach(({ code, nationality, language }) => {
            const policy = getReportLanguagePolicy(nationality, language);
            expect(policy.code).toBe(code);
            expect(policy.fontFamily).toContain('sans-serif');
            expect(Object.values(policy.labels).every((value) => value.trim().length > 0)).toBe(true);
            expect(policy.metrics).toHaveLength(6);

            if (code !== 'ko') {
                const nativeSurface = [
                    ...Object.values(policy.labels),
                    ...policy.metrics,
                    policy.countryName,
                    policy.genericGuidance,
                    policy.genericVerdict,
                    policy.genericCoaching,
                    getNativeJobFieldLabel('형틀', policy),
                ].join('\n');
                expect(hasHangul(nativeSurface), `${code} worker-facing copy contains Hangul`).toBe(false);
            }
        });
    });

    it('produces Hangul-free fallback guidance for every foreign language', () => {
        languageCases.filter(({ code }) => code !== 'ko').forEach(({ code, nationality, language }) => {
            const record = buildRecord({ nationality, language });
            const output = [
                buildFallbackNativeGuidanceText(record),
                buildFallbackNativeVerdictText(record),
                buildFallbackNativeCoachingText(record),
            ].join('\n');
            expect(hasHangul(output), `${code} fallback contains Hangul`).toBe(false);
        });
    });

    it('flags worker-facing native report text that is hard to read or not native-language clean', () => {
        const idPolicy = getReportLanguagePolicy('인도네시아', 'id');
        expect(getNativeReportReadabilityIssues('작업 전에는 안전대를 먼저 확인하세요.', idPolicy).some((issue) => issue.code === 'hangul-mixed')).toBe(true);
        expect(getNativeReportReadabilityIssues('Pekerja memahami risiko, tetapi score_reason perlu dicek.', idPolicy).map((issue) => issue.code)).toEqual(expect.arrayContaining(['manager-evaluation-tone', 'system-term']));

        const cleanId = 'Sebelum mulai kerja, periksa sabuk pengaman dan kondisi pijakan. Jika kondisi berubah, hentikan pekerjaan dan laporkan kepada mandor.';
        expect(getNativeReportReadabilityIssues(cleanId, idPolicy).filter((issue) => issue.severity === 'error')).toHaveLength(0);

        const zhPolicy = getReportLanguagePolicy('중국', 'zh');
        expect(getNativeReportReadabilityIssues('作业前先检查安全带和脚踏板。条件变化时立即停止作业，并向班长报告。', zhPolicy)).toHaveLength(0);
        expect(getNativeReportReadabilityIssues('该工人需要 check safetyScore before work.', zhPolicy).map((issue) => issue.code)).toEqual(expect.arrayContaining(['manager-evaluation-tone', 'unexpected-latin', 'system-term']));
    });

    it('keeps Korean verification copy out of the worker-facing certificate page', () => {
        const templateSource = readFileSync('components/ReportTemplate.tsx', 'utf8');
        const workerFacingSource = templateSource.split('{includeAdminAppendix &&')[0];
        expect(workerFacingSource).not.toContain('[KO]');
        expect(workerFacingSource).not.toContain('font-serif');
    });

    it('separates one-page worker delivery from the two-page manager analysis', () => {
        const individualReportSource = readFileSync('pages/IndividualReport.tsx', 'utf8');
        const workerManagementSource = readFileSync('pages/WorkerManagement.tsx', 'utf8');
        const managerReportSource = readFileSync('pages/Reports.tsx', 'utf8');

        expect(individualReportSource).toContain('includeAdminAppendix={false}');
        expect(workerManagementSource).toContain('includeAdminAppendix={false}');
        expect(managerReportSource).not.toContain('includeAdminAppendix={false}');
    });
});

describe('worker report target grouping', () => {
    it('shows one target per worker with months, records, period, and score change', () => {
        const records = [
            buildRecord({ id: 'a-1', worker_uuid: 'monthly-a-04', workerUuid: 'monthly-a-04', date: '2026-04-02', safetyScore: 70 }),
            buildRecord({ id: 'a-2', worker_uuid: 'monthly-a-05', workerUuid: 'monthly-a-05', date: '2026-05-02', safetyScore: 75 }),
            buildRecord({ id: 'a-3', worker_uuid: 'monthly-a-06', workerUuid: 'monthly-a-06', date: '2026-06-02', safetyScore: 82 }),
            buildRecord({ id: 'b-1', worker_uuid: 'worker-b', workerUuid: 'worker-b', name: '다른 근로자', date: '2026-06-03', safetyScore: 65 }),
        ];

        const targets = buildWorkerReportTargets(records);
        expect(targets).toHaveLength(2);
        const workerA = targets.find((target) => target.latestRecord.name === '테스트 근로자');
        expect(workerA).toMatchObject({
            recordCount: 3,
            monthCount: 3,
            periodLabel: '2026.04 - 2026.06',
            deltaScore: 12,
        });
        expect(workerA?.latestRecord.id).toBe('a-3');
    });

    it('opens the report center on the grouped worker list by default', () => {
        const source = readFileSync('pages/Reports.tsx', 'utf8');
        expect(source).toContain("useState<ReportType>('worker-report')");
    });
});

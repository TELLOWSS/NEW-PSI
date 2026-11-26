import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import {
    auditAccidentImportCandidates,
    buildAccidentConversionPrompt,
    computeAccidentBigDataAnalytics,
    exportAccidentRecordsToCsv,
    getSampleAccidentBigDataRecords,
    maskAccidentRecordPii,
    parseExternalAiAccidentPayload,
    persistAccidentBigDataStore,
    readAccidentBigDataStore,
    standardizeAccidentJobField,
    updateAccidentRecordInList,
} from '../utils/accidentBigData';

describe('accidentBigData hub engine', () => {
    it('builds copy-ready conversion prompt with frame-construction trades and disambiguation rules', () => {
        const prompt = buildAccidentConversionPrompt({
            provider: 'gemini',
            contractorHint: '한강건설',
            siteHint: '수도권 3공구',
            outputFormat: 'json',
        });

        expect(prompt).toContain('Gemini 전용');
        expect(prompt).toContain('개인정보 자동 비식별화');
        expect(prompt).toContain('해체정리');
        expect(prompt).toContain('갱폼');
        expect(prompt).toContain('알폼');
        expect(prompt).toContain('할석미장견출');
        expect(prompt).toContain('해체·탈형·정리·반출');
        expect(prompt).toContain('한강건설');
        expect(prompt).toContain('수도권 3공구');
    });

    it('preserves frame-construction trades like 해체정리, 알폼, 갱폼 without collapsing into 형틀', () => {
        expect(standardizeAccidentJobField('해체정리', '3층 거푸집 알폼 해체 및 반출 작업')).toBe('해체정리');
        expect(standardizeAccidentJobField('알폼', '2층 알루미늄 거푸집 조립')).toBe('알폼');
        expect(standardizeAccidentJobField('갱폼', '외벽 갱폼 인양 볼트 체결')).toBe('갱폼');
        expect(standardizeAccidentJobField('바닥미장', '옥상 바닥 휘니셔 작업')).toBe('바닥미장');
        expect(standardizeAccidentJobField('', '슬래브 유로폼 해체 및 정리 작업 중 낙하')).toBe('해체정리');
        expect(standardizeAccidentJobField('PC조립', 'PC 기둥 양중')).toBe('PC조립');
    });

    it('parses fenced Markdown JSON mixed with AI explanation text and standardizes fields', () => {
        const aiReply = `
네, 요청하신 원도급사 사고보고서를 NEW-PSI 표준 JSON으로 변환했습니다:

\`\`\`json
[
  {
    "occurredDate": "2026.11.20",
    "sourceContractor": "A원도급사",
    "siteName": "판교 신축 현장",
    "jobField": "거푸집 목공",
    "workTask": "슬래브 동바리 조립",
    "hazardType": "높은 곳에서 떨어짐",
    "severity": "중상",
    "causingAgent": "비계 발판",
    "summary": "발판 단부 이동 중 발을 헛디뎌 추락한 사고",
    "directCause": "안전대 미체결",
    "rootCause": "고소작업 전 체결 확인 누락",
    "preventionMeasure": "2줄걸이 안전대 체결 후 작업",
    "preWorkCheckpoints": ["안전대 고리 확인"]
  }
]
\`\`\`

추가 확인이 필요하시면 말씀해 주세요.
`;
        const parsed = parseExternalAiAccidentPayload(aiReply, { defaultProvider: 'chatgpt' });
        expect(parsed.ok).toBe(true);
        expect(parsed.formatDetected).toBe('json');
        expect(parsed.candidates).toHaveLength(1);
        expect(parsed.candidates[0].occurredDate).toBe('2026-11-20');
        expect(parsed.candidates[0].jobField).toBe('형틀');
        expect(parsed.candidates[0].hazardType).toBe('추락');
        expect(parsed.candidates[0].sourceAiProvider).toBe('chatgpt');
    });

    it('parses Korean CSV with quoted commas accurately', () => {
        const csvText = [
            '발생일자,원도급사,현장명,공종,재해유형,심각도,기인물,사고개요,재발방지대책',
            '2026-11-18,태백건설,"용인 1공구, 지하층",철근,맞음,경상,철근 다발,"인양 중 자재가 흔들려, 작업자 어깨 접촉",유도봉 필수 사용',
        ].join('\n');

        const parsed = parseExternalAiAccidentPayload(csvText);
        expect(parsed.ok).toBe(true);
        expect(parsed.formatDetected).toBe('csv');
        expect(parsed.candidates[0].siteName).toBe('용인 1공구, 지하층');
        expect(parsed.candidates[0].hazardType).toBe('낙하·비래');
        expect(parsed.candidates[0].jobField).toBe('철근');
    });

    it('detects PII, masks it cleanly, and flags duplicates against existing DB', () => {
        const rawParsed = parseExternalAiAccidentPayload(JSON.stringify([{
            occurredDate: '2026-11-24',
            sourceContractor: '대한건설',
            siteName: '동부 현장',
            jobField: '비계',
            hazardType: '추락',
            severity: '중상',
            summary: '재해자: 김철수 (010-9876-5432, 900101-1234567) 작업 중 추락',
            preventionMeasure: '안전대 2줄 체결',
        }]));

        expect(rawParsed.ok).toBe(true);
        const [firstCandidate] = rawParsed.candidates;

        const auditedFirst = auditAccidentImportCandidates([firstCandidate], []);
        expect(auditedFirst[0].isDuplicate).toBe(false);
        expect(auditedFirst[0].piiFindings).toContain('주민등록번호');
        expect(auditedFirst[0].piiFindings).toContain('휴대전화번호');
        expect(auditedFirst[0].piiFindings).toContain('실명 표기');

        const masked = maskAccidentRecordPii(auditedFirst[0].record);
        expect(masked.summary).not.toContain('900101-1234567');
        expect(masked.summary).not.toContain('010-9876-5432');
        expect(masked.summary).toContain('[비식별]');

        const auditedDup = auditAccidentImportCandidates([firstCandidate], [masked]);
        expect(auditedDup[0].isDuplicate).toBe(true);
        expect(auditedDup[0].selected).toBe(false);
    });

    it('computes big-data distributions and NEW-PSI worker cross-link alerts', () => {
        const samples = getSampleAccidentBigDataRecords();
        const mockWorkers: WorkerRecord[] = [
            {
                id: 'w1',
                name: '근로자A',
                jobField: '시스템',
                date: '2026-11-25',
                nationality: '대한민국',
                language: 'ko',
                handwrittenAnswers: [],
                fullText: '',
                koreanTranslation: '',
                safetyScore: 62,
                safetyLevel: '초급',
                strengths: [],
                strengths_native: [],
                weakAreas: ['추락 위험 인지 부족'],
                weakAreas_native: [],
                improvement: '',
                improvement_native: '',
                suggestions: [],
                suggestions_native: [],
                aiInsights: '',
                aiInsights_native: '',
                selfAssessedRiskLevel: '상',
            },
        ];

        const analytics = computeAccidentBigDataAnalytics(samples, mockWorkers);
        expect(analytics.totalCount).toBe(6);
        expect(analytics.topJobField?.label).toBe('시스템');
        expect(analytics.crossLinkAlerts.some((a) => a.jobField === '시스템' && a.beginnerCount === 1)).toBe(true);

        const editedList = updateAccidentRecordInList(samples, {
            ...samples[0],
            jobField: '해체정리',
            summary: '수정된 알폼 해체정리 사례',
        });
        expect(editedList[0].jobField).toBe('해체정리');
        expect(editedList[0].fingerprint).not.toBe(samples[0].fingerprint);

        const csvExport = exportAccidentRecordsToCsv(samples);
        expect(csvExport.startsWith('\uFEFF')).toBe(true);
        expect(csvExport).toContain('한강종합건설(예시)');
    });

    it('protects corrupted local storage from accidental overwrite', () => {
        const corrupted = readAccidentBigDataStore(() => '{broken json');
        expect(corrupted.safe).toBe(false);
        expect(corrupted.warning).toContain('덮어쓰기를 차단');

        let written = '';
        const samples = getSampleAccidentBigDataRecords();
        const saved = persistAccidentBigDataStore(samples, (text) => {
            written = text;
        });
        expect(saved.ok).toBe(true);

        const reloaded = readAccidentBigDataStore(() => written);
        expect(reloaded.safe).toBe(true);
        expect(reloaded.items).toHaveLength(6);
    });
});

import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import {
    applyBulkSiteAndContractorToCandidates,
    auditAccidentImportCandidates,
    buildAccidentConversionPrompt,
    computeAccidentBigDataAnalytics,
    exportAccidentRecordsToCsv,
    getMultiSiteBatchSampleText,
    getSampleAccidentBigDataRecords,
    maskAccidentRecordPii,
    normalizeAccidentSeverity,
    normalizeAccidentWorkStage,
    parseExternalAiAccidentPayload,
    parseMultipleAccidentFiles,
    persistAccidentBigDataStore,
    readAccidentBigDataStore,
    standardizeAccidentHazardType,
    standardizeAccidentJobField,
    updateAccidentRecordInList,
} from '../utils/accidentBigData';

describe('accidentBigData hub engine', () => {
    it('builds copy-ready conversion prompt with frame-construction trades, 5-tier severity, and disambiguation rules', () => {
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
        expect(prompt).toContain('소속 팀/직종 jobField');
        expect(prompt).toContain('작업공정(단계 workStage)');
        expect(prompt).toContain('경미(응급·외래)');
        expect(prompt).toContain('휴업재해(3일↑)');
        expect(prompt).toContain('중상(장기·입원)');
        expect(prompt).toContain('한강건설');
        expect(prompt).toContain('수도권 3공구');
    });

    it('normalizes 5-tier construction severity accurately and migrates legacy 경상/중상 safely', () => {
        expect(normalizeAccidentSeverity('아차사고')).toBe('아차사고');
        expect(normalizeAccidentSeverity('경상')).toBe('경미(응급·외래)');
        expect(normalizeAccidentSeverity('현장 응급처치 후 당일 복귀')).toBe('경미(응급·외래)');
        expect(normalizeAccidentSeverity('휴업 5일 통원치료')).toBe('휴업재해(3일↑)');
        expect(normalizeAccidentSeverity('발목 염좌 및 봉합(2주)')).toBe('휴업재해(3일↑)');
        expect(normalizeAccidentSeverity('전치 6주 입원 수술')).toBe('중상(장기·입원)');
        expect(normalizeAccidentSeverity('중상')).toBe('중상(장기·입원)');
        expect(normalizeAccidentSeverity('중대재해')).toBe('중대재해');
    });

    it('preserves explicit trade (AL폼/형틀) during dismantling and separates workStage from jobField', () => {
        // 1) 알폼·형틀 팀이 해체·정리 작업을 할 때는 소속 공종을 유지하고, 작업공정만 해체·탈형으로 분리해야 한다.
        expect(standardizeAccidentJobField('알폼', '3층 알폼 해체 및 정리 작업')).toBe('알폼');
        expect(standardizeAccidentJobField('형틀', '거푸집 탈형 및 정리 작업 중 낙하')).toBe('형틀');
        expect(standardizeAccidentJobField('갱폼', '외벽 갱폼 인양 볼트 체결')).toBe('갱폼');
        expect(standardizeAccidentJobField('바닥미장', '옥상 바닥 휘니셔 작업')).toBe('바닥미장');
        expect(standardizeAccidentJobField('PC조립', 'PC 기둥 양중')).toBe('PC조립');

        // 2) 대공종('골조공사')이거나 공종 미기재 시 본문 자재·전문팀 키워드로 판별하고, 해체전담팀일 때만 해체정리로 분류한다.
        expect(standardizeAccidentJobField('골조공사', '3층 알폼 해체 중 자재 낙하')).toBe('알폼');
        expect(normalizeAccidentWorkStage('', '3층 알폼 해체 중 자재 낙하')).toBe('해체·탈형');

        expect(standardizeAccidentJobField('해체정리', '알폼 패널 해체 반출')).toBe('해체정리');
        expect(standardizeAccidentJobField('골조공사', '해체정리반 슬래브 자재 반출')).toBe('해체정리');
        expect(normalizeAccidentWorkStage('', '해체정리반 슬래브 자재 반출')).toBe('정리·반출');
        expect(standardizeAccidentJobField('', '잔재물 정리 및 반출 작업')).toBe('해체정리');
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
        expect(parsed.candidates[0].hazardType).toBe('낙하');
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
        expect(analytics.severityPyramid).toHaveLength(5);
        expect(analytics.reportableCount).toBe(3);
        expect(analytics.timeSlotDistribution).toHaveLength(5);
        expect(analytics.riskMatrix.cells.length).toBeGreaterThan(0);
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

        const legacyJson = JSON.stringify([{ ...samples[0], severity: '경상' }, { ...samples[1], severity: '중상' }]);
        const migrated = readAccidentBigDataStore(() => legacyJson);
        expect(migrated.safe).toBe(true);
        expect(migrated.items[0].severity).toBe('경미(응급·외래)');
        expect(migrated.items[1].severity).toBe('중상(장기·입원)');
    });

    it('parses multiple fenced JSON blocks, stacked raw JSON arrays, and mixed multiple files across multiple sites', () => {
        const promptMulti = buildAccidentConversionPrompt({
            provider: 'chatgpt',
            outputFormat: 'json',
            multiSiteMode: true,
        });
        expect(promptMulti).toContain('다건·다수 현장 일괄 변환 원칙');
        expect(promptMulti).toContain('덮어쓰기 금지');

        const multiBlockResult = parseExternalAiAccidentPayload(getMultiSiteBatchSampleText());
        expect(multiBlockResult.ok).toBe(true);
        expect(multiBlockResult.blocksParsed).toBe(2);
        expect(multiBlockResult.candidates).toHaveLength(4);
        // 1번(알폼 팀 해체)은 알폼 공종 유지 + 작업공정 '해체·탈형', 2번(해체정리 전담반)은 '해체정리' + '정리·반출'
        expect(multiBlockResult.candidates[0].jobField).toBe('알폼');
        expect(multiBlockResult.candidates[0].workStage).toBe('해체·탈형');
        expect(multiBlockResult.candidates[1].jobField).toBe('해체정리');
        expect(multiBlockResult.candidates[1].workStage).toBe('정리·반출');
        expect(new Set(multiBlockResult.candidates.map((c) => c.siteName)).size).toBe(3);

        const multiBlockAudited = auditAccidentImportCandidates(multiBlockResult.candidates, []);
        expect(multiBlockAudited[0].tradeReviewHint).toContain('해체·탈형');
        expect(multiBlockAudited[1].tradeReviewHint).toBe('');

        const stackedJson = `[{"occurredDate":"2026-10-01","siteName":"현장A","workTask":"알폼 설치","hazardType":"협착"}]\n[{"occurredDate":"2026-10-02","siteName":"현장B","workTask":"갱폼 인양","hazardType":"추락"}]`;
        const stackedResult = parseExternalAiAccidentPayload(stackedJson);
        expect(stackedResult.ok).toBe(true);
        expect(stackedResult.blocksParsed).toBe(2);
        expect(stackedResult.candidates).toHaveLength(2);
        expect(stackedResult.candidates.map((c) => c.siteName)).toEqual(['현장A', '현장B']);

        const mixedBatch = parseMultipleAccidentFiles([
            {
                fileName: 'site-a.json',
                content: '[{"occurredDate":"2026-09-01","sourceContractor":"원청A","siteName":"A현장","jobField":"형틀","workTask":"슬래브 동바리 조립","hazardType":"추락"}]',
            },
            {
                fileName: 'site-b.csv',
                content: 'occurredDate,timeSlot,sourceContractor,siteName,jobField,workTask,hazardType,severity\n2026-09-02,오후,원청B,B현장,해체정리,거푸집 탈형 반출,낙하,휴업재해(3일↑)',
            },
            {
                fileName: 'broken.txt',
                content: '안녕하세요 변환 전 일반 메모입니다.',
            },
        ]);
        expect(mixedBatch.okCount).toBe(2);
        expect(mixedBatch.failedCount).toBe(1);
        expect(mixedBatch.candidates).toHaveLength(2);
        expect(mixedBatch.candidates[1].siteName).toBe('B현장');

        const auditedQueue = auditAccidentImportCandidates(mixedBatch.candidates, []);
        const bulkUpdated = applyBulkSiteAndContractorToCandidates(auditedQueue, [], {
            siteName: '통합수정현장',
            onlyWhenMissing: false,
        });
        expect(bulkUpdated[0].record.siteName).toBe('통합수정현장');
        expect(bulkUpdated[1].record.siteName).toBe('통합수정현장');

        const siteAnalytics = computeAccidentBigDataAnalytics(getSampleAccidentBigDataRecords());
        expect(siteAnalytics.siteCount).toBeGreaterThanOrEqual(4);
        expect(siteAnalytics.siteDistribution[0].siteName).toBeTruthy();
        expect(siteAnalytics.siteDistribution.reduce((acc, s) => acc + s.count, 0)).toBe(6);
    });

    it('separates bundled hazards cleanly into individual categories and migrates legacy bundled records', () => {
        // 1) 개별 재해유형 분리 원칙: 붕괴 vs 전도, 낙하 vs 비래, 화재 vs 폭발, 베임 vs 찔림
        expect(standardizeAccidentHazardType('전도', '갱폼 기울어짐')).toBe('전도(넘어짐)');
        expect(standardizeAccidentHazardType('넘어짐', '물기 있는 바닥 미끄러짐')).toBe('전도(넘어짐)');
        expect(standardizeAccidentHazardType('붕괴', '시스템 동바리 좌굴 무너짐')).toBe('붕괴');
        expect(standardizeAccidentHazardType('낙하', '상부 알폼 패널 떨어짐')).toBe('낙하');
        expect(standardizeAccidentHazardType('비래', '그라인더 연마 파편 튕김')).toBe('비래');
        expect(standardizeAccidentHazardType('화재', '용접 불티 착화')).toBe('화재');
        expect(standardizeAccidentHazardType('폭발', '밀폐공간 가연성 가스 폭발')).toBe('폭발');
        expect(standardizeAccidentHazardType('베임', '철판 모서리 절단 사고')).toBe('베임(절단)');
        expect(standardizeAccidentHazardType('찔림', '슬래브 돌출 철근 끝 찔림')).toBe('찔림');
        expect(standardizeAccidentHazardType('화학물질 누출', '')).toBe('화학물질 누출');

        // 2) 기존 DB에 저장된 묶음 표기('붕괴·전도', '낙하·비래')도 문맥을 반영해 무손실 분리 전환
        const samples = getSampleAccidentBigDataRecords();
        const legacyBundledJson = JSON.stringify([
            { ...samples[0], hazardType: '붕괴·전도', workTask: '바닥 물기 미끄러짐 넘어짐', summary: '보행 중 미끄러짐' },
            { ...samples[1], hazardType: '붕괴·전도', workTask: '시스템 동바리 무너짐', summary: '동바리 수직재 좌굴 붕괴' },
            { ...samples[2], hazardType: '낙하·비래', workTask: '그라인더 절단석 파편 튕김', summary: '절단석 파편 비산' },
            { ...samples[3], hazardType: '낙하·비래', workTask: '상부 볼트 떨어짐', summary: '상부에서 공구 낙하' },
        ]);
        const migrated = readAccidentBigDataStore(() => legacyBundledJson);
        expect(migrated.safe).toBe(true);
        expect(migrated.items.map((item) => item.hazardType)).toEqual([
            '전도(넘어짐)',
            '붕괴',
            '비래',
            '낙하',
        ]);

        // 3) AI 변환 지시문에도 묶음 금지 규칙 명시
        const prompt = buildAccidentConversionPrompt({
            provider: 'gemini',
            outputFormat: 'json',
        });
        expect(prompt).toContain('묶음 금지');
        expect(prompt).toContain('전도(넘어짐)');
        expect(prompt).toContain('베임(절단)');
    });
});

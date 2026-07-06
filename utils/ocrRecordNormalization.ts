import type { AuditTrailEntry, WorkerRecord } from '../types';
import { normalizeJobField } from './workerIdentity.js';

type PartialWorkerRecord = Partial<WorkerRecord> & {
    auditTrail?: AuditTrailEntry[];
    scoreReasoning?: string[];
};

export type OcrMetadataNormalizationChange = {
    field: 'date' | 'jobField';
    before: string;
    after: string;
    reason: string;
};

export type OcrMetadataNormalizationResult<T extends PartialWorkerRecord> = {
    record: T;
    changed: boolean;
    skipped: boolean;
    changes: OcrMetadataNormalizationChange[];
};

const GENERIC_JOB_FIELDS = new Set([
    '',
    '기타',
    '미분류',
    '일반',
    '일반공종',
    '일반 공종',
    '직영',
    '협력사',
    '위강건설',
    '외강건설',
]);

const toCompactText = (value: unknown): string => String(value || '').replace(/\s+/g, ' ').trim();

const toSearchText = (record: PartialWorkerRecord): string => [
    record.jobField,
    record.fullText,
    record.koreanTranslation,
    record.aiInsights,
    record.improvement,
    ...(record.handwrittenAnswers || []).flatMap((answer) => [
        answer.answerText,
        answer.koreanTranslation,
        answer.nativeTranslation,
    ]),
].filter(Boolean).join(' ').toLowerCase();

const toJobFieldNormalizationContext = (record: PartialWorkerRecord): string => [
    record.jobField,
    record.fullText,
    record.koreanTranslation,
].filter(Boolean).join(' ').toLowerCase();

const isFailureOnlyRecord = (record: PartialWorkerRecord): boolean => {
    const answers = Array.isArray(record.handwrittenAnswers) ? record.handwrittenAnswers : [];
    const text = `${record.fullText || ''} ${record.koreanTranslation || ''} ${record.aiInsights || ''}`;
    return answers.length === 0 && /분석 실패|ocr 분석에 실패|할당량 초과|resource_exhausted/i.test(text);
};

const normalizeDateParts = (yearInput: number, monthInput: number, dayInput: number): string | null => {
    let year = yearInput;
    const month = monthInput;
    const day = dayInput;

    if (year >= 0 && year < 100) {
        year = year >= 70 ? 1900 + year : 2000 + year;
    }

    // OCR에서 2026이 206으로 잘리는 경우가 있어 2020년대 현장 문서로 보정한다.
    if (year >= 200 && year <= 209) {
        year = 2000 + (year - 180);
    }

    if (year < 2000 || year > 2035) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;

    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const collectDateCandidates = (text: string): string[] => {
    const candidates: string[] = [];
    const seen = new Set<string>();
    const push = (date: string | null) => {
        if (!date || seen.has(date)) return;
        seen.add(date);
        candidates.push(date);
    };

    const normalized = text.replace(/[년월]/g, '.').replace(/[일]/g, ' ');

    for (const match of normalized.matchAll(/(^|[^\d])((?:19|20)\d{2})\s*[./,\-\s]\s*(\d{1,2})\s*[./,\-\s]\s*(\d{1,2})(?!\d)/g)) {
        push(normalizeDateParts(Number(match[2]), Number(match[3]), Number(match[4])));
    }

    for (const match of normalized.matchAll(/(^|[^\d])(\d{2})\s*[./,\-\s]\s*(\d{1,2})\s*[./,\-\s]\s*(\d{1,2})(?!\d)/g)) {
        push(normalizeDateParts(Number(match[2]), Number(match[3]), Number(match[4])));
    }

    for (const match of normalized.matchAll(/(^|[^\d])(20\d)\s*[./,\-\s]\s*(\d{1,2})\s*[./,\-\s]\s*(\d{1,2})(?!\d)/g)) {
        push(normalizeDateParts(Number(match[2]), Number(match[3]), Number(match[4])));
    }

    return candidates;
};

const resolveOcrDate = (
    rawDate: string,
    contextText: string,
    now = new Date(),
): { value: string; reason: string } => {
    const rawCandidates = collectDateCandidates(rawDate);
    const contextCandidates = collectDateCandidates(contextText);
    const allCandidates = [...contextCandidates, ...rawCandidates];
    const nowTime = now.getTime();
    const futureToleranceMs = 45 * 24 * 60 * 60 * 1000;
    const pastToleranceMs = 730 * 24 * 60 * 60 * 1000;

    const scored = allCandidates
        .map((candidate, index) => {
            const time = new Date(candidate).getTime();
            const age = nowTime - time;
            const futurePenalty = time > nowTime + futureToleranceMs ? 100000000000 : 0;
            const pastPenalty = age > pastToleranceMs ? 20000000000 : 0;
            const contextBonus = index < contextCandidates.length ? -5000000000 : 0;
            return {
                candidate,
                score: Math.abs(age) + futurePenalty + pastPenalty + contextBonus,
            };
        })
        .sort((left, right) => left.score - right.score);

    if (scored[0]?.candidate) {
        return {
            value: scored[0].candidate,
            reason: contextCandidates.includes(scored[0].candidate)
                ? '문서 본문 날짜 기준 보정'
                : '날짜 형식 표준화',
        };
    }

    const trimmed = toCompactText(rawDate);
    return {
        value: trimmed || now.toISOString().slice(0, 10),
        reason: '날짜 후보 없음',
    };
};

const resolveOcrJobField = (rawJobField: string, contextText: string): { value: string; reason: string } => {
    const raw = toCompactText(rawJobField);
    const rawCompact = raw.replace(/\s+/g, '');
    const normalized = normalizeJobField(raw);
    const context = contextText.replace(/\s+/g, '');

    const looksLikeQuestionAnswer =
        rawCompact.length >= 7 &&
        /작업|위험|사고|요인|대책|조심|확인|착용|체결|추락|낙하|감전|넘어짐|부딪힘|깔림|끼임|말림|화재|폭발|전도|충돌|미끄러짐/.test(rawCompact);

    if (looksLikeQuestionAnswer) {
        return {
            value: '미분류',
            reason: '문항 답변으로 보이는 공종값 격리',
        };
    }

    const fromContextRules: Array<[RegExp, string]> = [
        [/시스템비계|시스템동바리|동바리|시스템/, '비계'],
        [/콘크리트|타설|펌프카|레미콘/, '타설'],
        [/형틀|거푸집|목공|폼/, '형틀'],
        [/철근|배근/, '철근'],
        [/철골|데크|볼트체결/, '철골'],
        [/전기|감전|절연|양수기|분전반/, '전기'],
        [/신호수|유도원|장비유도|차량유도/, '신호수'],
        [/안전시설|난간|개구부|해체정리|해체·정리/, '안전시설'],
        [/지붕|판넬|패널/, '지붕'],
        [/보통인부|일반인부|용역|정리정돈|작업장이동|이동통로/, '용역'],
    ];

    if (rawCompact === '신호수/유도원' || rawCompact.includes('유도원')) return { value: '신호수', reason: '공종 표기 통합' };
    if (rawCompact === '보통인부' || rawCompact === '일반인부') return { value: '용역', reason: '공종 표기 통합' };
    if (rawCompact === '일반공종' || rawCompact === '일반') return { value: '기타', reason: '일반 공종 기본값 분리' };
    if (rawCompact === '직영' || rawCompact === '위강건설' || rawCompact === '외강건설') return { value: '기타', reason: '협력사/소속명 공종 제외' };

    const hasExplicitJobFieldLabel =
        /공종[:：]?(형틀|철근|비계|골조|배관|전기|미장|도장|용역|조적|타일|석공|방수|해체|신호수|유도원|굴착|타설|철골|안전시설|지붕)/.test(context);

    if ((GENERIC_JOB_FIELDS.has(raw) || GENERIC_JOB_FIELDS.has(rawCompact) || normalized === raw) && hasExplicitJobFieldLabel) {
        for (const [pattern, value] of fromContextRules) {
            if (pattern.test(context)) {
                return { value, reason: '공종 표기 영역 기준 보정' };
            }
        }
    }

    if (GENERIC_JOB_FIELDS.has(raw) || GENERIC_JOB_FIELDS.has(rawCompact)) {
        return { value: '미분류', reason: '공종 칸 판독 불확실' };
    }

    return { value: normalized || raw || '미분류', reason: normalized !== raw ? '공종 사전 표준화' : '공종 유지' };
};

export const normalizeOcrRecordMetadata = <T extends PartialWorkerRecord>(
    record: T,
    options?: { now?: Date; appendAuditTrail?: boolean },
): OcrMetadataNormalizationResult<T> => {
    if (isFailureOnlyRecord(record)) {
        return { record, changed: false, skipped: true, changes: [] };
    }

    const changes: OcrMetadataNormalizationChange[] = [];
    const contextText = toSearchText(record);
    const jobFieldContextText = toJobFieldNormalizationContext(record);
    const dateResult = resolveOcrDate(toCompactText(record.date), contextText, options?.now);
    const jobResult = resolveOcrJobField(toCompactText(record.jobField), jobFieldContextText);
    const nextRecord: T = { ...record };

    if (dateResult.value && dateResult.value !== toCompactText(record.date)) {
        (nextRecord as PartialWorkerRecord).date = dateResult.value;
        changes.push({
            field: 'date',
            before: toCompactText(record.date),
            after: dateResult.value,
            reason: dateResult.reason,
        });
    }

    if (jobResult.value && jobResult.value !== toCompactText(record.jobField)) {
        (nextRecord as PartialWorkerRecord).jobField = jobResult.value;
        changes.push({
            field: 'jobField',
            before: toCompactText(record.jobField),
            after: jobResult.value,
            reason: jobResult.reason,
        });
    }

    if (changes.length > 0 && options?.appendAuditTrail !== false) {
        const note = `OCR 후처리 표준화: ${changes.map((change) => `${change.field} ${change.before || '-'}→${change.after}(${change.reason})`).join(', ')}`;
        (nextRecord as PartialWorkerRecord).auditTrail = [
            ...(record.auditTrail || []),
            {
                stage: 'validation',
                timestamp: new Date().toISOString(),
                actor: 'ocr-postprocess',
                note,
            },
        ];
    }

    return {
        record: nextRecord,
        changed: changes.length > 0,
        skipped: false,
        changes,
    };
};

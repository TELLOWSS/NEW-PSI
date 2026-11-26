import {
    PSI_STANDARD_JOB_FIELDS,
    PSI_WORKER_JOB_FIELDS,
    PSI_WORKER_JOB_FIELD_ALIASES,
} from '../config/psiFormMaster';
import type {
    AccidentBigDataRecord,
    AccidentSeverity,
    AccidentSourceProvider,
    AccidentTimeSlot,
    AccidentWorkStage,
    WorkerRecord,
} from '../types';
import { normalizeJobField } from './workerIdentity';

export const ACCIDENT_BIGDATA_STORAGE_KEY = 'psi_accident_bigdata_v1';
export const ACCIDENT_BIGDATA_UPDATED_EVENT = 'psi-accident-bigdata-updated';

export const ACCIDENT_WORK_STAGE_OPTIONS: readonly AccidentWorkStage[] = [
    '설치·조립',
    '해체·탈형',
    '정리·반출',
    '양중·인양',
    '타설·양생',
    '가공·절단',
    '점검·보수',
    '이동·운반',
    '미상',
];

export const ACCIDENT_JOB_FIELD_OPTIONS: readonly string[] = Array.from(new Set([
    ...PSI_WORKER_JOB_FIELDS,
    ...PSI_STANDARD_JOB_FIELDS.filter((item) => item !== '미분류'),
    '장비',
    '안전시설',
    '신호수',
    '전기',
    '배관',
    '굴착',
    '철골',
    '기타',
]));

export type AccidentPromptProvider = 'gemini' | 'chatgpt';
export type AccidentPromptFormat = 'json' | 'csv';

export interface AccidentStoreReadResult {
    items: AccidentBigDataRecord[];
    safe: boolean;
    warning: string;
}

export interface AccidentAuditCandidate {
    candidateId: string;
    record: AccidentBigDataRecord;
    selected: boolean;
    normalizationNotes: string[];
    piiFindings: string[];
    tradeReviewHint: string;
    isDuplicate: boolean;
    duplicateReason: string;
    completenessPct: number;
}

export interface AccidentParseResult {
    ok: boolean;
    formatDetected: 'json' | 'csv' | 'unknown';
    candidates: AccidentBigDataRecord[];
    warnings: string[];
    error: string;
    blocksParsed: number;
}

export interface AccidentBatchFileInput {
    fileName: string;
    content: string;
}

export interface AccidentBatchFileReport {
    fileName: string;
    ok: boolean;
    count: number;
    formatDetected: 'json' | 'csv' | 'unknown';
    error: string;
}

export interface AccidentDistributionBucket {
    label: string;
    count: number;
    severeCount: number;
    sharePct: number;
}

export interface AccidentMonthlyPoint {
    month: string;
    total: number;
    severe: number;
    nearMiss: number;
}

export interface AccidentCrossLinkAlert {
    jobField: string;
    accidentCount: number;
    severeCount: number;
    workerCount: number;
    avgSafetyScore: number | null;
    beginnerCount: number;
    topHazard: string;
    checkpoints: string[];
    reasonSummary: string;
}

export interface AccidentSeverityTierMetric {
    severity: AccidentSeverity;
    shortLabel: string;
    criteria: string;
    color: string;
    count: number;
    sharePct: number;
}

export interface AccidentTimeSlotPoint {
    slot: Exclude<AccidentTimeSlot, '미상'>;
    count: number;
    severeCount: number;
    sharePct: number;
    isPeak: boolean;
}

export interface AccidentRiskMatrixCell {
    trade: string;
    hazard: string;
    count: number;
    severeCount: number;
    intensity: 0 | 1 | 2 | 3;
}

export interface AccidentRiskMatrix {
    trades: string[];
    hazards: string[];
    cells: AccidentRiskMatrixCell[];
}

export interface AccidentSiteComparisonBucket {
    siteName: string;
    contractor: string;
    count: number;
    reportableCount: number;
    severeCount: number;
    nearMissCount: number;
    sharePct: number;
    topJobField: string;
    topHazard: string;
}

export interface AccidentBigDataAnalytics {
    totalCount: number;
    severeCount: number;
    severeRatePct: number;
    reportableCount: number;
    reportableRatePct: number;
    nearMissCount: number;
    contractorCount: number;
    siteCount: number;
    topJobField: AccidentDistributionBucket | null;
    topHazardType: AccidentDistributionBucket | null;
    hazardDistribution: AccidentDistributionBucket[];
    jobFieldDistribution: AccidentDistributionBucket[];
    siteDistribution: AccidentSiteComparisonBucket[];
    severityPyramid: AccidentSeverityTierMetric[];
    timeSlotDistribution: AccidentTimeSlotPoint[];
    riskMatrix: AccidentRiskMatrix;
    rootCauseTop5: Array<{ label: string; count: number; sharePct: number }>;
    causingAgentTop5: Array<{ label: string; count: number; sharePct: number }>;
    monthlyTrend: AccidentMonthlyPoint[];
    crossLinkAlerts: AccidentCrossLinkAlert[];
}

export const ACCIDENT_SEVERITY_LEVELS: readonly AccidentSeverity[] = [
    '아차사고',
    '경미(응급·외래)',
    '휴업재해(3일↑)',
    '중상(장기·입원)',
    '중대재해',
];

export const ACCIDENT_SEVERITY_META: Record<AccidentSeverity, {
    label: AccidentSeverity;
    shortLabel: string;
    criteria: string;
    color: string;
    rank: number;
    isReportable: boolean;
    isSevere: boolean;
}> = {
    '아차사고': {
        label: '아차사고',
        shortLabel: '아차사고',
        criteria: '인적 피해 없음 · 위험 징후·미수 사례',
        color: '#10b981',
        rank: 1,
        isReportable: false,
        isSevere: false,
    },
    '경미(응급·외래)': {
        label: '경미(응급·외래)',
        shortLabel: '경미(응급)',
        criteria: '현장 응급처치 · 휴업 3일 미만 단순 타박/찰과상',
        color: '#06b6d4',
        rank: 2,
        isReportable: false,
        isSevere: false,
    },
    '휴업재해(3일↑)': {
        label: '휴업재해(3일↑)',
        shortLabel: '휴업(3일↑)',
        criteria: '휴업 3일 이상~4주 미만 산재보고 · 봉합/염좌/단순골절',
        color: '#f59e0b',
        rank: 3,
        isReportable: true,
        isSevere: false,
    },
    '중상(장기·입원)': {
        label: '중상(장기·입원)',
        shortLabel: '중상(4주↑)',
        criteria: '4주(28일) 이상 장기요양 · 입원 · 수술 필요',
        color: '#f97316',
        rank: 4,
        isReportable: true,
        isSevere: true,
    },
    '중대재해': {
        label: '중대재해',
        shortLabel: '중대재해',
        criteria: '사망 또는 법정 중대산업재해(동시 2인↑·6개월↑)',
        color: '#e11d48',
        rank: 5,
        isReportable: true,
        isSevere: true,
    },
};

const VALID_SEVERITIES: ReadonlySet<AccidentSeverity> = new Set(ACCIDENT_SEVERITY_LEVELS);

const VALID_TIME_SLOTS: ReadonlySet<AccidentTimeSlot> = new Set([
    '오전 작업전',
    '오전',
    '점심 직후',
    '오후',
    '야간',
    '미상',
]);

const VALID_PROVIDERS: ReadonlySet<AccidentSourceProvider> = new Set([
    'gemini',
    'chatgpt',
    'claude',
    'csv',
    'manual',
]);

export const ACCIDENT_HAZARD_TYPE_OPTIONS: readonly string[] = [
    '추락',
    '낙하',
    '비래',
    '전도(넘어짐)',
    '붕괴',
    '끼임(협착)',
    '깔림(매몰)',
    '충돌(부딪힘)',
    '베임(절단)',
    '찔림',
    '감전',
    '화재',
    '폭발',
    '질식',
    '온열질환',
    '근골격계(무리한 동작)',
    '기타',
];

const HAZARD_LABELS = ACCIDENT_HAZARD_TYPE_OPTIONS;

const normalizeText = (value: unknown): string =>
    String(value ?? '').replace(/\s+/g, ' ').trim();

export const normalizeAccidentDate = (value: unknown): string => {
    const raw = normalizeText(value);
    if (!raw) return new Date().toISOString().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const cleaned = raw.replace(/[년월]/g, '-').replace(/[일]/g, '').replace(/[./]/g, '-');
    const matched = cleaned.match(/(\d{4})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})/);
    if (matched) {
        const y = matched[1];
        const m = matched[2].padStart(2, '0');
        const d = matched[3].padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }
    return new Date().toISOString().slice(0, 10);
};

export const normalizeAccidentTimeSlot = (value: unknown): AccidentTimeSlot => {
    const raw = normalizeText(value);
    if (!raw) return '미상';
    if (VALID_TIME_SLOTS.has(raw as AccidentTimeSlot)) return raw as AccidentTimeSlot;
    if (/작업\s*전|출근|조조회|0[67]:/.test(raw)) return '오전 작업전';
    if (/점심|1[23]:/.test(raw)) return '점심 직후';
    if (/야간|밤|1[89]:|2[0-3]:|0[0-5]:/.test(raw)) return '야간';
    if (/오전|아침|0[89]:|1[01]:/.test(raw)) return '오전';
    if (/오후|1[4-7]:/.test(raw)) return '오후';
    return '미상';
};

export const normalizeAccidentSeverity = (value: unknown): AccidentSeverity => {
    const raw = normalizeText(value);
    if (VALID_SEVERITIES.has(raw as AccidentSeverity)) return raw as AccidentSeverity;
    if (/중대재해|중대산업|사망|전신|절단|의식불명|6개월/.test(raw)) return '중대재해';
    if (/중상|장기|입원|수술|복합골절|뇌출혈|4주|28일|1개월|6주|8주|12주|3개월/.test(raw)) return '중상(장기·입원)';
    if (/휴업|산재|3일|1주|2주|3주|봉합|염좌|단순골절|실금|골절|통원/.test(raw)) return '휴업재해(3일↑)';
    if (/아차|무재해|미수|부상\s*없|피해\s*없/.test(raw)) return '아차사고';
    if (/경상|경미|응급|외래|찰과|타박|불휴업|1~2일|일회성/.test(raw)) return '경미(응급·외래)';
    return '경미(응급·외래)';
};

const VALID_WORK_STAGES = new Set<AccidentWorkStage>(ACCIDENT_WORK_STAGE_OPTIONS);

export const normalizeAccidentWorkStage = (value: unknown, fallbackContext = ''): AccidentWorkStage => {
    const raw = normalizeText(value);
    if (VALID_WORK_STAGES.has(raw as AccidentWorkStage)) return raw as AccidentWorkStage;

    const search = `${raw} ${fallbackContext}`
        .replace(/해체\s*정리\s*(?:팀|반|공|조|공종)|해체\s*(?:팀|반|공)|정리\s*(?:팀|반|공)/g, ' ')
        .trim();

    if (/해체|탈형|철거|분해|풀림/.test(search)) return '해체·탈형';
    if (/정리|반출|적치|청소|잔재/.test(search)) return '정리·반출';
    if (/인양|양중|하역|크레인|호이스트|지게차/.test(search)) return '양중·인양';
    if (/타설|양생|펌프카|레미콘|바이브레이터|미장|휘니셔/.test(search)) return '타설·양생';
    if (/절단|가공|용접|그라인더|치핑|할석|견출/.test(search)) return '가공·절단';
    if (/점검|보수|측량|확인|검사|시험/.test(search)) return '점검·보수';
    if (/설치|조립|체결|배근|시공|포설|고정|되메우기/.test(search)) return '설치·조립';
    if (/이동|운반|보행|통행|승강|후진/.test(search)) return '이동·운반';
    return '미상';
};

const GENERIC_JOB_PLACEHOLDERS = new Set([
    '',
    '기타',
    '미분류',
    '일반',
    '일반공종',
    '일반 공종',
    '미상',
    '골조',
    '골조공사',
    '철근콘크리트',
    '철근콘크리트공사',
    '건축',
    '건축공사',
    '토목',
    '토목공사',
    '가설',
    '가설공사',
    '공통가설',
    '본공사',
]);

// 공종 미기재·대공종일 때만 문맥으로 추론: 전문팀 명칭 → 전문 골조 자재·공종 → 일반 해체/정리 순서로 판별한다.
const FRAME_TRADE_PRIORITY_RULES: Array<[RegExp, string]> = [
    [/해체\s*정리\s*(?:팀|반|공|조|공종)|해체\s*(?:팀|반|공|전담)|정리\s*(?:팀|반|공)|탈형\s*(?:팀|반)/, '해체정리'],
    [/갱폼|gang\s*form/i, '갱폼'],
    [/알폼|al\s*form|알루미늄\s*(?:폼|거푸집)/i, '알폼'],
    [/시스템\s*동바리|시스템\s*비계|시스템/, '시스템'],
    [/콘크리트\s*비계|타설|콘크리트|펌프카|레미콘/, '콘크리트비계'],
    [/바닥\s*미장|휘니셔|방통/, '바닥미장'],
    [/할석|견출|치핑|미장/, '할석미장견출'],
    [/철근|배근|가공철근/, '철근'],
    [/형틀|거푸집|유로폼|데크폼|동바리|목공|목수/, '형틀'],
    [/해체\s*[·ㆍ\s]*정리|해체|탈형|정리\s*[·ㆍ및\s]*반출|잔재물?\s*정리|자재\s*정리|자재\s*반출|철거/, '해체정리'],
    [/안전\s*시설|안전난간|개구부|추락방지망/, '안전시설'],
    [/신호수|유도원|차량유도|장비유도/, '신호수'],
    [/양중|크레인|호이스트|지게차|인양|장비|굴착기|백호/, '장비'],
    [/직영/, '직영'],
    [/용역|보통인부|일반인부|잡역/, '용역'],
    [/관리/, '관리'],
    [/전기|분전반|배선|케이블|감전/, '전기'],
    [/설비|배관|덕트|위생|소방/, '배관'],
    [/굴착|토공|터파기|성토/, '굴착'],
    [/철골|용접|산소절단|그라인더/, '철골'],
];

const matchPriorityTradeRule = (text: string): string | null => {
    const clean = text.trim();
    if (!clean) return null;
    for (const [pattern, target] of FRAME_TRADE_PRIORITY_RULES) {
        if (pattern.test(clean)) return target;
    }
    return null;
};

export const standardizeAccidentJobField = (value: unknown, fallbackContext = ''): string => {
    const raw = normalizeText(value);
    const compact = raw.replace(/\s+/g, '');

    if (raw && !GENERIC_JOB_PLACEHOLDERS.has(compact.toLowerCase())) {
        const directAlias = PSI_WORKER_JOB_FIELD_ALIASES[compact] || PSI_WORKER_JOB_FIELD_ALIASES[raw];
        if (directAlias) return directAlias;

        if (ACCIDENT_JOB_FIELD_OPTIONS.includes(raw)) return raw;

        const rawRuleMatch = matchPriorityTradeRule(raw);
        if (rawRuleMatch) return rawRuleMatch;

        // 사용자가 명시한 커스텀 공종(예: PC조립, 창호 등)은 억지로 덮어쓰지 않고 보존한다.
        return raw;
    }

    // 공종 칸이 비었거나 '골조공사/기타/미분류'처럼 대공종일 때만 작업내용·개요 문맥으로 세부 공종을 추정한다.
    const contextMatch = matchPriorityTradeRule(fallbackContext);
    if (contextMatch) return contextMatch;

    const base = normalizeJobField(raw);
    if (base && base !== '미분류') return base;

    return '기타';
};

const GENERIC_HAZARD_PLACEHOLDERS = new Set(['', '기타', '미분류', '미상', '맞음', '물체에맞음', '일반']);

const HAZARD_KEYWORD_RULES: Array<[RegExp, string]> = [
    [/추락|떨어짐|실족|고소|개구부|사다리/, '추락'],
    [/비래|파편|튕김|날아온|비산/, '비래'],
    [/낙하|떨어진|낙하물|맞음/, '낙하'],
    [/붕괴|무너짐|무너|좌굴|도괴/, '붕괴'],
    [/전도|넘어짐|미끄러짐|걸려|쓰러짐|기울어/, '전도(넘어짐)'],
    [/끼임|협착|물림|말림|회전체/, '끼임(협착)'],
    [/깔림|매몰|압사/, '깔림(매몰)'],
    [/충돌|부딪힘|접촉|후진|장비\s*충돌/, '충돌(부딪힘)'],
    [/찔림|못|관통|철근\s*끝/, '찔림'],
    [/베임|절단|절삭|날카|칼날/, '베임(절단)'],
    [/감전|전기|누전|합선|아크/, '감전'],
    [/폭발|파열|가스\s*폭발/, '폭발'],
    [/화재|불티|화상|인화|착화/, '화재'],
    [/질식|유독|밀폐|산소결핍|일산화탄소/, '질식'],
    [/온열|폭염|열사병|탈수|열탈진|한랭/, '온열질환'],
    [/근골격|무리한\s*동작|요통|허리\s*삐|염좌|과도한\s*힘/, '근골격계(무리한 동작)'],
];

export const standardizeAccidentHazardType = (value: unknown, fallbackContext = ''): string => {
    const raw = normalizeText(value);
    const compact = raw.replace(/\s+/g, '');
    const contextText = normalizeText(fallbackContext).toLowerCase();

    if ((HAZARD_LABELS as readonly string[]).includes(raw)) return raw;

    // 과거 묶음 분류('붕괴·전도', '낙하·비래', '화재·폭발', '베임·찔림')는 문맥을 보고 개별 재해유형으로 정확히 분리한다.
    if (/^붕괴\s*[·ㆍ/|]\s*전도$/.test(compact)) {
        return /붕괴|무너|좌굴|도괴|흙막이|토사\s*무너|동바리\s*무너|거푸집\s*무너/.test(contextText)
            ? '붕괴'
            : '전도(넘어짐)';
    }
    if (/^낙하\s*[·ㆍ/|]\s*비래$/.test(compact)) {
        return /비래|파편|튕김|날아|비산|그라인더|절단석/.test(contextText) ? '비래' : '낙하';
    }
    if (/^화재\s*[·ㆍ/|]\s*폭발$/.test(compact)) {
        return /폭발|파열|가스\s*폭발|인화성\s*증기/.test(contextText) ? '폭발' : '화재';
    }
    if (/^베임\s*[·ㆍ/|]\s*찔림$/.test(compact)) {
        return /찔림|못|철근\s*끝|관통|결속선/.test(contextText) ? '찔림' : '베임(절단)';
    }

    const rawLower = raw.toLowerCase();
    if (raw && !GENERIC_HAZARD_PLACEHOLDERS.has(compact.toLowerCase())) {
        for (const [pattern, label] of HAZARD_KEYWORD_RULES) {
            if (pattern.test(rawLower)) return label;
        }
        // 사용자가 직접 입력한 세부 재해유형은 '기타'로 뭉개지 않고 보존한다.
        return raw;
    }

    const combined = `${rawLower} ${contextText}`.trim();
    for (const [pattern, label] of HAZARD_KEYWORD_RULES) {
        if (pattern.test(combined)) return label;
    }

    return '기타';
};

export const computeAccidentFingerprint = (
    input: Pick<AccidentBigDataRecord, 'occurredDate' | 'siteName' | 'jobField' | 'hazardType' | 'summary'>,
): string => {
    const parts = [
        normalizeAccidentDate(input.occurredDate),
        normalizeText(input.siteName).toLowerCase().replace(/\s+/g, ''),
        normalizeText(input.jobField).toLowerCase().replace(/\s+/g, ''),
        normalizeText(input.hazardType).toLowerCase().replace(/\s+/g, ''),
        normalizeText(input.summary).slice(0, 28).toLowerCase().replace(/\s+/g, ''),
    ];
    return parts.join('::');
};

const toStringList = (value: unknown): string[] => {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeText(item)).filter(Boolean);
    }
    const raw = normalizeText(value);
    if (!raw) return [];
    return raw
        .split(/[,;|/\n]+/)
        .map((item) => item.trim())
        .filter(Boolean);
};

const PII_PATTERNS: Array<{ label: string; regex: RegExp; replacement: string }> = [
    { label: '주민등록번호', regex: /\b\d{6}[-\s]?[1-4]\d{6}\b/g, replacement: '[주민번호 비식별]' },
    { label: '휴대전화번호', regex: /\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g, replacement: '[연락처 비식별]' },
    { label: '일반전화번호', regex: /\b0(?:2|\d{2})[-\s]?\d{3,4}[-\s]?\d{4}\b/g, replacement: '[연락처 비식별]' },
    { label: '이메일 주소', regex: /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, replacement: '[이메일 비식별]' },
    {
        label: '실명 표기',
        regex: /(재해자|근로자|작업자|성명|이름|피해자|목격자)\s*[:：]\s*([가-힣A-Za-z]{2,12})/g,
        replacement: '$1: [비식별]',
    },
];

export const detectAccidentPiiMatches = (record: AccidentBigDataRecord): string[] => {
    const joined = [
        record.sourceContractor,
        record.siteName,
        record.workTask,
        record.summary,
        record.directCause,
        record.rootCause,
        record.preventionMeasure,
        ...record.preWorkCheckpoints,
    ].join('\n');

    const detected: string[] = [];
    for (const rule of PII_PATTERNS) {
        const clone = new RegExp(rule.regex.source, rule.regex.flags);
        if (clone.test(joined)) {
            detected.push(rule.label);
        }
    }
    return detected;
};

const maskTextPii = (value: string): string => {
    let next = String(value || '');
    for (const rule of PII_PATTERNS) {
        const clone = new RegExp(rule.regex.source, rule.regex.flags);
        next = next.replace(clone, rule.replacement);
    }
    return next;
};

export const maskAccidentRecordPii = (record: AccidentBigDataRecord): AccidentBigDataRecord => ({
    ...record,
    sourceContractor: maskTextPii(record.sourceContractor),
    siteName: maskTextPii(record.siteName),
    workTask: maskTextPii(record.workTask),
    summary: maskTextPii(record.summary),
    directCause: maskTextPii(record.directCause),
    rootCause: maskTextPii(record.rootCause),
    preventionMeasure: maskTextPii(record.preventionMeasure),
    preWorkCheckpoints: record.preWorkCheckpoints.map(maskTextPii),
    piiMasked: true,
});

export const buildAccidentConversionPrompt = (options: {
    provider: AccidentPromptProvider;
    contractorHint?: string;
    siteHint?: string;
    outputFormat: AccidentPromptFormat;
    batchMode?: boolean;
    multiSiteMode?: boolean;
}): string => {
    const providerName = options.provider === 'chatgpt' ? 'ChatGPT' : 'Gemini';
    const contractorNote = normalizeText(options.contractorHint);
    const siteNote = normalizeText(options.siteHint);
    const isMultiSite = options.multiSiteMode ?? options.batchMode !== false;
    const stdJobs = ACCIDENT_JOB_FIELD_OPTIONS.join(', ');
    const stdStages = ACCIDENT_WORK_STAGE_OPTIONS.join(', ');
    const stdHazards = HAZARD_LABELS.join(', ');

    const lines = [
        `[${providerName} 전용 · 원도급사 사고보고서 NEW-PSI 표준 변환 지시문]`,
        '첨부한 건설현장 사고보고서(또는 아차사고 보고서) PDF·문서의 양식·건수·현장 수와 무관하게 내용을 정확히 읽고,',
        '아래 NEW-PSI 빅데이터 DB 스키마에 맞춰 1건 또는 여러 건(JSON 배열 / CSV 여러 행)으로 구조화해 반환하세요.',
        '',
        '[필수 준수 규칙]',
        '1. 개인정보 자동 비식별화: 재해자·목격자·담당자의 성명, 생년월일, 전화번호, 주민번호, 이메일은 절대 그대로 쓰지 말고 [비식별]로 치환하세요.',
        `2. 공종(소속 팀/직종 jobField) vs 작업공정(단계 workStage) 분리 원칙: 공종 → [${stdJobs}], 작업공정 → [${stdStages}]`,
        '   - jobField(공종)는 재해자의 소속 팀/직종입니다. 알폼팀이 알폼을 해체하거나 형틀팀이 거푸집을 해체·정리한 경우 jobField를 "해체정리"로 바꾸지 말고 소속 공종(알폼·형틀·시스템·갱폼)을 그대로 유지하세요.',
        '   - 작업 단계·행동은 반드시 별도 workStage(작업공정) 항목에 "해체·탈형" 또는 "정리·반출" 등으로 분리해 기록하세요.',
        '   - 보고서의 공종·직종·소속팀 항목에 "해체정리/해체반/정리반/해체공"으로 명시되었거나, 특정 전문팀이 아닌 별도 해체전담팀 작업일 때만 jobField를 "해체정리"로 분류하세요.',
        '   - "갱폼", "알폼", "시스템", "콘크리트비계", "바닥미장", "할석미장견출"은 "형틀"로 뭉개지 말고 세부 공종명 그대로 기록하며, 원도급사 문서에 "골조공사/철근콘크리트공사"처럼 대공종만 적혀 있으면 본문의 자재·장비·팀 명칭으로 세부 공종을 판별하세요.',
        `3. 재해유형(hazardType) 개별 표준화 (묶음 금지): 다음 개별 목록 중 가장 정확한 1개로 분류하세요 → [${stdHazards}]`,
        '   - 성격과 위험 양상이 다른 "붕괴"와 "전도(넘어짐)", "낙하"와 "비래", "화재"와 "폭발", "베임(절단)"과 "찔림"을 절대 하나로 묶지 마세요.',
        '   - 바닥 미끄러짐·걸려 넘어짐·자재/갱폼 쓰러짐은 "전도(넘어짐)", 가설구조물·동바리·흙막이·구조체 파괴만 "붕괴"로 구분하세요.',
        '4. 심각도(severity) 5단계 구분 — 반드시 다음 5개 중 1개만 정확히 선택하세요:',
        '   · 아차사고: 부상 없음·위험 징후·미수',
        '   · 경미(응급·외래): 현장 응급처치·휴업 3일 미만 단순 타박/찰과상',
        '   · 휴업재해(3일↑): 휴업 3일 이상~4주 미만 산재보고(봉합·염좌·단순골절 통원 등)',
        '   · 중상(장기·입원): 4주(28일) 이상 장기요양·입원·수술',
        '   · 중대재해: 사망 또는 법정 중대산업재해',
        '5. 시간대(timeSlot) 표준화: 다음 6개 중 1개만 사용하세요 → [오전 작업전, 오전, 점심 직후, 오후, 야간, 미상]',
        '6. 보고서에 명시되지 않은 사실은 절대 추측하지 말고, 확인 불가 항목만 "미상" 또는 빈 배열로 남기세요.',
    ];

    if (isMultiSite) {
        lines.push(
            '7. 다건·다수 현장 일괄 변환 원칙:',
            '   - 첨부 파일이 여러 개이거나 1개 파일 안에 여러 현장의 보고서가 섞여 있으면 절대 합치지 말고, 각 사고 건마다 독립 객체(JSON) 또는 독립 행(CSV)으로 출력하세요.',
            '   - 각 사고의 siteName(현장명)과 sourceContractor(원도급사명)는 반드시 해당 보고서 본문에 적힌 값 그대로 개별 기입하세요 (이전 보고서 현장명으로 덮어쓰기 금지).',
        );
        if (contractorNote) lines.push(`8. 원도급사 미기재 건에만 적용할 기본값: ${contractorNote}`);
        if (siteNote) lines.push(`9. 현장명 미기재 건에만 적용할 기본값: ${siteNote}`);
    } else {
        if (contractorNote) lines.push(`7. 기본 원도급사명(문서에 다르면 문서 우선): ${contractorNote}`);
        if (siteNote) lines.push(`8. 기본 현장명(문서에 다르면 문서 우선): ${siteNote}`);
    }

    lines.push('');

    if (options.outputFormat === 'csv') {
        lines.push(
            '[출력 형식 — CSV 코드블록 1개만 출력]',
            '설명 문장 없이 아래 헤더 순서를 정확히 지켜 CSV 코드블록으로만 출력하세요.',
            'occurredDate,timeSlot,sourceContractor,siteName,jobField,workStage,workTask,hazardType,severity,causingAgent,summary,directCause,rootCause,preventionMeasure,preWorkCheckpoints,educationKeywords',
            '- 날짜는 YYYY-MM-DD 형식, 복수 항목(preWorkCheckpoints/educationKeywords)은 세미콜론(;)으로 구분하세요.',
        );
    } else {
        lines.push(
            '[출력 형식 — JSON 코드블록 1개만 출력]',
            options.batchMode !== false
                ? '설명 문장 없이 반드시 JSON 배열(`[ ... ]`) 코드블록 1개만 출력하세요.'
                : '설명 문장 없이 반드시 JSON 코드블록 1개만 출력하세요.',
            '```json',
            '[',
            '  {',
            '    "occurredDate": "YYYY-MM-DD",',
            '    "timeSlot": "오전 작업전 | 오전 | 점심 직후 | 오후 | 야간 | 미상",',
            `    "sourceContractor": "${contractorNote || '원도급사명 (예: OO건설)'}",`,
            `    "siteName": "${siteNote || '현장명 (비식별 가능)'}",`,
            '    "jobField": "소속 공종 1개 (알폼·형틀·갱폼·시스템·해체정리 등)",',
            '    "workStage": "설치·조립 | 해체·탈형 | 정리·반출 | 양중·인양 | 타설·양생 | 가공·절단 | 점검·보수 | 이동·운반 | 미상",',
            '    "workTask": "사고 당시 세부 작업내용",',
            '    "hazardType": "개별 재해유형 1개 (붕괴·전도 등 묶음 금지)",',
            '    "severity": "아차사고 | 경미(응급·외래) | 휴업재해(3일↑) | 중상(장기·입원) | 중대재해",',
            '    "causingAgent": "기인물 또는 가해 장비·자재 (예: 이동식 비계, 앵글그라인더)",',
            '    "summary": "사고 발생 경위 핵심 요약 2~3문장 (실명 제외)",',
            '    "directCause": "직접원인 (불안전 상태 및 불안전 행동)",',
            '    "rootCause": "근본·관리적 원인 (작업계획·유도원·체결 확인 누락 등)",',
            '    "preventionMeasure": "핵심 재발방지대책 (공학적·관리적·보호구 조치)",',
            '    "preWorkCheckpoints": ["작업 전 필수 점검 1", "작업 전 필수 점검 2"],',
            '    "educationKeywords": ["핵심 교육 키워드 1", "핵심 교육 키워드 2"],',
            `    "sourceAiProvider": "${options.provider}"`,
            '  }',
            ']',
            '```',
        );
    }

    return lines.join('\n');
};

const pickAlias = (obj: Record<string, unknown>, keys: string[]): unknown => {
    for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '') {
            return obj[key];
        }
    }
    return undefined;
};

const normalizeRawRecord = (
    raw: Record<string, unknown>,
    index: number,
    defaultProvider: AccidentSourceProvider = 'gemini',
): { record: AccidentBigDataRecord; notes: string[] } => {
    const notes: string[] = [];

    const rawDate = pickAlias(raw, ['occurredDate', 'date', 'accidentDate', '발생일자', '발생일', '사고일자', '날짜']);
    const occurredDate = normalizeAccidentDate(rawDate);
    if (rawDate && normalizeText(rawDate) !== occurredDate) {
        notes.push(`날짜 표준화 (${normalizeText(rawDate)} → ${occurredDate})`);
    }

    const rawContractor = normalizeText(pickAlias(raw, ['sourceContractor', 'contractor', '원도급사', '원청', '시공사'])) || '원도급사 미기재';
    const rawSite = normalizeText(pickAlias(raw, ['siteName', 'site', '현장명', '현장'])) || '현장 미지정';
    const rawWorkTask = normalizeText(pickAlias(raw, ['workTask', 'task', '작업내용', '세부작업', '공정'])) || '작업내용 확인 필요';
    const rawSummary = normalizeText(pickAlias(raw, ['summary', 'description', '사고개요', '사고경위', '경위', '내용'])) || '';

    const rawJob = pickAlias(raw, ['jobField', 'trade', '공종', '직종']);
    const jobField = standardizeAccidentJobField(rawJob, `${rawWorkTask} ${rawSummary}`);
    if (rawJob && normalizeText(rawJob) !== jobField) {
        notes.push(`공종 표준화 (${normalizeText(rawJob)} → ${jobField})`);
    } else if (!rawJob && jobField !== '기타') {
        notes.push(`작업내용 기반 공종 자동추정 (→ ${jobField})`);
    }

    const rawHazard = pickAlias(raw, ['hazardType', 'riskType', '재해유형', '위험유형', '사고유형', '재해형태']);
    const hazardType = standardizeAccidentHazardType(rawHazard, `${rawSummary} ${rawWorkTask}`);
    if (rawHazard && normalizeText(rawHazard) !== hazardType) {
        notes.push(`재해유형 표준화 (${normalizeText(rawHazard)} → ${hazardType})`);
    } else if (!rawHazard && hazardType !== '기타') {
        notes.push(`개요 기반 재해유형 자동추정 (→ ${hazardType})`);
    }

    const rawSeverity = pickAlias(raw, ['severity', 'grade', '심각도', '사고등급', '피해정도', '재해정도']);
    const severity = normalizeAccidentSeverity(rawSeverity);
    const timeSlot = normalizeAccidentTimeSlot(pickAlias(raw, ['timeSlot', 'time', '시간대', '발생시간']));
    const rawWorkStage = pickAlias(raw, ['workStage', 'processStage', 'workProcess', '작업공정', '작업단계', '공정단계', '공정']);
    const workStage = normalizeAccidentWorkStage(rawWorkStage, `${rawWorkTask} ${rawSummary}`);
    const causingAgent = normalizeText(pickAlias(raw, ['causingAgent', 'agent', '기인물', '가해물', '장비명'])) || '미상';
    const directCause = normalizeText(pickAlias(raw, ['directCause', '직접원인', '직접적원인'])) || '직접원인 보완 필요';
    const rootCause = normalizeText(pickAlias(raw, ['rootCause', '관리적원인', '근본원인', '간접원인'])) || '근본·관리적 원인 보완 필요';
    const preventionMeasure = normalizeText(pickAlias(raw, ['preventionMeasure', 'countermeasure', 'measure', '재발방지대책', '안전대책', '개선대책'])) || '재발방지대책 보완 필요';
    const preWorkCheckpoints = toStringList(pickAlias(raw, ['preWorkCheckpoints', 'checkpoints', '작업전확인사항', '작업전점검']));
    const educationKeywords = toStringList(pickAlias(raw, ['educationKeywords', 'keywords', '교육키워드', '핵심키워드']));
    const rawProvider = normalizeText(pickAlias(raw, ['sourceAiProvider', 'provider', '변환출처'])).toLowerCase();
    const sourceAiProvider: AccidentSourceProvider = VALID_PROVIDERS.has(rawProvider as AccidentSourceProvider)
        ? (rawProvider as AccidentSourceProvider)
        : defaultProvider;
    const sourceFormatNote = normalizeText(pickAlias(raw, ['sourceFormatNote', '원본양식', '출처비고'])) || '외부 AI 표준 변환';

    const summary = rawSummary || `${rawWorkTask} 중 ${hazardType} 사고 발생`;

    const baseRecord: AccidentBigDataRecord = {
        id: normalizeText(raw.id) || `acc-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
        sourceContractor: rawContractor,
        siteName: rawSite,
        occurredDate,
        timeSlot,
        jobField,
        workStage,
        workTask: rawWorkTask,
        hazardType,
        severity,
        causingAgent,
        summary,
        directCause,
        rootCause,
        preventionMeasure,
        preWorkCheckpoints: preWorkCheckpoints.length > 0 ? preWorkCheckpoints : [preventionMeasure].filter(Boolean),
        educationKeywords: educationKeywords.length > 0 ? educationKeywords : [jobField, hazardType].filter(Boolean),
        sourceAiProvider,
        sourceFormatNote,
        piiMasked: false,
        importedAt: new Date().toISOString(),
        fingerprint: '',
    };

    baseRecord.fingerprint = computeAccidentFingerprint(baseRecord);
    const piiMatches = detectAccidentPiiMatches(baseRecord);
    baseRecord.piiMasked = piiMatches.length === 0;

    return { record: baseRecord, notes };
};

const extractTopLevelJsonSegments = (input: string): string[] => {
    const segments: string[] = [];
    let inString = false;
    let escaped = false;
    let depth = 0;
    let startIdx = -1;

    for (let i = 0; i < input.length; i += 1) {
        const ch = input[i];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
            continue;
        }

        if (ch === '{' || ch === '[') {
            if (depth === 0) startIdx = i;
            depth += 1;
        } else if ((ch === '}' || ch === ']') && depth > 0) {
            depth -= 1;
            if (depth === 0 && startIdx >= 0) {
                segments.push(input.slice(startIdx, i + 1));
                startIdx = -1;
            }
        }
    }

    return segments;
};

const extractObjectsFromParsedJson = (parsed: unknown): Record<string, unknown>[] => {
    let rawList: unknown[] | null = null;
    if (Array.isArray(parsed)) {
        rawList = parsed;
    } else if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        const nested = obj.records || obj.accidents || obj.items || obj.data;
        rawList = Array.isArray(nested) ? nested : [obj];
    }
    if (!rawList) return [];
    return rawList.filter(
        (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    );
};

const parseDelimitedLine = (line: string, delimiter: ',' | '\t'): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === delimiter && !inQuotes) {
            cells.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    cells.push(current.trim());
    return cells;
};

const parseSingleDelimitedBlock = (block: string): Record<string, unknown>[] | null => {
    const body = block.replace(/^\uFEFF/, '').trim();
    const lines = body
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (lines.length < 2) return null;

    const headerLine = lines[0];
    const delimiter: ',' | '\t' | null = headerLine.includes('\t')
        ? '\t'
        : headerLine.includes(',')
            ? ','
            : null;
    if (!delimiter) return null;

    const headers = parseDelimitedLine(headerLine, delimiter);
    if (headers.length < 3) return null;

    const rows: Record<string, unknown>[] = [];
    for (let i = 1; i < lines.length; i += 1) {
        const values = parseDelimitedLine(lines[i], delimiter);
        if (values.every((v) => !v)) continue;
        // 여러 CSV 파일을 단순 합쳤을 때 중간에 반복된 헤더 행은 자동 건너뛴다.
        if (values.length === headers.length && values.every((v, colIdx) => v === headers[colIdx])) {
            continue;
        }
        const row: Record<string, unknown> = {};
        headers.forEach((header, colIdx) => {
            row[header] = values[colIdx] ?? '';
        });
        rows.push(row);
    }

    return rows.length > 0 ? rows : null;
};

const tryParseAllDelimitedBlocks = (input: string): { rows: Record<string, unknown>[]; blocksParsed: number } | null => {
    const fencedMatches = Array.from(input.matchAll(/```(?:csv|tsv)?\s*([\s\S]*?)```/gi))
        .map((m) => m[1]?.trim() || '')
        .filter(Boolean);

    if (fencedMatches.length > 0) {
        const merged: Record<string, unknown>[] = [];
        let blocksParsed = 0;
        for (const block of fencedMatches) {
            const rows = parseSingleDelimitedBlock(block);
            if (rows && rows.length > 0) {
                merged.push(...rows);
                blocksParsed += 1;
            }
        }
        if (merged.length > 0) return { rows: merged, blocksParsed };
    }

    const plainRows = parseSingleDelimitedBlock(input);
    return plainRows ? { rows: plainRows, blocksParsed: 1 } : null;
};

export const parseExternalAiAccidentPayload = (
    rawInput: string,
    options?: { defaultProvider?: AccidentSourceProvider },
): AccidentParseResult => {
    const defaultProvider = options?.defaultProvider || 'gemini';
    const text = String(rawInput || '').replace(/^\uFEFF/, '').trim();
    if (!text) {
        return {
            ok: false,
            formatDetected: 'unknown',
            candidates: [],
            warnings: [],
            error: '붙여넣은 변환 내용이나 업로드한 파일 내용이 비어 있습니다.',
            blocksParsed: 0,
        };
    }

    const fencedBlocks = Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi))
        .map((m) => m[1]?.trim() || '')
        .filter(Boolean);

    const jsonSources = fencedBlocks.length > 0
        ? fencedBlocks
        : extractTopLevelJsonSegments(text);

    const collectedJsonObjects: Record<string, unknown>[] = [];
    let jsonBlocksParsed = 0;

    for (const source of jsonSources) {
        try {
            const parsed: unknown = JSON.parse(source);
            const objs = extractObjectsFromParsedJson(parsed);
            if (objs.length > 0) {
                collectedJsonObjects.push(...objs);
                jsonBlocksParsed += 1;
            }
        } catch {
            // Try top-level segments inside fenced block or next source
            if (fencedBlocks.length > 0) {
                for (const inner of extractTopLevelJsonSegments(source)) {
                    try {
                        const parsedInner: unknown = JSON.parse(inner);
                        const objsInner = extractObjectsFromParsedJson(parsedInner);
                        if (objsInner.length > 0) {
                            collectedJsonObjects.push(...objsInner);
                            jsonBlocksParsed += 1;
                        }
                    } catch {
                        // Ignore malformed segment
                    }
                }
            }
        }
    }

    if (collectedJsonObjects.length > 0) {
        const normalized = collectedJsonObjects.map((obj, idx) =>
            normalizeRawRecord(obj, idx, defaultProvider),
        );
        return {
            ok: true,
            formatDetected: 'json',
            candidates: normalized.map((item) => item.record),
            warnings: normalized.flatMap((item) => item.notes).slice(0, 12),
            error: '',
            blocksParsed: jsonBlocksParsed,
        };
    }

    const csvResult = tryParseAllDelimitedBlocks(text);
    if (csvResult && csvResult.rows.length > 0) {
        const normalized = csvResult.rows.map((row, idx) =>
            normalizeRawRecord(row, idx, defaultProvider === 'gemini' || defaultProvider === 'chatgpt' ? defaultProvider : 'csv'),
        );
        return {
            ok: true,
            formatDetected: 'csv',
            candidates: normalized.map((item) => item.record),
            warnings: normalized.flatMap((item) => item.notes).slice(0, 12),
            error: '',
            blocksParsed: csvResult.blocksParsed,
        };
    }

    return {
        ok: false,
        formatDetected: 'unknown',
        candidates: [],
        warnings: [],
        error: 'JSON 또는 CSV 구조를 찾지 못했습니다. 위 [전용 변환 지시문 복사]로 Gemini·ChatGPT가 출력한 결과 블록 전체를 붙여넣어 주세요.',
        blocksParsed: 0,
    };
};

export const parseMultipleAccidentFiles = (
    files: readonly AccidentBatchFileInput[],
    options?: { defaultProvider?: AccidentSourceProvider },
): {
    candidates: AccidentBigDataRecord[];
    fileReports: AccidentBatchFileReport[];
    okCount: number;
    failedCount: number;
    warnings: string[];
} => {
    const candidates: AccidentBigDataRecord[] = [];
    const fileReports: AccidentBatchFileReport[] = [];
    const warnings: string[] = [];
    let okCount = 0;
    let failedCount = 0;

    files.forEach((file, fileIdx) => {
        const parsed = parseExternalAiAccidentPayload(file.content, options);
        if (parsed.ok) {
            okCount += 1;
            const stamped = parsed.candidates.map((item, recIdx) => ({
                ...item,
                id: `acc-${Date.now()}-${fileIdx}-${recIdx}-${Math.random().toString(36).slice(2, 5)}`,
                sourceFormatNote: item.sourceFormatNote === '외부 AI 표준 변환'
                    ? file.fileName
                    : `${item.sourceFormatNote} (${file.fileName})`,
            }));
            candidates.push(...stamped);
            warnings.push(...parsed.warnings);
            fileReports.push({
                fileName: file.fileName,
                ok: true,
                count: stamped.length,
                formatDetected: parsed.formatDetected,
                error: '',
            });
        } else {
            failedCount += 1;
            fileReports.push({
                fileName: file.fileName,
                ok: false,
                count: 0,
                formatDetected: parsed.formatDetected,
                error: parsed.error,
            });
        }
    });

    return {
        candidates,
        fileReports,
        okCount,
        failedCount,
        warnings: warnings.slice(0, 12),
    };
};

export const applyBulkSiteAndContractorToCandidates = (
    queue: readonly AccidentAuditCandidate[],
    existingRecords: readonly AccidentBigDataRecord[],
    patch: {
        siteName?: string;
        sourceContractor?: string;
        onlyWhenMissing?: boolean;
    },
): AccidentAuditCandidate[] => {
    const nextSite = normalizeText(patch.siteName);
    const nextContractor = normalizeText(patch.sourceContractor);
    if (!nextSite && !nextContractor) return [...queue];

    const existingFingerprints = new Set(existingRecords.map((item) => item.fingerprint));
    const seenInBatch = new Set<string>();

    const updatedRecords = queue.map((item) => {
        if (!item.selected) return item.record;
        const shouldApplySite = nextSite && (!patch.onlyWhenMissing || item.record.siteName === '현장 미지정' || !item.record.siteName.trim());
        const shouldApplyContractor = nextContractor && (!patch.onlyWhenMissing || item.record.sourceContractor === '원도급사 미기재' || !item.record.sourceContractor.trim());
        const updatedRecord: AccidentBigDataRecord = {
            ...item.record,
            siteName: shouldApplySite ? nextSite : item.record.siteName,
            sourceContractor: shouldApplyContractor ? nextContractor : item.record.sourceContractor,
        };
        updatedRecord.fingerprint = computeAccidentFingerprint(updatedRecord);
        return updatedRecord;
    });

    return queue.map((item, index) => {
        const updatedRecord = updatedRecords[index];
        const isExistingDup = existingFingerprints.has(updatedRecord.fingerprint);
        const isBatchDup = seenInBatch.has(updatedRecord.fingerprint);
        seenInBatch.add(updatedRecord.fingerprint);
        const isDuplicate = isExistingDup || isBatchDup;
        const duplicateReason = isExistingDup
            ? '이미 빅데이터 DB에 동일한 일자·현장·공종 사례가 존재합니다.'
            : isBatchDup
                ? '이번에 가져온 목록 안에 중복 항목이 있습니다.'
                : '';
        return {
            ...item,
            record: updatedRecord,
            isDuplicate,
            duplicateReason,
            completenessPct: computeCompletenessPct(updatedRecord),
        };
    });
};

const computeCompletenessPct = (record: AccidentBigDataRecord): number => {
    const checks = [
        Boolean(record.occurredDate),
        record.sourceContractor !== '원도급사 미기재',
        record.jobField !== '기타',
        record.hazardType !== '기타',
        record.causingAgent !== '미상',
        record.summary.length >= 10,
        !record.directCause.includes('보완 필요'),
        !record.rootCause.includes('보완 필요'),
        !record.preventionMeasure.includes('보완 필요'),
        record.preWorkCheckpoints.length > 0,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};

const FORMWORK_TRADES_FOR_DISMANTLE_HINT = new Set(['형틀', '알폼', '갱폼', '시스템']);

export const computeCandidateTradeReviewHint = (record: AccidentBigDataRecord): string => {
    const workStage = record.workStage || normalizeAccidentWorkStage('', `${record.workTask} ${record.summary}`);
    if (
        FORMWORK_TRADES_FOR_DISMANTLE_HINT.has(record.jobField)
        && (workStage === '해체·탈형' || workStage === '정리·반출')
    ) {
        return `${record.jobField} 팀의 ${workStage} 작업으로 분류됨 · 별도 해체정리 전담반 사고라면 공종을 '해체정리'로 변경하세요.`;
    }
    return '';
};

export const auditAccidentImportCandidates = (
    candidates: readonly AccidentBigDataRecord[],
    existingRecords: readonly AccidentBigDataRecord[],
): AccidentAuditCandidate[] => {
    const existingFingerprints = new Set(existingRecords.map((item) => item.fingerprint));
    const seenInBatch = new Set<string>();

    return candidates.map((record, index) => {
        const normalizationNotes: string[] = [];
        const piiFindings = detectAccidentPiiMatches(record);
        const fingerprint = record.fingerprint || computeAccidentFingerprint(record);
        const isExistingDup = existingFingerprints.has(fingerprint);
        const isBatchDup = seenInBatch.has(fingerprint);
        seenInBatch.add(fingerprint);

        const isDuplicate = isExistingDup || isBatchDup;
        const duplicateReason = isExistingDup
            ? '이미 빅데이터 DB에 동일한 일자·현장·공종 사례가 존재합니다.'
            : isBatchDup
                ? '이번에 가져온 목록 안에 중복 항목이 있습니다.'
                : '';

        const hydratedRecord: AccidentBigDataRecord = {
            ...record,
            workStage: normalizeAccidentWorkStage(record.workStage, `${record.workTask} ${record.summary}`),
            fingerprint,
            piiMasked: piiFindings.length === 0,
        };

        return {
            candidateId: `cand-${index}-${record.id}`,
            record: hydratedRecord,
            selected: !isDuplicate,
            normalizationNotes,
            piiFindings,
            tradeReviewHint: computeCandidateTradeReviewHint(hydratedRecord),
            isDuplicate,
            duplicateReason,
            completenessPct: computeCompletenessPct(hydratedRecord),
        };
    });
};

const isSevereTier = (severity: AccidentSeverity): boolean =>
    Boolean(ACCIDENT_SEVERITY_META[severity]?.isSevere);

const isReportableTier = (severity: AccidentSeverity): boolean =>
    Boolean(ACCIDENT_SEVERITY_META[severity]?.isReportable);

const TIME_SLOT_ORDER: ReadonlyArray<Exclude<AccidentTimeSlot, '미상'>> = [
    '오전 작업전',
    '오전',
    '점심 직후',
    '오후',
    '야간',
];

export const computeAccidentBigDataAnalytics = (
    records: readonly AccidentBigDataRecord[],
    workerRecords: readonly WorkerRecord[] = [],
): AccidentBigDataAnalytics => {
    const totalCount = records.length;
    const severeCount = records.filter((r) => isSevereTier(r.severity)).length;
    const reportableCount = records.filter((r) => isReportableTier(r.severity)).length;
    const nearMissCount = records.filter((r) => r.severity === '아차사고').length;
    const severeRatePct = totalCount > 0 ? Math.round((severeCount / totalCount) * 100) : 0;
    const reportableRatePct = totalCount > 0 ? Math.round((reportableCount / totalCount) * 100) : 0;
    const contractorCount = new Set(
        records.map((r) => r.sourceContractor.trim()).filter(Boolean),
    ).size;
    const siteCount = new Set(
        records.map((r) => r.siteName.trim()).filter(Boolean),
    ).size;

    const toBuckets = (getKey: (r: AccidentBigDataRecord) => string): AccidentDistributionBucket[] => {
        const map = new Map<string, { count: number; severeCount: number }>();
        for (const r of records) {
            const key = getKey(r) || '기타';
            const prev = map.get(key) || { count: 0, severeCount: 0 };
            prev.count += 1;
            if (isSevereTier(r.severity)) prev.severeCount += 1;
            map.set(key, prev);
        }
        return Array.from(map.entries())
            .map(([label, stats]) => ({
                label,
                count: stats.count,
                severeCount: stats.severeCount,
                sharePct: totalCount > 0 ? Math.round((stats.count / totalCount) * 100) : 0,
            }))
            .sort((a, b) => b.count - a.count || b.severeCount - a.severeCount);
    };

    const hazardDistribution = toBuckets((r) => r.hazardType);
    const jobFieldDistribution = toBuckets((r) => r.jobField);

    const siteMap = new Map<string, AccidentBigDataRecord[]>();
    for (const r of records) {
        const key = normalizeText(r.siteName) || '현장 미지정';
        const list = siteMap.get(key) || [];
        list.push(r);
        siteMap.set(key, list);
    }
    const siteDistribution: AccidentSiteComparisonBucket[] = Array.from(siteMap.entries())
        .map(([siteName, list]) => {
            const count = list.length;
            const reportableCountForSite = list.filter((r) => isReportableTier(r.severity)).length;
            const severeCountForSite = list.filter((r) => isSevereTier(r.severity)).length;
            const nearMissCountForSite = list.filter((r) => r.severity === '아차사고').length;
            const contractorFreq = new Map<string, number>();
            const jobFreq = new Map<string, number>();
            const hazardFreq = new Map<string, number>();
            for (const item of list) {
                const c = normalizeText(item.sourceContractor) || '원도급사 미기재';
                contractorFreq.set(c, (contractorFreq.get(c) || 0) + 1);
                jobFreq.set(item.jobField, (jobFreq.get(item.jobField) || 0) + 1);
                hazardFreq.set(item.hazardType, (hazardFreq.get(item.hazardType) || 0) + 1);
            }
            const topContractor = Array.from(contractorFreq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '원도급사 미기재';
            const topJobField = Array.from(jobFreq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '기타';
            const topHazard = Array.from(hazardFreq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '기타';
            return {
                siteName,
                contractor: topContractor,
                count,
                reportableCount: reportableCountForSite,
                severeCount: severeCountForSite,
                nearMissCount: nearMissCountForSite,
                sharePct: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0,
                topJobField,
                topHazard,
            };
        })
        .sort((a, b) => b.severeCount - a.severeCount || b.count - a.count);

    const severityPyramid: AccidentSeverityTierMetric[] = [...ACCIDENT_SEVERITY_LEVELS]
        .reverse()
        .map((severity) => {
            const count = records.filter((r) => r.severity === severity).length;
            const meta = ACCIDENT_SEVERITY_META[severity];
            return {
                severity,
                shortLabel: meta.shortLabel,
                criteria: meta.criteria,
                color: meta.color,
                count,
                sharePct: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0,
            };
        });

    const slotCounts = TIME_SLOT_ORDER.map((slot) => {
        const matching = records.filter((r) => r.timeSlot === slot);
        return {
            slot,
            count: matching.length,
            severeCount: matching.filter((r) => isSevereTier(r.severity)).length,
        };
    });
    const peakSlotCount = Math.max(0, ...slotCounts.map((s) => s.count));
    const timeSlotDistribution: AccidentTimeSlotPoint[] = slotCounts.map((item) => ({
        slot: item.slot,
        count: item.count,
        severeCount: item.severeCount,
        sharePct: totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0,
        isPeak: peakSlotCount > 0 && item.count === peakSlotCount,
    }));

    const matrixTrades = jobFieldDistribution.slice(0, 5).map((item) => item.label);
    const matrixHazards = hazardDistribution.slice(0, 5).map((item) => item.label);
    const matrixCounts = matrixTrades.flatMap((trade) =>
        matrixHazards.map((hazard) => {
            const matched = records.filter((r) => r.jobField === trade && r.hazardType === hazard);
            return {
                trade,
                hazard,
                count: matched.length,
                severeCount: matched.filter((r) => isSevereTier(r.severity)).length,
            };
        }),
    );
    const maxCellCount = Math.max(1, ...matrixCounts.map((c) => c.count));
    const riskMatrix: AccidentRiskMatrix = {
        trades: matrixTrades,
        hazards: matrixHazards,
        cells: matrixCounts.map((cell) => {
            const ratio = cell.count / maxCellCount;
            const intensity: 0 | 1 | 2 | 3 = cell.count === 0
                ? 0
                : ratio >= 0.7 || cell.severeCount > 0
                    ? 3
                    : ratio >= 0.4
                        ? 2
                        : 1;
            return { ...cell, intensity };
        }),
    };

    const toTopList = (getKey: (r: AccidentBigDataRecord) => string) => {
        const map = new Map<string, number>();
        for (const r of records) {
            const key = normalizeText(getKey(r));
            if (!key || key === '미상' || key.includes('보완 필요')) continue;
            map.set(key, (map.get(key) || 0) + 1);
        }
        return Array.from(map.entries())
            .map(([label, count]) => ({
                label,
                count,
                sharePct: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
    };

    const monthMap = new Map<string, AccidentMonthlyPoint>();
    for (const r of records) {
        const month = normalizeAccidentDate(r.occurredDate).slice(0, 7);
        const entry = monthMap.get(month) || { month, total: 0, severe: 0, nearMiss: 0 };
        entry.total += 1;
        if (isSevereTier(r.severity)) entry.severe += 1;
        if (r.severity === '아차사고') entry.nearMiss += 1;
        monthMap.set(month, entry);
    }
    const monthlyTrend = Array.from(monthMap.values())
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-8);

    // NEW-PSI 근로자 위험성평가 기록과 공종 단위 교차 경보 생성
    const workerByJob = new Map<string, { totalScore: number; count: number; beginnerCount: number }>();
    for (const w of workerRecords) {
        const stdJob = standardizeAccidentJobField(w.jobField);
        const prev = workerByJob.get(stdJob) || { totalScore: 0, count: 0, beginnerCount: 0 };
        prev.totalScore += Number(w.safetyScore) || 0;
        prev.count += 1;
        if (w.safetyLevel === '초급' || Number(w.safetyScore) < 70) prev.beginnerCount += 1;
        workerByJob.set(stdJob, prev);
    }

    const crossLinkAlerts: AccidentCrossLinkAlert[] = jobFieldDistribution
        .map((jobBucket) => {
            const matchingAccidents = records.filter((r) => r.jobField === jobBucket.label);
            const workerStats = workerByJob.get(jobBucket.label);
            const avgSafetyScore = workerStats && workerStats.count > 0
                ? Math.round(workerStats.totalScore / workerStats.count)
                : null;
            const beginnerCount = workerStats?.beginnerCount || 0;
            const hazardCount = new Map<string, number>();
            const checkpointSet = new Set<string>();
            for (const acc of matchingAccidents) {
                hazardCount.set(acc.hazardType, (hazardCount.get(acc.hazardType) || 0) + 1);
                acc.preWorkCheckpoints.forEach((cp) => {
                    if (cp.trim()) checkpointSet.add(cp.trim());
                });
            }
            const topHazard = Array.from(hazardCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '추락';
            const reasonSummary = workerStats
                ? `${jobBucket.label} 공종 누적 사고 ${jobBucket.count}건 · 현재 현장 평가 평균 ${avgSafetyScore}점(초급·주의 ${beginnerCount}명)`
                : `${jobBucket.label} 공종 누적 사고 ${jobBucket.count}건(장기·중대 ${jobBucket.severeCount}건) — 작업 전 선행 점검 필요`;

            return {
                jobField: jobBucket.label,
                accidentCount: jobBucket.count,
                severeCount: jobBucket.severeCount,
                workerCount: workerStats?.count || 0,
                avgSafetyScore,
                beginnerCount,
                topHazard,
                checkpoints: Array.from(checkpointSet).slice(0, 3),
                reasonSummary,
            };
        })
        .sort((a, b) => {
            const aRiskWeight = a.severeCount * 3 + a.beginnerCount * 2 + a.accidentCount;
            const bRiskWeight = b.severeCount * 3 + b.beginnerCount * 2 + b.accidentCount;
            return bRiskWeight - aRiskWeight;
        })
        .slice(0, 4);

    return {
        totalCount,
        severeCount,
        severeRatePct,
        reportableCount,
        reportableRatePct,
        nearMissCount,
        contractorCount,
        siteCount,
        topJobField: jobFieldDistribution[0] || null,
        topHazardType: hazardDistribution[0] || null,
        hazardDistribution,
        jobFieldDistribution,
        siteDistribution,
        severityPyramid,
        timeSlotDistribution,
        riskMatrix,
        rootCauseTop5: toTopList((r) => r.rootCause),
        causingAgentTop5: toTopList((r) => r.causingAgent),
        monthlyTrend,
        crossLinkAlerts,
    };
};

export const readAccidentBigDataStore = (
    readStorage?: () => string | null,
): AccidentStoreReadResult => {
    try {
        const reader = readStorage || (() => (
            typeof window !== 'undefined' && window.localStorage
                ? window.localStorage.getItem(ACCIDENT_BIGDATA_STORAGE_KEY)
                : null
        ));
        const raw = reader();
        if (raw === null || raw === '') {
            return { items: [], safe: true, warning: '' };
        }
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item !== 'object' || Array.isArray(item) || typeof (item as { id?: unknown }).id !== 'string')) {
            return {
                items: [],
                safe: false,
                warning: '기존 사고 빅데이터 저장 형식이 손상되어 원본 보존을 위해 자동 덮어쓰기를 중단했습니다.',
            };
        }
        // 기존 '경상'/'중상', 묶음 재해유형('붕괴·전도' 등), 누락된 작업공정(workStage)을 무손실 자동 세분화·보강한다.
        const migrated = (parsed as AccidentBigDataRecord[]).map((item) => ({
            ...item,
            severity: normalizeAccidentSeverity(item.severity),
            hazardType: standardizeAccidentHazardType(
                item.hazardType,
                `${item.workTask || ''} ${item.summary || ''} ${item.causingAgent || ''}`,
            ),
            workStage: normalizeAccidentWorkStage(item.workStage, `${item.workTask || ''} ${item.summary || ''}`),
        }));
        return { items: migrated, safe: true, warning: '' };
    } catch {
        return {
            items: [],
            safe: false,
            warning: '사고 빅데이터를 읽지 못했습니다. 기존 데이터 보호를 위해 덮어쓰기를 차단했습니다.',
        };
    }
};

export const persistAccidentBigDataStore = (
    items: readonly AccidentBigDataRecord[],
    writeStorage?: (text: string) => void,
): { ok: boolean; warning: string } => {
    try {
        const payload = JSON.stringify(items);
        if (writeStorage) {
            writeStorage(payload);
        } else if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(ACCIDENT_BIGDATA_STORAGE_KEY, payload);
            window.dispatchEvent(new CustomEvent(ACCIDENT_BIGDATA_UPDATED_EVENT));
        }
        return { ok: true, warning: '' };
    } catch {
        return {
            ok: false,
            warning: '브라우저 저장공간 부족 또는 접근 제한으로 사고 빅데이터 저장에 실패했습니다.',
        };
    }
};

export const exportAccidentRecordsToJson = (records: readonly AccidentBigDataRecord[]): string =>
    `${JSON.stringify(records, null, 2)}\n`;

const escapeCsvCell = (value: unknown): string => {
    const str = String(value ?? '');
    return `"${str.replaceAll('"', '""')}"`;
};

export const exportAccidentRecordsToCsv = (records: readonly AccidentBigDataRecord[]): string => {
    const headers = [
        '발생일자',
        '시간대',
        '원도급사',
        '현장명',
        '표준공종',
        '작업공정',
        '세부작업내용',
        '재해유형',
        '심각도',
        '기인물',
        '사고개요',
        '직접원인',
        '근본원인',
        '재발방지대책',
        '작업전확인사항',
        '교육키워드',
        'AI출처',
    ];
    const rows = records.map((r) => [
        r.occurredDate,
        r.timeSlot,
        r.sourceContractor,
        r.siteName,
        r.jobField,
        r.workStage || '미상',
        r.workTask,
        r.hazardType,
        r.severity,
        r.causingAgent,
        r.summary,
        r.directCause,
        r.rootCause,
        r.preventionMeasure,
        r.preWorkCheckpoints.join('; '),
        r.educationKeywords.join('; '),
        r.sourceAiProvider,
    ]);
    return `\uFEFF${[headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n')}\n`;
};

export const updateAccidentRecordInList = (
    records: readonly AccidentBigDataRecord[],
    updated: AccidentBigDataRecord,
): AccidentBigDataRecord[] => {
    const cleaned: AccidentBigDataRecord = {
        ...updated,
        sourceContractor: normalizeText(updated.sourceContractor) || '원도급사 미기재',
        siteName: normalizeText(updated.siteName) || '현장 미지정',
        occurredDate: normalizeAccidentDate(updated.occurredDate),
        timeSlot: normalizeAccidentTimeSlot(updated.timeSlot),
        jobField: standardizeAccidentJobField(updated.jobField, updated.workTask),
        workStage: normalizeAccidentWorkStage(updated.workStage, `${updated.workTask} ${updated.summary}`),
        workTask: normalizeText(updated.workTask) || '작업내용 확인 필요',
        hazardType: standardizeAccidentHazardType(updated.hazardType, updated.summary),
        severity: normalizeAccidentSeverity(updated.severity),
        causingAgent: normalizeText(updated.causingAgent) || '미상',
        summary: normalizeText(updated.summary) || '사고 개요 확인 필요',
        directCause: normalizeText(updated.directCause) || '직접원인 보완 필요',
        rootCause: normalizeText(updated.rootCause) || '근본·관리적 원인 보완 필요',
        preventionMeasure: normalizeText(updated.preventionMeasure) || '재발방지대책 보완 필요',
        preWorkCheckpoints: updated.preWorkCheckpoints.map((item) => normalizeText(item)).filter(Boolean),
        educationKeywords: updated.educationKeywords.map((item) => normalizeText(item)).filter(Boolean),
        fingerprint: '',
        piiMasked: false,
    };
    cleaned.fingerprint = computeAccidentFingerprint(cleaned);
    cleaned.piiMasked = detectAccidentPiiMatches(cleaned).length === 0;

    return records.map((item) => (item.id === cleaned.id ? cleaned : item));
};

export const getSampleAccidentBigDataRecords = (): AccidentBigDataRecord[] => {
    const rawSamples: Record<string, unknown>[] = [
        {
            occurredDate: '2026-06-14',
            timeSlot: '오전',
            sourceContractor: '한강종합건설(예시)',
            siteName: '수도권 3공구 공동주택',
            jobField: '시스템',
            workTask: '외부 시스템비계 4단 작업발판 볼트 체결',
            hazardType: '추락',
            severity: '중상(장기·입원)',
            causingAgent: '안전대 미체결 · 작업발판 단부',
            summary: '비계 상부 작업발판 이동 중 안전대 고리를 보조로프에 걸지 않은 상태에서 발이 헛디뎌 하부로 추락(4주 이상 입원 치료)한 사례.',
            directCause: '단부 안전난간 일부 미설치 구간에서 안전대 미체결 작업',
            rootCause: '작업 전 고소작업 구간 선행 난간 확인 및 감시인 배치 누락',
            preventionMeasure: '선행 안전난간 설치 완료 후 작업허가, 2줄걸이 안전대 체결 사진 확인',
            preWorkCheckpoints: ['2m 이상 구간 2줄걸이 안전대 상시 체결', '비계 발판 고정핀 전수 확인'],
            educationKeywords: ['고소작업', '안전대 체결', '선행난간'],
            sourceAiProvider: 'gemini',
            sourceFormatNote: '체험 예시(원도급사 A 양식)',
        },
        {
            occurredDate: '2026-07-08',
            timeSlot: '오후',
            sourceContractor: '태백엔지니어링(예시)',
            siteName: '판교 R&D 센터 신축',
            jobField: '해체정리',
            workTask: '2층 슬래브 알폼 해체 및 자재 하역',
            hazardType: '낙하',
            severity: '휴업재해(3일↑)',
            causingAgent: '알폼 패널 낙하',
            summary: '상부에서 알폼 고정핀을 해체하던 중 패널이 하부로 떨어지며 작업자 정강이에 맞아 2주 통원 휴업 치료가 발생한 사례.',
            directCause: '상하 동시작업 구역 하부 출입통제선 미설치',
            rootCause: '해체 순서(1개씩 지지 후 인계) 미준수 및 상하 교신 누락',
            preventionMeasure: '해체 직하부 반경 5m 통제선 및 신호수 배치 후 단계별 해체 실시',
            preWorkCheckpoints: ['상하 동시작업 금지 및 하부 통제선 설치', '알폼 해체 시 1인 단독 일괄 탈락 금지'],
            educationKeywords: ['상하동시작업', '통제선', '낙하방지'],
            sourceAiProvider: 'chatgpt',
            sourceFormatNote: '체험 예시(원도급사 B 양식)',
        },
        {
            occurredDate: '2026-08-19',
            timeSlot: '오후',
            sourceContractor: '한강종합건설(예시)',
            siteName: '수도권 3공구 공동주택',
            jobField: '철근',
            workTask: '타워크레인 철근 다발 인양 후 하역',
            hazardType: '끼임(협착)',
            severity: '경미(응급·외래)',
            causingAgent: '철근 다발과 거푸집 사이',
            summary: '인양 중인 철근 다발을 손으로 직접 잡아 위치를 맞추다 벽체 거푸집 사이에 손가락이 스쳐 현장 응급처치 후 당일 복귀한 경미 사례.',
            directCause: '중량물 인양 시 유도봉(태그라인) 미사용 및 손으로 직접 접촉',
            rootCause: '신호수 단독 유도 원칙 미준수 및 협착 위험구간 진입',
            preventionMeasure: '철근 양중 시 반드시 2m 이상 유도봉 사용, 착지 완료 전 손 접촉 엄금',
            preWorkCheckpoints: ['유도봉(태그라인) 지참 확인', '착지 지점 2m 이내 출입 통제'],
            educationKeywords: ['유도봉', '양중협착', '신호수'],
            sourceAiProvider: 'gemini',
            sourceFormatNote: '체험 예시(원도급사 A 양식)',
        },
        {
            occurredDate: '2026-09-11',
            timeSlot: '점심 직후',
            sourceContractor: '동해건설산업(예시)',
            siteName: '충청 물류터미널 2차',
            jobField: '전기',
            workTask: '지하층 임시 분전반 펌프 배선 점검',
            hazardType: '감전',
            severity: '아차사고',
            causingAgent: '피복 손상 이동식 전선',
            summary: '물기가 고인 지하 바닥을 통과하는 임시 케이블 피복이 까진 채 가동 중이던 것을 작업 전 점검에서 사전 발견해 차단한 아차사고.',
            directCause: '바닥 고인 물 위 전선 직접 포설 및 외피 손상',
            rootCause: '임시전선 공중 가설 기준 및 절연 저항 일일 점검 누락',
            preventionMeasure: '전선 절연 거치대 공중 가설 및 누전차단기(30mA/0.03초) 작동 시험',
            preWorkCheckpoints: ['임시 케이블 공중 가설 상태 점검', '누전차단기 테스트 버튼 정상 작동'],
            educationKeywords: ['절연', '공중가설', '누전차단기'],
            sourceAiProvider: 'chatgpt',
            sourceFormatNote: '체험 예시(원도급사 C 양식)',
        },
        {
            occurredDate: '2026-10-03',
            timeSlot: '오전 작업전',
            sourceContractor: '태백엔지니어링(예시)',
            siteName: '판교 R&D 센터 신축',
            jobField: '굴착',
            workTask: '우수관로 되메우기 구간 백호 후진 작업',
            hazardType: '충돌(부딪힘)',
            severity: '중대재해',
            causingAgent: '굴착기 후방 사각지대',
            summary: '장비 후방에서 측량 보조를 하던 작업자를 운전원이 사각지대로 인지하지 못해 충돌 직전 비상정지된 중대 아차·위험 사례.',
            directCause: '굴착기 작업반경 내 근로자 진입 및 유도원 미배치',
            rootCause: '후방감지 경보기 오작동 미조치 및 신호수 전담 배치 생략',
            preventionMeasure: '굴착기 작업반경 출입금지 라인 설치, 전담 신호수 상시 무전 교신',
            preWorkCheckpoints: ['전담 신호수 배치 및 무전기 채널 통일', '장비 작업반경 출입금지 표시'],
            educationKeywords: ['사각지대', '신호수', '작업반경'],
            sourceAiProvider: 'gemini',
            sourceFormatNote: '체험 예시(원도급사 B 양식)',
        },
        {
            occurredDate: '2026-11-12',
            timeSlot: '오후',
            sourceContractor: '한강종합건설(예시)',
            siteName: '인천 항만 배후부지',
            jobField: '시스템',
            workTask: '가설 통로 계단 발판 및 안전망 보수',
            hazardType: '추락',
            severity: '아차사고',
            causingAgent: '고정 클램프 풀림',
            summary: '이동 중 가설 계단 단부 클램프 볼트가 느슨해져 발판이 흔들린 것을 확인하고 즉시 작업중지 및 재체결 조치한 사례.',
            directCause: '반복 통행 구간의 볼트 풀림 정기 체결 점검 누락',
            rootCause: '주간 가설물 합동점검 체크리스트 항목 누락',
            preventionMeasure: '가설 계단·난간 연결 클램프 주 1회 토크 확인 및 풀림 방지 마킹',
            preWorkCheckpoints: ['클램프 체결 마킹 확인', '흔들림 발견 시 즉시 작업중지'],
            educationKeywords: ['가설통로', '클램프 점검', '작업중지'],
            sourceAiProvider: 'chatgpt',
            sourceFormatNote: '체험 예시(원도급사 A 양식)',
        },
    ];

    return rawSamples.map((sample, idx) => normalizeRawRecord(sample, idx).record);
};

export const getMultiSiteBatchSampleText = (): string => [
    '```json',
    JSON.stringify(
        [
            {
                occurredDate: '2026-10-18',
                timeSlot: '오후',
                sourceContractor: '한강종합건설',
                siteName: '수도권 3공구 공동주택',
                jobField: '알폼',
                workStage: '해체·탈형',
                workTask: '3층 알폼 패널 해체·탈형 작업 중 단부 자재 낙하',
                hazardType: '낙하',
                severity: '휴업재해(3일↑)',
                causingAgent: '알폼 패널 1매',
                summary: '알폼 팀 작업자가 3층 알폼 패널 해체 작업 중 미고정 패널이 하부 통로로 낙하해 지상 작업자의 어깨 타박(휴업 5일). 재해자 김반장(010-2211-8899) 병원 이송.',
                directCause: '상하부 동시 작업 통제 미흡 및 해체 패널 임시 적치 위치 부적정',
                rootCause: '알폼 해체 구간 하부 출입금지 라바콘 및 감시원 배치 누락',
                preventionMeasure: '알폼 해체 구역 상하부 동시작업 엄금, 해체 패널 가적치 전 결속 확인',
                preWorkCheckpoints: ['알폼 해체 구간 하부 출입금지 확인', '해체 패널 임시 적치 결속 상태 확인'],
                educationKeywords: ['알폼', '해체탈형', '상하동시작업금지'],
                sourceAiProvider: 'chatgpt',
            },
            {
                occurredDate: '2026-10-24',
                timeSlot: '오전',
                sourceContractor: '태백엔지니어링',
                siteName: '판교 R&D 센터 신축',
                jobField: '해체정리',
                workStage: '정리·반출',
                workTask: '해체정리반 5층 슬래브 자재 정리 및 반출 중 손가락 끼임',
                hazardType: '협착',
                severity: '경미(응급·외래)',
                causingAgent: '적치 패널 모서리',
                summary: '해체정리 전담반이 해체 완료된 자재를 파렛트에 정리·반출하던 중 동료 작업자와 신호 불일치로 패널 틈새에 우측 손가락 끼임(현장 응급처치 후 외래 1회).',
                directCause: '자재 적치 시 2인 1조 구호 일치 미흡',
                rootCause: '해체물 운반 정리 공정 피로 누적 및 장갑 착용 상태 불량',
                preventionMeasure: '해체물 정리·반출 전 손 위치 확인 구호 의무화, 충격보호 장갑 지급',
                preWorkCheckpoints: ['자재 정리 반출 구간 작업 구호 통일', '충격방지 안전장갑 착용'],
                educationKeywords: ['해체정리', '정리반출', '협착방지'],
                sourceAiProvider: 'gemini',
            },
        ],
        null,
        2,
    ),
    '```',
    '',
    '```json',
    JSON.stringify(
        [
            {
                occurredDate: '2026-11-04',
                timeSlot: '점심 직후',
                sourceContractor: '청룡건설',
                siteName: '부산 에코 델타시티 5BL',
                jobField: '시스템',
                workStage: '점검·보수',
                workTask: '외부 시스템비계 6단 띠장 볼트 해체 전 가새 점검',
                hazardType: '추락',
                severity: '아차사고',
                causingAgent: '미체결 가새핀',
                summary: '점심 직후 시스템비계 승강 중 가새핀 1개소가 풀린 것을 선점검 단계에서 발견해 즉시 작업중지 후 재체결한 아차사고.',
                directCause: '오전 작업 종료 전 가새핀 록킹 상태 확인 누락',
                rootCause: '점심 직후 재개 전 가설구조물 재확인 절차 생략',
                preventionMeasure: '오후 작업 재개 전 작업 전 안전점검 시 가새·클램프 풀림 여부 일제 점검',
                preWorkCheckpoints: ['오후 작업 전 가새핀·클램프 록킹 확인', '안전대 2줄걸이 상시 체결'],
                educationKeywords: ['시스템비계', '오후재개점검', '가새핀'],
                sourceAiProvider: 'gemini',
            },
            {
                occurredDate: '2026-11-09',
                timeSlot: '오전 작업전',
                sourceContractor: '한강종합건설',
                siteName: '수도권 3공구 공동주택',
                jobField: '갱폼',
                workStage: '양중·인양',
                workTask: '104동 12층 갱폼 인양 전 앵커볼트 풀림 및 크레인 인양 준비',
                hazardType: '전도',
                severity: '중상(장기·입원)',
                causingAgent: '갱폼 인양 앵커볼트',
                summary: '갱폼 인양 직전 앵커볼트 2개소 조기 해체 상태에서 풍하중으로 갱폼이 미세 기울어져 작업발판에 충돌(4주 이상 입원 치료).',
                directCause: '크레인 인양고리 완전 긴장 전 하부 고정 앵커볼트 선해체',
                rootCause: '갱폼 인양 작업순서 준수 확인 및 전담 신호수 무전 교신 누락',
                preventionMeasure: '크레인 훅 인장력 확보 확인 후 순차 앵커볼트 해체, 2중 안전로프 결속',
                preWorkCheckpoints: ['크레인 훅 긴장 전 앵커볼트 해체 금지', '갱폼 인양 전담 신호수 배치'],
                educationKeywords: ['갱폼', '앵커볼트선해체금지', '인양안전'],
                sourceAiProvider: 'chatgpt',
            },
        ],
        null,
        2,
    ),
    '```',
].join('\n');

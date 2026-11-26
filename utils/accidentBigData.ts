import {
    PSI_RISK_TYPE_CATALOG,
    PSI_STANDARD_JOB_FIELDS,
    PSI_WORKER_JOB_FIELDS,
    PSI_WORKER_JOB_FIELD_ALIASES,
} from '../config/psiFormMaster';
import type {
    AccidentBigDataRecord,
    AccidentSeverity,
    AccidentSourceProvider,
    AccidentTimeSlot,
    WorkerRecord,
} from '../types';
import { normalizeJobField } from './workerIdentity';

export const ACCIDENT_BIGDATA_STORAGE_KEY = 'psi_accident_bigdata_v1';
export const ACCIDENT_BIGDATA_UPDATED_EVENT = 'psi-accident-bigdata-updated';

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

export interface AccidentBigDataAnalytics {
    totalCount: number;
    severeCount: number;
    severeRatePct: number;
    nearMissCount: number;
    contractorCount: number;
    topJobField: AccidentDistributionBucket | null;
    topHazardType: AccidentDistributionBucket | null;
    hazardDistribution: AccidentDistributionBucket[];
    jobFieldDistribution: AccidentDistributionBucket[];
    rootCauseTop5: Array<{ label: string; count: number; sharePct: number }>;
    causingAgentTop5: Array<{ label: string; count: number; sharePct: number }>;
    monthlyTrend: AccidentMonthlyPoint[];
    crossLinkAlerts: AccidentCrossLinkAlert[];
}

const VALID_SEVERITIES: ReadonlySet<AccidentSeverity> = new Set([
    '아차사고',
    '경상',
    '중상',
    '중대재해',
]);

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

const HAZARD_LABELS = PSI_RISK_TYPE_CATALOG.map((item) => item.label);

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
    if (/중대|사망|절단|전신|의식불명|3개월/.test(raw)) return '중대재해';
    if (/중상|골절|입원|요양|28일|휴업/.test(raw)) return '중상';
    if (/아차|무재해|경미|미수|부상\s*없|피해\s*없/.test(raw)) return '아차사고';
    if (/경상|찰과|타박|치료|외래|통원|1~7일/.test(raw)) return '경상';
    return '경상';
};

const GENERIC_JOB_PLACEHOLDERS = new Set([
    '',
    '기타',
    '미분류',
    '일반',
    '일반공종',
    '일반 공종',
    '미상',
]);

const FRAME_TRADE_PRIORITY_RULES: Array<[RegExp, string]> = [
    [/해체\s*정리|해체|탈형|정리\s*반출|철거/, '해체정리'],
    [/갱폼|gang\s*form/i, '갱폼'],
    [/알폼|al\s*form|알루미늄\s*거푸집/i, '알폼'],
    [/시스템\s*동바리|시스템\s*비계|시스템/, '시스템'],
    [/콘크리트\s*비계|타설|콘크리트|펌프카|레미콘/, '콘크리트비계'],
    [/바닥\s*미장|휘니셔|방통/, '바닥미장'],
    [/할석|견출|치핑|미장/, '할석미장견출'],
    [/철근|배근|가공철근/, '철근'],
    [/형틀|거푸집|유로폼|데크폼|목공|목수/, '형틀'],
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

    if (raw) {
        const directAlias = PSI_WORKER_JOB_FIELD_ALIASES[compact] || PSI_WORKER_JOB_FIELD_ALIASES[raw];
        if (directAlias) return directAlias;

        if (ACCIDENT_JOB_FIELD_OPTIONS.includes(raw)) return raw;

        const rawRuleMatch = matchPriorityTradeRule(raw);
        if (rawRuleMatch) return rawRuleMatch;

        // 사용자가 명시한 커스텀 공종(예: PC조립, 창호 등)은 억지로 형틀/기타로 덮어쓰지 않고 보존한다.
        if (!GENERIC_JOB_PLACEHOLDERS.has(compact.toLowerCase())) {
            return raw;
        }
    }

    // 공종 칸이 비었거나 '기타/미분류'일 때만 작업내용·개요 문맥으로 골조특화 공종을 추정한다.
    const contextMatch = matchPriorityTradeRule(fallbackContext);
    if (contextMatch) return contextMatch;

    const base = normalizeJobField(raw);
    if (base && base !== '미분류') return base;

    return '기타';
};

export const standardizeAccidentHazardType = (value: unknown, fallbackContext = ''): string => {
    const raw = normalizeText(value);
    if ((HAZARD_LABELS as readonly string[]).includes(raw)) return raw;

    const search = `${raw} ${fallbackContext}`.toLowerCase();
    const extraHazardRules: Array<[RegExp, string]> = [
        [/떨어짐|추락|실족|고소|개구부|사다리/, '추락'],
        [/맞음|낙하|비래|떨어진|날아온|자재|공구/, '낙하·비래'],
        [/끼임|협착|물림|말림|회전/, '끼임'],
        [/깔림|매몰|압사|무너짐/, '깔림'],
        [/붕괴|무너|전도|쓰러짐|넘어짐/, '붕괴·전도'],
        [/감전|전기|누전|합선|아크/, '감전'],
        [/화재|폭발|불티|화상|인화|가스폭발/, '화재·폭발'],
        [/베임|찔림|절단|절삭|못|날카/, '베임·찔림'],
        [/충돌|부딪힘|접촉|후진|차량|장비/, '충돌'],
        [/질식|유독|밀폐|산소결핍|일산화탄소/, '질식'],
        [/온열|폭염|열사병|탈수|열탈진/, '온열질환'],
    ];

    for (const [pattern, label] of extraHazardRules) {
        if (pattern.test(search)) return label;
    }

    for (const item of PSI_RISK_TYPE_CATALOG) {
        if (item.keywords.some((kw) => search.includes(kw))) {
            return item.label;
        }
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
}): string => {
    const providerName = options.provider === 'chatgpt' ? 'ChatGPT' : 'Gemini';
    const contractorNote = normalizeText(options.contractorHint);
    const siteNote = normalizeText(options.siteHint);
    const stdJobs = ACCIDENT_JOB_FIELD_OPTIONS.join(', ');
    const stdHazards = HAZARD_LABELS.join(', ');

    const lines = [
        `[${providerName} 전용 · 원도급사 사고보고서 NEW-PSI 표준 변환 지시문]`,
        '첨부한 건설현장 사고보고서(또는 아차사고 보고서) PDF·문서의 양식과 무관하게 내용을 정확히 읽고,',
        '아래 NEW-PSI 빅데이터 DB 스키마에 맞춰 1건(여러 건이 있으면 배열)으로 구조화해 반환하세요.',
        '',
        '[필수 준수 규칙]',
        '1. 개인정보 자동 비식별화: 재해자·목격자·담당자의 성명, 생년월일, 전화번호, 주민번호, 이메일은 절대 그대로 쓰지 말고 [비식별]로 치환하세요.',
        `2. 공종(jobField) 표준화 (골조특화 세부 공종 포함): 다음 목록 중 가장 정확한 1개로 분류하세요 → [${stdJobs}]`,
        '   - 골조특화 구분 원칙: 거푸집·알폼·동바리·유로폼 작업이라도 "설치·조립"은 형틀/알폼/시스템으로, "해체·탈형·정리·반출"은 반드시 "해체정리"로 분류하세요.',
        '   - "갱폼", "알폼", "시스템", "콘크리트비계", "바닥미장", "할석미장견출", "해체정리"는 "형틀"로 뭉개지 말고 세부 공종명 그대로 기록하세요.',
        `3. 재해유형(hazardType) 표준화: 다음 12대 분류 중 가장 정확한 1개로 분류하세요 → [${stdHazards}]`,
        '4. 심각도(severity) 표준화: 반드시 다음 4개 중 1개만 사용하세요 → [아차사고, 경상, 중상, 중대재해]',
        '5. 시간대(timeSlot) 표준화: 다음 6개 중 1개만 사용하세요 → [오전 작업전, 오전, 점심 직후, 오후, 야간, 미상]',
        '6. 보고서에 명시되지 않은 사실은 절대 추측하지 말고, 확인 불가 항목만 "미상" 또는 빈 배열로 남기세요.',
    ];

    if (contractorNote) lines.push(`7. 기본 원도급사명(문서에 다르면 문서 우선): ${contractorNote}`);
    if (siteNote) lines.push(`8. 기본 현장명(문서에 다르면 문서 우선): ${siteNote}`);

    lines.push('');

    if (options.outputFormat === 'csv') {
        lines.push(
            '[출력 형식 — CSV 코드블록 1개만 출력]',
            '설명 문장 없이 아래 헤더 순서를 정확히 지켜 CSV 코드블록으로만 출력하세요.',
            'occurredDate,timeSlot,sourceContractor,siteName,jobField,workTask,hazardType,severity,causingAgent,summary,directCause,rootCause,preventionMeasure,preWorkCheckpoints,educationKeywords',
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
            '    "jobField": "표준 공종 1개",',
            '    "workTask": "사고 당시 세부 작업내용",',
            '    "hazardType": "12대 재해유형 중 1개",',
            '    "severity": "아차사고 | 경상 | 중상 | 중대재해",',
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

const stripCodeFencesAndExtractJson = (input: string): string[] => {
    const candidates: string[] = [];
    const trimmed = input.replace(/^\uFEFF/, '').trim();
    if (!trimmed) return candidates;

    for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
        if (match[1]?.trim()) candidates.push(match[1].trim());
    }
    candidates.push(trimmed);

    const arrStart = trimmed.indexOf('[');
    const arrEnd = trimmed.lastIndexOf(']');
    if (arrStart >= 0 && arrEnd > arrStart) {
        candidates.push(trimmed.slice(arrStart, arrEnd + 1));
    }
    const objStart = trimmed.indexOf('{');
    const objEnd = trimmed.lastIndexOf('}');
    if (objStart >= 0 && objEnd > objStart) {
        candidates.push(trimmed.slice(objStart, objEnd + 1));
    }

    return candidates;
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

const tryParseDelimitedTable = (input: string): Record<string, unknown>[] | null => {
    const fencedMatch = input.match(/```(?:csv|tsv)?\s*([\s\S]*?)```/i);
    const body = (fencedMatch?.[1] || input).replace(/^\uFEFF/, '').trim();
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
        const row: Record<string, unknown> = {};
        headers.forEach((header, colIdx) => {
            row[header] = values[colIdx] ?? '';
        });
        rows.push(row);
    }

    return rows.length > 0 ? rows : null;
};

export const parseExternalAiAccidentPayload = (
    rawInput: string,
    options?: { defaultProvider?: AccidentSourceProvider },
): AccidentParseResult => {
    const defaultProvider = options?.defaultProvider || 'gemini';
    const text = String(rawInput || '').trim();
    if (!text) {
        return {
            ok: false,
            formatDetected: 'unknown',
            candidates: [],
            warnings: [],
            error: '붙여넣은 변환 내용이나 업로드한 파일 내용이 비어 있습니다.',
        };
    }

    const jsonCandidates = stripCodeFencesAndExtractJson(text);
    for (const candidate of jsonCandidates) {
        try {
            const parsed: unknown = JSON.parse(candidate);
            let rawList: unknown[] | null = null;

            if (Array.isArray(parsed)) {
                rawList = parsed;
            } else if (parsed && typeof parsed === 'object') {
                const obj = parsed as Record<string, unknown>;
                const nested = obj.records || obj.accidents || obj.items || obj.data;
                if (Array.isArray(nested)) {
                    rawList = nested;
                } else {
                    rawList = [obj];
                }
            }

            if (rawList && rawList.length > 0) {
                const validObjs = rawList.filter(
                    (item): item is Record<string, unknown> =>
                        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
                );
                if (validObjs.length === 0) continue;

                const normalized = validObjs.map((obj, idx) =>
                    normalizeRawRecord(obj, idx, defaultProvider),
                );
                return {
                    ok: true,
                    formatDetected: 'json',
                    candidates: normalized.map((item) => item.record),
                    warnings: normalized.flatMap((item) => item.notes).slice(0, 8),
                    error: '',
                };
            }
        } catch {
            // Try next JSON candidate or fall back to CSV parser.
        }
    }

    const csvRows = tryParseDelimitedTable(text);
    if (csvRows) {
        const normalized = csvRows.map((row, idx) =>
            normalizeRawRecord(row, idx, defaultProvider === 'gemini' || defaultProvider === 'chatgpt' ? defaultProvider : 'csv'),
        );
        return {
            ok: true,
            formatDetected: 'csv',
            candidates: normalized.map((item) => item.record),
            warnings: normalized.flatMap((item) => item.notes).slice(0, 8),
            error: '',
        };
    }

    return {
        ok: false,
        formatDetected: 'unknown',
        candidates: [],
        warnings: [],
        error: 'JSON 또는 CSV 구조를 찾지 못했습니다. 위 [전용 변환 지시문 복사]로 Gemini·ChatGPT가 출력한 결과 블록 전체를 붙여넣어 주세요.',
    };
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

        return {
            candidateId: `cand-${index}-${record.id}`,
            record: {
                ...record,
                fingerprint,
                piiMasked: piiFindings.length === 0,
            },
            selected: !isDuplicate,
            normalizationNotes,
            piiFindings,
            isDuplicate,
            duplicateReason,
            completenessPct: computeCompletenessPct(record),
        };
    });
};

export const computeAccidentBigDataAnalytics = (
    records: readonly AccidentBigDataRecord[],
    workerRecords: readonly WorkerRecord[] = [],
): AccidentBigDataAnalytics => {
    const totalCount = records.length;
    const severeCount = records.filter(
        (r) => r.severity === '중상' || r.severity === '중대재해',
    ).length;
    const nearMissCount = records.filter((r) => r.severity === '아차사고').length;
    const severeRatePct = totalCount > 0 ? Math.round((severeCount / totalCount) * 100) : 0;
    const contractorCount = new Set(
        records.map((r) => r.sourceContractor.trim()).filter(Boolean),
    ).size;

    const toBuckets = (getKey: (r: AccidentBigDataRecord) => string): AccidentDistributionBucket[] => {
        const map = new Map<string, { count: number; severeCount: number }>();
        for (const r of records) {
            const key = getKey(r) || '기타';
            const prev = map.get(key) || { count: 0, severeCount: 0 };
            prev.count += 1;
            if (r.severity === '중상' || r.severity === '중대재해') prev.severeCount += 1;
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
        if (r.severity === '중상' || r.severity === '중대재해') entry.severe += 1;
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
                : `${jobBucket.label} 공종 누적 사고 ${jobBucket.count}건(중대·중상 ${jobBucket.severeCount}건) — 작업 전 선행 점검 필요`;

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
        nearMissCount,
        contractorCount,
        topJobField: jobFieldDistribution[0] || null,
        topHazardType: hazardDistribution[0] || null,
        hazardDistribution,
        jobFieldDistribution,
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
        return { items: parsed as AccidentBigDataRecord[], safe: true, warning: '' };
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
            severity: '중상',
            causingAgent: '안전대 미체결 · 작업발판 단부',
            summary: '비계 상부 작업발판 이동 중 안전대 고리를 보조로프에 걸지 않은 상태에서 발이 헛디뎌 하부로 추락한 사례.',
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
            hazardType: '낙하·비래',
            severity: '중상',
            causingAgent: '알폼 패널 낙하',
            summary: '상부에서 알폼 고정핀을 일시에 해체하던 중 패널 1장이 하부 통행 구간으로 떨어져 하부 작업자가 맞을 뻔한 중대 위험 사례.',
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
            hazardType: '끼임',
            severity: '경상',
            causingAgent: '철근 다발과 거푸집 사이',
            summary: '인양 중인 철근 다발을 손으로 직접 잡아 위치를 맞추다 흔들리는 자재와 벽체 거푸집 사이에 손가락이 끼인 사례.',
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
            hazardType: '충돌',
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

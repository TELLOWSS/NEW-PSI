import type { WorkerRecord } from '../types';

export type TbmSourceKind = 'field-record' | 'document' | 'manual';

export interface TbmEvidenceSource {
    id: string;
    kind: TbmSourceKind;
    title: string;
    text: string;
    fileName?: string;
    createdAt: string;
}

export interface TbmRiskItem {
    id: string;
    risk: string;
    action: string;
    evidenceLabels: string[];
    score: number;
    owner: string;
    managerConfirmed: boolean;
}

export interface TbmAccidentCase {
    id: string;
    title: string;
    occurredAt: string;
    source: string;
    summary: string;
    siteRelevance: string;
    lesson: string;
}

export interface TbmVideoScene {
    id: string;
    seconds: number;
    title: string;
    narration: string;
    visualGuide: string;
}

export interface TbmEducationDraft {
    month: string;
    workType: string;
    title: string;
    coreMessage: string;
    opening: string;
    risks: TbmRiskItem[];
    videoScenes: TbmVideoScene[];
    accidentCases: TbmAccidentCase[];
    focusPoints: string[];
    notices: string[];
    checklist: string[];
    confirmationQuestions: string[];
    closingCommitment: string;
    sourceCount: number;
    generatedAt: string;
}

export const TBM_MONTHLY_PACKAGE_STORAGE_KEY = 'psi_tbm_monthly_education_package_v1';

const normalizeScopeValue = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

export const getTbmEducationScopeKey = (month: string, workType: string): string => {
    const normalizedMonth = normalizeScopeValue(month);
    const safeMonth = /^\d{4}-\d{2}$/.test(normalizedMonth) ? normalizedMonth : 'unknown-month';
    const safeWorkType = normalizeScopeValue(workType) || '전체 공종';
    return `${safeMonth}::${safeWorkType}`;
};

export interface TbmMonthlyPackagePayload {
    draft: TbmEducationDraft;
    sourceText: string;
    translatedTexts: Record<string, string>;
    translationNeedsRefresh?: boolean;
    savedAt: string;
    month: string;
    workType: string;
    title: string;
    scopeKey: string;
}

const ACTION_RULES: Array<{ risk: string; keywords: string[]; action: string }> = [
    { risk: '추락', keywords: ['추락', '고소', '사다리', '개구부'], action: '작업발판, 안전난간, 개구부 덮개와 안전대 체결 상태를 작업 전에 확인한다.' },
    { risk: '끼임', keywords: ['끼임', '협착', '회전체'], action: '가동부 방호장치와 비상정지 장치를 확인하고 정비 전 전원을 차단한다.' },
    { risk: '충돌', keywords: ['충돌', '중장비', '차량', '장비동선'], action: '장비 동선과 작업자 통로를 분리하고 유도자 신호에 따라 이동한다.' },
    { risk: '낙하·비래', keywords: ['낙하', '비래'], action: '상하 동시작업을 금지하고 공구 낙하방지와 출입통제 상태를 확인한다.' },
    { risk: '감전', keywords: ['감전', '전기', '누전'], action: '누전차단기, 접지, 피복 손상 여부를 확인하고 젖은 손으로 전기기구를 다루지 않는다.' },
    { risk: '화재', keywords: ['화재', '용접', '불티'], action: '가연물을 제거하고 소화기와 화재감시자를 배치한 뒤 작업한다.' },
    { risk: '보호구 미착용', keywords: ['보호구 미착용', '안전모 미착용', '미착용'], action: '작업에 맞는 보호구를 올바르게 착용하고 서로 착용 상태를 교차 확인한다.' },
];

const normalize = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

const HIGH_GRADE_SOURCE_PATTERN = /(상등급|위험\s*등급\s*상|위험수준\s*상|등급\s*[:：]?\s*상|High\s*Risk|high\s*priority)/i;
const HIGH_GRADE_SHARE_EVIDENCE_PATTERN = /(회의자료\s*상등급|문서\s*상등급|업로드\s*상등급|PPT\s*상등급|PDF\s*상등급|관리자\s*상등급\s*수동\s*확인)/i;
const HIGH_GRADE_SECTION_START_PATTERN = /(위험성평가\s*)?(상등급|상\s*등급)\s*(위험|공유|사항|항목|리스트)?|위험\s*등급\s*[:：]?\s*상|위험수준\s*[:：]?\s*상|High\s*Risk|high\s*priority/i;
const HIGH_GRADE_SECTION_END_PATTERN = /(현장\s*중점\s*관리|중점\s*관리\s*포인트|중점관리\s*포인트|공지\s*사항|이해\s*확인|행동\s*약속|교육\s*확인|작업\s*중지\s*약속|^4[.)]\s*|^5[.)]\s*)/i;
const HIGH_GRADE_EMPTY_PATTERN = /(상등급|위험\s*등급\s*상|위험수준\s*상).{0,24}(없음|없습니다|해당\s*없음|미해당|없다)/i;
const GENERIC_HIGH_GRADE_HEADING_PATTERN = /^(?:\d+[.)]\s*)?(?:위험성평가\s*)?(?:상등급|상\s*등급)\s*(?:위험|공유|사항|항목|리스트)?$/i;
const RISK_ROW_PATTERN = /^([\-•·*▶▷▪■□○●※]|\d+[.)]|TOP\s*\d+|위험\s*요인|위험요인|위험\s*항목|위험명|유해\s*위험\s*요인|유해위험요인)/i;
const NON_HIGH_GRADE_ROW_PATTERN = /(위험\s*등급|위험수준|등급)\s*[:：]?\s*(중등급|하등급|중|하|보통|낮음|Low|Medium)(?:\s|$|[),，、|/])/i;

export const isHighGradeRiskShareItem = (risk: TbmRiskItem): boolean => {
    const evidenceText = (risk.evidenceLabels || []).map(normalize).join(' ');
    return HIGH_GRADE_SHARE_EVIDENCE_PATTERN.test(evidenceText);
};

export const getHighGradeRiskShareItems = (risks: TbmRiskItem[] | undefined): TbmRiskItem[] => (
    Array.isArray(risks) ? risks.filter(isHighGradeRiskShareItem) : []
);

const getActionForRisk = (risk: string): string => {
    const normalized = normalize(risk);
    const matched = ACTION_RULES.find((rule) => rule.risk === normalized || rule.keywords.some((keyword) => normalized.includes(keyword)));
    return matched?.action || '작업 위치와 순서를 확인하고 제거, 차단, 보호구 순으로 안전조치를 정한 뒤 작업한다.';
};

const canonicalizeRisk = (value: string): string => {
    const normalized = normalize(value);
    return ACTION_RULES.find((rule) => rule.keywords.some((keyword) => normalized.includes(keyword)))?.risk || normalized;
};

const createSourceSegments = (text: string): string[] => {
    const headerAwareText = String(text || '')
        .replace(/\r/g, '\n')
        .replace(/\u000c/g, '\n')
        .replace(/(위험성평가\s*상등급|상등급\s*(?:위험|공유|사항|항목|리스트)|현장\s*중점\s*관리|중점\s*관리\s*포인트|중점관리\s*포인트|공지\s*사항)/g, '\n$1\n')
        .replace(/(\b[1-9][0-9]?[.)]\s*)/g, '\n$1')
        .replace(/(\bTOP\s*\d+\b)/gi, '\n$1');

    return headerAwareText
        .split(/[\n]+|[；;]+/)
        .map(normalize)
        .filter(Boolean);
};

const cleanRiskCandidate = (value: string): string => {
    const cleaned = normalize(value)
        .replace(/^[\-•·*▶▷▪■□○●※\s]+/, '')
        .replace(/^(?:TOP\s*)?\d+[.)]?\s*/i, '')
        .replace(/^(?:위험\s*요인|위험요인|위험\s*항목|위험명|유해\s*위험\s*요인|유해위험요인|상등급\s*항목|상등급\s*위험)\s*[:：]?\s*/i, '')
        .replace(/\s*(?:관리\s*대책|감소\s*대책|대책|조치|담당|비고|확인)\s*[:：].*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleaned || cleaned.length < 2) return '';
    if (/^(?:-+\s*)?(page|slide)\s*\d+\s*-*$/i.test(cleaned) || /^\d+\s*-+$/i.test(cleaned)) return '';
    if (GENERIC_HIGH_GRADE_HEADING_PATTERN.test(cleaned)) return '';
    if (/^(위험성평가|상등급|위험등급|위험수준|회의자료|다음달|다음 달)$/i.test(cleaned)) return '';
    if (HIGH_GRADE_EMPTY_PATTERN.test(cleaned)) return '';
    return cleaned.length > 42 ? cleaned.slice(0, 42).trim() : cleaned;
};

const collectRiskCandidatesFromSegment = (segment: string, allowSectionLine: boolean): string[] => {
    const candidates = new Set<string>();
    const normalizedSegment = normalize(segment);
    if (NON_HIGH_GRADE_ROW_PATTERN.test(normalizedSegment)) return [];

    ACTION_RULES.forEach((rule) => {
        const terms = [rule.risk, ...rule.keywords].map(normalize).filter(Boolean);
        if (terms.some((term) => normalizedSegment.includes(term))) {
            candidates.add(rule.risk);
        }
    });

    const fieldPatterns = [
        /(?:위험\s*요인|위험요인|위험\s*항목|위험명|유해\s*위험\s*요인|유해위험요인|상등급\s*항목|상등급\s*위험)\s*[:：]\s*([^|;\n]+)/gi,
        /(?:TOP\s*\d+)\s*[:：]?\s*([^|;\n]+)/gi,
    ];

    fieldPatterns.forEach((pattern) => {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(normalizedSegment)) !== null) {
            const candidate = cleanRiskCandidate(match[1] || '');
            if (candidate) candidates.add(canonicalizeRisk(candidate));
        }
    });

    if (allowSectionLine && candidates.size === 0) {
        const candidate = cleanRiskCandidate(normalizedSegment);
        if (candidate && RISK_ROW_PATTERN.test(normalizedSegment) && !HIGH_GRADE_SECTION_START_PATTERN.test(candidate) && !HIGH_GRADE_SECTION_END_PATTERN.test(candidate)) {
            candidates.add(canonicalizeRisk(candidate));
        }
    }

    return [...candidates];
};

const extractHighGradeRiskCandidatesFromText = (text: string): string[] => {
    const candidates = new Set<string>();
    const segments = createSourceSegments(text);
    let inHighGradeSection = false;

    segments.forEach((segment) => {
        if (inHighGradeSection && HIGH_GRADE_SECTION_END_PATTERN.test(segment)) {
            inHighGradeSection = false;
            return;
        }

        if (HIGH_GRADE_EMPTY_PATTERN.test(segment)) {
            inHighGradeSection = false;
            return;
        }

        const hasHighGradeMarker = HIGH_GRADE_SOURCE_PATTERN.test(segment);
        const isHighGradeStart = HIGH_GRADE_SECTION_START_PATTERN.test(segment);

        if (hasHighGradeMarker) {
            collectRiskCandidatesFromSegment(segment, false).forEach((risk) => candidates.add(risk));
        }

        if (isHighGradeStart) {
            inHighGradeSection = true;
            return;
        }

        if (inHighGradeSection) {
            collectRiskCandidatesFromSegment(segment, true).forEach((risk) => candidates.add(risk));
        }
    });

    return [...candidates];
};

const isMeetingRiskSource = (source: TbmEvidenceSource): boolean => source.kind !== 'field-record';

const collectFieldRecordFocusPoints = (records: WorkerRecord[]): string[] => {
    const focus = new Set<string>();
    records.forEach((record) => {
        (record.weakAreas || []).map(normalize).filter(Boolean).forEach((rawRisk) => {
            const risk = canonicalizeRisk(rawRisk);
            if (risk) focus.add(`${risk}: ${getActionForRisk(risk)}`);
        });
        [
            ...(record.suggestions || []),
            record.improvement,
            record.actionable_coaching,
        ].map(normalize).filter(Boolean).forEach((point) => focus.add(point));
    });
    return [...focus];
};

const collectSourceFocusPoints = (
    sourceTexts: Array<{ source: TbmEvidenceSource; rawText: string; text: string }>,
    highGradeRiskNames: Set<string>,
): string[] => {
    const focus = new Set<string>();
    sourceTexts.forEach(({ text }) => {
        ACTION_RULES.forEach((rule) => {
            if (highGradeRiskNames.has(rule.risk)) return;
            const hasKeyword = [rule.risk, ...rule.keywords].some((keyword) => text.includes(keyword.toLowerCase()));
            if (hasKeyword) focus.add(`${rule.risk}: ${rule.action}`);
        });
    });
    return [...focus];
};

const getNextMonth = (): string => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export const buildFieldRecordSource = (
    workerRecords: WorkerRecord[],
    workType: string,
    targetCycleLabel = '다음 달',
): TbmEvidenceSource | null => {
    const targetRecords = workType === '전체 공종'
        ? workerRecords
        : workerRecords.filter((record) => record.jobField === workType);
    if (!targetRecords.length) return null;

    const focusLines = collectFieldRecordFocusPoints(targetRecords);
    const lines = [
        '[현장중점관리 참고]',
        `근로자 위험성평가 기록은 ${targetCycleLabel} 교육의 중점관리 포인트로만 사용합니다.`,
        `상등급 공유 항목은 ${targetCycleLabel} 위험성평가 회의자료(PPT/PDF/문서)에 명시된 상등급에서만 추출합니다.`,
        ...(focusLines.length ? focusLines : ['반복 위험 또는 개선 요청이 확인되면 여기에 중점관리 포인트로 정리합니다.']),
    ];

    return {
        id: `field-${workType}`,
        kind: 'field-record',
        title: `${workType} 위험성평가 기록 ${targetRecords.length}건`,
        text: lines.join('\n'),
        createdAt: new Date().toISOString(),
    };
};

export const buildTbmEducationDraft = (options: {
    workerRecords: WorkerRecord[];
    sources: TbmEvidenceSource[];
    month?: string;
    workType?: string;
    coreMessage?: string;
    targetCycleLabel?: string;
    targetPeriodLabel?: string;
}): TbmEducationDraft => {
    const month = options.month || getNextMonth();
    const workType = options.workType || '전체 공종';
    const targetCycleLabel = normalize(options.targetCycleLabel) || '다음 달';
    const targetPeriodLabel = normalize(options.targetPeriodLabel);
    const targetRecords = workType === '전체 공종'
        ? options.workerRecords
        : options.workerRecords.filter((record) => record.jobField === workType);
    const sourceTexts = options.sources.map((source) => ({
        source,
        rawText: source.text,
        text: normalize(source.text).toLowerCase(),
    }));
    const riskMap = new Map<string, { score: number; evidence: Set<string> }>();

    sourceTexts.forEach(({ source, rawText }) => {
        if (!isMeetingRiskSource(source)) return;
        extractHighGradeRiskCandidatesFromText(rawText).forEach((risk) => {
            const current = riskMap.get(risk) || { score: 0, evidence: new Set<string>() };
            current.score += source.kind === 'document' ? 5 : 3;
            current.evidence.add(`회의자료 상등급 ${source.title}`);
            riskMap.set(risk, current);
        });
    });

    const candidates = new Set<string>(riskMap.keys());

    candidates.forEach((risk) => {
        sourceTexts.forEach(({ source, text }) => {
            if (!isMeetingRiskSource(source)) return;
            const rule = ACTION_RULES.find((item) => item.risk === risk);
            const keywords = rule?.keywords || [risk];
            const occurrences = keywords.reduce(
                (sum, keyword) => sum + text.split(keyword.toLowerCase()).length - 1,
                0,
            );
            if (!occurrences) return;
            const current = riskMap.get(risk) || { score: 0, evidence: new Set<string>() };
            current.score += Math.min(6, occurrences * 2) + (source.kind === 'manual' ? 1 : 0);
            current.evidence.add(`회의자료 상등급 ${source.title}`);
            riskMap.set(risk, current);
        });
    });

    const ranked = [...riskMap.entries()]
        .filter(([, value]) => value.score > 0)
        .sort((left, right) => right[1].score - left[1].score)
        .slice(0, 3);
    const selected: Array<[string, { score: number; evidence: Set<string> }]> = [...ranked];

    const risks = selected.map(([risk, value], index) => ({
        id: `risk-${index + 1}`,
        risk,
        action: getActionForRisk(risk),
        evidenceLabels: [...value.evidence].slice(0, 3),
        score: value.score,
        owner: '담당자 지정 필요',
        managerConfirmed: true,
    }));
    const firstRisk = risks[0]?.risk || '회의자료 상등급 위험 없음';
    const coreMessage = normalize(options.coreMessage)
        || (risks.length
            ? `${workType} 작업자는 작업 시작 전 ${firstRisk} 위험과 안전조치를 함께 확인하고, 조건이 달라지면 즉시 작업을 멈춘다.`
            : `${workType} 작업자는 이번 자료에서 회의자료로 확정된 상등급 공유 위험이 없더라도 근로자 기록과 현장 조건을 바탕으로 작업중지 기준을 함께 확인한다.`);
    const highGradeRiskNames = new Set(risks.map((item) => item.risk));
    const focusPoints = [
        ...collectFieldRecordFocusPoints(targetRecords),
        ...collectSourceFocusPoints(sourceTexts, highGradeRiskNames),
    ].filter((point, index, array) => point && array.indexOf(point) === index).slice(0, 6);
    const accidentCases: TbmAccidentCase[] = [{
        id: 'accident-1',
        title: '최근 유사 재해사례 입력 필요',
        occurredAt: '',
        source: '관리자 확인 필요',
        summary: '현장과 작업이 유사한 최근 재해사례를 입력해 주세요. 확인되지 않은 사례는 교육에 사용하지 않습니다.',
        siteRelevance: risks.length
            ? `${workType} 작업의 ${firstRisk} 위험과 연결해 설명합니다.`
            : `${workType} 작업의 현장 조건과 작업중지 기준을 중심으로 설명합니다.`,
        lesson: risks[0]?.action || '작업 전 위험요인과 안전조치를 확인합니다.',
    }];
    const notices = [
        `${targetCycleLabel} 작업 일정과 작업구역 변경사항을 교육 전에 최종 확인합니다.`,
        '기상, 공정, 인원 또는 장비 조건이 바뀌면 작업을 멈추고 위험성평가를 다시 확인합니다.',
    ];
    const videoScenes: TbmVideoScene[] = [
        {
            id: 'video-opening',
            seconds: 30,
            title: '교육 목적과 핵심 한 문장',
            narration: `${targetCycleLabel} ${workType} 작업의 핵심 위험과 안전조치를 5분 안에 확인합니다. ${coreMessage}`,
            visualGuide: '교육 제목, 대상 공종, 핵심 전달 문구를 큰 글자로 표시',
        },
        {
            id: 'video-accident',
            seconds: 50,
            title: '최근 재해사례와 현장 연관성',
            narration: `${accidentCases[0].summary} 사례의 원인과 우리 현장에서 같은 위험이 발생할 수 있는 지점을 설명합니다.`,
            visualGuide: '사례 출처와 발생일, 현장 유사 작업 위치를 함께 표시',
        },
        {
            id: 'video-high-risk',
            seconds: 80,
            title: `${targetCycleLabel} 상등급 위험 공유`,
            narration: risks.length
                ? risks.map((item) => `${item.risk} 위험의 핵심 조치는 ${item.action}`).join(' ')
                : `이번 자료에는 ${targetCycleLabel} 위험성평가 회의자료에서 상등급으로 지정된 공유 위험이 없습니다. 일반 추천 위험은 넣지 않고 현장 중점관리 포인트에서 다룹니다.`,
            visualGuide: '회의자료 PPT/PDF에서 상등급으로 지정된 공유 대상만 표시하고, 없으면 “회의자료 상등급 항목 없음”으로 표시',
        },
        {
            id: 'video-focus',
            seconds: 90,
            title: '현장 중점관리 포인트',
            narration: focusPoints.join(' '),
            visualGuide: '작업 전 직접 확인할 위치, 설비, 보호구를 현장 사진과 함께 표시',
        },
        {
            id: 'video-notice',
            seconds: 30,
            title: '공지사항',
            narration: notices.join(' '),
            visualGuide: '일정, 작업구역, 출입 또는 장비 변경사항을 간결하게 표시',
        },
        {
            id: 'video-check',
            seconds: 20,
            title: '이해 확인과 행동 약속',
            narration: '오늘 확인한 위험 한 가지와 작업 전 실천할 조치 한 가지를 말하고, 조건이 달라지면 즉시 작업을 멈춥니다.',
            visualGuide: '이해 확인 질문 2개와 작업중지 약속을 표시',
        },
    ];

    return {
        month,
        workType,
        title: (() => {
            const parts = month.split('-');
            const displayMonth = parts.length === 2 ? `${parts[0]}년 ${parseInt(parts[1], 10)}월` : month;
            return `${targetPeriodLabel || displayMonth} ${workType} 위험성평가 교육자료`;
        })(),
        coreMessage,
        opening: `이번 교육은 ${targetCycleLabel} 예정 작업의 위험요인과 안전조치를 작업 전에 함께 확인하기 위한 자료입니다.`,
        risks,
        videoScenes,
        accidentCases,
        focusPoints,
        notices,
        checklist: [
            '오늘 수행할 작업과 작업 순서를 구체적으로 확인했는가?',
            '주요 위험이 발생하는 위치와 시간을 확인했는가?',
            '안전시설, 장비, 보호구 상태를 직접 확인했는가?',
            '작업 조건이 바뀌면 즉시 멈추고 관리자에게 알리는가?',
        ],
        confirmationQuestions: risks.map((item) => `${item.risk} 위험을 줄이기 위해 작업 전에 무엇을 확인해야 합니까?`),
        closingCommitment: '작업 조건이 교육 내용과 다르면 즉시 작업을 멈추고 관리자와 위험성평가를 다시 확인한다.',
        sourceCount: options.sources.length + (targetRecords.length ? 1 : 0),
        generatedAt: new Date().toISOString(),
    };
};

export const normalizeTbmEducationDraft = (draft: TbmEducationDraft): TbmEducationDraft => {
    const fallback = buildTbmEducationDraft({
        workerRecords: [],
        sources: [],
        month: draft.month,
        workType: draft.workType,
        coreMessage: draft.coreMessage,
    });
    return {
        ...fallback,
        ...draft,
        risks: (Array.isArray(draft.risks) ? draft.risks : fallback.risks).map((risk, index) => ({
            ...fallback.risks[index % fallback.risks.length],
            ...risk,
            owner: risk.owner || '담당자 지정 필요',
            managerConfirmed: Boolean(risk.managerConfirmed),
        })),
        videoScenes: Array.isArray(draft.videoScenes) ? draft.videoScenes : fallback.videoScenes,
        accidentCases: Array.isArray(draft.accidentCases) ? draft.accidentCases : fallback.accidentCases,
        focusPoints: Array.isArray(draft.focusPoints) ? draft.focusPoints : fallback.focusPoints,
        notices: Array.isArray(draft.notices) ? draft.notices : fallback.notices,
        closingCommitment: draft.closingCommitment || fallback.closingCommitment,
    };
};

export const getFiveMinuteVideoDuration = (draft: TbmEducationDraft): number =>
    draft.videoScenes.reduce((sum, scene) => sum + Math.max(0, scene.seconds), 0);

export const buildMonthlyEducationPackageText = (draft: TbmEducationDraft): string => {
    const accident = draft.accidentCases[0];
    const risksToShare = getHighGradeRiskShareItems(draft.risks);
    const accidentMeta = [accident?.occurredAt, accident?.source].filter(Boolean).join(' · ') || '출처와 발생일 확인 필요';
    const highRiskStageTitle = draft.videoScenes.find((scene) => scene.id === 'video-high-risk')?.title
        || '다음 달 상등급 위험 공유';
    const targetCycleLabel = highRiskStageTitle.replace(/\s*상등급 위험 공유$/, '').trim() || '다음 달';

    return [
        `[${draft.title}]`,
        draft.opening,
        '',
        '[오늘 반드시 전달할 한 문장]',
        draft.coreMessage,
        '',
        '1. 교육 전 5분 핵심 동영상',
        ...(draft.videoScenes.length
            ? draft.videoScenes.map((scene) => `- ${scene.title} (${scene.seconds}초): ${scene.narration}`)
            : ['- 관리자 검수에서 동영상 장면표를 제외했습니다. 원페이지 교육자료 중심으로 진행합니다.']),
        '',
        '2. 최근 재해사례와 현장 연관성',
        ...(accident
            ? [
                `- ${accident.title || '사례 입력 필요'} (${accidentMeta})`,
                `- 사례 요약: ${accident.summary || '관리자 입력 필요'}`,
                `- 현장 연관성: ${accident.siteRelevance || '관리자 입력 필요'}`,
                `- 핵심 교훈: ${accident.lesson || '관리자 입력 필요'}`,
            ]
            : ['- 관리자 검수에서 부적합한 재해사례를 제외했습니다. 현장 기록 기반 위험공유로 대체합니다.']),
        '',
        `3. ${targetCycleLabel} 위험성평가 상등급 공유`,
        ...(risksToShare.length
            ? risksToShare.map((risk) => `- ${risk.risk}: ${risk.action} / 담당 ${risk.owner} / ${risk.managerConfirmed ? '관리자 확인 완료' : '상등급 최종 확인 필요'}`)
            : [`- ${targetCycleLabel} 위험성평가 회의자료(PPT/PDF/문서)에서 상등급으로 지정된 공유 항목이 없습니다. 일반 추천 위험은 이 영역에 넣지 않습니다.`]),
        '',
        '4. 현장 중점관리 포인트',
        ...(draft.focusPoints.length
            ? draft.focusPoints.map((point) => `- ${point}`)
            : ['- 작업구역, 일정, 인원, 장비 조건이 바뀌면 작업 전 다시 확인합니다.']),
        '',
        '5. 공지사항',
        ...(draft.notices.length
            ? draft.notices.map((notice) => `- ${notice}`)
            : ['- 별도 공지 없음. 현장 변경사항은 교육 전 최종 확인합니다.']),
        '',
        '[이해 확인 및 행동 약속]',
        ...draft.confirmationQuestions.slice(0, 2).map((question, index) => `Q${index + 1}. ${question}`),
        `- ${draft.closingCommitment}`,
    ].join('\n');
};

export const estimateEducationTokens = (sources: TbmEvidenceSource[]): number =>
    Math.ceil(sources.reduce((sum, source) => sum + source.text.length, 0) / 3.2);

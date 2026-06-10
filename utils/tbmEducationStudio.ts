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
}

export interface TbmEducationDraft {
    month: string;
    workType: string;
    title: string;
    coreMessage: string;
    opening: string;
    risks: TbmRiskItem[];
    checklist: string[];
    confirmationQuestions: string[];
    sourceCount: number;
    generatedAt: string;
}

const DEFAULT_RISKS = ['추락', '끼임', '충돌'];

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

const getActionForRisk = (risk: string): string => {
    const normalized = normalize(risk);
    const matched = ACTION_RULES.find((rule) => rule.risk === normalized || rule.keywords.some((keyword) => normalized.includes(keyword)));
    return matched?.action || '작업 위치와 순서를 확인하고 제거, 차단, 보호구 순으로 안전조치를 정한 뒤 작업한다.';
};

const canonicalizeRisk = (value: string): string => {
    const normalized = normalize(value);
    return ACTION_RULES.find((rule) => rule.keywords.some((keyword) => normalized.includes(keyword)))?.risk || normalized;
};

const getNextMonth = (): string => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export const buildFieldRecordSource = (
    workerRecords: WorkerRecord[],
    workType: string,
): TbmEvidenceSource | null => {
    const targetRecords = workType === '전체 공종'
        ? workerRecords
        : workerRecords.filter((record) => record.jobField === workType);
    if (!targetRecords.length) return null;

    const lines = targetRecords.flatMap((record) => [
        ...(record.weakAreas || []),
        ...(record.suggestions || []),
        record.improvement,
        record.actionable_coaching,
    ]).map(normalize).filter(Boolean);

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
}): TbmEducationDraft => {
    const month = options.month || getNextMonth();
    const workType = options.workType || '전체 공종';
    const targetRecords = workType === '전체 공종'
        ? options.workerRecords
        : options.workerRecords.filter((record) => record.jobField === workType);
    const sourceTexts = options.sources.map((source) => ({
        source,
        text: normalize(source.text).toLowerCase(),
    }));
    const riskMap = new Map<string, { score: number; evidence: Set<string> }>();

    targetRecords.forEach((record) => {
        (record.weakAreas || []).map(normalize).filter(Boolean).forEach((rawRisk) => {
            const risk = canonicalizeRisk(rawRisk);
            const current = riskMap.get(risk) || { score: 0, evidence: new Set<string>() };
            current.score += 4;
            current.evidence.add(`현장기록 ${record.date}`);
            riskMap.set(risk, current);
        });
    });

    const candidates = new Set<string>([...riskMap.keys(), ...DEFAULT_RISKS, ...ACTION_RULES.map((rule) => rule.risk)]);

    candidates.forEach((risk) => {
        sourceTexts.forEach(({ source, text }) => {
            const rule = ACTION_RULES.find((item) => item.risk === risk);
            const keywords = rule?.keywords || [risk];
            const occurrences = keywords.reduce(
                (sum, keyword) => sum + text.split(keyword.toLowerCase()).length - 1,
                0,
            );
            if (!occurrences) return;
            const current = riskMap.get(risk) || { score: 0, evidence: new Set<string>() };
            current.score += Math.min(6, occurrences * 2) + (source.kind === 'manual' ? 1 : 0);
            current.evidence.add(source.title);
            riskMap.set(risk, current);
        });
    });

    const ranked = [...riskMap.entries()]
        .filter(([, value]) => value.score > 0)
        .sort((left, right) => right[1].score - left[1].score)
        .slice(0, 3);
    const selected: Array<[string, { score: number; evidence: Set<string> }]> = ranked.length
        ? [...ranked]
        : DEFAULT_RISKS.map((risk) => [risk, { score: 1, evidence: new Set(['기본 안전교육 보기글']) }]);
    DEFAULT_RISKS.forEach((risk) => {
        if (selected.length >= 3 || selected.some(([selectedRisk]) => selectedRisk === risk)) return;
        selected.push([risk, { score: 1, evidence: new Set(['기본 안전교육 보기글']) }]);
    });

    const risks = selected.map(([risk, value], index) => ({
        id: `risk-${index + 1}`,
        risk,
        action: getActionForRisk(risk),
        evidenceLabels: [...value.evidence].slice(0, 3),
        score: value.score,
    }));
    const firstRisk = risks[0]?.risk || '주요 위험';
    const coreMessage = normalize(options.coreMessage)
        || `${workType} 작업자는 작업 시작 전 ${firstRisk} 위험과 안전조치를 함께 확인하고, 조건이 달라지면 즉시 작업을 멈춘다.`;

    return {
        month,
        workType,
        title: `${month} ${workType} 위험성평가 전파교육`,
        coreMessage,
        opening: '이번 교육은 다음 달 예정 작업의 위험요인과 안전조치를 작업 전에 함께 확인하기 위한 자료입니다.',
        risks,
        checklist: [
            '오늘 수행할 작업과 작업 순서를 구체적으로 확인했는가?',
            '주요 위험이 발생하는 위치와 시간을 확인했는가?',
            '안전시설, 장비, 보호구 상태를 직접 확인했는가?',
            '작업 조건이 바뀌면 즉시 멈추고 관리자에게 알리는가?',
        ],
        confirmationQuestions: risks.map((item) => `${item.risk} 위험을 줄이기 위해 작업 전에 무엇을 확인해야 합니까?`),
        sourceCount: options.sources.length + (targetRecords.length ? 1 : 0),
        generatedAt: new Date().toISOString(),
    };
};

export const estimateEducationTokens = (sources: TbmEvidenceSource[]): number =>
    Math.ceil(sources.reduce((sum, source) => sum + source.text.length, 0) / 3.2);

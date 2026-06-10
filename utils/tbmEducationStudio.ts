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
        owner: '담당자 지정 필요',
        managerConfirmed: false,
    }));
    const firstRisk = risks[0]?.risk || '주요 위험';
    const coreMessage = normalize(options.coreMessage)
        || `${workType} 작업자는 작업 시작 전 ${firstRisk} 위험과 안전조치를 함께 확인하고, 조건이 달라지면 즉시 작업을 멈춘다.`;
    const focusPoints = risks.map((item) => `${item.risk}: ${item.action}`);
    const accidentCases: TbmAccidentCase[] = [{
        id: 'accident-1',
        title: '최근 유사 재해사례 입력 필요',
        occurredAt: '',
        source: '관리자 확인 필요',
        summary: '현장과 작업이 유사한 최근 재해사례를 입력해 주세요. 확인되지 않은 사례는 교육에 사용하지 않습니다.',
        siteRelevance: `${workType} 작업의 ${firstRisk} 위험과 연결해 설명합니다.`,
        lesson: risks[0]?.action || '작업 전 위험요인과 안전조치를 확인합니다.',
    }];
    const notices = [
        '다음 달 작업 일정과 작업구역 변경사항을 교육 전에 최종 확인합니다.',
        '기상, 공정, 인원 또는 장비 조건이 바뀌면 작업을 멈추고 위험성평가를 다시 확인합니다.',
    ];
    const videoScenes: TbmVideoScene[] = [
        {
            id: 'video-opening',
            seconds: 30,
            title: '교육 목적과 핵심 한 문장',
            narration: `다음 달 ${workType} 작업의 핵심 위험과 안전조치를 5분 안에 확인합니다. ${coreMessage}`,
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
            title: '다음 달 상등급 위험 공유',
            narration: risks.map((item) => `${item.risk} 위험의 핵심 조치는 ${item.action}`).join(' '),
            visualGuide: '상등급 공유 대상 3건과 선정 근거, 담당자를 순서대로 표시',
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
        title: `${month} ${workType} 위험성평가 전파교육`,
        coreMessage,
        opening: '이번 교육은 다음 달 예정 작업의 위험요인과 안전조치를 작업 전에 함께 확인하기 위한 자료입니다.',
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
        risks: (draft.risks || fallback.risks).map((risk, index) => ({
            ...fallback.risks[index % fallback.risks.length],
            ...risk,
            owner: risk.owner || '담당자 지정 필요',
            managerConfirmed: Boolean(risk.managerConfirmed),
        })),
        videoScenes: draft.videoScenes?.length ? draft.videoScenes : fallback.videoScenes,
        accidentCases: draft.accidentCases?.length ? draft.accidentCases : fallback.accidentCases,
        focusPoints: draft.focusPoints?.length ? draft.focusPoints : fallback.focusPoints,
        notices: draft.notices?.length ? draft.notices : fallback.notices,
        closingCommitment: draft.closingCommitment || fallback.closingCommitment,
    };
};

export const getFiveMinuteVideoDuration = (draft: TbmEducationDraft): number =>
    draft.videoScenes.reduce((sum, scene) => sum + Math.max(0, scene.seconds), 0);

export const buildMonthlyEducationPackageText = (draft: TbmEducationDraft): string => {
    const accident = draft.accidentCases[0];
    const confirmedRisks = draft.risks.filter((risk) => risk.managerConfirmed);
    const risksToShare = confirmedRisks.length ? confirmedRisks : draft.risks;
    const accidentMeta = [accident?.occurredAt, accident?.source].filter(Boolean).join(' · ') || '출처와 발생일 확인 필요';

    return [
        `[${draft.title}]`,
        draft.opening,
        '',
        '1. 교육 전 5분 핵심 동영상',
        ...draft.videoScenes.map((scene) => `- ${scene.title} (${scene.seconds}초): ${scene.narration}`),
        '',
        '2. 최근 재해사례와 현장 연관성',
        `- ${accident?.title || '사례 입력 필요'} (${accidentMeta})`,
        `- 사례 요약: ${accident?.summary || '관리자 입력 필요'}`,
        `- 현장 연관성: ${accident?.siteRelevance || '관리자 입력 필요'}`,
        `- 핵심 교훈: ${accident?.lesson || '관리자 입력 필요'}`,
        '',
        '3. 다음 달 위험성평가 상등급 공유',
        ...risksToShare.map((risk) => `- ${risk.risk}: ${risk.action} / 담당 ${risk.owner} / ${risk.managerConfirmed ? '관리자 확인 완료' : '상등급 최종 확인 필요'}`),
        '',
        '4. 현장 중점관리 포인트',
        ...draft.focusPoints.map((point) => `- ${point}`),
        '',
        '5. 공지사항',
        ...draft.notices.map((notice) => `- ${notice}`),
        '',
        '[이해 확인 및 행동 약속]',
        ...draft.confirmationQuestions.slice(0, 2).map((question, index) => `Q${index + 1}. ${question}`),
        `- ${draft.closingCommitment}`,
    ].join('\n');
};

export const estimateEducationTokens = (sources: TbmEvidenceSource[]): number =>
    Math.ceil(sources.reduce((sum, source) => sum + source.text.length, 0) / 3.2);

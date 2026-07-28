import { TRAINING_LANGUAGE_LABELS, type TrainingLanguageCode } from './constructionTrainingTranslation';
import {
    flattenEducationPosterTranslationMap,
    normalizeEducationPosterTranslationMap,
    type EducationPosterTranslationMap,
} from './educationPosterTranslation';
export type {
    EducationPosterTranslation,
    EducationPosterTranslationMap,
} from './educationPosterTranslation';
import {
    getHighGradeRiskShareItems,
    normalizeTbmEducationDraft,
    buildMonthlyEducationPackageText,
    type TbmEducationDraft,
    type TbmEvidenceSource,
    type TbmRiskItem,
} from './tbmEducationStudio';

export type ExternalAiProvider = 'chatgpt' | 'claude' | 'gemini';

export interface ExternalAiParsedResult {
    draft: TbmEducationDraft;
    translations: Record<string, string>;
    structuredTranslations: EducationPosterTranslationMap;
}

export const EXTERNAL_AI_PROVIDERS: Record<ExternalAiProvider, {
    label: string;
    url: string;
    description: string;
}> = {
    chatgpt: {
        label: 'ChatGPT',
        url: 'https://chatgpt.com/',
        description: '교육자료 구조화와 초안 검토에 적합',
    },
    claude: {
        label: 'Claude',
        url: 'https://claude.ai/new',
        description: '긴 자료 정리와 문장 다듬기에 적합',
    },
    gemini: {
        label: 'Gemini',
        url: 'https://gemini.google.com/app',
        description: '자료 검토와 다국어 초안 작성에 적합',
    },
};

export const DEFAULT_EXTERNAL_AI_LANGUAGES: TrainingLanguageCode[] = [
    'en-US',
    'vi-VN',
    'cmn-CN',
    'th-TH',
    'km-KH',
    'uz-UZ',
];

const MAX_SOURCE_CHARS = 42_000;

const normalizeText = (value: unknown): string =>
    String(value ?? '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

const redactCommonPersonalData = (value: string): string =>
    value
        .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[이메일 제거]')
        .replace(/\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g, '[전화번호 제거]')
        .replace(/\b\d{6}[-\s]?[1-4]\d{6}\b/g, '[주민번호 제거]');

const buildSourceBlock = (sources: TbmEvidenceSource[]): { text: string; truncated: boolean } => {
    let used = 0;
    let truncated = false;
    const blocks: string[] = [];

    sources.forEach((source, index) => {
        if (used >= MAX_SOURCE_CHARS) {
            truncated = true;
            return;
        }
        const header = `[출처 ${index + 1}] ${normalizeText(source.title) || '제목 없음'}`;
        const remaining = Math.max(0, MAX_SOURCE_CHARS - used - header.length - 2);
        const cleaned = redactCommonPersonalData(normalizeText(source.text));
        const body = cleaned.slice(0, remaining);
        if (body.length < cleaned.length) truncated = true;
        blocks.push(`${header}\n${body || '내용 없음'}`);
        used += header.length + body.length + 2;
    });

    return { text: blocks.join('\n\n'), truncated };
};

export const buildExternalAiPrompt = (options: {
    sources: TbmEvidenceSource[];
    month: string;
    workType: string;
    languageCodes?: TrainingLanguageCode[];
    draft?: TbmEducationDraft;
    mode?: 'generation' | 'translation';
    targetCycleLabel?: string;
    targetPeriodLabel?: string;
}): string => {
    const mode = options.mode || 'generation';
    const targetCycleLabel = normalizeText(options.targetCycleLabel) || '다음 달';
    const targetPeriodLabel = normalizeText(options.targetPeriodLabel) || options.month || '관리자 확인 필요';
    const { text: sourceText, truncated } = buildSourceBlock(options.sources);
    const languageCodes = (options.languageCodes || []).filter((code) => code !== 'ko-KR');
    const languageRequest = languageCodes.length
        ? languageCodes.map((code) => `${TRAINING_LANGUAGE_LABELS[code]}(${code})`).join(', ')
        : '번역하지 않음';

    const currentDraftText = options.draft ? buildMonthlyEducationPackageText(options.draft) : '';

    const lines = [
        '당신은 한국 건설현장의 위험성평가 교육자료를 만드는 안전교육 편집자입니다.',
        mode === 'translation' && options.draft
            ? '아래 제공된 [현재 검수 완료 한국어 원문]을 그대로 요청된 다국어로 정확하게 번역하세요.'
            : `아래 근거 자료를 정밀 분석하여 ${targetCycleLabel} 교육용 5단계 한 장 완성형 초안(한국어)을 작성하고 지정된 다국어 번역을 동시에 반환하세요.`,
        '',
        '[대상]',
        `- 교육 적용 구간: ${targetPeriodLabel}`,
        `- 자료 보관 월: ${options.month || '관리자 확인 필요'}`,
        `- 공종: ${options.workType || '전체 공종'}`,
        `- 다국어 결과: ${languageRequest}`,
        '',
    ];

    if (mode === 'translation' && options.draft) {
        lines.push(
            '[현재 작업 목적]',
            '지금은 새 초안을 만드는 단계가 아닙니다.',
            '관리자가 5단계 검수와 한 장 편집에서 수정한 최신 한국어 원문을 외국인 근로자용 다국어 자료로 다시 맞추는 단계입니다.',
            '따라서 아래 [현재 검수 완료 한국어 원문]의 문장, 순서, 위험 항목, 공지, 질문, 행동 약속을 바꾸지 말고 번역만 수행하십시오.',
            '',
            '[가장 중요한 번역 지침]',
            '1. 제공된 [현재 검수 완료 한국어 원문]이 최우선 기준입니다. 각 다국어 번역본(structuredTranslations)은 이 한국어 원문의 문장과 내용을 단어 하나, 수치 하나 왜곡하지 않고 그대로 번역해야 합니다.',
            '2. 근거 자료를 참조하여 AI가 새로운 내용이나 재해사례를 마음대로 상상해서 번역본에 채워넣거나, 기존 원문 내용을 임의로 변경/생략하지 마십시오. 오직 아래 [현재 검수 완료 한국어 원문]의 문장 그대로만 지정된 언어별로 충실하게 1:1 번역해야 합니다.',
            '3. 번역본은 번호가 포함된 긴 문자열이 아니라 workType, title, opening, coreMessage, video, accident, risks, focus, notices, questions, closingCommitment 키가 있는 구조화 객체로 반환하십시오. workType에는 대상 공종을 현지어로 번역하고, 배열 순서는 한국어 초안과 정확히 1:1 대응해야 하며, 현지어 번호를 섹션 구분용으로 사용하지 마십시오.',
            '4. 반환하는 JSON의 `draft` 객체는 아래 [현재 검수 완료 한국어 원문]의 값(title, opening, coreMessage, videoScenes, accidentCases, risks, focusPoints, notices, confirmationQuestions, closingCommitment 등)을 한국어 그대로 모두 보존하여 반환해 주십시오.',
            '5. structuredTranslations의 값 안에는 한국어나 불필요한 영어 단어가 섞여 나와서는 안 됩니다. JSON 키는 아래 예시 그대로 유지하되 값은 100% 해당 번역 대상 국가의 공식 모국어 문자와 자연스러운 현지 표현으로 완전히 번역하십시오. 영문 약어(TBM)도 현지어로 풀어서 번역하십시오.',
            '6. questions 배열에는 질문 문장만 순서대로 넣으십시오. Q1, Q2 또는 현지어 번호를 붙이지 마십시오. 프로그램이 배열 순서로 질문을 배치합니다.',
            ''
        );
    } else {
        lines.push(
            '[가장 중요한 초안 생성 지침]',
            '1. 제공된 [근거 자료]만을 기반으로 사실적이고 실행 가능한 위험성평가 전파교육 내용(한국어 초안 `draft`)을 직접 구성하십시오. 확인되지 않은 사실이나 재해사례는 상상해서 채워넣지 마시고 누락된 사항은 "관리자 확인 필요"로 남겨두십시오.',
            '2. 구성된 한국어 초안(`draft`)을 지정된 다국어 결과(structuredTranslations)로 각각 정확하게 번역하여 함께 반환하십시오. 번역본의 섹션과 배열 순서는 한국어 초안의 구조와 100% 매칭되어야 합니다.',
            `3. 제공된 [현재 작성된 참고용 초안]은 기본 틀(템플릿) 역할만 합니다. 다만 draft.risks(${targetCycleLabel} 상등급 위험 공유)는 ${targetCycleLabel} 위험성평가 회의자료(PPT/PDF/문서)에서 "상등급", "위험등급 상", "위험수준 상"으로 지정된 항목만 사용하십시오. 근로자 기록지 Q3, 일반 위험 추천, 기본 안전수칙, 추정 위험은 risks에 넣지 말고 focusPoints나 notices로만 정리하십시오. 회의자료에서 확인된 상등급이 없으면 risks는 빈 배열([])로 반환하십시오.`,
            '4. 회의자료에서 "위험성평가 상등급", "상등급 위험", "위험등급 상" 같은 제목이 나오면 그 뒤 다음 페이지/다음 슬라이드에 이어지는 항목도 상등급 섹션으로 보십시오. 단, "현장 중점관리 포인트", "중점관리", "공지사항", 다음 번호 섹션이 나오면 그 이후 항목은 risks가 아니라 focusPoints 또는 notices로만 정리하십시오.',
            '5. structuredTranslations의 JSON 키는 예시 그대로 유지하고 workType의 대상 공종까지 번역하되, 각 값에는 한국어 단어나 불필요한 영어 표현이 섞이지 않게 하여 100% 해당 국가의 공식 모국어로 작성하십시오. 질문에는 Q1, Q2 같은 번호를 붙이지 마십시오.',
            '6. 교육자료의 제목(title)을 생성할 때 "초안", "임시", "가이드라인", "참고" 등의 단어를 절대 포함하지 마십시오. 즉시 인쇄하여 현장에 배포 가능한 완성형 제목(예: "7월 철골 설치 작업 안전 교육자료")으로 명확히 작성하십시오.',
            ''
        );
    }

    lines.push(
        '[안전 규칙]',
        '1. 근거 자료에 없는 사고 일자, 기관, 수치, 담당자, 안전조치를 만들어내지 마세요.',
        '2. 확인할 수 없는 값은 "관리자 확인 필요"로 표시하세요.',
        '3. 이름, 연락처, 주민번호 등 개인정보를 결과에 포함하지 마세요.',
        `4. 교육 흐름은 5분 핵심 동영상, 최근 재해사례, ${targetCycleLabel} 상등급 위험, 현장 중점관리, 공지사항 순서로 구성하세요.`,
        '5. 영상 장면의 seconds 합계는 정확히 300초로 맞추세요.',
        '6. 안전조치는 짧고 실행 가능한 명령형 문장으로 작성하고, 위험 시 즉시 작업중지와 관리자 보고가 드러나게 하세요.',
        '7. evidenceLabels에는 아래 출처 제목만 사용하세요.',
        '8. 번역은 한국 건설현장 용어의 의무 강도와 5개 교육 섹션의 의미를 보존하되, 섹션 판별용 번호를 값에 붙이지 말고 지정된 구조화 키와 배열에 나누어 담으십시오.',
        `9. ${targetCycleLabel} 상등급 위험(draft.risks)은 위험성평가 회의자료(PPT/PDF/문서)에서 확인된 상등급 항목만 담으세요. 근로자 Q3 응답이나 상등급 근거가 없는 추천 위험을 만들거나 기본 3개 위험으로 채우지 마세요.`,
        '10. 제목(title)에는 "초안", "참고" 같은 표현을 빼고 완성형으로 기재하십시오.',
        '',
        '[응답 형식]',
        '설명, 마크다운, 코드블록 없이 아래 구조의 JSON 객체 하나만 반환하세요.',
        '`structuredTranslations`만 작성하면 됩니다. 기존 긴 문자열 `translations`는 프로그램이 저장 호환용으로 자동 생성합니다.',
        JSON.stringify({
            draft: {
                workType: options.workType,
                title: '문자열',
                opening: '문자열',
                coreMessage: '문자열',
                videoScenes: [{
                    title: '문자열',
                    seconds: 30,
                    narration: '문자열',
                    visualGuide: '문자열',
                }],
                accidentCases: [{
                    title: '문자열',
                    occurredAt: 'YYYY-MM-DD 또는 빈 문자열',
                    source: '출처 또는 관리자 확인 필요',
                    summary: '문자열',
                    siteRelevance: '문자열',
                    lesson: '문자열',
                }],
                risks: [{
                    risk: '문자열',
                    action: '문자열',
                    evidenceLabels: ['출처 제목'],
                    owner: '관리자 확인 필요',
                    managerConfirmed: false,
                }],
                focusPoints: ['문자열'],
                notices: ['문자열'],
                checklist: ['문자열'],
                confirmationQuestions: ['문자열'],
                closingCommitment: '문자열',
            },
            structuredTranslations: {
                '요청한 언어 코드': {
                    workType: '번역한 대상 공종',
                    title: '번역한 제목',
                    opening: '번역한 도입 문장',
                    coreMessage: '번역한 핵심 한 문장',
                    video: [{
                        title: '번역한 장면 제목',
                        narration: '번역한 설명',
                        visualGuide: '번역한 화면 안내',
                    }],
                    accident: [{
                        title: '번역한 사례 제목',
                        occurredAt: '원문의 일자 또는 빈 문자열',
                        source: '번역한 출처',
                        summary: '번역한 사례 요약',
                        siteRelevance: '번역한 현장 연관성',
                        lesson: '번역한 핵심 교훈',
                    }],
                    risks: [{
                        risk: '번역한 위험',
                        action: '번역한 예방 행동',
                        owner: '번역한 담당',
                    }],
                    focus: ['번역한 중점관리 항목'],
                    notices: ['번역한 공지사항'],
                    questions: ['번호를 붙이지 않은 번역 질문'],
                    closingCommitment: '번역한 행동 약속',
                },
            },
        }, null, 2),
        ''
    );

    if (options.draft) {
        lines.push(
            mode === 'translation' ? '[현재 검수 완료 한국어 원문]' : '[현재 작성된 참고용 초안]',
            currentDraftText,
            ''
        );
    }

    lines.push(
        `[근거 자료${truncated ? ' - 길이 제한으로 일부 생략됨' : ''}]`,
        sourceText || '등록된 근거 자료 없음. 일반론을 채우지 말고 모든 핵심 항목을 "관리자 확인 필요"로 표시하세요.'
    );

    return lines.join('\n');
};

const asStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.map(normalizeText).filter(Boolean).slice(0, 12) : [];

const stripCodeFence = (value: string): string =>
    value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

const normalizeRiskTopic = (value: unknown): string =>
    normalizeText(value).replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();

const findMatchingHighGradeRisk = (incoming: Record<string, unknown>, allowedRisks: TbmRiskItem[]): TbmRiskItem | null => {
    const incomingTopic = normalizeRiskTopic(incoming.risk);
    if (!incomingTopic) return null;
    return allowedRisks.find((risk) => {
        const allowedTopic = normalizeRiskTopic(risk.risk);
        return allowedTopic
            && (incomingTopic.includes(allowedTopic) || allowedTopic.includes(incomingTopic));
    }) || null;
};

export const parseExternalAiResult = (
    raw: string,
    currentDraft: TbmEducationDraft,
): ExternalAiParsedResult => {
    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(stripCodeFence(raw)) as Record<string, unknown>;
    } catch {
        throw new Error('AI 결과 형식을 읽을 수 없습니다. AI에게 "JSON 객체만 다시 출력"하도록 요청해 주세요.');
    }

    const incoming = parsed.draft && typeof parsed.draft === 'object'
        ? parsed.draft as Record<string, unknown>
        : parsed;
    const normalizeItems = (value: unknown): Record<string, unknown>[] =>
        Array.isArray(value)
            ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
            : [];

    const allowedHighGradeRisks = getHighGradeRiskShareItems(currentDraft.risks);
    const risks = normalizeItems(incoming.risks).slice(0, 5).reduce<TbmRiskItem[]>((items, item) => {
        const matched = findMatchingHighGradeRisk(item, allowedHighGradeRisks);
        if (!matched) return items;
        items.push({
            ...matched,
            action: normalizeText(item.action) || matched.action,
            owner: normalizeText(item.owner) || matched.owner,
            evidenceLabels: matched.evidenceLabels,
            score: matched.score,
            managerConfirmed: matched.managerConfirmed,
        });
        return items;
    }, []);
    const videoScenes = normalizeItems(incoming.videoScenes).slice(0, 8).map((item, index) => ({
        id: `ai-video-${index + 1}`,
        seconds: Math.max(0, Math.round(Number(item.seconds) || 0)),
        title: normalizeText(item.title) || `장면 ${index + 1}`,
        narration: normalizeText(item.narration),
        visualGuide: normalizeText(item.visualGuide),
    }));
    const accidentCases = normalizeItems(incoming.accidentCases).slice(0, 3).map((item, index) => ({
        id: `ai-accident-${index + 1}`,
        title: normalizeText(item.title) || '관리자 확인 필요',
        occurredAt: normalizeText(item.occurredAt),
        source: normalizeText(item.source) || '관리자 확인 필요',
        summary: normalizeText(item.summary),
        siteRelevance: normalizeText(item.siteRelevance),
        lesson: normalizeText(item.lesson),
    }));

    const merged = normalizeTbmEducationDraft({
        ...currentDraft,
        title: normalizeText(incoming.title) || currentDraft.title,
        opening: normalizeText(incoming.opening) || currentDraft.opening,
        coreMessage: normalizeText(incoming.coreMessage) || currentDraft.coreMessage,
        risks: risks.length ? risks : allowedHighGradeRisks,
        videoScenes: videoScenes.length ? videoScenes : currentDraft.videoScenes,
        accidentCases: accidentCases.length ? accidentCases : currentDraft.accidentCases,
        focusPoints: asStringArray(incoming.focusPoints).length ? asStringArray(incoming.focusPoints) : currentDraft.focusPoints,
        notices: asStringArray(incoming.notices).length ? asStringArray(incoming.notices) : currentDraft.notices,
        checklist: asStringArray(incoming.checklist).length ? asStringArray(incoming.checklist) : currentDraft.checklist,
        confirmationQuestions: asStringArray(incoming.confirmationQuestions).length
            ? asStringArray(incoming.confirmationQuestions)
            : currentDraft.confirmationQuestions,
        closingCommitment: normalizeText(incoming.closingCommitment) || currentDraft.closingCommitment,
        generatedAt: new Date().toISOString(),
    });

    const legacyTranslationValues = parsed.translations && typeof parsed.translations === 'object'
        ? parsed.translations as Record<string, unknown>
        : {};
    const flatTranslations = Object.fromEntries(
        Object.entries(legacyTranslationValues)
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
            .map(([code, value]) => [normalizeText(code), normalizeText(value)])
            .filter(([code, value]) => Boolean(code && value)),
    );
    const structuredTranslations: EducationPosterTranslationMap = {
        ...normalizeEducationPosterTranslationMap(legacyTranslationValues),
        ...normalizeEducationPosterTranslationMap(parsed.structuredTranslations),
    };
    const translations = {
        ...flattenEducationPosterTranslationMap(structuredTranslations),
        ...flatTranslations,
    };

    return { draft: merged, translations, structuredTranslations };
};

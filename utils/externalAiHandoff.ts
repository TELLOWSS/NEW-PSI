import { TRAINING_LANGUAGE_LABELS, type TrainingLanguageCode } from './constructionTrainingTranslation';
import {
    normalizeTbmEducationDraft,
    type TbmEducationDraft,
    type TbmEvidenceSource,
} from './tbmEducationStudio';

export type ExternalAiProvider = 'chatgpt' | 'claude' | 'gemini';

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
}): string => {
    const { text: sourceText, truncated } = buildSourceBlock(options.sources);
    const languageCodes = (options.languageCodes || []).filter((code) => code !== 'ko-KR');
    const languageRequest = languageCodes.length
        ? languageCodes.map((code) => `${TRAINING_LANGUAGE_LABELS[code]}(${code})`).join(', ')
        : '번역하지 않음';

    return [
        '당신은 한국 건설현장의 위험성평가와 TBM 교육자료를 만드는 안전교육 편집자입니다.',
        '아래 근거 자료만 분석하여 다음 달 교육용 5단계 한 장 초안을 작성하세요.',
        '',
        '[대상]',
        `- 교육 월: ${options.month || '관리자 확인 필요'}`,
        `- 공종: ${options.workType || '전체 공종'}`,
        `- 다국어 결과: ${languageRequest}`,
        '',
        '[안전 규칙]',
        '1. 근거 자료에 없는 사고 일자, 기관, 수치, 담당자, 안전조치를 만들어내지 마세요.',
        '2. 확인할 수 없는 값은 "관리자 확인 필요"로 표시하세요.',
        '3. 이름, 연락처, 주민번호 등 개인정보를 결과에 포함하지 마세요.',
        '4. 교육 흐름은 5분 핵심 동영상, 최근 재해사례, 다음 달 상등급 위험, 현장 중점관리, 공지사항 순서로 구성하세요.',
        '5. 영상 장면의 seconds 합계는 정확히 300초로 맞추세요.',
        '6. 안전조치는 짧고 실행 가능한 명령형 문장으로 작성하고, 위험 시 즉시 작업중지와 관리자 보고가 드러나게 하세요.',
        '7. evidenceLabels에는 아래 출처 제목만 사용하세요.',
        '8. 번역은 한국 건설현장 용어의 의무 강도를 유지하고 1~5단계 구조를 보존하세요.',
        '',
        '[응답 형식]',
        '설명, 마크다운, 코드블록 없이 아래 구조의 JSON 객체 하나만 반환하세요.',
        JSON.stringify({
            draft: {
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
            translations: {
                '요청한 언어 코드': '한국어 초안 전체를 1~5단계로 유지한 완성 번역문',
            },
        }, null, 2),
        '',
        `[근거 자료${truncated ? ' - 길이 제한으로 일부 생략됨' : ''}]`,
        sourceText || '등록된 근거 자료 없음. 일반론을 채우지 말고 모든 핵심 항목을 "관리자 확인 필요"로 표시하세요.',
    ].join('\n');
};

const asStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.map(normalizeText).filter(Boolean).slice(0, 12) : [];

const stripCodeFence = (value: string): string =>
    value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

export const parseExternalAiResult = (
    raw: string,
    currentDraft: TbmEducationDraft,
): { draft: TbmEducationDraft; translations: Record<string, string> } => {
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

    const risks = normalizeItems(incoming.risks).slice(0, 5).map((item, index) => ({
        id: `ai-risk-${index + 1}`,
        risk: normalizeText(item.risk) || '관리자 확인 필요',
        action: normalizeText(item.action) || '관리자 확인 필요',
        evidenceLabels: asStringArray(item.evidenceLabels).slice(0, 3),
        score: 0,
        owner: normalizeText(item.owner) || '관리자 확인 필요',
        managerConfirmed: false,
    }));
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
        risks: risks.length ? risks : currentDraft.risks,
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

    const translations = parsed.translations && typeof parsed.translations === 'object'
        ? Object.fromEntries(
            Object.entries(parsed.translations as Record<string, unknown>)
                .map(([code, value]) => [code, normalizeText(value)])
                .filter(([, value]) => Boolean(value)),
        )
        : {};

    return { draft: merged, translations };
};

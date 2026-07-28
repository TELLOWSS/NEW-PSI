export interface EducationPosterVideoTranslation {
    title: string;
    narration: string;
    visualGuide: string;
}

export interface EducationPosterAccidentTranslation {
    title: string;
    occurredAt: string;
    source: string;
    summary: string;
    siteRelevance: string;
    lesson: string;
}

export interface EducationPosterRiskTranslation {
    risk: string;
    action: string;
    owner: string;
}

/**
 * Translation contract used by the A4 poster.
 *
 * Sections are deliberately keyed instead of being recovered from localized
 * "1.", "2." headings. Array order matches the corresponding Korean draft.
 */
export interface EducationPosterTranslation {
    workType: string;
    title: string;
    opening: string;
    coreMessage: string;
    video: EducationPosterVideoTranslation[];
    accident: EducationPosterAccidentTranslation[];
    risks: EducationPosterRiskTranslation[];
    focus: string[];
    notices: string[];
    questions: string[];
    closingCommitment: string;
}

export type EducationPosterTranslationMap = Record<string, EducationPosterTranslation>;

const normalizeText = (value: unknown): string =>
    String(value ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value));

const asArray = (value: unknown): unknown[] => {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null || value === '') return [];
    return [value];
};

const asStringArray = (value: unknown, limit = 12): string[] =>
    asArray(value).map(normalizeText).filter(Boolean).slice(0, limit);

const normalizeVideo = (value: unknown): EducationPosterVideoTranslation[] => {
    const candidates = isRecord(value) && Array.isArray(value.scenes) ? value.scenes : asArray(value);
    return candidates.slice(0, 8).flatMap((item) => {
        if (!isRecord(item)) {
            const narration = normalizeText(item);
            return narration ? [{ title: '', narration, visualGuide: '' }] : [];
        }
        const translated = {
            title: normalizeText(item.title),
            narration: normalizeText(item.narration ?? item.text),
            visualGuide: normalizeText(item.visualGuide ?? item.visual),
        };
        return Object.values(translated).some(Boolean) ? [translated] : [];
    });
};

const normalizeAccident = (value: unknown): EducationPosterAccidentTranslation[] => {
    const candidates = isRecord(value) && Array.isArray(value.cases) ? value.cases : asArray(value);
    return candidates.slice(0, 3).flatMap((item) => {
        if (!isRecord(item)) {
            const summary = normalizeText(item);
            return summary
                ? [{
                    title: '',
                    occurredAt: '',
                    source: '',
                    summary,
                    siteRelevance: '',
                    lesson: '',
                }]
                : [];
        }
        const translated = {
            title: normalizeText(item.title),
            occurredAt: normalizeText(item.occurredAt ?? item.date),
            source: normalizeText(item.source),
            summary: normalizeText(item.summary ?? item.text),
            siteRelevance: normalizeText(item.siteRelevance ?? item.relevance),
            lesson: normalizeText(item.lesson),
        };
        return Object.values(translated).some(Boolean) ? [translated] : [];
    });
};

const normalizeRisks = (value: unknown): EducationPosterRiskTranslation[] =>
    asArray(value).slice(0, 5).flatMap((item) => {
        if (!isRecord(item)) {
            const risk = normalizeText(item);
            return risk ? [{ risk, action: '', owner: '' }] : [];
        }
        const translated = {
            risk: normalizeText(item.risk ?? item.title),
            action: normalizeText(item.action ?? item.measure),
            owner: normalizeText(item.owner),
        };
        return Object.values(translated).some(Boolean) ? [translated] : [];
    });

export const normalizeEducationPosterTranslation = (
    value: unknown,
): EducationPosterTranslation | null => {
    if (!isRecord(value)) return null;

    const normalized: EducationPosterTranslation = {
        workType: normalizeText(value.workType),
        title: normalizeText(value.title),
        opening: normalizeText(value.opening),
        coreMessage: normalizeText(value.coreMessage),
        video: normalizeVideo(value.video ?? value.videoScenes),
        accident: normalizeAccident(value.accident ?? value.accidentCases),
        risks: normalizeRisks(value.risks),
        focus: asStringArray(value.focus ?? value.focusPoints),
        notices: asStringArray(value.notices),
        questions: asStringArray(value.questions ?? value.confirmationQuestions),
        closingCommitment: normalizeText(value.closingCommitment),
    };

    const hasContent = normalized.workType
        || normalized.title
        || normalized.opening
        || normalized.coreMessage
        || normalized.video.length
        || normalized.accident.length
        || normalized.risks.length
        || normalized.focus.length
        || normalized.notices.length
        || normalized.questions.length
        || normalized.closingCommitment;

    return hasContent ? normalized : null;
};

export const normalizeEducationPosterTranslationMap = (
    value: unknown,
): EducationPosterTranslationMap => {
    if (!isRecord(value)) return {};

    return Object.fromEntries(
        Object.entries(value).flatMap(([languageCode, translation]) => {
            const normalizedCode = normalizeText(languageCode);
            const normalizedTranslation = normalizeEducationPosterTranslation(translation);
            return normalizedCode && normalizedTranslation
                ? [[normalizedCode, normalizedTranslation] as const]
                : [];
        }),
    );
};

const joinMeaningful = (values: string[], separator = ' · '): string =>
    values.map(normalizeText).filter(Boolean).join(separator);

/**
 * Produces the legacy text representation for existing storage and previews.
 * The structured object remains the source of truth for new poster rendering.
 */
export const flattenEducationPosterTranslation = (
    translation: EducationPosterTranslation,
): string => {
    const lines: string[] = [];
    if (translation.title) lines.push(`[${translation.title}]`);
    if (translation.workType) lines.push(translation.workType);
    if (translation.opening) lines.push(translation.opening);
    if (translation.coreMessage) lines.push(translation.coreMessage);

    lines.push(
        '',
        '1.',
        ...translation.video.map((scene) =>
            joinMeaningful([scene.title, scene.narration, scene.visualGuide])),
        '',
        '2.',
        ...translation.accident.flatMap((accident) => [
            joinMeaningful([accident.title, accident.occurredAt, accident.source]),
            accident.summary,
            accident.siteRelevance,
            accident.lesson,
        ].filter(Boolean)),
        '',
        '3.',
        ...translation.risks.map((risk) =>
            joinMeaningful([risk.risk, risk.action, risk.owner])),
        '',
        '4.',
        ...translation.focus,
        '',
        '5.',
        ...translation.notices,
        '',
        '[✓]',
        ...translation.questions,
        translation.closingCommitment,
    );

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

export const flattenEducationPosterTranslationMap = (
    translations: EducationPosterTranslationMap,
): Record<string, string> =>
    Object.fromEntries(
        Object.entries(translations)
            .map(([languageCode, translation]) => [
                languageCode,
                flattenEducationPosterTranslation(translation),
            ])
            .filter(([, translation]) => Boolean(translation)),
    );

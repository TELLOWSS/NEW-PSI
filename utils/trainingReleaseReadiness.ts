import type { TranslationQualityReport } from './constructionTrainingTranslation.js';

export const TRAINING_RELEASE_METADATA_KEY = '__release__';
export const TRAINING_TRANSLATION_QUALITY_KEY = '__quality__';

export type TrainingReleaseBlockerKind = 'translation' | 'quality' | 'audio';

export type TrainingReleaseBlocker = {
    languageCode: string;
    kind: TrainingReleaseBlockerKind;
    message: string;
};

export type TrainingReleaseMetadata = {
    version: 1;
    status: 'draft' | 'ready';
    selectedLanguages: string[];
    approvedReviewLanguages: string[];
    blockers: TrainingReleaseBlocker[];
    checkedAt: string;
};

type ReleaseReadinessInput = {
    selectedLanguages: unknown;
    sourceTextKo: unknown;
    translatedTexts: unknown;
    audioUrls: unknown;
    translationReports?: unknown;
    approvedReviewLanguages?: unknown;
};

const normalizeCodeList = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(
        value
            .map((item) => String(item || '').trim())
            .filter(Boolean),
    ));
};

export const normalizeTrainingStringMap = (value: unknown): Record<string, string> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .filter(([, item]) => typeof item === 'string' && item.trim().length > 0)
            .map(([key, item]) => [key, String(item).trim()]),
    );
};

export const parseTrainingTranslationReports = (value: unknown): Record<string, TranslationQualityReport> => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, TranslationQualityReport>;
    }
    if (typeof value !== 'string' || !value.trim()) return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, TranslationQualityReport>
            : {};
    } catch {
        return {};
    }
};

export const parseTrainingReleaseMetadata = (translatedTexts: unknown): TrainingReleaseMetadata | null => {
    const textMap = normalizeTrainingStringMap(translatedTexts);
    const raw = textMap[TRAINING_RELEASE_METADATA_KEY];
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<TrainingReleaseMetadata>;
        if (parsed?.version !== 1 || (parsed.status !== 'draft' && parsed.status !== 'ready')) return null;
        return {
            version: 1,
            status: parsed.status,
            selectedLanguages: normalizeCodeList(parsed.selectedLanguages),
            approvedReviewLanguages: normalizeCodeList(parsed.approvedReviewLanguages),
            blockers: Array.isArray(parsed.blockers)
                ? parsed.blockers.filter((item): item is TrainingReleaseBlocker => Boolean(
                    item
                    && typeof item === 'object'
                    && typeof item.languageCode === 'string'
                    && ['translation', 'quality', 'audio'].includes(item.kind),
                ))
                : [],
            checkedAt: typeof parsed.checkedAt === 'string' ? parsed.checkedAt : '',
        };
    } catch {
        return null;
    }
};

export const assessTrainingReleaseReadiness = (input: ReleaseReadinessInput) => {
    const translatedTexts = normalizeTrainingStringMap(input.translatedTexts);
    const audioUrls = normalizeTrainingStringMap(input.audioUrls);
    const embeddedReports = parseTrainingTranslationReports(translatedTexts[TRAINING_TRANSLATION_QUALITY_KEY]);
    const translationReports = input.translationReports === undefined
        ? embeddedReports
        : parseTrainingTranslationReports(input.translationReports);
    const approvedReviewLanguages = normalizeCodeList(input.approvedReviewLanguages);
    const approvedSet = new Set(approvedReviewLanguages);
    const selectedLanguages = normalizeCodeList(input.selectedLanguages);
    const sourceTextKo = String(input.sourceTextKo || '').trim();
    const blockers: TrainingReleaseBlocker[] = [];

    for (const languageCode of selectedLanguages) {
        const translated = languageCode === 'ko-KR'
            ? (translatedTexts[languageCode] || sourceTextKo)
            : translatedTexts[languageCode];
        if (!translated) {
            blockers.push({
                languageCode,
                kind: 'translation',
                message: `${languageCode} 번역문이 없습니다.`,
            });
        }

        const report = translationReports[languageCode];
        if (
            languageCode !== 'ko-KR'
            && translated
            && report?.status !== 'ready'
            && !approvedSet.has(languageCode)
        ) {
            blockers.push({
                languageCode,
                kind: 'quality',
                message: `${languageCode} 번역을 관리자 또는 현장 통역자가 확인해야 합니다.`,
            });
        }

        if (!audioUrls[languageCode]) {
            blockers.push({
                languageCode,
                kind: 'audio',
                message: `${languageCode} 음성 파일이 없습니다.`,
            });
        }
    }

    return {
        ready: selectedLanguages.length > 0 && blockers.length === 0,
        selectedLanguages,
        approvedReviewLanguages,
        blockers,
    };
};

export const embedTrainingReleaseMetadata = (
    translatedTextsInput: unknown,
    readiness: ReturnType<typeof assessTrainingReleaseReadiness>,
): Record<string, string> => {
    const translatedTexts = normalizeTrainingStringMap(translatedTextsInput);
    const metadata: TrainingReleaseMetadata = {
        version: 1,
        status: readiness.ready ? 'ready' : 'draft',
        selectedLanguages: readiness.selectedLanguages,
        approvedReviewLanguages: readiness.approvedReviewLanguages,
        blockers: readiness.blockers,
        checkedAt: new Date().toISOString(),
    };
    return {
        ...translatedTexts,
        [TRAINING_RELEASE_METADATA_KEY]: JSON.stringify(metadata),
    };
};

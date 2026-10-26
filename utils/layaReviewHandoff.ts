import {
    CURRENT_SITE_TRAINING_LANGUAGE_CODES,
    type TrainingLanguageCode,
} from './constructionTrainingTranslation';
import {
    validateLayaExtendedPack,
    type LayaV2Pack,
} from './layaExtendedSafetyBenchmark';

const REVIEW_SESSION_VERSION = 1 as const;
export interface LayaReviewSession {
    version: typeof REVIEW_SESSION_VERSION;
    selectedLanguage: TrainingLanguageCode;
    selectedCaseId: string;
    focusedMode: boolean;
    pendingOnly: boolean;
}
export type LayaReviewHandoff = LayaV2Pack & { reviewSession: LayaReviewSession };
export interface LayaReviewRestore {
    pack: LayaV2Pack;
    session: LayaReviewSession | null;
    ignoredSession: boolean;
}

const recordOf = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const langExists = (value: unknown): value is TrainingLanguageCode =>
    typeof value === 'string' &&
    (CURRENT_SITE_TRAINING_LANGUAGE_CODES as readonly string[]).includes(value);

/**
 * Keeps the original 132-case JSON schema unchanged for the offline model
 * runner. Adds only optional browser display state. No personal data.
 */
export const buildLayaReviewHandoff = (
    pack: LayaV2Pack,
    state: Omit<LayaReviewSession, 'version'>,
): LayaReviewHandoff => {
    const validated = validateLayaExtendedPack(pack);
    const selectedLanguage = langExists(state.selectedLanguage) ? state.selectedLanguage : 'vi-VN';
    const selectedCaseId = validated.cases.some(c =>
        c.id === state.selectedCaseId && c.language === selectedLanguage
    ) ? state.selectedCaseId : '';
    return {
        ...validated,
        reviewSession: {
            version: REVIEW_SESSION_VERSION,
            selectedLanguage,
            selectedCaseId,
            focusedMode: state.focusedMode === true,
            pendingOnly: state.pendingOnly === true,
        },
    };
};

/**
 * Legacy v2 files without reviewSession load normally.
 * Untrusted/invalid UI state is ignored, never executed or trusted as review evidence.
 */
export const restoreLayaReviewHandoff = (input: unknown): LayaReviewRestore => {
    const pack = validateLayaExtendedPack(input);
    const raw = recordOf(input);
    const meta = raw?.reviewSession;
    if (meta === undefined) return { pack, session: null, ignoredSession: false };
    const m = recordOf(meta);
    if (!m || m.version !== REVIEW_SESSION_VERSION || !langExists(m.selectedLanguage)
        || typeof m.selectedCaseId !== 'string'
        || m.selectedCaseId.length > 100
        || typeof m.focusedMode !== 'boolean'
        || typeof m.pendingOnly !== 'boolean'
        || (m.selectedCaseId !== '' && !pack.cases.some(c =>
            c.id === m.selectedCaseId && c.language === m.selectedLanguage
        ))) {
        return { pack, session: null, ignoredSession: true };
    }
    return {
        pack,
        session: {
            version: REVIEW_SESSION_VERSION,
            selectedLanguage: m.selectedLanguage,
            selectedCaseId: m.selectedCaseId,
            focusedMode: m.focusedMode,
            pendingOnly: m.pendingOnly,
        },
        ignoredSession: false,
    };
};

/**
 * Find the next foreign language requiring human review, wrapping without
 * falsely implying that any written translation has been meaning-checked.
 */
export const findNextPendingLayaLanguage = (
    pack: LayaV2Pack,
    current: TrainingLanguageCode,
): TrainingLanguageCode | null => {
    const languages = CURRENT_SITE_TRAINING_LANGUAGE_CODES.filter(
        code => code !== 'ko-KR',
    );
    const start = languages.indexOf(current);
    for (let offset = 1; offset <= languages.length; offset++) {
        const index = ((start < 0 ? -1 : start) + offset) % languages.length;
        const target = languages[index];
        if (pack.cases.some(c =>
            c.language === target && c.translationReview === 'pending'
        )) return target;
    }
    return null;
};

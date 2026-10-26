import type { TrainingLanguageCode } from './constructionTrainingTranslation';
import type { LayaV2Case, LayaV2Pack } from './layaExtendedSafetyBenchmark';

/** Browser-only view helpers; all source cases remain unchanged and exportable. */
export const getLayaReviewQueue = (
    pack: LayaV2Pack,
    language: TrainingLanguageCode,
    pendingOnly: boolean,
): LayaV2Case[] => pack.cases.filter(item =>
    item.language === language && (!pendingOnly || item.translationReview === 'pending')
);

export const resolveLayaReviewCursor = (
    items: readonly LayaV2Case[],
    requestedId: string,
): { id: string | null; position: number; total: number } => {
    if (items.length === 0) return { id: null, position: 0, total: 0 };
    const found = items.findIndex(item => item.id === requestedId);
    const index = found >= 0 ? found : 0;
    return { id: items[index].id, position: index + 1, total: items.length };
};

export const advanceLayaReviewCursor = (
    items: readonly LayaV2Case[],
    currentId: string,
    direction: -1 | 1,
): string | null => {
    if (!items.length) return null;
    const currentIndex = items.findIndex(item => item.id === currentId);
    const index = currentIndex < 0 ? 0 : Math.max(0, Math.min(items.length - 1, currentIndex + direction));
    return items[index].id;
};

/** Returns the next unfinished case in source order, wrapping inside one language. */
export const findNextUnreviewedLayaCase = (
    pack: LayaV2Pack,
    language: TrainingLanguageCode,
    currentId: string,
): string | null => {
    const all = pack.cases.filter(item => item.language === language);
    const current = all.findIndex(item => item.id === currentId);
    if (current < 0 || !all.length) return null;
    for (let offset = 1; offset <= all.length; offset++) {
        const next = all[(current + offset) % all.length];
        if (next.translationReview === 'pending' && next.id !== currentId) return next.id;
    }
    return null;
};

import { validateLayaExtendedPack, type LayaV2Pack } from './layaExtendedSafetyBenchmark';
import { type LayaReviewRestore, restoreLayaReviewHandoff } from './layaReviewHandoff';
import { CURRENT_SITE_TRAINING_LANGUAGE_CODES, TRAINING_LANGUAGE_LABELS } from './constructionTrainingTranslation';

export interface LayaImportPreview {
    /** How many of the 132 fixed cases differ at least in one review field. */
    changedCases: number;
    existingReviewed: number;
    incomingReviewed: number;
    reviewsLostOnReplace: number;
    reviewsAddedOnReplace: number;
    conflictingReviewedCases: number;
    pendingLanguagesAfter: number;
    changedLanguages: Array<{ code: string; label: string; changed: number }>;
    sameContent: boolean;
    /** No imported record can certify the reviewer or model correctness. */
    reviewProvenanceVerified: false;
}
const reviewFieldsEqual = (
    a: LayaV2Pack['cases'][number], b: LayaV2Pack['cases'][number],
): boolean => a.text === b.text
    && a.translationReview === b.translationReview
    && a.reviewerCode === b.reviewerCode
    && a.reviewedAt === b.reviewedAt;

/** Compares only validated synthetic fixtures, never actual worker information. */
export const compareLayaReviewImport = (
    existingRaw: unknown, incomingRaw: unknown,
): LayaImportPreview => {
    const existing = validateLayaExtendedPack(existingRaw);
    const incoming = validateLayaExtendedPack(incomingRaw);
    const from = new Map(existing.cases.map(item => [item.id, item]));
    let changedCases=0, reviewsLostOnReplace=0, reviewsAddedOnReplace=0, conflictingReviewedCases=0;
    const changed = new Map<string,number>();
    for(const item of incoming.cases){
        const previous=from.get(item.id);
        if(!previous) throw new Error('검수표 비교 기준 ID가 누락됐습니다.');
        if(!reviewFieldsEqual(previous,item)){
            changedCases++;
            changed.set(item.language,(changed.get(item.language)||0)+1);
            if(previous.translationReview==='reviewed' && item.translationReview==='pending') reviewsLostOnReplace++;
            else if(previous.translationReview==='pending' && item.translationReview==='reviewed') reviewsAddedOnReplace++;
            else if(previous.translationReview==='reviewed' && item.translationReview==='reviewed') conflictingReviewedCases++;
        }
    }
    const existingReviewed=existing.cases.filter(x=>x.translationReview==='reviewed').length;
    const incomingReviewed=incoming.cases.filter(x=>x.translationReview==='reviewed').length;
    const pendingLanguagesAfter=CURRENT_SITE_TRAINING_LANGUAGE_CODES.filter(language=>
        language!=='ko-KR' && incoming.cases.some(x=>x.language===language && x.translationReview==='pending')
    ).length;
    return {
        changedCases, existingReviewed, incomingReviewed, reviewsLostOnReplace, reviewsAddedOnReplace,
        conflictingReviewedCases,pendingLanguagesAfter,
        changedLanguages:CURRENT_SITE_TRAINING_LANGUAGE_CODES.filter(code=>changed.has(code))
            .map(code=>({code,label:TRAINING_LANGUAGE_LABELS[code],changed:changed.get(code)!})),
        sameContent:changedCases===0,
        reviewProvenanceVerified:false,
    };
};
export interface StagedLayaReviewImport {
    restored: LayaReviewRestore;
    preview: LayaImportPreview;
}
/** Stage a file for review. This helper deliberately never mutates current state. */
export const stageLayaReviewImport = (
    currentPack: LayaV2Pack, rawFile: unknown,
): StagedLayaReviewImport => {
    const restored=restoreLayaReviewHandoff(rawFile);
    return {restored,preview:compareLayaReviewImport(currentPack,restored.pack)};
};

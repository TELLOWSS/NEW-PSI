import {
    CURRENT_SITE_TRAINING_LANGUAGE_CODES,
    TRAINING_LANGUAGE_LABELS,
    type TrainingLanguageCode,
} from './constructionTrainingTranslation';
import type { EducationPosterTranslation, EducationPosterTranslationMap } from './educationPosterTranslation';
import { getHighGradeRiskShareItems, type TbmEducationDraft } from './tbmEducationStudio';

export type LanguageAuditStatus = 'original' | 'missing' | 'stale' | 'review' | 'format-checked';
export interface LanguageAuditRow {
    code: TrainingLanguageCode;
    label: string;
    status: LanguageAuditStatus;
    issues: string[];
}
export interface LanguageAuditReport {
    rows: LanguageAuditRow[];
    total: number;
    targetLanguages: number;
    formatChecked: number;
    needsAction: number;
    missing: number;
    stale: number;
    semanticReviewRequired: true;
}
export interface LanguageAuditInput {
    draft: TbmEducationDraft;
    sourceText: string;
    savedSourceText: string;
    translatedTexts: Record<string, string>;
    structuredTranslations: EducationPosterTranslationMap;
}

const ALIASES: Partial<Record<TrainingLanguageCode, string[]>> = {
    'ko-KR': ['ko'], 'vi-VN': ['vi'], 'cmn-CN': ['cmn', 'zh', 'zh-CN'],
    'km-KH': ['km'], 'mn-MN': ['mn'], 'th-TH': ['th'], 'my-MM': ['my'],
    'id-ID': ['id'], 'ru-RU': ['ru'], 'uz-UZ': ['uz'], 'kk-KZ': ['kk'],
};
const lookup = <T>(record: Record<string, T>, language: TrainingLanguageCode): T | undefined => {
    for (const key of [language, ...(ALIASES[language] || [])]) {
        if (Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined) return record[key];
    }
    return undefined;
};
const nonblank = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;
const allNonblank = (values: string[]): boolean => values.every(nonblank);

/** Syntactic/structural diagnostics, never a semantic or legal safety determination. */
const inspectStructure = (draft: TbmEducationDraft, item: EducationPosterTranslation): string[] => {
    const issues: string[] = [];
    if (!allNonblank([item.title, item.opening, item.coreMessage, item.closingCommitment])) {
        issues.push('제목·도입·핵심 내용·행동 약속 중 비어 있는 항목이 있습니다.');
    }
    if (item.video.length !== draft.videoScenes.length
        || !item.video.every(scene => allNonblank([scene.title, scene.narration, scene.visualGuide]))) {
        issues.push('영상 장면 수나 제목·내레이션·화면 지시가 원문과 다릅니다.');
    }
    if (item.accident.length !== Math.min(1, draft.accidentCases.length)) {
        issues.push('재해사례 수가 원문과 다릅니다.');
    }
    const highGrade = getHighGradeRiskShareItems(draft.risks);
    if (item.risks.length !== highGrade.length
        || !item.risks.every(risk => allNonblank([risk.risk, risk.action]))) {
        issues.push('상등급 위험 또는 안전조치 항목 수가 원문과 다릅니다.');
    }
    if (item.focus.length !== draft.focusPoints.length || !allNonblank(item.focus)) {
        issues.push('중점관리 항목이 원문과 다릅니다.');
    }
    if (item.notices.length !== draft.notices.length || !allNonblank(item.notices)) {
        issues.push('공지사항 항목이 원문과 다릅니다.');
    }
    if (item.questions.length !== draft.confirmationQuestions.length || !allNonblank(item.questions)) {
        issues.push('이해 확인 질문이 원문과 다릅니다.');
    }
    return issues;
};

export const buildEducationLanguageAudit = (input: LanguageAuditInput): LanguageAuditReport => {
    const rows: LanguageAuditRow[] = CURRENT_SITE_TRAINING_LANGUAGE_CODES.map(code => {
        const label = TRAINING_LANGUAGE_LABELS[code];
        if (code === 'ko-KR') return { code, label, status: 'original', issues: [] };
        const plain = lookup(input.translatedTexts, code);
        const structured = lookup(input.structuredTranslations, code);
        if (!nonblank(plain) && !structured) {
            return { code, label, status: 'missing', issues: ['이 언어 번역이 아직 없습니다.'] };
        }
        if (!input.savedSourceText || input.savedSourceText !== input.sourceText) {
            return { code, label, status: 'stale', issues: ['한국어 원문 변경 후 번역을 갱신하지 않았습니다.'] };
        }
        if (!structured) {
            return {
                code, label, status: 'review',
                issues: ['일반 텍스트 번역입니다. 5단계 및 작업중지 의미를 직접 대조하세요.'],
            };
        }
        const issues = inspectStructure(input.draft, structured);
        return { code, label, status: issues.length ? 'review' : 'format-checked', issues };
    });
    return {
        rows, total: rows.length, targetLanguages: rows.length - 1,
        formatChecked: rows.filter(x => x.status === 'format-checked').length,
        needsAction: rows.filter(x => ['missing', 'stale', 'review'].includes(x.status)).length,
        missing: rows.filter(x => x.status === 'missing').length,
        stale: rows.filter(x => x.status === 'stale').length,
        semanticReviewRequired: true,
    };
};

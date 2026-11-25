import React from 'react';
import type { PsiOcrEvidenceReview } from '../../utils/psiOcrEvidenceReview';

interface PsiOcrEvidenceReviewPanelProps {
    review: PsiOcrEvidenceReview;
    onInspectOriginal: () => void;
    canInspectOriginal: boolean;
}

/** Presentation only: the attached document, OCR transcript and manager edits
 * remain separate. No saving, approval, analysis or external calls. */
export const PsiOcrEvidenceReviewPanel: React.FC<PsiOcrEvidenceReviewPanelProps> = ({
    review,
    onInspectOriginal,
    canInspectOriginal,
}) => (
    <section
        aria-labelledby="psi-ocr-evidence-title"
        data-psi-ocr-evidence={review.attention}
        className="rounded-2xl border border-teal-200 bg-gradient-to-br from-white to-teal-50/60 px-4 py-4 shadow-sm dark:border-teal-800 dark:from-slate-900 dark:to-slate-900 sm:px-5"
    >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black tracking-wider text-teal-700 dark:text-teal-300">OCR · 원본 대조 순서</p>
                <h3 id="psi-ocr-evidence-title" className="mt-1 text-base font-extrabold leading-6 text-slate-900 dark:text-white">
                    {review.headline}
                </h3>
                <p className="mt-2 text-xs leading-6 text-slate-700 dark:text-slate-200">{review.instruction}</p>
            </div>
            {canInspectOriginal && (
                <button
                    type="button"
                    onClick={onInspectOriginal}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-teal-700 bg-teal-700 px-4 py-2 text-sm font-extrabold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
                >
                    원본 사진 대조
                </button>
            )}
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="원본 대조 근거 상태">
            {[
                { label: '원본 이미지', value: review.sourceLabel },
                { label: 'OCR 신뢰 신호', value: review.confidenceLabel },
                { label: '자기규율 5문항', value: review.answersLabel },
                { label: '모국어 안내', value: review.translationLabel },
                { label: '관리자 수정', value: review.editsLabel },
            ].map((item) => (
                <div key={item.label} className="min-w-0 rounded-xl border border-slate-200 bg-white/90 px-3 py-3 dark:border-slate-700 dark:bg-slate-800">
                    <dt className="text-[11px] font-bold text-slate-500 dark:text-slate-300">{item.label}</dt>
                    <dd className="mt-1 break-words text-xs font-extrabold leading-5 text-slate-800 dark:text-slate-100">{item.value}</dd>
                </div>
            ))}
        </dl>
        <p className="mt-3 text-xs font-medium leading-5 text-slate-600 dark:text-slate-300">
            OCR 인식 문장은 원본 사진 자체가 아닙니다. 입력 완료·신뢰도 수치만으로 관리자 승인 또는 작업 재개를 확정하지 않습니다.
        </p>
    </section>
);

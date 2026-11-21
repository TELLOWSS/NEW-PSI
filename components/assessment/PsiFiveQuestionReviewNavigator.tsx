import React, { useMemo } from 'react';
import type { HandwrittenAnswer } from '../../types';
import { buildFiveQuestionReviewItems } from '../../utils/psiFiveQuestionReview';

export interface PsiFiveQuestionReviewNavigatorProps {
    answers: readonly HandwrittenAnswer[];
    onFocusAnswer: (index: number) => void;
}

/**
 * Manager-side navigator for the existing OCR Q1–Q5 source/translation editor.
 * No independent worker submission, persistence, scoring or translation.
 */
export const PsiFiveQuestionReviewNavigator: React.FC<PsiFiveQuestionReviewNavigatorProps> = ({
    answers,
    onFocusAnswer,
}) => {
    const steps = useMemo(() => buildFiveQuestionReviewItems(answers), [answers]);
    const sourceReady = steps.filter((item) => item.state === 'source-only' || item.state === 'comparison-ready').length;
    const comparisonReady = steps.filter((item) => item.state === 'comparison-ready').length;
    return (
        <section
            aria-labelledby="psi-five-question-review-title"
            data-psi-five-question-review="true"
            className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 dark:border-slate-700 dark:bg-slate-900/70 sm:px-5"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[11px] font-bold tracking-wide text-teal-700 dark:text-teal-300">PSI · 자기규율 위험성평가</p>
                    <h3 id="psi-five-question-review-title" className="mt-1 text-base font-extrabold text-slate-900 dark:text-slate-100">5문항 원문 확인 순서</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                        근로자가 작성한 위험작업 → 위험 원인 → 등급과 이유 → 감소대책 → 실천행동의 원문을 순서대로 확인합니다.
                    </p>
                </div>
                <div className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-xs font-semibold tabular-nums text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <span className="block">자필 원문 {sourceReady}/5</span>
                    <span className="mt-1 block">원문·해석 {comparisonReady}/5</span>
                </div>
            </div>
            <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {steps.map((step) => {
                    const canFocus = step.sourceIndex !== null;
                    return (
                        <li key={step.key} className="min-w-0">
                            <button
                                type="button"
                                disabled={!canFocus}
                                onClick={() => {
                                    if (step.sourceIndex !== null) onFocusAnswer(step.sourceIndex);
                                }}
                                data-psi-question-nav={step.key}
                                className="flex min-h-[100px] w-full flex-col items-start rounded-xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm transition-colors hover:border-teal-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                aria-label={`${step.key} ${step.intent} · ${step.stateLabel}${canFocus ? ' · 원문 입력으로 이동' : ' · 원문 기록 없음'}`}
                            >
                                <span className="text-xs font-black text-teal-700 dark:text-teal-300">{step.key}</span>
                                <span className="mt-2 line-clamp-3 text-xs font-bold leading-5">{step.intent}</span>
                                <span className={`mt-auto pt-2 text-[11px] font-semibold ${step.state === 'comparison-ready' ? 'text-teal-700 dark:text-teal-300' : 'text-amber-700 dark:text-amber-300'}`}>
                                    {step.stateLabel}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ol>
            <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
                문항 확인 상태는 저장·관리자 승인 또는 위험 해소를 뜻하지 않습니다. 누락된 문항은 원본 기록지와 대조해 주세요.
                {' '}여기 표시한 문항 안내는 한국어 기준이며 모국어 번역 검수를 대신하지 않습니다.
            </p>
        </section>
    );
};

import React, { useEffect, useRef, useState } from 'react';
import '../styles.css';
import { PSI_FORM_QUESTIONS, type PsiQuestionKey } from '../config/psiFormMaster';
import { prepareL06ClientSubmission } from '../utils/workerRiskSubmissionContractL06';
import {
    checkWorkerRiskDraft,
    emptyWorkerRiskDraft,
    printableWorkerRiskDraft,
    type WorkerRiskDraftGrade,
} from '../utils/workerRiskDraftL06';

/**
 * Unauthenticated, identity-free TRIAL screen only. It is not a server-backed
 * submission form and deliberately never writes to storage or calls an API.
 */
export default function WorkerRiskDraft() {
    const [draft, setDraft] = useState(emptyWorkerRiskDraft);
    const [review, setReview] = useState(false);
    const [step, setStep] = useState(0);
    const [furthestStep, setFurthestStep] = useState(0);
    const [notice, setNotice] = useState('');
    const navigated = useRef(false);
    const status = checkWorkerRiskDraft(draft);
    const rows = printableWorkerRiskDraft(draft);
    const currentQuestion = PSI_FORM_QUESTIONS[step];

    // Focus the new question only after deliberate navigation; never
    // raise the mobile keyboard automatically on the first page load.
    useEffect(() => {
        if (!review && navigated.current) {
            document.getElementById(currentQuestion.key === 'Q3' ? 'psi-l06-grade' : 'psi-l06-' + currentQuestion.key)?.focus();
        }
    }, [step, review, currentQuestion.key]);

    const goToStep = (index: number) => {
        navigated.current = true;
        setStep(index);
        setReview(false);
        setNotice('');
    };

    const updateAnswer = (key: PsiQuestionKey, value: string) => {
        setDraft(previous => ({
            ...previous,
            answers: { ...previous.answers, [key]: value.slice(0, 500) },
        }));
        setReview(false);
        setNotice('');
    };
    const openReview = () => {
        if (!status.readyForReview) {
            const missingIndex = PSI_FORM_QUESTIONS.findIndex(question => question.key === status.missing[0]);
            goToStep(Math.max(0, missingIndex));
            setNotice('작성하지 않은 문항을 확인해 주세요: ' + status.missing.join(', '));
            return;
        }
        // Apply the same source-text validation expected at a future trusted
        // server boundary. This only opens a local preview; no request is sent.
        const prepared = prepareL06ClientSubmission(draft, 'ko');
        if (!prepared.ok) {
            setNotice('작성 내용을 다시 확인해 주세요. 제출 또는 서버 저장은 진행되지 않았습니다.');
            return;
        }
        setReview(true);
        setNotice('작성 내용만 확인합니다. 아직 제출되거나 저장된 기록이 아닙니다.');
    };
    const nextStep = () => {
        if (status.missing.includes(currentQuestion.key)) {
            setNotice(currentQuestion.key + ' 문항을 먼저 작성해 주세요. 입력 내용은 화면 이동 중에만 유지됩니다.');
            return;
        }
        if (step === PSI_FORM_QUESTIONS.length - 1) {
            openReview();
            return;
        }
        const next = step + 1;
        setFurthestStep(previous => Math.max(previous, next));
        goToStep(next);
    };
    const reset = () => {
        setDraft(emptyWorkerRiskDraft());
        setStep(0);
        setFurthestStep(0);
        setReview(false);
        navigated.current = false;
        setNotice('작성 내용을 초기화했습니다. 복구할 수 없습니다.');
    };

    return (
        <main className="psi-l06-worker-draft min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:py-10" data-testid="worker-risk-draft-l06">
            <div className="psi-l06-page-shell mx-auto max-w-2xl">
                <header className="psi-l06-screen-header mb-5 rounded-3xl bg-slate-900 p-6 text-white">
                    <p className="text-xs font-black tracking-wide text-teal-200">PSI · Q1~Q5</p>
                    <h1 className="mt-2 text-2xl font-black sm:text-3xl">작업 전 위험성평가 직접 작성 연습</h1>
                    <p className="mt-3 text-sm leading-6 text-slate-200">
                        내가 할 작업의 위험과 감소대책을 5문항으로 작성해 보세요.
                        이 화면은 한국어 입력 시범이며 정식 근로자 제출·서명·교육 이수·관리자 승인 화면이 아닙니다.
                    </p>
                </header>
                <div className="psi-l06-screen-note mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950" role="note">
                    <strong>저장·제출 기능 없음</strong> — 이름, 생년월일, 전화번호 등 개인정보를 입력하지 마세요.
                    작성한 내용은 이 화면에만 임시 표시되며 새로고침·이동 시 사라집니다.
                    작업허가·작업재개 판단과 무관합니다.
                </div>
                <section aria-label="5단계 작성 현황" className="psi-l06-progress-screen mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-bold text-slate-700">작성 진행 · {review ? '전체 검토' : `${step + 1}단계 / 5단계`}</span>
                        <output aria-live="polite" data-testid="l06-progress" className="font-black tabular-nums text-teal-800">{status.completedCount} / 5문항</output>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar"
                        aria-valuemin={0} aria-valuemax={5} aria-valuenow={status.completedCount} aria-label="작성 완료 문항 수">
                        <div className="h-full rounded-full bg-teal-600" style={{ width: `${status.completedCount * 20}%` }} />
                    </div>
                    {!review && (
                        <nav aria-label="문항 이동" className="mt-4 grid grid-cols-5 gap-2">
                            {PSI_FORM_QUESTIONS.map((question, index) => (
                                <button key={question.key} type="button" onClick={() => goToStep(index)}
                                    disabled={index > furthestStep}
                                    aria-current={index === step ? 'step' : undefined}
                                    aria-label={`${question.key} ${index + 1}단계 ${index > furthestStep ? '미도달' : index === step ? '현재 문항' : '이동'}`}
                                    className={`min-h-11 rounded-xl border text-sm font-extrabold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${index === step
                                        ? 'border-indigo-700 bg-indigo-700 text-white'
                                        : index > furthestStep
                                            ? 'border-slate-100 bg-slate-50 text-slate-400'
                                            : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-400'}`}>
                                    {question.key}
                                </button>
                            ))}
                        </nav>
                    )}
                </section>
                {!review && (
                    <section className="psi-l06-incomplete-print-warning hidden" aria-label="작성 중 인쇄 안내">
                        <h2>작성 중인 연습 기록은 인쇄할 수 없습니다.</h2>
                        <p>Q1~Q5 전체 문항을 작성하고 '작성 내용 확인' 화면에서 인쇄해 주세요.</p>
                        <p>이 화면은 정식 제출이 아닙니다. 제출·접수·안전조치 완료·교육 이수 증빙으로 사용할 수 없습니다.</p>
                    </section>
                )}
                {!review ? (
                    <form onSubmit={event => { event.preventDefault(); nextStep(); }} className="psi-l06-edit-form space-y-4" noValidate>
                        {PSI_FORM_QUESTIONS.filter((_, index) => index === step).map(question => (
                            <fieldset key={question.key} className="rounded-2xl border border-slate-200 bg-white p-5">
                                <legend className="px-1 text-lg font-black">{question.key} · {question.workerIntent}</legend>
                                {question.key === 'Q3' ? (
                                    <>
                                        <label htmlFor="psi-l06-grade" className="mt-3 block text-sm font-bold">내가 판단하는 위험수준</label>
                                        <select id="psi-l06-grade" value={draft.grade} onChange={event => {
                                            const grade = event.target.value as WorkerRiskDraftGrade;
                                            setDraft(previous => ({ ...previous, grade, answers: { ...previous.answers, Q3: grade } }));
                                            setReview(false);
                                        }} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base" required>
                                            <option value="">위험수준 선택</option>
                                            <option value="상">상 · 매우 위험하다고 느낍니다</option>
                                            <option value="중">중 · 주의가 필요합니다</option>
                                            <option value="하">하 · 상대적으로 낮습니다</option>
                                        </select>
                                        <label htmlFor="psi-l06-grade-reason" className="mt-4 block text-sm font-bold">그렇게 생각한 이유 (선택)</label>
                                        <textarea id="psi-l06-grade-reason" rows={2} maxLength={500} value={draft.gradeReason}
                                            onChange={event => setDraft(previous => ({ ...previous, gradeReason: event.target.value.slice(0, 500) }))}
                                            placeholder="어떤 상황에서 특히 위험한지 적어주세요"
                                            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-base" />
                                        <p className="mt-2 text-xs text-slate-500">상·중·하는 근로자 본인의 위험인식입니다. 공식 위험등급이나 작업 허가를 결정하지 않습니다.</p>
                                    </>
                                ) : (
                                    <>
                                        <label htmlFor={'psi-l06-' + question.key} className="mt-2 block text-sm font-medium text-slate-600">근로자 본인의 말로 구체적으로 적어주세요.</label>
                                        <textarea id={'psi-l06-' + question.key} rows={3} maxLength={500} required
                                            value={draft.answers[question.key]} onChange={event => updateAnswer(question.key, event.target.value)}
                                            placeholder={question.key === 'Q1' ? '예: 00층 벽체 거푸집 설치 작업'
                                                : question.key === 'Q2' ? '예: 작업발판 단부에 난간이 없어 추락할 위험'
                                                : question.key === 'Q4' ? '예: 난간을 확인하고 안전대를 적정 고정점에 체결'
                                                : '예: 시작 전에 난간을 확인하고 미설치 시 작업을 중단해 관리자에게 알림'}
                                            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-base leading-6" />
                                        <p className="mt-1 text-right text-xs text-slate-500">{draft.answers[question.key].length}/500</p>
                                    </>
                                )}
                            </fieldset>
                        ))}
                        <div className="flex flex-wrap gap-3 pb-8">
                            {step > 0 && <button type="button" onClick={() => goToStep(step - 1)}
                                className="min-h-12 rounded-xl border border-slate-300 bg-white px-5 font-bold hover:border-indigo-400">이전 문항</button>}
                            <button type="submit" className="min-h-12 flex-1 rounded-xl bg-indigo-700 px-5 font-black text-white hover:bg-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700">
                                {step === 4 ? '작성 내용 확인' : '다음 문항'}
                            </button>
                            <button type="button" onClick={reset} className="min-h-12 rounded-xl border border-slate-300 bg-white px-5 font-bold">전체 초기화</button>
                        </div>
                    </form>
                ) : (
                    <section className="psi-l06-review-print rounded-2xl border border-slate-300 bg-white p-5" aria-label="Q1~Q5 작성 내용 검토">
                        <h2 className="text-xl font-black">내가 작성한 내용 확인</h2>
                        <p className="mt-2 text-sm text-rose-800">작성 검토 화면일 뿐 서버 제출·관리자 확인·현장 조치 완료가 아닙니다.</p>
                        <dl className="mt-4 space-y-4">
                            {rows.map(row => (
                                <div key={row.key} className="border-b border-slate-100 pb-3">
                                    <dt className="text-sm font-black">{row.key} · {row.title}</dt>
                                    <dd className="mt-2 whitespace-pre-wrap break-words text-sm">{row.answer}</dd>
                                </div>
                            ))}
                        </dl>
                        <div className="psi-l06-review-actions mt-5 flex flex-wrap gap-3 print:hidden">
                            <button type="button" onClick={() => goToStep(0)} className="min-h-12 flex-1 rounded-xl border border-slate-300 px-4 font-bold">수정하기</button>
                            <button type="button" onClick={() => window.print()} className="min-h-12 flex-1 rounded-xl bg-slate-800 px-4 font-bold text-white">화면 인쇄</button>
                        </div>
                        <p className="psi-l06-review-disclaimer mt-4 text-xs font-bold text-rose-800">인쇄한 종이도 정식 제출이 아닙니다. 실제 기록 절차는 현장 관리자에게 확인하세요.</p>
                    </section>
                )}
                {notice && <p className="psi-l06-screen-notice mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold" role="status">{notice}</p>}
            </div>
        </main>
    );
}

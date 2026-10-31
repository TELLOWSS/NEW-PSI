import React, { useMemo } from 'react';
import type { WorkerRecord } from '../../types';
import { buildWorkerInterpretationNote } from '../../utils/workerInterpretationNote';
import { FOLLOWUP_STATUS_LABELS, getWorkerRiskFollowupSummary } from '../../utils/workerRiskFollowup';

interface WorkerInterpretationAppendixProps {
    record: WorkerRecord;
}

/**
 * Optional A4 administrator appendix. Reuses stored OCR answers only:
 * no fabricated translations, no automatic conclusion that PPE was worn.
 */
export const WorkerInterpretationAppendix: React.FC<WorkerInterpretationAppendixProps> = ({ record }) => {
    const note = useMemo(() => buildWorkerInterpretationNote(record), [record]);
    const followup = useMemo(() => getWorkerRiskFollowupSummary(record.riskFollowupEvents || []), [record.riskFollowupEvents]);
    const isNonKorean = !/^(?:ko|ko-KR)$/i.test(String(record.language || ''));

    return (
        <div
            data-report-page="true"
            data-worker-interpretation-note="true"
            lang="ko-KR"
            className="bg-white w-[210mm] h-[297mm] relative shadow-2xl overflow-hidden text-slate-900 flex flex-col print:shadow-none print:m-0 print:w-full break-after-page"
            style={{ fontFamily: "'Pretendard', 'Noto Sans KR', 'Noto Sans CJK SC', 'Malgun Gothic', sans-serif" }}
        >
            <div className="absolute inset-0 m-4 border border-slate-200 pointer-events-none" />
            <div className="relative flex h-full flex-col px-[12mm] py-[11mm] gap-3">
                <header className="border-b-2 border-slate-800 pb-3">
                    <p className="text-[10px] font-black tracking-[0.22em] text-indigo-600">NEW-PSI · WORKER INTERPRETATION NOTE</p>
                    <h2 className="mt-1 text-[23px] font-black tracking-tight">근로자 원문 · 현장식 번역 해석노트</h2>
                    <p className="mt-1 text-[10px] text-slate-600">
                        OCR 입력 기록에서 자동 구성한 검토본입니다. 원문은 근로자 서술, 번역은 관리자 확인 대상으로 구분합니다.
                    </p>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-[10px]">
                        <div className="rounded-lg bg-slate-100 px-2 py-1.5"><span className="text-slate-500">근로자</span><p className="font-black">{record.name || '미확인'}</p></div>
                        <div className="rounded-lg bg-slate-100 px-2 py-1.5"><span className="text-slate-500">공종</span><p className="font-black">{record.jobField || '미확인'}</p></div>
                        <div className="rounded-lg bg-slate-100 px-2 py-1.5"><span className="text-slate-500">기록일</span><p className="font-black">{record.date || '미확인'}</p></div>
                        <div className="rounded-lg bg-indigo-50 px-2 py-1.5"><span className="text-indigo-600">원문 / 번역</span><p className="font-black">{note.sourceCount}/5 · {note.translationCount}/5</p></div>
                    </div>
                </header>

                <main className="flex-1 min-h-0 flex flex-col gap-2">
                    {note.rows.map(row => (
                        <section key={row.number} className="rounded-xl border border-slate-200 p-3 flex-1 min-h-0 overflow-hidden" data-interpretation-question={row.number}>
                            <div className="flex justify-between gap-2 items-center border-b border-slate-100 pb-1.5">
                                <h3 className="text-[11.5px] font-black text-slate-900">Q{row.number}. {row.question}</h3>
                                <span className="text-[9px] font-bold text-slate-500">원문 {row.sourceState === 'recorded' ? '기록됨' : '없음'}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mt-2">
                                <div className="rounded-lg bg-slate-50 px-2.5 py-2 min-w-0">
                                    <p className="text-[9px] font-black text-indigo-600">OCR ORIGINAL · {record.language || '언어 미지정'}</p>
                                    <p className="mt-1 text-[11px] font-semibold text-slate-800 whitespace-pre-wrap break-words leading-relaxed">
                                        {row.original || '원문 미입력 · 원본 확인 필요'}
                                    </p>
                                </div>
                                <div className="rounded-lg bg-blue-50 px-2.5 py-2 min-w-0">
                                    <p className="text-[9px] font-black text-blue-700">KOREAN TRANSLATION · 검토용</p>
                                    <p className="mt-1 text-[11px] font-semibold text-slate-800 whitespace-pre-wrap break-words leading-relaxed">
                                        {row.korean || '번역 미입력 · 번역 및 검수 필요'}
                                    </p>
                                </div>
                            </div>
                            {row.number === 3 && (
                                <p className="mt-1.5 text-[8.5px] text-amber-800">※ 자필 위험 표현은 공식 위험등급과 자동 동일시하지 않습니다.</p>
                            )}
                            {row.number === 4 || row.number === 5 ? (
                                <p className="mt-1.5 text-[8.5px] text-amber-800">※ 작성된 예방·실천 의향은 실제 실행 완료 확인이 아닙니다.</p>
                            ) : null}
                        </section>
                    ))}
                </main>

                <footer className="shrink-0 space-y-2">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <div className="flex justify-between items-center gap-2">
                            <h3 className="text-[11px] font-black text-amber-900">현장 관리자 확인 · 환류 기록</h3>
                            <span className="text-[9px] font-black text-amber-800">{followup.total ? `진행 ${followup.unresolved} · 완료확인 ${followup.completed} · 기한초과 ${followup.overdue}` : '조치상태: 확인 전'}</span>
                        </div>
                        <p className="mt-1 text-[9px] text-amber-950 leading-relaxed">
                            확인할 사항: Q1 작업구역·고소작업 조건 / Q2 위험별 통제 상태 / Q4 보호구 착용·체결 / Q5 작업 전 확인 및 소통
                        </p>
                        {followup.total ? (
                            <div className="mt-1 text-[8.6px] text-amber-900 space-y-0.5">
                                {followup.cases.slice(0, 3).map(item => <p key={item.caseId}>Q{item.opened.questionNumber} · {FOLLOWUP_STATUS_LABELS[item.latest.status]} · 담당 {item.latest.owner} · 기한 {item.latest.dueDate || '미지정'}</p>)}
                                {followup.total > 3 && <p>나머지 {followup.total - 3}건은 조치관리 부록을 참조하세요.</p>}
                            </div>
                        ) : (
                            <p className="mt-1 text-[9px] text-amber-900">□ 확인 전　□ 임시통제 중　□ 조치 예정　□ 현장 확인 완료 (완료 증빙 필요)</p>
                        )}
                        <p className="mt-1 text-[9px] text-slate-700">담당자: __________　확인일: __________　기한: __________　증빙 위치: __________________</p>
                    </div>
                    <div className="flex justify-between gap-3 border-t border-slate-200 pt-2">
                        <p className="text-[8px] text-slate-500 max-w-[143mm]">
                            {isNonKorean ? '외국어 원문은 모국어 자연스러움·의미 정확성을 별도 검수해야 합니다. ' : ''}
                            관리 기록 승인 표시: {note.managerRecordApproved ? '있음 (번역 검수 인증은 아님)' : '미확인'}.
                            이 문서는 점수 재산정·법 위반 판정·조치 완료 인증 문서가 아닙니다.
                        </p>
                        <p className="text-[8px] font-black text-slate-500 text-right">NEW-PSI · 근로자 해석노트<br />관리자 확인용 보조 문서</p>
                    </div>
                </footer>
            </div>
        </div>
    );
};

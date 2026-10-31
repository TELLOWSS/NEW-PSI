import React, { useMemo } from 'react';
import type { WorkerRecord } from '../../types';
import { FOLLOWUP_STATUS_LABELS, getWorkerRiskFollowupSummary } from '../../utils/workerRiskFollowup';

interface WorkerRiskFollowupAppendixProps { record: WorkerRecord }

const chunks = <T,>(items: T[], size: number): T[][] => {
    const output: T[][] = [];
    for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
    return output;
};

export const WorkerRiskFollowupAppendix: React.FC<WorkerRiskFollowupAppendixProps> = ({ record }) => {
    const summary = useMemo(() => getWorkerRiskFollowupSummary(record.riskFollowupEvents || []), [record.riskFollowupEvents]);
    if (!summary.total) return null;
    const pages = chunks(summary.cases, 5);

    return (
        <>
            {pages.map((cases, pageIndex) => (
                <div key={pageIndex} data-report-page="true" data-worker-risk-followup-appendix="true" lang="ko-KR"
                    className="bg-white w-[210mm] h-[297mm] relative shadow-2xl overflow-hidden text-slate-900 print:shadow-none print:m-0 print:w-full break-after-page"
                    style={{ fontFamily: "'Pretendard', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}>
                    <div className="absolute inset-0 m-4 border border-slate-200 pointer-events-none" />
                    <div className="relative h-full flex flex-col gap-3 px-[12mm] py-[11mm]">
                        <header className="border-b-2 border-slate-800 pb-3">
                            <p className="text-[10px] font-black tracking-[0.2em] text-indigo-600">NEW-PSI · FIELD SAFETY FOLLOW-UP</p>
                            <h2 className="mt-1 text-[22px] font-black">현장 조치·재확인 환류 기록</h2>
                            <p className="mt-1 text-[10px] text-slate-600">{record.name || '근로자 미확인'} · {record.jobField || '공종 미확인'} · 위험성평가 {record.date || '기록일 미확인'} · {pageIndex+1}/{pages.length}쪽</p>
                            <div className="mt-3 grid grid-cols-4 gap-2">
                                {[
                                    ['등록', summary.total+'건'],
                                    ['진행·미완료', summary.unresolved+'건'],
                                    ['기한 초과', summary.overdue+'건'],
                                    ['완료 증빙 확인', summary.completed+'건'],
                                ].map(([label,value])=><div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
                                    <p className="text-[9px] text-slate-600">{label}</p>
                                    <p className="text-base font-black text-slate-900">{value}</p>
                                </div>)}
                            </div>
                        </header>
                        <main className="min-h-0 flex-1 flex flex-col gap-2">
                            {cases.map(item => {
                                const last = item.latest;
                                return (
                                    <section key={item.caseId} className="rounded-xl border border-slate-200 p-3 flex-1 min-h-0 overflow-hidden">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <h3 className="text-[11px] font-black text-slate-900">Q{item.opened.questionNumber} · {FOLLOWUP_STATUS_LABELS[last.status]}</h3>
                                            <span className="text-[8px] font-bold text-slate-500">누적 {item.events.length}회 · 마지막 기록 {last.timestamp.slice(0,10)}</span>
                                        </div>
                                        <div className="mt-2 grid grid-cols-[1fr_28mm] gap-2">
                                            <div className="space-y-1 text-[9px] text-slate-700">
                                                <p><strong>최신 확인 내용: </strong>{last.actionDetail}</p>
                                                <p><strong>담당자/기한: </strong>{last.owner} / {last.dueDate || '미지정'} · 기록자 {last.actor}</p>
                                                {last.interimControl && <p><strong>임시통제: </strong>{last.interimControl}</p>}
                                                {last.evidenceNote && <p><strong>증빙 설명: </strong>{last.evidenceNote}</p>}
                                                {last.evidenceReference && <p><strong>증빙 위치: </strong>{last.evidenceReference}</p>}
                                                {last.verifiedBy && <p><strong>확인자: </strong>{last.verifiedBy}</p>}
                                            </div>
                                            <div className="rounded-lg border border-slate-100 bg-slate-50 min-h-[22mm] flex items-center justify-center overflow-hidden">
                                                {last.evidencePhoto ? <img src={last.evidencePhoto} className="max-h-[29mm] max-w-full object-contain" alt={'Q'+last.questionNumber+' 조치 증빙 사진'} /> :
                                                    <span className="text-center text-[8px] font-bold text-slate-400">사진 없음<br/>증빙 참조 확인</span>}
                                            </div>
                                        </div>
                                        {item.events.length > 1 && <p className="mt-2 border-t border-slate-100 pt-1 text-[8px] text-slate-500 break-words">
                                            이전 이력: {item.events.slice(0,-1).slice(-3).map(event =>
                                                event.timestamp.slice(0,10)+' '+FOLLOWUP_STATUS_LABELS[event.status]).join(' → ')}
                                            {item.events.length > 4 ? ' 외 추가 이력 있음' : ''}
                                        </p>}
                                    </section>
                                );
                            })}
                        </main>
                        <footer className="shrink-0 space-y-1.5 border-t border-slate-200 pt-2">
                            <p className="text-[9px] font-black text-amber-800">주의: 미완료 건은 조치계획·임시통제와 현장 확인이 필요합니다. 본 PDF는 작업재개 허가서가 아닙니다.</p>
                            <p className="text-[8px] text-slate-600">최신 상태만 요약 표시하며 모든 이벤트·이전 증빙은 PSI 원기록에 보존됩니다. 완료 기록은 관리자 입력 및 확인에 따른 것으로 시스템이 현장 안전을 보증하지 않습니다.</p>
                            <p className="text-right text-[8px] text-slate-500">PSI Field Feedback · 증빙·추적 관리본</p>
                        </footer>
                    </div>
                </div>
            ))}
        </>
    );
};

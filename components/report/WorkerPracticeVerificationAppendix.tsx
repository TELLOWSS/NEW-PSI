import React, { useMemo } from 'react';
import type { WorkerRecord, WorkerPracticeVerificationEvent } from '../../types';
import { PRACTICE_RESULT_LABELS, PRACTICE_STAGE_LABELS } from '../../utils/practiceVerification';

/**
 * Manager-only A4 appendix for separately verified practice observations.
 * This does not certify training attendance, rule compliance, or work resumption.
 */
export const WorkerPracticeVerificationAppendix: React.FC<{ record: WorkerRecord }> = ({ record }) => {
    const pages = useMemo(() => {
        const items = [...(record.practiceVerificationEvents || [])]
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
        const out: WorkerPracticeVerificationEvent[][] = [];
        for (let index = 0; index < items.length; index += 6) out.push(items.slice(index, index + 6));
        return out;
    }, [record.practiceVerificationEvents]);

    if (!pages.length) return null;
    const itemCount = record.practiceVerificationEvents?.length || 0;

    return <>{pages.map((events, page) => (
        <div key={page} data-report-page="true" data-practice-verification-appendix="true"
            lang="ko-KR" className="relative flex h-[297mm] w-[210mm] flex-col overflow-hidden bg-white px-[12mm] py-[11mm] text-slate-900 shadow-2xl print:m-0 print:w-full print:shadow-none break-after-page"
            style={{ fontFamily: "'Pretendard', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}>
            <div className="absolute inset-4 border border-slate-200 pointer-events-none" />
            <header className="relative shrink-0 border-b-2 border-slate-800 pb-3">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">NEW-PSI · VERIFIED PRACTICE TRAIL</p>
                <h2 className="mt-1 text-[22px] font-black">교육 후 실천 확인·재점검 이력</h2>
                <p className="mt-1 text-[10px] text-slate-600">
                    {record.name || '근로자 미확인'} · {record.jobField || '공종 미확인'} · 평가기록 {record.date || '일자 미확인'} · {page + 1}/{pages.length}쪽
                </p>
                <p className="mt-1 text-[9px] text-slate-500">개별 확인 이력 {itemCount}건. 교육 전달과 이해 확인, 안전행동 관찰은 서로 다른 증빙입니다.</p>
            </header>
            <main className="relative flex min-h-0 flex-1 flex-col gap-2 py-3">
                {events.map((event, index) => (
                    <article key={event.id || index} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1">
                            <h3 className="text-[11px] font-black">
                                Q{event.questionNumber} · {PRACTICE_STAGE_LABELS[event.stage] || event.stage} / {PRACTICE_RESULT_LABELS[event.result] || event.result}
                            </h3>
                            <span className="text-[8px] font-bold text-slate-500">{event.timestamp.slice(0, 19).replace('T', ' ')} UTC</span>
                        </div>
                        <div className="mt-1.5 space-y-1 text-[9px] leading-[1.5] text-slate-700">
                            <p><strong>확인 관리자: </strong>{event.actor}</p>
                            <p className="break-words line-clamp-3"><strong>현장 확인 근거: </strong>{event.evidenceNote}</p>
                            {event.sessionReference && <p className="break-all"><strong>교육/이해 확인 근거: </strong>{event.sessionReference}</p>}
                            {event.evidenceReference && <p className="break-all"><strong>현장 관찰 증빙: </strong>{event.evidenceReference}</p>}
                            {event.nextCheckDueDate && <p><strong>재점검 기한: </strong>{event.nextCheckDueDate}</p>}
                            {event.relatedFollowupCaseId && <p className="break-all"><strong>연결 현장 조치: </strong>{event.relatedFollowupCaseId}</p>}
                        </div>
                    </article>
                ))}
            </main>
            <footer className="relative shrink-0 space-y-1.5 border-t border-slate-200 pt-2">
                <p className="text-[9px] font-black text-amber-800">
                    교육 참석·이해 확인은 보호구 착용이나 시정조치 완료를 증명하지 않습니다.
                </p>
                <p className="text-[8px] text-slate-600">
                    관찰 기록은 해당 시점의 확인 결과이며 안전성 보증 또는 작업재개 허가가 아닙니다.
                    세부 증빙·전체 텍스트 및 원본은 PSI 기록에서 별도 확인해야 합니다.
                </p>
                <p className="text-right text-[8px] text-slate-500">PSI Manager-only Practice Verification · A4</p>
            </footer>
        </div>
    ))}</>;
};

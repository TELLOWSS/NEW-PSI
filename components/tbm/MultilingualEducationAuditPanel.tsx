import React, { useState } from 'react';
import type { LanguageAuditReport, LanguageAuditRow, LanguageAuditStatus } from '../../utils/multilingualEducationAudit';

interface Props {
    audit: LanguageAuditReport;
    onInspect: (row: LanguageAuditRow) => void;
    onRegenerate: () => void;
}

const STATUS: Record<LanguageAuditStatus, { label: string; theme: string }> = {
    original: { label: '원문', theme: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-white' },
    missing: { label: '번역 필요', theme: 'bg-rose-100 text-rose-800 dark:bg-rose-600/20 dark:text-rose-200' },
    stale: { label: '재번역', theme: 'bg-amber-100 text-amber-900 dark:bg-amber-600/20 dark:text-amber-200' },
    review: { label: '대조 필요', theme: 'bg-orange-100 text-orange-900 dark:bg-orange-600/20 dark:text-orange-200' },
    'format-checked': { label: '형식 확인', theme: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-600/20 dark:text-emerald-200' },
};

/** This checks translation presence and structural omissions, not linguistic quality. */
export const MultilingualEducationAuditPanel: React.FC<Props> = ({ audit, onInspect, onRegenerate }) => {
    const [issuesOnly, setIssuesOnly] = useState(false);
    const visible = issuesOnly
        ? audit.rows.filter(row => ['missing', 'stale', 'review'].includes(row.status))
        : audit.rows;
    return (
        <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 no-print dark:border-slate-700 dark:bg-slate-900 sm:p-5" aria-label="11개 언어 교육자료 품질 점검">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[11px] font-black tracking-widest text-blue-700 dark:text-blue-300">PSI · LANGUAGE SAFETY REVIEW</p>
                    <h3 className="mt-1 text-lg font-black text-slate-950 dark:text-white">11개 언어 교육자료 확인</h3>
                    <p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">
                        한국어 원문 1개와 현장 외국어 10개를 검사합니다. 번역 존재·원문 갱신·항목 누락만 확인합니다.
                        외국어 의미의 정확성이나 실제 교육 완료는 자동 판정하지 않습니다.
                    </p>
                </div>
                <button type="button" onClick={onRegenerate}
                    className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white hover:bg-blue-800">
                    다국어 갱신
                </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2" aria-label="다국어 현황">
                <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-500/10">
                    <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-200">형식 확인</p>
                    <p className="mt-1 text-xl font-black tabular-nums text-emerald-900 dark:text-emerald-200">{audit.formatChecked} / {audit.targetLanguages}</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-500/10">
                    <p className="text-[11px] font-bold text-amber-800 dark:text-amber-200">확인 필요</p>
                    <p className="mt-1 text-xl font-black tabular-nums text-amber-900 dark:text-amber-200">{audit.needsAction}</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-200">누락 / 재번역</p>
                    <p className="mt-1 text-xl font-black tabular-nums text-slate-900 dark:text-white">{audit.missing} / {audit.stale}</p>
                </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">{issuesOnly ? '조치가 필요한 언어' : '전체 현장 언어'} · {visible.length}개</p>
                <button type="button" onClick={() => setIssuesOnly(previous => !previous)}
                    className="min-h-10 rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 dark:border-slate-600 dark:text-white">
                    {issuesOnly ? '전체 11개 보기' : '확인 필요만 보기'}
                </button>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map(row => (
                    <button key={row.code} type="button" onClick={() => onInspect(row)}
                        aria-label={[row.label, STATUS[row.status].label, ...row.issues].join(' ')}
                        className="min-h-16 rounded-xl border border-slate-200 px-3 py-3 text-left hover:border-blue-500 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-slate-700 dark:hover:bg-slate-800">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-black text-slate-950 dark:text-white">{row.label}</span>
                            <span className={['rounded-full px-2 py-1 text-[10px] font-black', STATUS[row.status].theme].join(' ')}>{STATUS[row.status].label}</span>
                        </div>
                        <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-600 dark:text-slate-300">
                            {row.issues[0] || (row.status === 'original' ? '한국어 원문' : '항목 형식 확인 · 의미 대조 필요')}
                        </p>
                    </button>
                ))}
            </div>
            <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-bold leading-5 text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                형식 확인은 번역 품질 합격이 아닙니다. 추락·협착·낙하, 즉시 작업중지, 금지,
                보호구 착용 등의 명령과 조치 내용을 현장 통역자·관리자가 원문과 대조한 후 교육에 사용하세요.
                이 검사는 브라우저에서만 실행되며 새 AI·서버 함수 호출이 없습니다.
            </p>
        </section>
    );
};

export default MultilingualEducationAuditPanel;

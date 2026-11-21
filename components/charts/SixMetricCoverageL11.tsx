import React from 'react';
import type { ScoreMetricEvidence } from '../../utils/scoreMetricEvidence';

/** Read-only coverage table for the existing six scored fields. It is not
 * the separately proposed six worker-safety perception perspectives. */
export default function SixMetricCoverageL11({rows,period}:{
    rows:readonly ScoreMetricEvidence[];period:string;
}){
    const reviewed = rows.filter(row => row.valid > 0).length;
    return <section data-monthly-guidance="l11-six-metric-evidence"
        aria-label="6대 평가점수 표본 근거"
        className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm dark:border-indigo-800 dark:bg-slate-900 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
                <p className="psi-eyebrow text-indigo-700 dark:text-indigo-300">PSI · SCORE EVIDENCE</p>
                <h3 className="psi-section-title mt-1 dark:text-white">6개 평가점수 · 표본과 결측 근거</h3>
                <p className="mt-2 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">
                    현재 선택한 {period} 기록의 항목별 유효 평균입니다. 항목마다 유효 분모가 다르며 미기록·오류를 임의로 0점 처리하지 않습니다.
                </p>
            </div>
            <span className="shrink-0 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-900 dark:border-slate-600 dark:bg-slate-800 dark:text-indigo-200">{reviewed}/6 항목 유효</span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map(row=><article key={row.key} data-metric-key={row.key} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">{row.label}</h4>
                    <strong className="shrink-0 text-sm tabular-nums text-indigo-800 dark:text-indigo-300">{row.average === null?'산출 불가':`${row.average} / ${row.max}`}</strong>
                </div>
                {row.average === null
                    ? <div className="mt-3 h-2 rounded-full border border-dashed border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900" aria-label="유효 점수 없음"/>
                    : <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="meter"
                        aria-label={`${row.label} 평균 만점 대비`} aria-valuemin={0} aria-valuemax={100}
                        aria-valuenow={Math.max(0,Math.min(100,Math.round(row.average/row.max*100)))}>
                        <div className="h-full rounded-full bg-indigo-600 dark:bg-indigo-400" style={{width:`${Math.max(0,Math.min(100,row.average/row.max*100))}%`}}/>
                    </div>}
                <p className="mt-2 text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                    유효 {row.valid}/{row.total} · 결측 {row.missing} · 제외 {row.excluded}
                </p>
                {row.key==='repeatViolationPenalty'&&<p className="mt-1 text-xs font-medium text-amber-900 dark:text-amber-300">감점 크기: 높을수록 감점이 큽니다. 0은 취약한 점수가 아닙니다.</p>}
            </article>)}
        </div>
        <p className="mt-3 text-xs font-medium leading-6 text-slate-600 dark:text-slate-300">
            이는 기존 6개 평가점수 항목입니다. 기획상의 위험인지도·교육이해도·실천참여도·보호구/수칙·소통/보고·작업중지 감수성 관점과 동일한 검증 지표가 아닙니다.
            작성 점수의 변화·언급 횟수 감소를 사고 감소, 실제 보호조치 완료 또는 작업 재개 승인으로 해석하지 않습니다.
        </p>
    </section>;
}

import React from 'react';
import type { Page } from '../../types';
import type { EducationReturnEvidenceOverview } from '../../utils/educationReturnEvidenceOverview';

const tones={
    review: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-600/30 dark:bg-amber-500/10 dark:text-amber-200',
    recorded: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-600/30 dark:bg-emerald-500/10 dark:text-emerald-200',
    unknown: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
} as const;

export default function EducationReturnEvidencePanel({
    overview,onNavigate,
}:{overview:EducationReturnEvidenceOverview;onNavigate:(page:Page)=>void}){
    return <section
        data-education-return="evidence-loop-l10"
        aria-labelledby="education-return-evidence-heading"
        className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6"
    >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
                <p className="psi-eyebrow">PSI · MONTHLY EVIDENCE LOOP</p>
                <h3 id="education-return-evidence-heading" className="mt-1 text-lg font-extrabold tracking-tight text-slate-950 dark:text-white">
                    다음 달 교육까지, 무엇을 확인해야 하나요?
                </h3>
                <p className="mt-2 max-w-3xl text-xs font-semibold leading-6 text-slate-600 dark:text-slate-300">
                    {overview.sourceScope}. 자료 제작, 번역, 교육 전달, 이해 확인, 작업 중 재점검을 서로 다른 근거로 관리합니다.
                </p>
            </div>
            <span className="w-fit rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">기록 현황 · 배포 승인 아님</span>
        </div>
        <ol className="mt-4 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3" aria-label="교육 환류 검증 단계">
            {overview.steps.map(stage=><li key={stage.key} data-return-stage={stage.key}
                className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-slate-50/40 px-4 py-4 dark:border-slate-700 dark:bg-slate-800/40">
                <h4 className="text-sm font-black text-slate-900 dark:text-white">{stage.title}</h4>
                <p className={['mt-2 w-fit max-w-full break-words rounded-lg border px-2.5 py-1.5 text-xs font-extrabold leading-5',tones[stage.tone]].join(' ')}>{stage.status}</p>
                <p className="mt-3 flex-1 text-xs font-medium leading-6 text-slate-700 dark:text-slate-200">{stage.detail}</p>
                {stage.destination&&stage.actionLabel&&<button
                    type="button"
                    className="mt-3 min-h-11 w-fit rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-extrabold text-blue-800 transition-colors hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-600 dark:bg-slate-900 dark:text-blue-200"
                    onClick={()=>onNavigate(stage.destination as Page)}
                >{stage.actionLabel}</button>}
            </li>)}
        </ol>
        <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold leading-6 text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">{overview.risksNote}</p>
        <p className="mt-3 text-xs leading-6 text-slate-500 dark:text-slate-300">
            표시는 현재 앱에 로드된 기록에만 근거합니다. 번역 형식 검사·기기 내 출력물 수동 확인은 원어민 의미 검증, 교육 이수, 서버 승인 또는 현장 안전 확인을 대체하지 않습니다.
        </p>
    </section>;
}

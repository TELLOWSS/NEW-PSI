import React from 'react';
import type { buildLocalNextCheckPrompt } from '../../lib/inspector/localNextCheckPrompt.mjs';

type Prompt = ReturnType<typeof buildLocalNextCheckPrompt>;

export default function LocalNextCheckPanel({prompt,busy,onOpen}:{
    prompt:Prompt;
    busy:boolean;
    onOpen:(recordId:string,actionId:string)=>void;
}) {
    const canNavigate=Boolean(prompt.target?.recordId);
    return <section
        aria-label="지연 조치 다음 확인"
        data-psi-l09-next-check={prompt.target?'target':'empty'}
        className="rounded-xl border border-teal-300 bg-teal-50 p-3 text-slate-900 shadow-sm dark:border-teal-700 dark:bg-slate-800 dark:text-slate-100"
    >
        <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
                <span className="text-xs font-bold tracking-wide text-teal-700 dark:text-teal-300">PSI · 다음 현장 확인</span>
                <h5 className="mt-1 text-base font-black leading-6">{prompt.headline}</h5>
                <p className="mt-2 text-sm leading-6">{prompt.guidance}</p>
            </div>
            <div className="shrink-0 rounded-lg border border-teal-200 bg-white px-3 py-2 text-xs font-semibold tabular-nums dark:border-slate-600 dark:bg-slate-900">
                미확인·진행 {prompt.openCount}건
                <span className="mt-1 block">확인 완료 입력 {prompt.recordedVerified}건</span>
            </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-lg border border-teal-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900">{prompt.category}</span>
            {prompt.target&&<span className="rounded-lg border border-teal-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900">{prompt.dateLabel}</span>}
            {prompt.target&&<span className="rounded-lg border border-teal-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900">{prompt.statusLabel}</span>}
        </div>
        {prompt.target&&<p className="mt-3 break-words text-sm font-semibold">해당 조치: {prompt.targetLabel}</p>}
        {!!prompt.checklist.length&&<ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
            {prompt.checklist.map(item=><li key={item}>{item}</li>)}
        </ul>}
        {canNavigate&&<button
            type="button"
            className="si-btn mt-3 min-h-11"
            disabled={busy}
            onClick={()=>{if(prompt.target?.recordId)onOpen(prompt.target.recordId,prompt.target.actionId);}}
        >
            {prompt.action} · 해당 재점검 입력 열기
        </button>}
        <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
            이 안내는 기기에 저장된 기록의 관리 순서입니다. 실제 현장 위험 우선순위, 담당자 통보, 임시조치 이행, 작업 완료·재개 승인을 뜻하지 않습니다.
        </p>
    </section>;
}

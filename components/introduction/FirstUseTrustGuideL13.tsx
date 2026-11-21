import React, {useState} from 'react';
import type {Page} from '../../types';
import {INTRO_SCOPE_WARNINGS, INTRO_VERIFIED_PATH, getIntroPathStep, type IntroPathKey} from '../../utils/introTrustFlowL13';

/** A route guide, not an automatic completion tracker or a simulated job. */
export default function FirstUseTrustGuideL13({onNavigate}: {onNavigate:(page:Page)=>void}){
  const [selected,setSelected]=useState<IntroPathKey>('original');
  const step=getIntroPathStep(selected);
  return (
    <section data-psi-onboarding-l13="true" aria-labelledby="psi-onboarding-l13-heading"
      className="rounded-2xl border border-sky-200 bg-gradient-to-r from-white via-sky-50/70 to-white p-3.5 shadow-sm dark:border-sky-900 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-[10px] font-extrabold tracking-[0.16em] text-sky-700 dark:text-sky-300">NEW-PSI · FIRST REAL ACTION</p>
          <h2 id="psi-onboarding-l13-heading" className="mt-1 text-lg font-black leading-snug text-slate-950 dark:text-white sm:text-xl">처음 사용하는 관리자라면, 이 순서부터</h2>
          <p className="mt-1 text-xs font-medium leading-5 text-slate-600 dark:text-slate-300">기능 소개 대신 실제 연결된 메뉴를 바로 열 수 있습니다. 아래 단계는 <strong>이용 안내</strong>이며, 실행·검수·이수 완료를 자동 판정하지 않습니다.</p>
        </div>
        <span className="w-fit shrink-0 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-sky-800 dark:border-sky-700 dark:bg-slate-800 dark:text-sky-200">실제 메뉴 연결 · 자동 완료 아님</span>
      </div>
      <div role="tablist" aria-label="처음 시작하는 다섯 단계" className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        {INTRO_VERIFIED_PATH.map((item,index)=><button key={item.key} type="button" role="tab" id={`psi-onboarding-l13-tab-${item.key}`}
          aria-controls="psi-onboarding-l13-detail" aria-selected={selected===item.key}
          className={`min-h-11 rounded-xl border px-2.5 py-2 text-left text-xs font-extrabold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${selected===item.key?'border-sky-700 bg-sky-800 text-white dark:border-sky-400 dark:bg-sky-700':'border-slate-200 bg-white text-slate-700 hover:border-sky-400 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}
          onClick={()=>setSelected(item.key)}>
            <span className={`mr-1.5 text-[10px] ${selected===item.key?'text-sky-100':'text-sky-700 dark:text-sky-300'}`}>{String(index+1).padStart(2,'0')}</span>{item.shortTitle}
        </button>)}
      </div>
      <div role="tabpanel" id="psi-onboarding-l13-detail" aria-labelledby={`psi-onboarding-l13-tab-${selected}`}
        data-psi-onboarding-stage={selected} className="mt-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-700 dark:bg-slate-800 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            <h3 className="text-sm font-black text-slate-950 dark:text-white">{step.title}</h3>
            <p className="mt-1 text-xs font-medium leading-6 text-slate-700 dark:text-slate-200">{step.task}</p>
            <p className="mt-1.5 text-[11px] font-semibold leading-5 text-amber-800 dark:text-amber-300">{step.evidenceBoundary}</p>
          </div>
          <button type="button" onClick={()=>onNavigate(step.destination)}
            className="min-h-11 shrink-0 rounded-xl bg-sky-800 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition-colors hover:bg-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:bg-sky-600 dark:hover:bg-sky-500">
            {step.action}
          </button>
        </div>
      </div>
      <details className="mt-2 rounded-xl border border-transparent px-2 py-1 text-xs font-semibold text-slate-600 open:border-slate-200 open:bg-white dark:text-slate-300 dark:open:border-slate-700 dark:open:bg-slate-800">
        <summary className="cursor-pointer py-1 font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600">제품 기능 설명과 실제 검증의 차이</summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-4 leading-5">
          {INTRO_SCOPE_WARNINGS.map(item=><li key={item}>{item}</li>)}
        </ul>
      </details>
    </section>
  );
}

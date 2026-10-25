import React, { useMemo, useState } from 'react';
import progress from '../../config/psi-company-progress.json';
import ownership from '../../config/psi-company-ownership.json';

type DepartmentStatus = 'pass' | 'blocked' | 'review' | 'unverified';
type Filter = 'all' | DepartmentStatus;
const styleByStatus: Record<DepartmentStatus, {label: string;className: string;dot: string}> = {
    pass: {label:'검증 통과',className:'border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200',dot:'bg-emerald-500'},
    blocked: {label:'추가 검증 필요',className:'border-amber-300/60 bg-amber-50 text-amber-950 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200',dot:'bg-amber-500'},
    review: {label:'독립 검토 중',className:'border-sky-300/60 bg-sky-50 text-sky-950 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-200',dot:'bg-sky-500'},
    unverified: {label:'미검증',className:'border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200',dot:'bg-slate-500'},
};
const isStatus = (value: string): value is DepartmentStatus => value in styleByStatus;
const readableDate = new Date(progress.capturedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
const filters: Array<{id:Filter;label:string}> = [
    {id:'all',label:'전체 부서'},
    {id:'blocked',label:'보완 필요'},
    {id:'pass',label:'검증 통과'},
    {id:'review',label:'검토 중'},
    {id:'unverified',label:'미검증'},
];

export const PsiCompanyAuditPanel: React.FC = () => {
    const [filter,setFilter] = useState<Filter>('all');
    const [expanded,setExpanded] = useState<string[]>([]);
    const departmentTitles = useMemo(()=>new Map(ownership.departments.map((item)=>[item.id,item.title])),[]);
    const shown = progress.departments.filter(item => filter==='all'||item.status===filter);
    const verified = progress.departments.filter(item=>item.status==='pass').length;
    const blocked = progress.departments.filter(item=>item.status==='blocked').length;
    const totalPassed = progress.departments.filter(item=>item.id==='qa')[0]?.passed??0;
    const totalChecks = progress.departments.filter(item=>item.id==='qa')[0]?.total??0;

    return (
        <section id="settings-company-qa" aria-labelledby="psi-company-title" className="scroll-mt-24 overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="bg-[#102943] px-4 py-5 text-white sm:px-6 sm:py-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-2xl">
                        <p className="text-[11px] font-bold tracking-[0.16em] text-sky-200">PSI ORGANIZATION · AUDIT TRAIL</p>
                        <h3 id="psi-company-title" className="mt-1 text-xl font-black tracking-tight sm:text-2xl">부서별 품질·개선 현황</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-200">
                            각 부서의 확인 결과, 발견 사항, 개선 계획, 실제 검증 기록을 함께 공개합니다.
                        </p>
                    </div>
                    <a href={progress.sourceRun} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold text-white underline-offset-4 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                        GitHub 검증 원문 보기 ↗
                    </a>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                        {label:'책임 부서',value:String(progress.departments.length)},
                        {label:'전제품 시나리오 통과',value:String(totalPassed)+'/'+String(totalChecks)},
                        {label:'통과 상태 부서',value:String(verified)},
                        {label:'보완 필요 부서',value:String(blocked)},
                    ].map(item=>(
                        <div key={item.label} className="rounded-xl border border-white/15 bg-white/10 px-3 py-3">
                            <p className="text-xs text-slate-200">{item.label}</p>
                            <p className="mt-1 text-2xl font-black tabular-nums">{item.value}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-4 p-4 sm:p-6">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                    <p><strong>검증 기록 기준:</strong> {readableDate} · 코드 {progress.sourceSha.slice(0,8)} · <strong>이 화면은 마지막으로 검토한 기록의 사본이며 실시간 상태가 아닙니다.</strong></p>
                    <p className="mt-1">{progress.scope}</p>
                    <p className="mt-1">부서는 자동검증과 사람의 검토 책임을 뜻합니다. 독립 AI 직원 6명이 상시 실행된다는 뜻이 아닙니다.</p>
                </div>

                <div className="flex flex-wrap gap-2" role="group" aria-label="부서 검증 상태 필터">
                    {filters.map(item=>(
                        <button key={item.id} type="button" onClick={()=>setFilter(item.id)} aria-pressed={filter===item.id} className={'min-h-11 rounded-xl border px-3 py-2 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 '+(filter===item.id?'border-[#1769aa] bg-[#1769aa] text-white':'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700')}>
                            {item.label}
                        </button>
                    ))}
                </div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400" role="status">{shown.length}개 부서 표시</p>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {shown.map(item=>{
                        const status=isStatus(item.status)?item.status:'unverified';
                        const info=styleByStatus[status];
                        const isExpanded=expanded.includes(item.id);
                        return (
                            <article key={item.id} data-psi-department={item.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{item.id}</p>
                                        <h4 className="mt-1 text-base font-black text-slate-900 dark:text-white">{departmentTitles.get(item.id)||item.id}</h4>
                                    </div>
                                    <span className={'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold '+info.className}>
                                        <span aria-hidden="true" className={'h-2 w-2 rounded-full '+info.dot} />{info.label}
                                    </span>
                                </div>
                                <p className="mt-3 text-sm font-semibold leading-6 text-slate-800 dark:text-slate-200">{item.summary}</p>
                                {item.total>0?<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">관련 검증 통과 {item.passed}/{item.total} · 합성 시나리오 기준</p>:<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">자동 검증 수치 없음 · 통과로 간주하지 않음</p>}
                                <button type="button" aria-expanded={isExpanded} aria-controls={'psi-qa-detail-'+item.id} onClick={()=>setExpanded(prev=>prev.includes(item.id)?prev.filter(id=>id!==item.id):[...prev,item.id])} className="mt-3 flex min-h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 text-left text-sm font-bold text-slate-900 hover:border-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                                    발견 사항 · 개선 내용 {isExpanded?'접기':'보기'} <span aria-hidden="true">{isExpanded?'−':'+'}</span>
                                </button>
                                {isExpanded && <div id={'psi-qa-detail-'+item.id} className="space-y-3 pt-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
                                    <div><p className="text-xs font-black text-slate-500 dark:text-slate-400">확인·검증</p><p>{item.finding}</p></div>
                                    <div><p className="text-xs font-black text-slate-500 dark:text-slate-400">개선 및 다음 조치</p><p>{item.improvement}</p></div>
                                    <a href={item.evidence} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-bold text-sky-700 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 dark:text-sky-300">해당 증거 확인 ↗</a>
                                </div>}
                            </article>
                        );
                    })}
                </div>
                <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-base font-black text-slate-900 dark:text-white">부서별 작업·검증 이력</h4>
                        <a href={progress.sourcePr} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-sky-700 underline underline-offset-4 dark:text-sky-300">개선 PR 보기 ↗</a>
                    </div>
                    <ol className="space-y-3">
                        {progress.activity.map((item,index)=>{
                            const status=isStatus(item.result)?item.result:'unverified';
                            return (
                                <li key={item.department+'-'+index} className="flex gap-3 rounded-xl bg-slate-50 px-3 py-3 dark:bg-slate-800/70">
                                    <span className={'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full '+styleByStatus[status].dot} aria-hidden="true" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{item.date} · {departmentTitles.get(item.department)||item.department} · {styleByStatus[status].label}</p>
                                        <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">{item.title}</p>
                                        <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{item.details}</p>
                                    </div>
                                    <a aria-label={item.title+' 증거'} href={item.evidence} target="_blank" rel="noopener noreferrer" className="shrink-0 self-start rounded-lg px-2 py-2 text-sm font-black text-sky-700 focus-visible:outline focus-visible:outline-2 dark:text-sky-300">증거 ↗</a>
                                </li>
                            );
                        })}
                    </ol>
                </div>
            </div>
        </section>
    );
};

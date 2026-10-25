import React,{useMemo,useState} from 'react';
import {DEFAULT_FREE_TIER_SCENARIO,estimateFreeTierCapacity,type FreeTierScenario} from '../../utils/freeTierCapacity';
import {getClientRequestDiagnostics,subscribeClientRequestDiagnostics} from '../../utils/clientRequestDiagnostics';

/**
 * No billing API, database, storage, or analytics calls.
 * This is a *manual what-if* planner, NOT a real-time quota dashboard.
 */
export const FreeTierCapacityPlanner:React.FC=()=>{
    const [values,setValues]=useState<FreeTierScenario>(DEFAULT_FREE_TIER_SCENARIO);
    const [expanded,setExpanded]=useState(false);
    const [diagnostics,setDiagnostics]=useState(getClientRequestDiagnostics);
    React.useEffect(()=>subscribeClientRequestDiagnostics(setDiagnostics),[]);
    const result=useMemo(()=>estimateFreeTierCapacity(values),[values]);
    const update=(name:keyof FreeTierScenario,value:string)=>setValues(prev=>({...prev,[name]:Math.min(100000,Math.max(0,Number(value)||0))}));
    return <section aria-labelledby="psi-free-tier-capacity-title" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-3xl">
                <p className="text-[11px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-300">PSI · RESOURCE READINESS</p>
                <h3 id="psi-free-tier-capacity-title" className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100 sm:text-xl">무료 운영 용량 계획</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Vercel Hobby에서는 하루 배포 100회가 팀 전체에 적용됩니다. 무료 한도와 개인·비상업적 사용 조건을 고려한 <strong>예상 시뮬레이션</strong>입니다.</p>
            </div>
            <span className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-600 dark:border-slate-500 dark:text-slate-300">실시간 사용량 아님</span>
        </div>
        <button type="button" className="mt-4 min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold dark:border-slate-600 dark:text-slate-100" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'계획 입력 접기':'사진·배포 계획 직접 계산'}</button>
        {expanded&&<div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {([
                ['photosPerMonth','월간 사진 건수',100000,'장'],
                ['averagePhotoKB','사진 사본 평균 크기',3000,'KB'],
                ['downloadsPerPhoto','사진당 재조회 횟수',100,'회'],
                ['analysisAttemptsPerPhoto','사진당 AI 분석 시도',20,'회'],
                ['teamDeploymentsPerDay','팀 전체 하루 신규 배포',500,'회'],
            ] as const).map(([key,label,max,unit])=><label key={key} className="flex flex-col gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                {label}<span className="flex items-center gap-2"><input aria-label={label} type="number" inputMode="numeric" min={0} max={max} step={1} value={values[key]} onChange={e=>update(key,e.target.value)} className="min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm tabular-nums text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-white"/><span>{unit}</span></span>
            </label>)}
        </div>}
        <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
                {label:'월 신규 사진 예상 저장량',value:result.newStorageMiB.toFixed(1)+' MiB',sub:'기존 보관 데이터 제외'},
                {label:'월 사진 재조회 예상 전송',value:result.uncachedDownloadGiBUpper.toFixed(2)+' GiB',sub:'모두 비캐시일 때의 단순 추정'},
                {label:'월 예상 AI 분석 시도',value:result.analysisAttempts.toLocaleString('ko-KR')+'회',sub:'실제 공급자 호출/비용과 다름'},
                {label:'팀 신규 배포 계획',value:result.deploymentsOfDailyCap+'/100 회',sub:'하루 참고 한도 · 타 프로젝트 포함'},
            ].map(item=><div key={item.label} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                <dt className="text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{item.label}</dt><dd className="mt-1 break-all text-lg font-black tabular-nums text-slate-900 dark:text-white">{item.value}</dd><p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{item.sub}</p>
            </div>)}
        </dl>
        <div className="mt-4 space-y-2 text-xs leading-5 text-slate-600 dark:text-slate-300" role="status">
            {result.notes.map(note=><p key={note}>• {note}</p>)}
            <p className="font-bold">상용 도입 전 확인: Hobby는 개인·비상업적 이용에 한정됩니다. 필요 시 요금제, 테넌트 보안·데이터 보존 및 외부 AI 사용 예산을 별도로 검토하세요.</p>
            <p>협력사 안전관리비·안전시설비·신호수 인건비는 PSI/Inspector 운영 용량 계획에 포함되지 않으며 데이터가 합쳐지지 않습니다.</p>
        </div>
        <section aria-label="이 탭의 API 요청 결과" className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-3 dark:border-teal-800 dark:bg-teal-950">
            <div className="flex flex-wrap justify-between gap-2">
                <h4 className="text-sm font-black text-teal-900 dark:text-teal-100">이 탭에서 발생한 API 요청 결과</h4>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">기기 안에서만 집계 · 새로고침 시 초기화</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
                {([
                    ['정상 응답',diagnostics.success],
                    ['이용 한도',diagnostics.rateLimited],
                    ['오류 응답',diagnostics.httpError],
                    ['응답 시간 초과',diagnostics.timeout],
                    ['네트워크 실패',diagnostics.network],
                ] as const).map(([label,value])=><div key={label} className="rounded-lg border border-teal-100 bg-white p-2 dark:border-teal-800 dark:bg-slate-800"><dt className="text-xs text-slate-600 dark:text-slate-300">{label}</dt><dd className="text-xl font-black tabular-nums text-slate-900 dark:text-slate-100">{value}</dd></div>)}
            </dl>
            <p className="mt-2 text-xs leading-5 text-slate-700 dark:text-teal-100">Vercel·Supabase의 전체 사용량이 아닙니다. 이 탭의 공통 API 클라이언트 요청 결과만 메모리에서 집계합니다. 요청 본문·사진·신원·토큰은 저장하지 않으며, 오류 시 자동 재전송하지 않습니다. 저장 기록을 먼저 확인하세요.</p>
        </section>
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
            <a href="https://vercel.com/docs/plans/hobby" target="_blank" rel="noreferrer noopener" className="min-h-11 rounded-lg border border-slate-300 px-4 py-3 font-bold underline dark:border-slate-600 dark:text-slate-100">Vercel 공식 한도 확인</a>
            <a href="https://supabase.com/docs/guides/platform/billing-on-supabase" target="_blank" rel="noreferrer noopener" className="min-h-11 rounded-lg border border-slate-300 px-4 py-3 font-bold underline dark:border-slate-600 dark:text-slate-100">Supabase 공식 한도 확인</a>
        </div>
    </section>;
};

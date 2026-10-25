import React,{useState} from 'react';
import {currentReleaseLabel,currentReleaseSha} from '../../utils/releaseGate';

export const OperatorReleaseProof:React.FC=()=>{
    const sha=currentReleaseSha();
    const [copied,setCopied]=useState('');
    const copy=async()=>{
        if(!sha||!navigator.clipboard?.writeText){setCopied('자동 복사를 지원하지 않습니다. 화면의 버전 정보를 직접 확인해 주세요.');return;}
        try{await navigator.clipboard.writeText(sha);setCopied('빌드 코드 식별자를 복사했습니다. 이것만으로 운영 적용을 증명하지는 않습니다.');}
        catch{setCopied('복사가 제한되어 있습니다. 화면의 버전을 확인해 주세요.');}
    };
    return <section aria-labelledby="psi-operator-release-title" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-[11px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-300">PSI · OPERATOR RELEASE</p>
        <h3 id="psi-operator-release-title" className="mt-1 text-xl font-black text-slate-900 dark:text-slate-100">운영 버전·백업 확인</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">안전관리자·운영자 전용 프로그램입니다. 근로자에게 PSI 본프로그램이나 인스펙터 접속 권한을 배포하지 않습니다. 기존 QR 설문·교육 입력 경로는 별개입니다.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
            <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-600 dark:text-slate-300">현재 화면에 포함된 코드 출처</p>
                <p className="mt-1 break-all font-mono text-sm font-bold text-slate-900 dark:text-white" aria-label="현재 실행 빌드 식별">{currentReleaseLabel()}</p>
            </div>
            <button className="min-h-11 rounded-lg border border-teal-500 px-3 py-2 text-sm font-semibold text-teal-900 dark:text-teal-200 disabled:opacity-50" type="button" disabled={!sha} onClick={()=>void copy()}>버전 코드 복사</button>
        </div>
        {copied&&<p role="status" className="mt-2 text-xs text-teal-800 dark:text-teal-200">{copied}</p>}
        <p className="mt-2 text-xs leading-5 text-amber-800 dark:text-amber-200">빌드 코드가 확인돼도 현재 운영 주소가 최신 커밋인지, Vercel 배포가 READY인지 자동으로 판단하지 않습니다. 반드시 Vercel Deployments에서 운영 별칭과 SHA를 대조하세요.</p>
        <details className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <summary className="cursor-pointer py-2 text-sm font-bold text-slate-800 dark:text-slate-100">운영자 배포·복구 확인 순서</summary>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700 dark:text-slate-300">
                <li>GitHub에서 합쳐서 검증한 커밋의 릴리즈·전체 제품 브라우저 결과를 확인합니다.</li>
                <li>Vercel 미리보기 READY의 SHA가 실제 검증 커밋과 같은지 확인합니다.</li>
                <li>저장자료를 변경하는 배포라면 원본 보존·복원 가능성·권한 범위를 먼저 확인합니다.</li>
                <li>운영 배포 READY 이후 실제 도메인 별칭이 새 SHA를 가리키는지 확인합니다. 제한에 막히면 기존 버전을 유지합니다.</li>
            </ol>
            <p className="mt-3 text-xs leading-5 text-amber-800 dark:text-amber-200">PSI PC 월별 백업은 암호화 보관함에서 사용자가 직접 전체 복원 검증할 수 있지만, 이는 인스펙터 Supabase 사진/DB 백업과는 별개입니다. 모든 자료의 복구를 완료했다고 표시하지 않습니다.</p>
            <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">협력사 안전시설비·신호수 인건비 관리 제품은 독립 유지하며 여기에 포함하지 않습니다.</p>
        </details>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <a href="https://github.com/TELLOWSS/NEW-PSI/commits/main" target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 py-2 font-bold underline dark:border-slate-600 dark:text-slate-200">GitHub 최신 소스 확인</a>
            <a href="https://vercel.com/tellowss-projects/new-psi/deployments" target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 py-2 font-bold underline dark:border-slate-600 dark:text-slate-200">Vercel 운영 배포 확인</a>
        </div>
    </section>;
};

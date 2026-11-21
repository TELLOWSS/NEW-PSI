import React from 'react';
import type { DocumentDeliveryEvidence } from '../../utils/reportDeliveryEvidenceL12';

const states={
    'not-started': 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200',
    running: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-200',
    requested: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-200',
    reviewed: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200',
    attention: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200',
    unconfirmed: 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
} as const;

/** This is a read-only guide, never a proof of device storage or recipient receipt. */
export default function ReportDeliveryEvidencePanel({evidence,canNavigateToVerification=false}:{
    evidence: DocumentDeliveryEvidence;
    canNavigateToVerification?: boolean;
}){
    return <section className="no-print rounded-2xl border border-sky-200 bg-white p-4 shadow-sm dark:border-sky-800 dark:bg-slate-900 sm:p-5"
        data-psi-report-delivery-l12="true" aria-labelledby="psi-report-delivery-l12-heading">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
                <p className="psi-eyebrow text-sky-700 dark:text-sky-300">PSI · REPORT DELIVERY EVIDENCE</p>
                <h3 id="psi-report-delivery-l12-heading" className="mt-1 text-base font-black text-slate-900 dark:text-white">
                    보고서 작성과 상대방 수신은 다른 단계입니다
                </h3>
                <p className="mt-1 max-w-3xl text-xs font-semibold leading-6 text-slate-600 dark:text-slate-300">
                    실제 실행 사실만 표시합니다. 브라우저 파일 저장, 외부 공유앱 발송·열람, 관리자 최종 검수는 각각 별도의 확인이 필요합니다.
                </p>
            </div>
            <span className="w-fit shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                배포·수신 자동 확인 없음
            </span>
        </header>
        <ol aria-label="보고서 생성부터 승인까지 근거 단계" className="mt-4 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 xl:grid-cols-3">
            {evidence.stages.map(step=><li key={step.key} data-psi-l12-stage={step.key}
                className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                <h4 className="text-sm font-black text-slate-900 dark:text-white">{step.title}</h4>
                <p className={['mt-2 w-fit max-w-full rounded-lg border px-2.5 py-1.5 text-xs font-bold leading-5',states[step.state]].join(' ')}>
                    {step.label}
                </p>
                <p className="mt-2 text-xs font-medium leading-5 text-slate-600 dark:text-slate-300">{step.evidence}</p>
            </li>)}
        </ol>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-3 dark:border-sky-900 dark:bg-sky-900/20">
            <p role="status" className="min-w-0 flex-1 text-xs font-bold leading-6 text-sky-950 dark:text-sky-100">{evidence.nextCheck}</p>
            {canNavigateToVerification&&<a href="#psi-report-package-verification" className="inline-flex min-h-11 items-center rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-black text-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700 dark:border-sky-700 dark:bg-slate-900 dark:text-sky-200">
                별도 증빙 검증 영역으로 이동
            </a>}
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">이 단계별 상태는 파일 전송, 전자서명, 상대방 수신 또는 작업 재개 승인을 대신하지 않습니다. 검증 결과는 선택한 별도 증빙 묶음에만 적용됩니다.</p>
    </section>;
}

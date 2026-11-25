import React from 'react';
import './EvidencePanels.css';

export type EvidenceLoadState = 'not-requested' | 'loading' | 'loaded' | 'empty' | 'error' | 'stale' | 'local';
const labels: Record<EvidenceLoadState, string> = {
    'not-requested': '미조회', loading: '조회 중', loaded: '조회된 자료', empty: '조회 결과 없음',
    error: '조회 실패', stale: '이전 조회 자료', local: '현재 불러온 자료 한정',
};
interface EvidenceScopePanelProps {
    source: string;
    scope: string;
    asOf: string;
    state: EvidenceLoadState;
    population?: string;
    review: string;
    nextAction: string;
}
/** Four independent facts; successful retrieval never implies safety approval. */
export function EvidenceScopePanel({source, scope, asOf, state, population, review, nextAction}: EvidenceScopePanelProps) {
    const attention = state === 'error' || state === 'stale';
    return <section aria-label="자료 출처와 확인 범위" data-evidence-scope={state}
        className={`psi-evidence-panel my-3 break-words rounded-2xl border p-4 text-sm leading-6 ${attention ? 'psi-evidence-attention' : ''}`}>
        <p role="status" className="font-bold">{labels[state]}</p>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            <div><dt className="font-bold">출처</dt><dd>{source}</dd></div>
            <div><dt className="font-bold">조회 범위</dt><dd>{scope}</dd></div>
            <div><dt className="font-bold">기준시각</dt><dd>{asOf}</dd></div>
            <div><dt className="font-bold">검토 상태</dt><dd>{review}</dd></div>
        </dl>
        {population && <p className="mt-2">집계 대상: {population}</p>}
        <p className="mt-2 font-semibold">다음 확인: {nextAction}</p>
    </section>;
}

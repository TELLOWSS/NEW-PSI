import React, { useMemo } from 'react';
import type { WorkerRecord } from '../../types';
import { buildLatestScoreMetricEvidence, SCORE_EVIDENCE_VERSION } from '../../utils/scoreMetricEvidence';

interface Props {
    records: readonly WorkerRecord[];
    scopeLabel: string;
    asOf: string;
    loadState?: 'loading' | 'ready' | 'error';
    onOpenRecord?: (record: WorkerRecord) => void;
}

/** Existing scored fields, deliberately distinct from the six proposed safety perspectives. */
export function ScoreMetricEvidencePanel({ records, scopeLabel, asOf, loadState = 'ready', onOpenRecord }: Props) {
    const evidence = useMemo(() => buildLatestScoreMetricEvidence(records), [records]);
    return <section className="nexus-score-evidence-panel" aria-label="기존 평가점수 근거">
        <div className="nexus-score-evidence-head">
            <div>
                <span className="nexus-score-evidence-kicker">원자료 기반 점수 산출 근거</span>
                <h3>기존 평가점수와 원자료</h3>
            </div>
            <span className="nexus-score-evidence-scope-pill">{scopeLabel} · 기준일 {asOf}</span>
        </div>
        <div className="nexus-score-evidence-notices">
            <p className="nexus-score-evidence-note">{scopeLabel} · 기준일 {asOf}. 로드된 자료 안에서 식별자별 최신 평가를 사용하며, 식별 미확인 기록은 개별 단위로 유지합니다. 전체 현장 인원과 같지 않을 수 있습니다.</p>
            <p className="nexus-score-evidence-note is-boundary">기획서의 위험인지·교육이해·실천참여·보호구 준수·소통보고·작업중지 감수성은 아래 점수와 다른 지표입니다. 해당 6개 관점의 승인된 산식과 원자료 연결은 아직 없어 점수를 대신 표시하지 않습니다.</p>
        </div>
        {loadState !== 'ready' ? <p role="status" className="nexus-score-evidence-status">{loadState === 'loading' ? '자료 조회 중 · 점수 산출 대기' : '조회 실패 · 점수 확인 불가'}</p> : <>
            {!records.length && <p role="status" className="nexus-score-evidence-status">선택 범위에 조회된 평가자료가 없습니다.</p>}
            <div className="nexus-score-evidence-grid">
                {evidence.map(row => <article key={row.key} className="nexus-score-evidence-card">
                    <div className="nexus-score-evidence-card-top">
                        <h4>{row.label}{row.key === 'repeatViolationPenalty' ? ' (감점 크기)' : ''}</h4>
                        <span className="nexus-score-evidence-valid-pill">유효 {row.valid} / {row.total}</span>
                    </div>
                    <p className="nexus-score-evidence-score">{row.average === null ? '산출 불가' : `${row.average} / ${row.max}점`}</p>
                    <p className="nexus-score-evidence-stats">유효 {row.valid} / 대상 {row.total}개 평가 · 결측 {row.missing} · 제외 {row.excluded}</p>
                    <details className="nexus-score-evidence-details">
                        <summary>산식·원자료 확인 ({row.sourceRecords.length}건)</summary>
                        <div className="nexus-score-evidence-details-body">
                            <p>유효값 합계 ÷ 유효 평가 수. 결측·범위 밖 값·유효하지 않은 총점은 평균에서 제외합니다. 버전 {SCORE_EVIDENCE_VERSION}. 실제 현장 검토·조치 완료를 뜻하지 않습니다.</p>
                            {row.key === 'repeatViolationPenalty' && <p>감점 크기는 낮을수록 작습니다. 감점 0점을 취약 신호로 표시하지 않습니다.</p>}
                            {row.sourceRecords.length ? <ul className="nexus-score-evidence-list">{row.sourceRecords.map((record, index) => <li key={`${record.id}-${index}`} className="nexus-score-evidence-list-item">
                                {onOpenRecord ? <button type="button" className="nexus-score-evidence-open-btn" onClick={() => onOpenRecord(record)}>평가 근거 {index + 1} · {record.date} · {record.jobField || '공종 미기록'}</button> : <span>평가 근거 {index + 1} · {record.date} · 원자료 열기는 기록 화면에서 확인</span>}
                            </li>)}</ul> : <p className="nexus-score-evidence-empty">평균에 포함된 유효 원자료 없음</p>}
                        </div>
                    </details>
                </article>)}
            </div>
        </>}
    </section>;
}

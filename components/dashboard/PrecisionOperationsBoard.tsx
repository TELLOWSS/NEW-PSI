import React, { useMemo, useState } from 'react';
import type { Page, SafetyCheckRecord, WorkerRecord } from '../../types';
import { calculateCoreMetricSnapshot, isOperationalWorkerRecord } from '../../utils/coreMetrics';

interface PrecisionOperationsBoardProps {
    workerRecords: WorkerRecord[];
    safetyCheckRecords: SafetyCheckRecord[];
    setCurrentPage: (page: Page) => void;
    onOpenAdvanced: () => void;
}

type QueueTone = 'critical' | 'warning' | 'progress' | 'normal';
type PeriodFilter = 'all' | '7' | '30';

type QueueItem = {
    record: WorkerRecord;
    tone: QueueTone;
    statusLabel: string;
    riskLabel: string;
};

const RISK_SCORE_THRESHOLD = 70;
const OPS_TONE_CLASSES: Record<QueueTone, {
    kpi: string;
    mark: string;
    status: string;
}> = {
    critical: {
        kpi: 'psi-ops-kpi--critical',
        mark: 'psi-ops-state-mark--critical',
        status: 'psi-ops-status--critical',
    },
    warning: {
        kpi: 'psi-ops-kpi--warning',
        mark: 'psi-ops-state-mark--warning',
        status: 'psi-ops-status--warning',
    },
    progress: {
        kpi: 'psi-ops-kpi--progress',
        mark: 'psi-ops-state-mark--progress',
        status: 'psi-ops-status--progress',
    },
    normal: {
        kpi: 'psi-ops-kpi--normal',
        mark: 'psi-ops-state-mark--normal',
        status: 'psi-ops-status--normal',
    },
};

const formatLocalDateKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const parseRecordDate = (value: string): Date | null => {
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getRecordDateLabel = (value: string): string => {
    const parsed = parseRecordDate(value);
    if (!parsed) return '날짜 확인 필요';
    return new Intl.DateTimeFormat('ko-KR', {
        month: 'numeric',
        day: 'numeric',
    }).format(parsed);
};

const getSiteName = (): string => {
    if (typeof window === 'undefined') return '현장 안전관리';
    try {
        const raw = window.localStorage.getItem('psi_app_settings');
        if (!raw) return '현장 안전관리';
        const parsed = JSON.parse(raw) as { siteName?: unknown };
        const siteName = typeof parsed.siteName === 'string' ? parsed.siteName.trim() : '';
        return siteName || '현장 안전관리';
    } catch {
        return '현장 안전관리';
    }
};

const isImmediateRecord = (record: WorkerRecord): boolean =>
    record.riskDecision === 'CRITICAL_STOP'
    || record.riskDecision === 'IMMEDIATE_ATTENTION'
    || (Number.isFinite(Number(record.safetyScore)) && Number(record.safetyScore) < RISK_SCORE_THRESHOLD);

const isPendingReviewRecord = (record: WorkerRecord): boolean =>
    record.reviewStatus === 'PENDING'
    || record.approvalStatus === 'PENDING'
    || record.approvalState === 'PENDING'
    || record.workflowState === 'manual_review_required'
    || record.workflowState === 'awaiting_manager_approval'
    || record.secondPassStatus === 'NEEDED';

const isInProgressRecord = (record: WorkerRecord): boolean =>
    record.secondPassStatus === 'IN_PROGRESS'
    || record.workflowState === 'ocr_validating'
    || record.workflowState === 'first_pass_analyzing'
    || record.workflowState === 'second_pass_analyzing'
    || record.workflowState === 'evaluator_review';

const isCompletedRecord = (record: WorkerRecord): boolean =>
    record.reviewStatus === 'APPROVED'
    || record.approvalStatus === 'APPROVED'
    || record.approvalState === 'APPROVED'
    || record.secondPassStatus === 'DONE'
    || record.workflowState === 'completed';

const hasRiskSignal = (record: WorkerRecord): boolean =>
    isImmediateRecord(record)
    || record.selfAssessedRiskLevel === '상'
    || (Array.isArray(record.weakAreas) && record.weakAreas.length > 0);

const resolveQueueItem = (record: WorkerRecord): QueueItem => {
    const riskLabel =
        record.weakAreas?.find((item) => String(item || '').trim())
        || record.improvement
        || record.ocrErrorMessage
        || '관리자 검토가 필요한 기록';

    if (record.riskDecision === 'CRITICAL_STOP') {
        return { record, tone: 'critical', statusLabel: '작업중지 확인', riskLabel };
    }
    if (isImmediateRecord(record)) {
        return { record, tone: 'critical', statusLabel: '보호 우선', riskLabel };
    }
    if (isPendingReviewRecord(record)) {
        return { record, tone: 'warning', statusLabel: '검토 대기', riskLabel };
    }
    if (isInProgressRecord(record)) {
        return { record, tone: 'progress', statusLabel: '분석 중', riskLabel };
    }
    return {
        record,
        tone: isCompletedRecord(record) ? 'normal' : 'progress',
        statusLabel: isCompletedRecord(record) ? '검토 완료' : '확인 필요',
        riskLabel,
    };
};

const getQueuePriority = (item: QueueItem): number => {
    const tonePriority: Record<QueueTone, number> = {
        critical: 0,
        warning: 1,
        progress: 2,
        normal: 3,
    };
    return tonePriority[item.tone] * 1000 + (Number(item.record.safetyScore) || 100);
};

const formatToday = (): string =>
    new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short',
    }).format(new Date());

const formatDayLabel = (dateKey: string): string => {
    const parsed = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateKey.slice(5);
    return new Intl.DateTimeFormat('ko-KR', { weekday: 'short' }).format(parsed).replace('요일', '');
};

const ChevronIcon = () => (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="m7 4 6 6-6 6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const PlusIcon = () => (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M10 4v12M4 10h12" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

export const PrecisionOperationsBoard: React.FC<PrecisionOperationsBoardProps> = ({
    workerRecords,
    safetyCheckRecords,
    setCurrentPage,
    onOpenAdvanced,
}) => {
    const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
    const [tradeFilter, setTradeFilter] = useState('all');

    const operationalRecords = useMemo(
        () => workerRecords.filter(isOperationalWorkerRecord),
        [workerRecords],
    );

    const tradeOptions = useMemo(
        () => [...new Set<string>(operationalRecords
            .map((record) => String(record.jobField || '').trim())
            .filter((trade): trade is string => Boolean(trade)))]
            .sort((left, right) => left.localeCompare(right, 'ko')),
        [operationalRecords],
    );

    const filteredRecords = useMemo(() => {
        const now = new Date();
        const periodDays = periodFilter === 'all' ? null : Number(periodFilter);
        const cutoff = periodDays ? new Date(now.getTime() - (periodDays - 1) * 24 * 60 * 60 * 1000) : null;
        cutoff?.setHours(0, 0, 0, 0);

        return operationalRecords.filter((record) => {
            if (tradeFilter !== 'all' && record.jobField !== tradeFilter) return false;
            if (!cutoff) return true;
            const recordDate = parseRecordDate(record.date);
            return recordDate ? recordDate >= cutoff : false;
        });
    }, [operationalRecords, periodFilter, tradeFilter]);

    const summary = useMemo(
        () => calculateCoreMetricSnapshot(filteredRecords),
        [filteredRecords],
    );

    const statusCounts = useMemo(() => {
        const result = {
            immediate: 0,
            pending: 0,
            progress: 0,
            completed: 0,
        };

        filteredRecords.forEach((record) => {
            if (isImmediateRecord(record)) {
                result.immediate += 1;
            } else if (isPendingReviewRecord(record)) {
                result.pending += 1;
            } else if (isInProgressRecord(record)) {
                result.progress += 1;
            } else if (isCompletedRecord(record)) {
                result.completed += 1;
            } else {
                result.pending += 1;
            }
        });

        return result;
    }, [filteredRecords]);

    const priorityQueue = useMemo(
        () => filteredRecords
            .map(resolveQueueItem)
            .sort((left, right) => {
                const priorityDifference = getQueuePriority(left) - getQueuePriority(right);
                if (priorityDifference !== 0) return priorityDifference;
                const leftTime = parseRecordDate(left.record.date)?.getTime() || 0;
                const rightTime = parseRecordDate(right.record.date)?.getTime() || 0;
                return rightTime - leftTime;
            })
            .slice(0, 4),
        [filteredRecords],
    );

    const riskCounts = useMemo(() => {
        const counts = new Map<string, number>();
        filteredRecords.forEach((record) => {
            (record.weakAreas || []).forEach((risk) => {
                const normalized = String(risk || '').trim();
                if (normalized) counts.set(normalized, (counts.get(normalized) || 0) + 1);
            });
        });
        return [...counts.entries()].sort((left, right) => right[1] - left[1]);
    }, [filteredRecords]);

    const trendSeries = useMemo(() => {
        const dailyCounts = new Map<string, number>();
        filteredRecords.forEach((record) => {
            if (!hasRiskSignal(record)) return;
            const parsed = parseRecordDate(record.date);
            if (!parsed) return;
            const key = formatLocalDateKey(parsed);
            dailyCounts.set(key, (dailyCounts.get(key) || 0) + 1);
        });

        const existingKeys = [...dailyCounts.keys()].sort((left, right) => left.localeCompare(right));
        const anchor = existingKeys.length
            ? new Date(`${existingKeys[existingKeys.length - 1]}T00:00:00`)
            : new Date();

        return Array.from({ length: 7 }, (_, index) => {
            const date = new Date(anchor);
            date.setDate(anchor.getDate() - (6 - index));
            const key = formatLocalDateKey(date);
            return {
                key,
                label: formatDayLabel(key),
                value: dailyCounts.get(key) || 0,
            };
        });
    }, [filteredRecords]);

    const averageOcrConfidence = useMemo(() => {
        const values = filteredRecords
            .map((record) => Number(record.ocrConfidence))
            .filter((value) => Number.isFinite(value) && value > 0);
        if (!values.length) return null;
        return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100);
    }, [filteredRecords]);

    const aiSuggestion = useMemo(() => {
        if (!filteredRecords.length) {
            return '첫 위험성평가를 등록하면 반복 위험과 우선 검토 대상을 근거와 함께 정리합니다.';
        }
        const [topRisk, topRiskCount] = riskCounts[0] || ['반복 위험', 0];
        const priorityTrade = priorityQueue[0]?.record.jobField || '전체 공종';
        if (statusCounts.immediate > 0) {
            return `${priorityTrade}에서 보호 우선 기록 ${statusCounts.immediate}건이 확인되었습니다. ${topRisk} 관련 원문과 현장 조치 여부를 먼저 검토해 주세요.`;
        }
        if (statusCounts.pending > 0) {
            return `관리자 검토가 필요한 기록 ${statusCounts.pending}건이 남아 있습니다. ${topRiskCount ? `${topRisk} 신호 ${topRiskCount}건을` : '최신 기록을'} 우선 확인해 주세요.`;
        }
        return '현재 보호 우선 기록은 없습니다. 완료된 조치의 교육 환류와 월별 반복 여부를 이어서 확인해 주세요.';
    }, [filteredRecords.length, priorityQueue, riskCounts, statusCounts.immediate, statusCounts.pending]);

    const trendMax = Math.max(1, ...trendSeries.map((item) => item.value));
    const distributionTotal = Math.max(1, filteredRecords.length);
    const evidenceCount = riskCounts.reduce((sum, [, count]) => sum + count, 0);
    const visibleRecordLabel =
        filteredRecords.length === operationalRecords.length
            ? `전체 ${filteredRecords.length}건`
            : `${operationalRecords.length}건 중 ${filteredRecords.length}건`;

    const kpis = [
        {
            key: 'immediate',
            label: '보호 우선',
            value: statusCounts.immediate,
            unit: '건',
            helper: statusCounts.immediate ? '원문과 현장조치 즉시 확인' : '현재 즉시 확인 대상 없음',
            tone: 'critical',
        },
        {
            key: 'pending',
            label: '검토 대기',
            value: statusCounts.pending,
            unit: '건',
            helper: statusCounts.pending ? '승인 또는 보완 판단 필요' : '검토 대기 없음',
            tone: 'warning',
        },
        {
            key: 'analyzed',
            label: '분석 완료',
            value: summary.analyzedWorkerCount,
            unit: '건',
            helper: `표시 기록 ${visibleRecordLabel}`,
            tone: 'progress',
        },
        {
            key: 'improvement',
            label: '개선 이행률',
            value: summary.improvementExecutionRate,
            unit: '%',
            helper: `공식 계산 기준 · ${summary.ruleVersion}`,
            tone: 'normal',
        },
    ] as const;

    const quickLinks: Array<{ page: Page; title: string; description: string }> = [
        { page: 'ocr-analysis', title: '위험성평가 분석', description: '등록·판독·검토' },
        { page: 'safety-compliance-hub', title: '안전조치 통합 허브', description: '조치·코칭·이행' },
        { page: 'education-return', title: '교육 환류', description: '교육자료·개인 안내' },
        { page: 'monthly-guidance-report', title: '월별 계도 리포트', description: '반복 위험·개선 추적' },
        { page: 'reports', title: '근로자 리포트', description: '개인별 분석 근거' },
        { page: 'performance-analysis', title: '안전성과 분석', description: '월별 성과와 변화' },
    ];

    return (
        <div className="psi-ops-dashboard">
            <section className="psi-ops-intro" aria-labelledby="operations-page-title">
                <div className="min-w-0">
                    <div className="psi-ops-context">
                        <span className="psi-ops-context-mark" aria-hidden="true" />
                        <span>{getSiteName()}</span>
                        <span className="psi-ops-context-divider" aria-hidden="true" />
                        <span>{formatToday()}</span>
                    </div>
                    <h1 id="operations-page-title" className="psi-ops-title">오늘의 안전 운영</h1>
                    <p className="psi-ops-subtitle">위험 신호를 먼저 확인하고, 검토·조치·교육까지 끊김 없이 이어갑니다.</p>
                </div>

                <div className="psi-ops-toolbar" aria-label="안전 운영 필터와 주요 작업">
                    <label className="psi-ops-filter">
                        <span>기간</span>
                        <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value as PeriodFilter)}>
                            <option value="all">전체 기간</option>
                            <option value="7">최근 7일</option>
                            <option value="30">최근 30일</option>
                        </select>
                    </label>
                    <label className="psi-ops-filter">
                        <span>공종</span>
                        <select value={tradeFilter} onChange={(event) => setTradeFilter(event.target.value)}>
                            <option value="all">전체 공종</option>
                            {tradeOptions.map((trade) => <option key={trade} value={trade}>{trade}</option>)}
                        </select>
                    </label>
                    <button
                        type="button"
                        onClick={() => setCurrentPage('ocr-analysis')}
                        className="psi-ops-primary-action"
                    >
                        <PlusIcon />
                        <span>새 위험성평가 등록</span>
                    </button>
                </div>
            </section>

            <section className="psi-ops-kpi-grid" aria-label="주요 안전 지표">
                {kpis.map((item) => (
                    <article key={item.key} className={`psi-ops-kpi ${OPS_TONE_CLASSES[item.tone].kpi}`}>
                        <div className="psi-ops-kpi-heading">
                            <span className={`psi-ops-state-mark ${OPS_TONE_CLASSES[item.tone].mark}`} aria-hidden="true" />
                            <span>{item.label}</span>
                        </div>
                        <div className="psi-ops-kpi-value">
                            {item.value}<small>{item.unit}</small>
                        </div>
                        <p>{item.helper}</p>
                    </article>
                ))}
            </section>

            <section className="psi-ops-main-grid" aria-label="안전 운영 상세">
                <article className="psi-ops-panel psi-ops-priority">
                    <header className="psi-ops-panel-header">
                        <div>
                            <div className="psi-ops-panel-title-row">
                                <h2>오늘의 우선 확인</h2>
                                <span>{priorityQueue.length}건</span>
                            </div>
                            <p>보호 우선과 승인 대기 기록을 위험도 순으로 정리했습니다.</p>
                        </div>
                        <button type="button" onClick={() => setCurrentPage('ocr-analysis')} className="psi-ops-text-action">
                            전체 기록 보기
                            <ChevronIcon />
                        </button>
                    </header>

                    {priorityQueue.length ? (
                        <div className="psi-ops-table-wrap">
                            <table className="psi-ops-table">
                                <caption className="sr-only">우선 확인이 필요한 위험성평가 기록</caption>
                                <thead>
                                    <tr>
                                        <th scope="col">대상</th>
                                        <th scope="col">공종</th>
                                        <th scope="col">위험 신호</th>
                                        <th scope="col">상태</th>
                                        <th scope="col">기록일</th>
                                        <th scope="col"><span className="sr-only">작업</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {priorityQueue.map((item) => (
                                        <tr key={item.record.id}>
                                            <td data-label="대상">
                                                <strong>{item.record.name || '이름 확인 필요'}</strong>
                                            </td>
                                            <td data-label="공종">{item.record.jobField || '공종 미등록'}</td>
                                            <td data-label="위험 신호">
                                                <span className="psi-ops-risk-copy">{item.riskLabel}</span>
                                            </td>
                                            <td data-label="상태">
                                                <span className={`psi-ops-status ${OPS_TONE_CLASSES[item.tone].status}`}>
                                                    <span aria-hidden="true" />
                                                    {item.statusLabel}
                                                </span>
                                            </td>
                                            <td data-label="기록일">{getRecordDateLabel(item.record.date)}</td>
                                            <td className="psi-ops-row-action">
                                                <button type="button" onClick={() => setCurrentPage('ocr-analysis')} aria-label={`${item.record.name} 기록 검토`}>
                                                    검토
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="psi-ops-empty">
                            <span className="psi-ops-empty-mark" aria-hidden="true" />
                            <div>
                                <h3>{operationalRecords.length ? '선택한 조건에 해당하는 기록이 없습니다.' : '첫 안전 기록을 등록해 주세요.'}</h3>
                                <p>{operationalRecords.length ? '기간이나 공종 필터를 변경해 다시 확인할 수 있습니다.' : '사진, PDF 또는 수기 내용을 등록하면 우선 확인 목록이 자동으로 구성됩니다.'}</p>
                            </div>
                            <button type="button" onClick={() => setCurrentPage('ocr-analysis')}>기록 등록</button>
                        </div>
                    )}
                </article>

                <article className="psi-ops-panel psi-ops-trend">
                    <header className="psi-ops-panel-header">
                        <div>
                            <h2>최근 위험 기록 추이</h2>
                            <p>최신 기록일 기준 7일</p>
                        </div>
                        <span className="psi-ops-panel-unit">건수</span>
                    </header>
                    <div
                        className="psi-ops-chart"
                        role="img"
                        aria-label={`최근 위험 기록 추이: ${trendSeries.map((item) => `${item.label} ${item.value}건`).join(', ')}`}
                    >
                        {trendSeries.map((item, index) => (
                            <div key={item.key} className="psi-ops-chart-column" aria-hidden="true">
                                <div className="psi-ops-chart-rail">
                                    <span
                                        className={index === trendSeries.length - 1 ? 'is-current' : undefined}
                                        style={{ height: `${Math.max(item.value ? 12 : 2, (item.value / trendMax) * 100)}%` }}
                                    >
                                        {item.value > 0 ? <b>{item.value}</b> : null}
                                    </span>
                                </div>
                                <small>{item.label}</small>
                            </div>
                        ))}
                    </div>
                </article>

                <article className="psi-ops-panel psi-ops-distribution">
                    <header className="psi-ops-panel-header">
                        <div>
                            <h2>검토·조치 분포</h2>
                            <p>한 기록을 하나의 현재 상태로 집계</p>
                        </div>
                        <span className="psi-ops-panel-unit">총 {filteredRecords.length}건</span>
                    </header>
                    <div className="psi-ops-distribution-body">
                        <div
                            className="psi-ops-stacked-bar"
                            role="img"
                            aria-label={`완료 ${statusCounts.completed}건, 진행 ${statusCounts.progress}건, 검토 대기 ${statusCounts.pending}건, 보호 우선 ${statusCounts.immediate}건`}
                        >
                            <span className="is-complete" style={{ width: `${(statusCounts.completed / distributionTotal) * 100}%` }} />
                            <span className="is-progress" style={{ width: `${(statusCounts.progress / distributionTotal) * 100}%` }} />
                            <span className="is-pending" style={{ width: `${(statusCounts.pending / distributionTotal) * 100}%` }} />
                            <span className="is-critical" style={{ width: `${(statusCounts.immediate / distributionTotal) * 100}%` }} />
                        </div>
                        <dl className="psi-ops-distribution-list">
                            {[
                                { label: '완료', value: statusCounts.completed, tone: 'complete' },
                                { label: '진행', value: statusCounts.progress, tone: 'progress' },
                                { label: '검토 대기', value: statusCounts.pending, tone: 'pending' },
                                { label: '보호 우선', value: statusCounts.immediate, tone: 'critical' },
                            ].map((item) => (
                                <div key={item.label}>
                                    <dt><span className={`is-${item.tone}`} aria-hidden="true" />{item.label}</dt>
                                    <dd>{item.value}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                </article>

                <article className="psi-ops-panel psi-ops-ai">
                    <header className="psi-ops-panel-header">
                        <div className="psi-ops-ai-title">
                            <span aria-hidden="true">AI</span>
                            <div>
                                <h2>AI 제안</h2>
                                <p>관리자 검토형 안내</p>
                            </div>
                        </div>
                        <span className="psi-ops-ai-review">사람의 확인 필요</span>
                    </header>
                    <div className="psi-ops-ai-body">
                        <p>{aiSuggestion}</p>
                        <div className="psi-ops-ai-evidence">
                            <span className="psi-ops-evidence-mark" aria-hidden="true" />
                            <span>
                                근거 위험 신호 {evidenceCount}건
                                {' · '}
                                {averageOcrConfidence === null ? 'OCR 신뢰도 미산정' : `OCR 평균 신뢰도 ${averageOcrConfidence}%`}
                            </span>
                        </div>
                        <div className="psi-ops-ai-actions">
                            <button type="button" onClick={() => setCurrentPage('ocr-analysis')}>근거 기록 검토</button>
                            <button type="button" onClick={() => setCurrentPage('safety-compliance-hub')}>조치 현황 확인</button>
                        </div>
                    </div>
                </article>
            </section>

            <section className="psi-ops-workflow" aria-labelledby="operations-workflow-title">
                <header>
                    <div>
                        <p className="psi-ops-eyebrow">Closed safety loop</p>
                        <h2 id="operations-workflow-title">분석에서 교육 환류까지</h2>
                        <p>필요한 업무만 빠르게 열고, 상세 분석은 별도 화면에서 이어갑니다.</p>
                    </div>
                    <button type="button" onClick={onOpenAdvanced} className="psi-ops-secondary-action">
                        상세 분석 대시보드
                        <ChevronIcon />
                    </button>
                </header>
                <div className="psi-ops-quick-grid">
                    {quickLinks.map((item, index) => (
                        <button type="button" key={item.page} onClick={() => setCurrentPage(item.page)}>
                            <span className="psi-ops-quick-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                            <span>
                                <strong>{item.title}</strong>
                                <small>{item.description}</small>
                            </span>
                            <ChevronIcon />
                        </button>
                    ))}
                </div>
                <p className="psi-ops-data-note">
                    현재 화면은 이 기기에 연결된 위험성평가 {workerRecords.length}건과 안전점검 {safetyCheckRecords.length}건을 기준으로 표시합니다.
                </p>
            </section>
        </div>
    );
};

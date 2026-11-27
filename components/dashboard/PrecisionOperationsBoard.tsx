import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Page, SafetyCheckRecord, WorkerRecord } from '../../types';
import { nexusFeatureFlags } from '../../config/nexusFeatureFlags';
import { calculateCoreMetricSnapshot, isOperationalWorkerRecord } from '../../utils/coreMetrics';
import {
    NEXUS_EQUIPMENT_PHOTO_UPDATED_EVENT,
    readEquipmentPhotoSubmissions,
    type NexusEquipmentPhotoSubmission,
} from '../../utils/nexusEquipmentPhotoReport';
import {
    NEXUS_CEO_TRAINING_UPDATED_EVENT,
    readExecutiveTrainingCampaigns,
    type NexusExecutiveTrainingCampaign,
} from '../../utils/nexusExecutiveTrainingPipeline';
import {
    NEXUS_HQ_LOOP_UPDATED_EVENT,
    readAiInvestigations,
    readHqVisitPlans,
    type NexusAiInvestigationRecord,
    type NexusHqVisitPlan,
} from '../../utils/nexusHqCommandLoop';
import {
    NEXUS_PIPELINE_UPDATED_EVENT,
    readNexusPipelineCases,
    type NexusPipelineCase,
} from '../../utils/nexusQuickPipeline';
import { useAssessmentCycle } from '../../hooks/useAssessmentCycle';
import { resolveAssessmentPeriod } from '../../utils/assessmentCycle';
import { getSafetyLevelThresholds } from '../../utils/safetyLevelUtils';
import { buildOperationsTrend, TREND_PERIODS, type TrendGranularity } from '../../utils/operationsTrend';
import {
    isOperationsRecordCompleted,
    isOperationsRecordInProgress,
    isPendingOperationsReviewRecord,
    isProtectionPriorityRecord,
    selectOperationsPriorityQueue,
    type OperationsQueueTone,
} from '../../utils/operationsBoard';

interface PrecisionOperationsBoardProps {
    workerRecords: WorkerRecord[];
    safetyCheckRecords: SafetyCheckRecord[];
    setCurrentPage: (page: Page) => void;
    onOpenAdvanced: () => void;
    onOpenRecord?: (record: WorkerRecord) => void;
    onOpenNexus?: (trade: string, view: OperationsViewState) => void;
    initialTrade?: string;
    initialView?: OperationsViewState | null;
}

type PeriodFilter = 'all' | 'cycle' | '7' | '30';
export type OperationsViewState = { period: PeriodFilter; trend: TrendGranularity };

const OPS_TONE_CLASSES: Record<OperationsQueueTone, {
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

const formatToday = (): string =>
    new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short',
    }).format(new Date());

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
    onOpenRecord,
    onOpenNexus,
    initialTrade,
    initialView,
}) => {
    const { cycle, copy: cycleCopy } = useAssessmentCycle();
    const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(initialView?.period ?? 'cycle');
    const [tradeFilter, setTradeFilter] = useState(initialTrade || 'all');
    const [trendPeriod, setTrendPeriod] = useState<TrendGranularity>(initialView?.trend ?? 'monthly');
    const protectionPriorityThreshold = getSafetyLevelThresholds().intermediateMin;

    const [nexusCases, setNexusCases] = useState<NexusPipelineCase[]>(() => readNexusPipelineCases());
    const [nexusEquipReports, setNexusEquipReports] = useState<NexusEquipmentPhotoSubmission[]>(() =>
        readEquipmentPhotoSubmissions(),
    );
    const [nexusInvs, setNexusInvs] = useState<NexusAiInvestigationRecord[]>(() => readAiInvestigations());
    const [nexusVisits, setNexusVisits] = useState<NexusHqVisitPlan[]>(() => readHqVisitPlans());
    const [nexusTrainings, setNexusTrainings] = useState<NexusExecutiveTrainingCampaign[]>(() =>
        readExecutiveTrainingCampaigns(),
    );

    useEffect(() => {
        const sync = () => {
            setNexusCases(readNexusPipelineCases());
            setNexusEquipReports(readEquipmentPhotoSubmissions());
            setNexusInvs(readAiInvestigations());
            setNexusVisits(readHqVisitPlans());
            setNexusTrainings(readExecutiveTrainingCampaigns());
        };
        window.addEventListener(NEXUS_PIPELINE_UPDATED_EVENT, sync);
        window.addEventListener(NEXUS_EQUIPMENT_PHOTO_UPDATED_EVENT, sync);
        window.addEventListener(NEXUS_HQ_LOOP_UPDATED_EVENT, sync);
        window.addEventListener(NEXUS_CEO_TRAINING_UPDATED_EVENT, sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener(NEXUS_PIPELINE_UPDATED_EVENT, sync);
            window.removeEventListener(NEXUS_EQUIPMENT_PHOTO_UPDATED_EVENT, sync);
            window.removeEventListener(NEXUS_HQ_LOOP_UPDATED_EVENT, sync);
            window.removeEventListener(NEXUS_CEO_TRAINING_UPDATED_EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);

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
        const periodDays = periodFilter === '7' || periodFilter === '30' ? Number(periodFilter) : null;
        const currentCycle = periodFilter === 'cycle' ? resolveAssessmentPeriod(now, cycle) : null;
        const cycleStart = currentCycle ? new Date(`${currentCycle.startDate}T00:00:00`) : null;
        const cycleEnd = currentCycle ? new Date(`${currentCycle.endDate}T23:59:59`) : null;
        const cutoff = periodDays ? new Date(now.getTime() - (periodDays - 1) * 24 * 60 * 60 * 1000) : cycleStart;
        cutoff?.setHours(0, 0, 0, 0);

        return operationalRecords.filter((record) => {
            if (tradeFilter !== 'all' && record.jobField !== tradeFilter) return false;
            if (!cutoff) return true;
            const recordDate = parseRecordDate(record.date);
            return recordDate ? recordDate >= cutoff && (!cycleEnd || recordDate <= cycleEnd) : false;
        });
    }, [cycle, operationalRecords, periodFilter, tradeFilter]);

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
            if (isProtectionPriorityRecord(record, protectionPriorityThreshold)) {
                result.immediate += 1;
            } else if (isPendingOperationsReviewRecord(record)) {
                result.pending += 1;
            } else if (isOperationsRecordInProgress(record)) {
                result.progress += 1;
            } else if (isOperationsRecordCompleted(record)) {
                result.completed += 1;
            } else {
                result.pending += 1;
            }
        });

        return result;
    }, [filteredRecords, protectionPriorityThreshold]);

    const allPriorityQueue = useMemo(
        () => selectOperationsPriorityQueue(filteredRecords, protectionPriorityThreshold, filteredRecords.length),
        [filteredRecords, protectionPriorityThreshold],
    );
    const priorityQueue = allPriorityQueue.slice(0, 4);

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

    const trend = useMemo(() => buildOperationsTrend(
        operationalRecords.filter(record => tradeFilter === 'all' || record.jobField === tradeFilter),
        trendPeriod, protectionPriorityThreshold,
    ), [operationalRecords, tradeFilter, trendPeriod, protectionPriorityThreshold]);
    const trendSeries = trend.points;
    const trendChartRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const chart = trendChartRef.current;
        if (!chart) return;
        const showLatest = () => { chart.scrollLeft = chart.scrollWidth; };
        showLatest();
        const observer = new ResizeObserver(showLatest);
        observer.observe(chart);
        return () => observer.disconnect();
    }, [trendSeries]);

    const averageOcrConfidence = useMemo(() => {
        const values = filteredRecords
            .map((record) => Number(record.ocrConfidence))
            .filter((value) => Number.isFinite(value) && value > 0);
        if (!values.length) return null;
        return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100);
    }, [filteredRecords]);

    const sourceReviewCount = useMemo(
        () => filteredRecords.filter((record) => (
            Boolean(record.ocrErrorType)
            || (typeof record.ocrConfidence === 'number' && record.ocrConfidence < 0.7)
        )).length,
        [filteredRecords],
    );

    const latestRecordLabel = useMemo(() => {
        const latest = filteredRecords.reduce<Date | null>((current, record) => {
            const parsed = parseRecordDate(record.date);
            if (!parsed || (current && parsed <= current)) return current;
            return parsed;
        }, null);
        if (!latest) return '기록 없음';
        return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(latest);
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
        return `현재 보호 우선 기록은 없습니다. 완료된 조치의 교육 환류와 ${cycleCopy.shortLabel} 반복 여부를 이어서 확인해 주세요.`;
    }, [cycleCopy.shortLabel, filteredRecords.length, priorityQueue, riskCounts, statusCounts.immediate, statusCounts.pending]);

    const trendMax = Math.max(1, ...trendSeries.map((item) => item.value));
    const distributionTotal = Math.max(1, filteredRecords.length);
    const evidenceCount = riskCounts.reduce((sum, [, count]) => sum + count, 0);
    const visibleRecordLabel =
        filteredRecords.length === operationalRecords.length
            ? `전체 ${filteredRecords.length}건`
            : `${operationalRecords.length}건 중 ${filteredRecords.length}건`;
    const evidenceCoverage = summary.totalWorkers > 0
        ? Math.round((summary.validScoreRecordCount / summary.totalWorkers) * 100)
        : null;
    const periodScopeLabel: Record<PeriodFilter, string> = {
        all: '전체 기간',
        cycle: cycleCopy.currentCycleLabel,
        '7': '최근 7일',
        '30': '최근 30일',
    };

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
            unit: '명',
            helper: `표시 기록 ${visibleRecordLabel}`,
            tone: 'progress',
        },
        {
            key: 'improvement',
            label: '응답 기반 개선 신호',
            value: summary.analyzedWorkerCount > 0 ? summary.improvementExecutionRate : '—',
            unit: summary.analyzedWorkerCount > 0 ? '%' : '',
            helper: summary.analyzedWorkerCount > 0 ? '관리자 확인용 보호 신호' : '세부 분석 후 표시',
            tone: 'normal',
        },
    ] as const;

    const quickLinks: Array<{ key: string; page: Page; title: string; description: string; status: string }> = [
        { key: 'capture', page: 'ocr-analysis', title: '1. 기록·분석', description: '촬영하고 원문 확인', status: `${filteredRecords.length}건` },
        { key: 'review', page: 'ocr-analysis', title: '2. 관리자 확인', description: '근거 대조·승인', status: statusCounts.pending ? `${statusCounts.pending}건 대기` : '대기 없음' },
        { key: 'protect', page: 'safety-compliance-hub', title: '3. 현장 보호조치', description: '담당·기한·이행', status: statusCounts.immediate ? `${statusCounts.immediate}건 우선` : '우선 없음' },
        { key: 'educate', page: 'education-return', title: '4. 교육 환류', description: '원페이지·개인 안내', status: '확인 기록 기반' },
        { key: 'track', page: 'monthly-guidance-report', title: '5. 반복위험 추적', description: cycleCopy.trackingLabel, status: cycleCopy.shortLabel },
        { key: 'report', page: 'reports', title: '6. 공식 리포트', description: '승인 근거·수정 이력', status: '내부 확인용' },
    ];

    const fieldRouteActions: Array<{key: string; step: string; label: string; helper: string; page: Page}> = [
        {key:'source',step:'01',label:'위험성평가 원문 확인',helper:'근로자의 위험 인식을 확인하고 관리자 검토로 연결',page:'ocr-analysis'},
        {key:'photo',step:'02',label:'현장 사진점검',helper:'확인된 사실을 기록하고 개선·재점검 항목 관리',page:'safety-inspector'},
        {key:'education',step:'03',label:'교육 환류',helper:'검토된 기록을 근로자 안전계도와 다음 교육으로 연결',page:'education-return'},
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
                        <span className="psi-ops-context-divider" aria-hidden="true" />
                        <span>{cycleCopy.cadenceLabel} · {cycleCopy.frequencyLabel}</span>
                    </div>
                    <p className="psi-ops-eyebrow">PSI · 현장 운영 대시보드</p>
                    <h1 id="operations-page-title" className="psi-ops-title">현장 안전, 한눈에.</h1>
                    <p className="psi-ops-subtitle">오늘 처리할 위험 신호를 먼저 확인하고, 검토·조치·교육까지 끊김 없이 이어갑니다.</p>
                    <div className="psi-ops-hero-pills"><span>선택 기간 기록 <b>{filteredRecords.length}건</b></span><span>검토 대기 <b>{statusCounts.pending}건</b></span><span>확인 완료 <b>{statusCounts.completed}건</b></span></div>
                </div>

                <div className="psi-ops-toolbar" role="group" aria-label="안전 운영 필터와 주요 작업">
                    <label className="psi-ops-filter">
                        <span>기간</span>
                        <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value as PeriodFilter)}>
                            <option value="all">전체 기간</option>
                            <option value="cycle">{cycleCopy.currentCycleLabel} ({cycleCopy.shortLabel})</option>
                            <option value="7">최근 7일</option>
                            <option value="30">최근 30일</option>
                        </select>
                    </label>
                    <label className="psi-ops-filter">
                        <span>공종</span>
                        <select value={tradeFilter} onChange={(event) => setTradeFilter(event.target.value)}>
                            <option value="all">전체 공종</option>
                            {tradeFilter !== 'all' && !tradeOptions.includes(tradeFilter) && <option value={tradeFilter}>{tradeFilter} · 현재 기록 없음</option>}
                            {tradeOptions.map((trade) => <option key={trade} value={trade}>{trade}</option>)}
                        </select>
                    </label>
                    <button
                        type="button"
                        onClick={() => setCurrentPage('ocr-analysis')}
                        className="psi-ops-primary-action"
                    >
                        <PlusIcon />
                        <span>새 {cycleCopy.recordLabel} 등록</span>
                    </button>
                </div>
            </section>

            <section className="psi-ops-field-route" aria-labelledby="psi-field-route-title">
                <div className="psi-ops-field-route-heading">
                    <div>
                        <p className="psi-ops-route-eyebrow">FIELD WORKFLOW / 3 STEPS</p>
                        <h2 id="psi-field-route-title">오늘 현장 업무, 여기서 시작하세요</h2>
                        <p>근로자 기록을 이해하고, 실제 위험을 확인하며, 다음 교육으로 이어갑니다.</p>
                    </div>
                    <span className="psi-ops-route-manual">최종 판단 · 현장 관리자 확인</span>
                </div>
                <div className="psi-ops-field-route-grid">
                    {fieldRouteActions.map((action) => (
                        <button
                            type="button"
                            key={action.key}
                            className={`psi-ops-route-action psi-ops-route-action--${action.key}`}
                            onClick={() => setCurrentPage(action.page)}
                            aria-label={`${action.label} 화면으로 이동`}
                        >
                            <span className="psi-ops-route-number" aria-hidden="true">{action.step}</span>
                            <span className="psi-ops-route-copy">
                                <strong>{action.label}</strong>
                                <small>{action.helper}</small>
                            </span>
                            <span className="psi-ops-route-arrow" aria-hidden="true"><ChevronIcon /></span>
                        </button>
                    ))}
                </div>
                {nexusFeatureFlags.uiEnabled && <button type="button" className="psi-ops-text-action" onClick={() => onOpenNexus ? onOpenNexus(tradeFilter === 'all' ? '' : tradeFilter, {period:periodFilter,trend:trendPeriod}) : setCurrentPage('safety-nexus')}>안전지능 연결 보기 · 시제품</button>}
                <p className="psi-ops-route-note">선택한 공종을 전달합니다. 기간은 안전지능 화면에서 다시 선택해 주세요.</p>
                <p className="psi-ops-route-note">AI 분석·인계·상태 표시는 검토를 돕는 정보입니다. 현장 위험 해소나 작업 재개를 자동 승인하지 않습니다.</p>
            </section>

            <section className="psi-ops-assurance" aria-labelledby="operations-assurance-title">
                <div className="psi-ops-assurance-copy">
                    <span className="psi-ops-assurance-mark" aria-hidden="true" />
                    <div>
                        <h2 id="operations-assurance-title">사람이 확정하는 보호 판단</h2>
                        <p>자동 분석은 확인할 신호를 정리합니다. 원문과 현장 상황을 대조한 관리자의 판단이 최종 기준입니다.</p>
                        {summary.unconfirmedIdentityCount > 0 && <p>식별 미확인 {summary.unconfirmedIdentityCount}건은 개별 집계됩니다. 이름만으로 합치지 않으므로 표시 인원은 실제 인원과 다를 수 있습니다.</p>}
                    </div>
                </div>
                <dl className="psi-ops-assurance-metrics">
                    <div><dt>분석 근거</dt><dd>{summary.validScoreRecordCount}/{summary.totalWorkers}명</dd></div>
                    <div><dt>근거 준비율</dt><dd>{evidenceCoverage === null ? '—' : `${evidenceCoverage}%`}</dd></div>
                    <div><dt>원문 확인 필요</dt><dd>{sourceReviewCount}건</dd></div>
                    <div><dt>최근 기록</dt><dd>{latestRecordLabel}</dd></div>
                </dl>
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

            {nexusFeatureFlags.uiEnabled && (() => {
                const openNexusCount = nexusCases.filter(c => c.status !== 'closed').length;
                const stopWorkCount = nexusCases.filter(c => c.status !== 'closed' && c.stopWorkFlag).length;
                const ceoPhotoReported = nexusEquipReports.filter(e => e.status === 'reported_to_ceo').length;
                const hqPhotoPending = nexusEquipReports.filter(e => e.status === 'submitted_to_hq').length;
                const hqPendingInvs = nexusInvs.filter(i => i.status === 'ai_draft_pending_hq').length;
                const activeVisitsCount = nexusVisits.filter(v => v.status !== 'action_issued_closed').length;
                const trainingTargets = nexusTrainings.reduce((s, t) => s + Math.max(1, t.targetWorkers || 0), 0);
                const trainingSigned = nexusTrainings.reduce((s, t) => s + Math.max(0, t.confirmedSignatures || 0), 0);
                const trainingPct = trainingTargets > 0 ? Math.min(100, Math.round((trainingSigned / trainingTargets) * 100)) : 0;
                return (
                    <section
                        className="mb-4 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-4 text-slate-100 shadow-lg"
                        aria-label="안전지능 네트워크 본사·현장 폐루프 요약 연동"
                    >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">
                                    SOVEREIGN NEXUS BRIDGE · 본사·현장 폐루프 연동
                                </span>
                                <h2 className="mt-1 text-base font-extrabold text-white">
                                    골조·형틀·건설기계 사용전 사진 보고 &amp; 본사 결재 현황
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => onOpenNexus ? onOpenNexus(tradeFilter === 'all' ? '' : tradeFilter, { period: periodFilter, trend: trendPeriod }) : setCurrentPage('safety-nexus')}
                                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/50 bg-amber-500/15 px-4 py-2 text-xs font-extrabold text-amber-200 transition hover:bg-amber-500/25"
                            >
                                3D 황금 구체 &amp; 경영 브리핑 열기 ↗
                            </button>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                            <div className="rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 py-2.5">
                                <p className="text-[11px] font-bold text-slate-400">현장 미결·작업중지</p>
                                <p className="mt-1 text-lg font-black text-amber-200">{openNexusCount}건 <small className="text-xs font-bold text-rose-300">({stopWorkCount > 0 ? `중지 ${stopWorkCount}` : '정상'})</small></p>
                            </div>
                            <div className="rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 py-2.5">
                                <p className="text-[11px] font-bold text-slate-400">건설기계 사용전 사진</p>
                                <p className="mt-1 text-lg font-black text-cyan-200">{nexusEquipReports.length}건 <small className="text-xs font-bold text-slate-400">(CEO보고 {ceoPhotoReported} · 대기 {hqPhotoPending})</small></p>
                            </div>
                            <div className="rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 py-2.5">
                                <p className="text-[11px] font-bold text-slate-400">본사 결재·순회대기</p>
                                <p className="mt-1 text-lg font-black text-violet-200">{hqPendingInvs + activeVisitsCount}건 <small className="text-xs font-bold text-slate-400">(조사 {hqPendingInvs} · 순회 {activeVisitsCount})</small></p>
                            </div>
                            <div className="rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 py-2.5">
                                <p className="text-[11px] font-bold text-slate-400">12개국어 교육 이수</p>
                                <p className="mt-1 text-lg font-black text-emerald-200">{trainingPct}% <small className="text-xs font-bold text-slate-400">({trainingSigned}/{trainingTargets}명)</small></p>
                            </div>
                        </div>
                    </section>
                );
            })()}

            <section className="psi-ops-main-grid" aria-label="안전 운영 상세">
                <article className="psi-ops-panel psi-ops-priority">
                    <header className="psi-ops-panel-header">
                        <div>
                            <div className="psi-ops-panel-title-row">
                                <h2>{periodScopeLabel[periodFilter]} 우선 확인</h2>
                                <span>{allPriorityQueue.length}건</span>
                            </div>
                            <p>보호 우선·승인 대기·분석 중 기록을 위험도 순으로 정리했습니다.{allPriorityQueue.length > priorityQueue.length ? ` 상위 ${priorityQueue.length}건을 표시합니다.` : ''}</p>
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
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (onOpenRecord && item.actionPage === 'ocr-analysis') {
                                                            onOpenRecord(item.record);
                                                            return;
                                                        }
                                                        setCurrentPage(item.actionPage);
                                                    }}
                                                    aria-label={`${item.record.name} ${item.actionLabel}`}
                                                >
                                                    {item.actionLabel}
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
                            <p>최신 작성일 {trend.latestDate || '미등록'} 기준 {TREND_PERIODS[trendPeriod].range}</p>
                        </div>
                        <span className="psi-ops-panel-unit">위험 신호 {trend.risks} / 기록 {trend.total}건</span>
                    </header>
                    <div className="psi-ops-trend-tabs" role="group" aria-label="위험 기록 추이 집계 단위">
                        {(Object.keys(TREND_PERIODS) as TrendGranularity[]).map(period => <button key={period} type="button" aria-pressed={trendPeriod === period} onClick={() => setTrendPeriod(period)}>{TREND_PERIODS[period].label}</button>)}
                    </div>
                    <p className="psi-ops-trend-scope">공종 필터 적용 · 상단 기간과 별도로 문서 작성일 집계 · 막대는 위험 신호 기록 건수</p>
                    {trend.total === 0 && <p className="psi-ops-trend-empty">집계할 기록이 없습니다. 기록 없음은 위험 없음 판정을 뜻하지 않습니다.</p>}
                    <div
                        className="psi-ops-chart"
                        ref={trendChartRef}
                        tabIndex={0}
                        style={{ gridTemplateColumns: `repeat(${trendSeries.length}, minmax(30px, 1fr))`, overflowX: 'auto' }}
                        role="img"
                        aria-label={`최근 위험 기록 추이: ${trendSeries.map((item) => `${item.label} ${item.value}건`).join(', ')}`}
                    >
                        {trendSeries.map((item, index) => (
                            <div key={item.key} className="psi-ops-chart-column" aria-hidden="true" title={`${item.key} ~ ${item.end}: 위험 신호 ${item.value}건 / 전체 기록 ${item.total}건`}>
                                <div className="psi-ops-chart-rail">
                                    <span
                                        className={index === trendSeries.length - 1 ? 'is-current' : undefined}
                                        style={{ height: `${item.value ? Math.max(12, (item.value / trendMax) * 100) : 0}%` }}
                                    >
                                        {item.value > 0 ? <b>{item.value}</b> : null}
                                    </span>
                                </div>
                                <small>{item.label}</small>
                            </div>
                        ))}
                    </div>
                    <p className="psi-ops-trend-scope">{trendSeries[0].key} ~ {trend.latestDate || trendSeries[trendSeries.length - 1].end} · 좌우로 이동해 이전 구간 확인{trend.invalidDateCount > 0 ? ` · 날짜 확인 필요 ${trend.invalidDateCount}건 제외` : ''}</p>
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
                                {averageOcrConfidence === null ? '원문 인식 상태 미산정' : `원문 인식 평균 ${averageOcrConfidence}%`}
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
                        <p className="psi-ops-eyebrow">기록 → 확인 → 환류</p>
                        <h2 id="operations-workflow-title">쓴 위험을 확인된 행동으로</h2>
                        <p>기록을 읽는 데서 끝내지 않고 현장조치, 교육, 다음 주기 재확인까지 연결합니다.</p>
                    </div>
                    <button type="button" onClick={onOpenAdvanced} className="psi-ops-secondary-action">
                        상세 분석 대시보드
                        <ChevronIcon />
                    </button>
                </header>
                <div className="psi-ops-quick-grid">
                    {quickLinks.map((item, index) => (
                        <button type="button" key={item.key} onClick={() => setCurrentPage(item.page)}>
                            <span className="psi-ops-quick-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                            <span>
                                <strong>{item.title}</strong>
                                <small>{item.description}</small>
                            </span>
                            <em>{item.status}</em>
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

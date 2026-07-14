
import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import type { WorkerRecord, Page } from '../types';
import { isAdminAuthenticated } from '../utils/adminGuard';
import { postAdminJson } from '../utils/adminApiClient';
import { extractMessage, toVercelFriendlyMessage } from '../utils/errorUtils';
import { InterpretationCardGrid, type InterpretationCardItem } from '../components/shared/InterpretationCardGrid';
import { EmptyStatePanel } from '../components/shared/EmptyStatePanel';
import { NoticeCallout } from '../components/shared/NoticeCallout';
import { SummaryMetricGrid } from '../components/shared/SummaryMetricGrid';
import { MOBILE_CARD_GRID_COMPACT_CLASS, MOBILE_CARD_GRID_ITEM_CLASS, MOBILE_CARD_PANEL_CLASS, MOBILE_CARD_PANEL_COMPACT_CLASS } from '../components/shared/cardTokens';
import { BRAND_TONE } from '../utils/brandToneTokens';
import { createMetricSessionId, trackUIViewMetric } from '../utils/uiViewModeMetrics';
import { useUiAudienceMode } from '../hooks/useUiAudienceMode';
import {
    buildSafetyCaseId,
    completeSafetyCaseStage,
    markSafetyCaseActionStarted,
    readSafetyCases,
    resolveSafetyCaseDueAt,
    syncSafetyCasesFromPlans,
    upsertSafetyCase,
} from '../utils/safetyCase';
import { saveSafetyCaseToServer } from '../services/safetyCaseService';

const PREDICTIVE_STATUS_COPY = {
    syncReady: '현재 데이터 기준으로 AI 리스크 결과를 다시 정리할 수 있습니다.',
    syncNoData: '재계산할 OCR/평가 데이터가 아직 없어 버튼이 비활성화됩니다.',
    syncLoading: '실행 계획 상태와 최근 변경 사항을 다시 불러오는 중입니다.',
    syncError: '실행 계획 조회 지연 (네트워크 연결 혹은 관리자 로그인을 확인해 주세요)',
    syncSuccess: '최신 실행 계획 상태를 반영했습니다.',
    riskInsightEmpty: {
        title: '예측 결과를 만들 데이터가 아직 충분하지 않습니다.',
        description: 'OCR 결과와 평가 이력이 더 쌓이면 우선 개입 대상과 위험 근거를 자동으로 계산합니다.',
    },
    executionPlanEmpty: {
        title: '실행 계획 생성 대기 상태입니다.',
        description: '현재 입력 조건에서는 우선 조치 대상을 계산할 데이터가 부족합니다.',
    },
    executionPlanFilteredEmpty: {
        title: '선택한 조건에 맞는 실행 계획이 없습니다.',
        description: '필터를 해제하거나 다른 우선순위를 선택하면 전체 계획을 다시 확인할 수 있습니다.',
    },
    planHistoryLoading: '실행 계획 변경 이력을 불러오는 중입니다.',
    planHistoryEmpty: '아직 저장된 실행 계획 변경 이력이 없습니다.',
} as const;

// 관리 직군 필터링 함수
const isManagementRole = (field: string) => 
    /관리|팀장|부장|과장|기사|공무|소장/.test(field);

const getWorkerIdentityKey = (record: WorkerRecord): string => {
    return String(
        record.worker_uuid
        || record.workerUuid
        || record.employeeId
        || record.qrId
        || `${record.name || 'unknown'}::${record.teamLeader || '미지정'}::${record.jobField || '미분류'}`,
    ).trim();
};

const inferHarnessWorkflowState = (record: Partial<WorkerRecord>): string => {
    if (record.workflowState) return record.workflowState;
    if (record.secondPassStatus === 'IN_PROGRESS') return 'second_pass_analyzing';
    if (record.reviewStatus === 'PENDING' || record.approvalStatus === 'PENDING') return 'awaiting_manager_approval';
    if (record.ocrErrorType || record.secondPassStatus === 'NEEDED') return 'manual_review_required';
    if (record.secondPassStatus === 'DONE' || record.reviewStatus === 'APPROVED' || record.approvalStatus === 'APPROVED') return 'completed';
    return 'uploaded';
};

const inferHarnessRiskDecision = (record: Partial<WorkerRecord>): string => {
    if (record.riskDecision) return record.riskDecision;
    if (record.ocrErrorType) return 'IMMEDIATE_ATTENTION';
    if (record.secondPassStatus === 'NEEDED') return 'SUPPLEMENTARY_REVIEW';
    return 'SAFE_TO_PROCEED';
};

const inferHarnessApprovalState = (record: Partial<WorkerRecord>, workflowState: string): string => {
    if (record.approvalState) return record.approvalState;
    if (record.reviewStatus === 'REJECTED') return 'REJECTED';
    if (record.reviewStatus === 'APPROVED' || record.approvalStatus === 'APPROVED') return 'APPROVED';
    if (workflowState === 'manual_review_required' || workflowState === 'awaiting_manager_approval' || workflowState === 'second_pass_analyzing') return 'PENDING';
    return 'NOT_REQUIRED';
};

const getHarnessPersistenceState = (record: Partial<WorkerRecord>): 'connected' | 'fallback' | 'pending' => {
    if (String(record.harnessPersistenceWarning || '').trim()) return 'fallback';
    if (String(record.workflowRunId || '').trim()) return 'connected';
    return 'pending';
};

const summarizeHarnessRecords = (records: WorkerRecord[]) => {
    const latestRecords = Array.from(
        records.reduce((map, record) => {
            const key = getWorkerIdentityKey(record);
            const current = map.get(key);
            if (!current || new Date(record.date).getTime() >= new Date(current.date).getTime()) {
                map.set(key, record);
            }
            return map;
        }, new Map<string, WorkerRecord>()).values(),
    );

    return latestRecords.reduce((summary, record) => {
        const workflowState = inferHarnessWorkflowState(record);
        const riskDecision = inferHarnessRiskDecision(record);
        const approvalState = inferHarnessApprovalState(record, workflowState);
        const persistenceState = getHarnessPersistenceState(record);

        summary.total += 1;
        if (String(record.workflowRunId || '').trim()) summary.runLinked += 1;
        if (persistenceState === 'connected') summary.connected += 1;
        if (persistenceState === 'fallback') summary.fallback += 1;
        if (persistenceState === 'pending') summary.pending += 1;
        if (approvalState === 'PENDING' || approvalState === 'REQUIRED') summary.approvalBacklog += 1;
        if (workflowState === 'manual_review_required' || workflowState === 'awaiting_manager_approval' || workflowState === 'second_pass_analyzing') summary.reviewNeeded += 1;
        if (riskDecision === 'IMMEDIATE_ATTENTION' || riskDecision === 'CRITICAL_STOP') summary.immediateAttention += 1;
        return summary;
    }, {
        total: 0,
        runLinked: 0,
        connected: 0,
        fallback: 0,
        pending: 0,
        approvalBacklog: 0,
        reviewNeeded: 0,
        immediateAttention: 0,
    });
};

// 온톨로지 노드 및 링크 타입 정의
interface Node {
    id: string;
    group: 'worker' | 'risk' | 'job' | 'action';
    value: number; // 크기 결정
    label: string;
}

interface Link {
    source: string;
    target: string;
    value: number; // 굵기 결정
}

interface WorkerRiskInsight {
    key: string;
    name: string;
    jobField: string;
    nationality: string;
    latestScore: number;
    previousScore: number | null;
    scoreDelta: number | null;
    riskScore: number;
    topRisk: string;
    teamLeader?: string;
    reasonLabels: string[];
    latestRecord: WorkerRecord;
}

interface ActionExecutionPlan {
    key: string;
    caseId: string;
    sourceRecordId: string;
    workerId: string;
    priority: '즉시' | '고' | '중';
    owner: string;
    workerName: string;
    jobField: string;
    teamLeader?: string;
    riskLabel: string;
    actionTitle: string;
    dueLabel: string;
    dueAt?: string;
    checkItems: string[];
}

type PlanStatus = 'not-started' | 'in-progress' | 'completed';

type ExecutionPlanFilter = 'all' | 'urgent' | PlanStatus;

type PredictiveSyncState = 'idle' | 'loading' | 'success' | 'error';

type PlanStatusApiItem = {
    planKey: string;
    status: PlanStatus;
    updatedAt?: string | null;
    updatedBy?: string | null;
};

type PlanStatusHistoryItem = {
    status: PlanStatus;
    previousStatus?: PlanStatus | null;
    updatedAt: string | null;
    updatedBy: string | null;
};

type PlanAuditMeta = {
    updatedAt: string | null;
    updatedBy: string | null;
};

const PLAN_STATUS_META: Record<PlanStatus, { label: string; chipClass: string; buttonClass: string }> = {
    'not-started': {
        label: '미착수',
        chipClass: 'bg-slate-100 text-slate-700',
        buttonClass: 'border-slate-200 text-slate-600 hover:bg-slate-100',
    },
    'in-progress': {
        label: '진행중',
        chipClass: 'bg-amber-100 text-amber-700',
        buttonClass: 'border-amber-200 text-amber-700 hover:bg-amber-50',
    },
    completed: {
        label: '완료',
        chipClass: 'bg-emerald-100 text-emerald-700',
        buttonClass: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
    },
};

const PLAN_STATUS_STORAGE_KEY = 'psi_predictive_execution_plan_status_v1';
const PREDICTIVE_INTERVENTION_HANDOFF_KEY = 'psi_predictive_intervention_handoff_v1';
const PREDICTIVE_INTERVENTION_HANDOFF_EVENT = 'psi-predictive-intervention-updated';
const INTERVENTION_FOCUS_PLAN_KEY = 'psi_intervention_focus_plan_key_v1';
const INTERVENTION_FOCUS_EVENT = 'psi-intervention-focus-updated';

const readSavedPlanStatusMap = (): Record<string, PlanStatus> => {
    try {
        if (typeof window === 'undefined') return {};
        const raw = window.localStorage.getItem(PLAN_STATUS_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const allowed = new Set<PlanStatus>(['not-started', 'in-progress', 'completed']);
        const next: Record<string, PlanStatus> = {};
        for (const [key, value] of Object.entries(parsed || {})) {
            if (typeof value === 'string' && allowed.has(value as PlanStatus)) {
                next[key] = value as PlanStatus;
            }
        }
        return next;
    } catch {
        return {};
    }
};

const getRegisteredJobFields = (): string[] => {
    try {
        if (typeof window === 'undefined') return [];
        const raw = window.localStorage.getItem('psi_app_settings');
        if (!raw) return [];
        const parsed = JSON.parse(raw) as { jobFields?: unknown };
        if (!Array.isArray(parsed?.jobFields)) return [];
        return parsed.jobFields
            .map((item) => String(item || '').trim())
            .filter((item) => item.length > 0);
    } catch {
        return [];
    }
};

const isFormworkJob = (jobField: string) => jobField.includes('형틀');

const normalizeTeamLabel = (teamLeader?: string) => {
    const trimmed = String(teamLeader || '').trim();
    return trimmed.length > 0 ? trimmed : '팀미지정';
};

const getCurrentBoardScope = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
};

const getCurrentAdminActorName = () => {
    try {
        if (typeof window === 'undefined') return '관리자';
        const raw = window.localStorage.getItem('psi_app_settings');
        if (!raw) return '관리자';
        const parsed = JSON.parse(raw) as { siteManager?: unknown };
        const siteManager = String(parsed?.siteManager || '').trim();
        return siteManager || '관리자';
    } catch {
        return '관리자';
    }
};

const formatAuditTime = (value?: string | null) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const getPlanGroupLabel = (plan: Pick<ActionExecutionPlan, 'jobField' | 'teamLeader'>) => {
    if (isFormworkJob(plan.jobField)) {
        return `${plan.jobField} · ${normalizeTeamLabel(plan.teamLeader)}`;
    }
    return plan.jobField;
};

const clampOntologyZoom = (value: number) => Math.min(1.8, Math.max(0.7, Number(value.toFixed(2))));

const getOntologyLabelLimit = (group: Node['group']) => {
    if (group === 'worker') return 8;
    if (group === 'action') return 10;
    return 9;
};

const shortenOntologyLabel = (label: string, group: Node['group']) => {
    const normalized = String(label || '').trim();
    const limit = getOntologyLabelLimit(group);
    if (normalized.length <= limit) return normalized;
    return `${normalized.slice(0, Math.max(0, limit - 1))}…`;
};

const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
};

const getOntologyGroupLabel = (group: Node['group']) => {
    if (group === 'worker') return '근로자';
    if (group === 'job') return '공종';
    if (group === 'risk') return '위험요인';
    return '예방대책';
};

const clampRiskScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const inferRiskKeyword = (text: string) => {
    if (text.includes('추락') || text.includes('고소')) return '추락 위험';
    if (text.includes('전기') || text.includes('감전')) return '감전 위험';
    if (text.includes('화재') || text.includes('용접')) return '화재 위험';
    if (text.includes('보호구') || text.includes('미착용')) return '보호구 미흡';
    if (text.includes('협착') || text.includes('끼임')) return '협착 위험';
    return '작업 절차 미준수';
};

const getActionByRisk = (riskLabel: string) => {
    if (riskLabel === '추락 위험') return '안전대 체결 확인 및 고소작업 전 점검';
    if (riskLabel === '화재 위험') return '화기작업 허가서 재점검 및 소화기 배치';
    if (riskLabel === '감전 위험') return '전선 피복·누전차단기 점검';
    if (riskLabel === '보호구 미흡') return 'TBM 보호구 상호점검 및 착용 인증';
    if (riskLabel === '협착 위험') return '신호수 배치 및 협착구간 접근 통제';
    return '표준 작업절차 재교육 및 현장 확인';
};

const getOwnerByRisk = (riskLabel: string, jobField: string) => {
    if (riskLabel === '감전 위험') return `전기안전 담당 · ${jobField} 반장`;
    if (riskLabel === '화재 위험') return `화기관리 책임자 · ${jobField} 반장`;
    if (riskLabel === '추락 위험') return `안전관리자 · ${jobField} 팀장`;
    return `${jobField} 팀장 · 안전담당`;
};

const parseRecordDate = (value: string) => {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
};

// 간단한 포스 그래프 시각화 컴포넌트 (SVG 기반)
const OntologyGraph: React.FC<{ nodes: Node[], links: Link[]; spacingStrength: number }> = ({ nodes, links, spacingStrength }) => {
    // 렌더링 최적화를 위해 노드 좌표를 미리 계산 (시뮬레이션 단순화)
    const [positions, setPositions] = useState<Record<string, { x: number, y: number }>>({});
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoverTooltip, setHoverTooltip] = useState<{ x: number; y: number; label: string; group: Node['group'] } | null>(null);
    const [pinnedNodeId, setPinnedNodeId] = useState<string | null>(null);
    const [pinnedTooltip, setPinnedTooltip] = useState<{ x: number; y: number; label: string; group: Node['group'] } | null>(null);
    const [isTooltipCopied, setIsTooltipCopied] = useState(false);

    useEffect(() => {
        const newPos: Record<string, { x: number, y: number }> = {};
        const width = 1000;
        const height = 700;
        const margin = 28;
        const centerX = width / 2;
        const centerY = height / 2;

        // 그룹별 배치 전략
        nodes.forEach((node, i) => {
            const angle = (i / nodes.length) * 2 * Math.PI;
            let radius = 240;
            
            if (node.group === 'risk') radius = 95; // 위험요인은 중앙
            if (node.group === 'job') radius = 210; // 공종은 중간
            if (node.group === 'worker') radius = 285; // 근로자는 외곽
            if (node.group === 'action') radius = 320; // 조치는 최외곽

            // 노드 ID 해시를 이용한 랜덤성 부여 (일관된 위치 보장)
            const hash = node.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const noise = (hash % 30) - 15;

            newPos[node.id] = {
                x: centerX + Math.cos(angle) * radius + noise,
                y: centerY + Math.sin(angle) * radius + noise
            };
        });

        const relaxIterations = 16 + Math.round(spacingStrength * 12);
        const minDistance = 30 + Math.round(spacingStrength * 24);
        const nodeIds = nodes.map((node) => node.id);

        for (let iteration = 0; iteration < relaxIterations; iteration++) {
            for (let i = 0; i < nodeIds.length; i++) {
                for (let j = i + 1; j < nodeIds.length; j++) {
                    const leftId = nodeIds[i];
                    const rightId = nodeIds[j];
                    const left = newPos[leftId];
                    const right = newPos[rightId];
                    if (!left || !right) continue;

                    const dx = right.x - left.x;
                    const dy = right.y - left.y;
                    const distance = Math.sqrt(dx * dx + dy * dy) || 0.001;

                    if (distance >= minDistance) continue;

                    const push = (minDistance - distance) / 2;
                    const ux = dx / distance;
                    const uy = dy / distance;

                    left.x -= ux * push;
                    left.y -= uy * push;
                    right.x += ux * push;
                    right.y += uy * push;
                }
            }

            for (const nodeId of nodeIds) {
                const point = newPos[nodeId];
                if (!point) continue;
                point.x = Math.min(width - margin, Math.max(margin, point.x));
                point.y = Math.min(height - margin, Math.max(margin, point.y));
            }
        }

        setPositions(newPos);
    }, [nodes, spacingStrength]);

    const activeTooltip = pinnedTooltip || hoverTooltip;

    const tooltipPlacement = useMemo(() => {
        if (!activeTooltip) return null;

        const leftPercent = (activeTooltip.x / 1000) * 100;
        const topPercent = (activeTooltip.y / 700) * 100;
        const safeLeft = Math.min(96, Math.max(4, leftPercent));
        const safeTop = Math.min(94, Math.max(6, topPercent));

        const placeLeft = activeTooltip.x > 760;
        const placeTop = activeTooltip.y > 560;

        return {
            left: `${safeLeft}%`,
            top: `${safeTop}%`,
            transform: placeLeft
                ? (placeTop ? 'translate(calc(-100% - 10px), calc(-100% - 8px))' : 'translate(calc(-100% - 10px), -50%)')
                : (placeTop ? 'translate(10px, calc(-100% - 8px))' : 'translate(10px, -50%)'),
        };
    }, [activeTooltip]);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setPinnedNodeId(null);
            setPinnedTooltip(null);
            setIsTooltipCopied(false);
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, []);

    useEffect(() => {
        if (!isTooltipCopied) return;
        const timer = window.setTimeout(() => setIsTooltipCopied(false), 1400);
        return () => window.clearTimeout(timer);
    }, [isTooltipCopied]);

    const handleCopyTooltip = async () => {
        if (!activeTooltip?.label) return;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(activeTooltip.label);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = activeTooltip.label;
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            setIsTooltipCopied(true);
        } catch {
            setIsTooltipCopied(false);
        }
    };

    return (
        <div className="relative w-full h-full">
        <svg
            viewBox="0 0 1000 700"
            className="w-full h-full bg-slate-900 rounded-2xl shadow-inner border border-slate-700"
            onClick={() => {
                setPinnedNodeId(null);
                setPinnedTooltip(null);
            }}
        >
            <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="28" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
                </marker>
            </defs>
            {/* Links */}
            {links.map((link, i) => {
                const start = positions[link.source];
                const end = positions[link.target];
                if (!start || !end) return null;
                return (
                    <line 
                        key={i} 
                        x1={start.x} y1={start.y} 
                        x2={end.x} y2={end.y} 
                        stroke={link.value > 2 ? "#f43f5e" : "#475569"} 
                        strokeWidth={Math.sqrt(link.value)} 
                        strokeOpacity={0.6}
                        markerEnd="url(#arrowhead)"
                    />
                );
            })}
            {/* Nodes */}
            {nodes.map((node) => {
                const pos = positions[node.id];
                if (!pos) return null;
                let color = "#94a3b8";
                if (node.group === 'risk') color = "#f43f5e"; // Red
                if (node.group === 'worker') color = "#3b82f6"; // Blue
                if (node.group === 'job') color = "#10b981"; // Emerald
                if (node.group === 'action') color = "#f59e0b"; // Amber
                const displayLabel = shortenOntologyLabel(node.label, node.group);

                return (
                    <g
                        key={node.id}
                        transform={`translate(${pos.x},${pos.y})`}
                        className="cursor-pointer"
                        onMouseEnter={() => {
                            if (pinnedNodeId) return;
                            setHoveredNodeId(node.id);
                            setHoverTooltip({ x: pos.x, y: pos.y, label: node.label, group: node.group });
                        }}
                        onMouseMove={() => {
                            if (pinnedNodeId) return;
                            setHoveredNodeId(node.id);
                            setHoverTooltip({ x: pos.x, y: pos.y, label: node.label, group: node.group });
                        }}
                        onMouseLeave={() => {
                            if (pinnedNodeId) return;
                            setHoveredNodeId((prev) => (prev === node.id ? null : prev));
                            setHoverTooltip((prev) => (prev?.label === node.label ? null : prev));
                        }}
                        onTouchStart={() => {
                            setHoveredNodeId(node.id);
                            setHoverTooltip({ x: pos.x, y: pos.y, label: node.label, group: node.group });
                        }}
                        onClick={(event) => {
                            event.stopPropagation();
                            if (pinnedNodeId === node.id) {
                                setPinnedNodeId(null);
                                setPinnedTooltip(null);
                                return;
                            }
                            setPinnedNodeId(node.id);
                            setPinnedTooltip({ x: pos.x, y: pos.y, label: node.label, group: node.group });
                        }}
                    >
                        <title>{node.label}</title>
                        <circle
                            r={Math.max(5, Math.sqrt(node.value) * 3 + 5)}
                            fill={color}
                            stroke={pinnedNodeId === node.id || hoveredNodeId === node.id ? '#e2e8f0' : '#1e293b'}
                            strokeWidth={pinnedNodeId === node.id || hoveredNodeId === node.id ? '3' : '2'}
                            className="transition-colors duration-150"
                        />
                        <text y={-10} textAnchor="middle" fill="white" fontSize="9" fontWeight="bold" className="pointer-events-none select-none drop-shadow-md">
                            {displayLabel}
                        </text>
                    </g>
                );
            })}
        </svg>
        {activeTooltip && tooltipPlacement && (
            <div
                className={`absolute z-20 max-w-[280px] rounded-xl border border-indigo-300/40 bg-slate-950/95 px-3 py-2 text-[11px] text-slate-100 shadow-2xl backdrop-blur-sm ${pinnedTooltip ? 'pointer-events-auto' : 'pointer-events-none'}`}
                style={tooltipPlacement}
            >
                <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black text-indigo-200 tracking-wide">{getOntologyGroupLabel(activeTooltip.group)} {pinnedTooltip ? '· 고정됨' : ''}</p>
                    {pinnedTooltip && (
                        <button
                            type="button"
                            onClick={handleCopyTooltip}
                            className="pointer-events-auto rounded-md border border-indigo-300/40 bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-black text-indigo-100 hover:bg-indigo-500/25"
                        >
                            {isTooltipCopied ? '복사됨' : '복사'}
                        </button>
                    )}
                </div>
                <p className="font-extrabold leading-snug break-words text-slate-50">{activeTooltip.label}</p>
            </div>
        )}
        </div>
    );
};

interface PredictiveAnalysisProps {
    workerRecords: WorkerRecord[];
    onNavigateToPage?: (page: Page) => void;
}

const PredictiveAnalysis: React.FC<PredictiveAnalysisProps> = ({ workerRecords, onNavigateToPage }) => {
    const uiAudienceMode = useUiAudienceMode();
    const isDevMode = uiAudienceMode === 'developer';
    // 1. 순수 근로자 필터링
    const sourceRecords = useMemo(() => 
        workerRecords.filter(r => !isManagementRole(r.jobField))
    , [workerRecords]);
    const harnessSummary = useMemo(() => summarizeHarnessRecords(sourceRecords), [sourceRecords]);

    const [todayDate, setTodayDate] = useState('');
    const [nextMonth, setNextMonth] = useState('');
    const boardScope = useMemo(() => getCurrentBoardScope(), []);
    const currentAdminActor = useMemo(() => getCurrentAdminActorName(), []);
    const [viewportWidth, setViewportWidth] = useState<number>(() => (typeof window !== 'undefined' ? window.innerWidth : 1440));
    const [showOntologyMobile, setShowOntologyMobile] = useState(false);
    const [showMobileExtendedPanels, setShowMobileExtendedPanels] = useState(false);
    const [ontologyZoom, setOntologyZoom] = useState(1);
    const [ontologySpacingStrength, setOntologySpacingStrength] = useState(0.5);
    const [planStatusMap, setPlanStatusMap] = useState<Record<string, PlanStatus>>(() => readSavedPlanStatusMap());
    const [planAuditMap, setPlanAuditMap] = useState<Record<string, PlanAuditMeta>>({});
    const [expandedHistoryPlanKey, setExpandedHistoryPlanKey] = useState<string | null>(null);
    const [expandedPlanDetailKey, setExpandedPlanDetailKey] = useState<string | null>(null);
    const [planHistoryMap, setPlanHistoryMap] = useState<Record<string, PlanStatusHistoryItem[]>>({});
    const [planHistoryLoadingMap, setPlanHistoryLoadingMap] = useState<Record<string, boolean>>({});
    const [predictiveSyncState, setPredictiveSyncState] = useState<PredictiveSyncState>('idle');
    const [predictiveSyncError, setPredictiveSyncError] = useState<string | null>(null);
    const [predictiveSyncMessage, setPredictiveSyncMessage] = useState<string>(PREDICTIVE_STATUS_COPY.syncReady);
    const [predictiveRefreshTick, setPredictiveRefreshTick] = useState(0);
    const [executionPlanFilter, setExecutionPlanFilter] = useState<ExecutionPlanFilter>('urgent');
    const [showAllExecutionPlans, setShowAllExecutionPlans] = useState(false);
    const [showAllJobActionRates, setShowAllJobActionRates] = useState(false);
    const [showAllRiskInsights, setShowAllRiskInsights] = useState(false);
    const [showAllMeetingAgenda, setShowAllMeetingAgenda] = useState(false);
    const ontologyViewportRef = useRef<HTMLDivElement | null>(null);
    const [isPanningOntology, setIsPanningOntology] = useState(false);
    const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
    const hasAutoCenteredRef = useRef(false);
    const quickActionMetricSessionRef = useRef<string>(createMetricSessionId('predictive-analysis'));
    const touchStateRef = useRef<{
        mode: 'none' | 'pan' | 'pinch';
        startX: number;
        startY: number;
        startScrollLeft: number;
        startScrollTop: number;
        startDistance: number;
        startZoom: number;
    }>({
        mode: 'none',
        startX: 0,
        startY: 0,
        startScrollLeft: 0,
        startScrollTop: 0,
        startDistance: 0,
        startZoom: 1,
    });

    const trackQuickAction = (actionKey: string, payload?: Record<string, unknown>) => {
        trackUIViewMetric('cta_click', 'predictive-analysis', quickActionMetricSessionRef.current, {
            actionKey,
            panel: 'pc_quick_actions',
            viewportWidth,
            ...payload,
        });
    };

    const hasPredictiveSourceData = sourceRecords.length > 0;
    const isPlanSyncAvailable = isAdminAuthenticated();

    useEffect(() => {
        const d = new Date();
        setTodayDate(`${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`);
        d.setMonth(d.getMonth() + 1);
        setNextMonth(`${d.getMonth() + 1}월`);
    }, []);

    useEffect(() => {
        const handleResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const riskInsights = useMemo<WorkerRiskInsight[]>(() => {
        const workerMap = new Map<string, WorkerRecord[]>();

        for (const record of sourceRecords) {
            const workerKey = `${record.name}|${record.jobField}`;
            if (!workerMap.has(workerKey)) {
                workerMap.set(workerKey, []);
            }
            workerMap.get(workerKey)!.push(record);
        }

        const insights: WorkerRiskInsight[] = [];

        for (const [workerKey, records] of workerMap.entries()) {
            const sortedRecords = [...records].sort((a, b) => parseRecordDate(a.date) - parseRecordDate(b.date));
            if (sortedRecords.length === 0) continue;

            const latestRecord = sortedRecords[sortedRecords.length - 1];
            const previousRecord = sortedRecords.length > 1 ? sortedRecords[sortedRecords.length - 2] : null;
            const latestScore = latestRecord.safetyScore || 0;
            const previousScore = previousRecord ? (previousRecord.safetyScore || 0) : null;
            const scoreDelta = previousScore === null ? null : Number((latestScore - previousScore).toFixed(1));

            const recentRecords = sortedRecords.slice(-3);
            const weaknessMap = new Map<string, number>();
            for (const rec of recentRecords) {
                for (const area of rec.weakAreas || []) {
                    const risk = inferRiskKeyword(area);
                    weaknessMap.set(risk, (weaknessMap.get(risk) || 0) + 1);
                }
            }

            const topWeakness = Array.from(weaknessMap.entries()).sort((a, b) => b[1] - a[1])[0];
            const topRisk = topWeakness?.[0] || '작업 절차 미준수';
            const repeatWeaknessScore = clampRiskScore(((topWeakness?.[1] || 0) / Math.max(1, recentRecords.length)) * 100);

            const dropAmount = scoreDelta !== null ? Math.max(0, -scoreDelta) : 0;
            const trendDropScore = clampRiskScore((dropAmount / 20) * 100);
            const lowScorePenalty = clampRiskScore(((70 - latestScore) / 30) * 100);

            const incidentSignal = latestRecord.selfAssessedRiskLevel === '상'
                ? 100
                : latestRecord.selfAssessedRiskLevel === '중'
                    ? 60
                    : 25;

            const riskScore = clampRiskScore(
                trendDropScore * 0.4
                + repeatWeaknessScore * 0.3
                + lowScorePenalty * 0.2
                + incidentSignal * 0.1
            );

            const reasons: Array<{ label: string; score: number }> = [
                { label: `점수 추세 ${scoreDelta === null ? '기준없음' : `${scoreDelta >= 0 ? '+' : ''}${scoreDelta}점`}`, score: trendDropScore },
                { label: `반복 취약 '${topRisk}'`, score: repeatWeaknessScore },
                { label: `현재 점수 ${latestScore}점`, score: lowScorePenalty },
                { label: `자가 위험수준 ${latestRecord.selfAssessedRiskLevel}`, score: incidentSignal },
            ];

            const reasonLabels = reasons.sort((a, b) => b.score - a.score).slice(0, 3).map((item) => item.label);

            insights.push({
                key: workerKey,
                name: latestRecord.name,
                jobField: latestRecord.jobField,
                nationality: latestRecord.nationality,
                latestScore,
                previousScore,
                scoreDelta,
                riskScore,
                topRisk,
                teamLeader: latestRecord.teamLeader,
                reasonLabels,
                latestRecord,
            });
        }

        return insights.sort((a, b) => b.riskScore - a.riskScore);
    }, [sourceRecords]);

    const summary = useMemo(() => {
        if (riskInsights.length === 0) {
            return {
                highRiskCount: 0,
                rapidDropCount: 0,
                topRiskLabel: '-',
            };
        }

        const highRiskCount = riskInsights.filter((item) => item.riskScore >= 70).length;
        const rapidDropCount = riskInsights.filter((item) => (item.scoreDelta ?? 0) <= -10).length;
        const topRiskMap = new Map<string, number>();

        for (const item of riskInsights) {
            topRiskMap.set(item.topRisk, (topRiskMap.get(item.topRisk) || 0) + 1);
        }

        const topRiskLabel = Array.from(topRiskMap.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

        return {
            highRiskCount,
            rapidDropCount,
            topRiskLabel,
        };
    }, [riskInsights]);

    const aiRiskScore = useMemo(() => {
        if (riskInsights.length === 0) return 0;
        const topSamples = riskInsights.slice(0, 5);
        const score = topSamples.reduce((acc, item) => acc + item.riskScore, 0) / topSamples.length;
        return clampRiskScore(score);
    }, [riskInsights]);

    const riskBucketSummary = useMemo(() => {
        const red = riskInsights.filter((item) => item.riskScore >= 70).length;
        const yellow = riskInsights.filter((item) => item.riskScore >= 40 && item.riskScore < 70).length;
        const green = riskInsights.filter((item) => item.riskScore < 40).length;
        return { red, yellow, green };
    }, [riskInsights]);

    const harnessSummaryMetrics = useMemo(() => ([
        {
            key: 'predictive-harness-connected',
            label: '저장 연결',
            value: `${harnessSummary.connected}명`,
            helper: `처리 이력 연결 ${harnessSummary.runLinked}명 / 전체 ${harnessSummary.total}명`,
            tone: BRAND_TONE.emeraldSoft80,
            labelClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700',
            helperClassName: 'mt-1 text-xs font-bold text-emerald-700',
        },
        {
            key: 'predictive-harness-backlog',
            label: '관리자 검토 대기',
            value: `${harnessSummary.approvalBacklog}명`,
            helper: `재검토 필요 ${harnessSummary.reviewNeeded}명`,
            tone: harnessSummary.approvalBacklog > 0 ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-slate-50',
            labelClassName: `text-[10px] font-black uppercase tracking-[0.18em] ${harnessSummary.approvalBacklog > 0 ? 'text-amber-700' : 'text-slate-500'}`,
            helperClassName: `mt-1 text-xs font-bold ${harnessSummary.approvalBacklog > 0 ? 'text-amber-700' : 'text-slate-600'}`,
        },
        {
            key: 'predictive-harness-attention',
            label: '즉시 개입',
            value: `${harnessSummary.immediateAttention}명`,
            helper: '다음 달 계획보다 먼저 보호 조치 우선',
            tone: harnessSummary.immediateAttention > 0 ? 'border-rose-200 bg-rose-50/80' : 'border-indigo-200 bg-indigo-50/70',
            labelClassName: `text-[10px] font-black uppercase tracking-[0.18em] ${harnessSummary.immediateAttention > 0 ? 'text-rose-700' : 'text-indigo-700'}`,
            helperClassName: `mt-1 text-xs font-bold ${harnessSummary.immediateAttention > 0 ? 'text-rose-700' : 'text-indigo-700'}`,
        },
        {
            key: 'predictive-harness-fallback',
            label: '저장 보완·대기',
            value: `${harnessSummary.fallback + harnessSummary.pending}명`,
            helper: `저장 보완 ${harnessSummary.fallback}명 · 대기 ${harnessSummary.pending}명`,
            tone: harnessSummary.fallback > 0 ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-slate-50',
            labelClassName: `text-[10px] font-black uppercase tracking-[0.18em] ${harnessSummary.fallback > 0 ? 'text-amber-700' : 'text-slate-500'}`,
            helperClassName: `mt-1 text-xs font-bold ${harnessSummary.fallback > 0 ? 'text-amber-700' : 'text-slate-600'}`,
        },
    ]), [harnessSummary]);

    // 2. 온톨로지 데이터 구성 (Nodes & Links)
    const graphData = useMemo(() => {
        const nodes: Node[] = [];
        const links: Link[] = [];
        const nodeMap = new Set<string>();

        if (sourceRecords.length === 0) return { nodes: [], links: [] };

        // 상위 위험 근로자 및 빈도 높은 위험 요소 추출
        const targetWorkers = riskInsights
            .slice(0, 10);

        targetWorkers.forEach((insight) => {
            const w = insight.latestRecord;
            // Worker Node
            if (!nodeMap.has(w.id)) {
                nodes.push({ id: w.id, group: 'worker', value: Math.max(10, Math.round(insight.riskScore / 6)), label: w.name });
                nodeMap.add(w.id);
            }

            // Job Node
            const jobId = `job-${w.jobField}`;
            if (!nodeMap.has(jobId)) {
                nodes.push({ id: jobId, group: 'job', value: 20, label: w.jobField });
                nodeMap.add(jobId);
            }
            links.push({ source: w.id, target: jobId, value: 1 });

            // Risk Nodes & Links
            w.weakAreas.forEach(weak => {
                const riskLabel = inferRiskKeyword(weak);
                const riskId = `risk-${riskLabel}`;
                
                if (!nodeMap.has(riskId)) {
                    nodes.push({ id: riskId, group: 'risk', value: 30, label: riskLabel });
                    nodeMap.add(riskId);
                }
                // Link: Worker -> Risk (점수가 낮을수록 강한 연결)
                links.push({ source: w.id, target: riskId, value: insight.riskScore >= 70 ? 5 : 2 });
                
                // Ontology Inference: Risk -> Action (Next Month Plan)
                let actionLabel = '';
                if (riskLabel === '추락 위험') actionLabel = '안전대 체결 확인';
                if (riskLabel === '화재 위험') actionLabel = '소화기 비치/감시자';
                if (riskLabel === '감전 위험') actionLabel = '전선 피복/접지 확인';
                if (riskLabel === '보호구 미흡') actionLabel = 'TBM 보호구 상호점검';
                if (riskLabel === '협착 위험') actionLabel = '신호수 배치 필수';
                
                if (actionLabel) {
                    const actionId = `action-${actionLabel}`;
                    if (!nodeMap.has(actionId)) {
                        nodes.push({ id: actionId, group: 'action', value: 15, label: actionLabel });
                        nodeMap.add(actionId);
                    }
                    links.push({ source: riskId, target: actionId, value: 3 });
                }
            });
        });

        return { nodes, links };
    }, [riskInsights, sourceRecords.length]);

    // 회의 안건 (Agenda) 생성 로직
    const meetingAgenda = useMemo(() => {
        const riskCounts: Record<string, number> = {};
        riskInsights.forEach((insight) => {
            const key = insight.topRisk;
            riskCounts[key] = (riskCounts[key] || 0) + 1;
        });
        
        const topRisks = Object.entries(riskCounts).sort((a,b) => b[1] - a[1]).slice(0, 3);
        
        return topRisks.map(([risk], idx) => ({
            rank: idx + 1,
            title: `${nextMonth} ${risk} 집중 관리 기간`,
            desc: `보호 우선군에서 ${risk} 비중이 ${(riskCounts[risk]/Math.max(1, riskInsights.length) * 100).toFixed(0)}%입니다. TBM 전파 항목으로 우선 지정하십시오.`
        }));
    }, [riskInsights, nextMonth]);

    const visibleRiskInsights = useMemo(() => {
        const topInsights = riskInsights.slice(0, 5);
        return showAllRiskInsights ? topInsights : topInsights.slice(0, 3);
    }, [riskInsights, showAllRiskInsights]);

    const visibleMeetingAgenda = useMemo(() => {
        return showAllMeetingAgenda ? meetingAgenda : meetingAgenda.slice(0, 2);
    }, [meetingAgenda, showAllMeetingAgenda]);

    const executionPlans = useMemo<ActionExecutionPlan[]>(() => {
        return riskInsights.slice(0, 5).map((insight, index) => {
            const riskLabel = insight.topRisk;
            const actionTitle = getActionByRisk(riskLabel);
            const owner = getOwnerByRisk(riskLabel, insight.jobField);
            const priority: ActionExecutionPlan['priority'] = insight.riskScore >= 85
                ? '즉시'
                : insight.riskScore >= 70
                    ? '고'
                    : '중';

            const dueLabel = index < 2
                ? `${nextMonth} 1주차`
                : index < 4
                    ? `${nextMonth} 2주차`
                    : `${nextMonth} 3주차`;

            const checkItems = [
                'TBM 시작 전 5분 브리핑 시행',
                `${actionTitle} 현장 사진 1건 이상 업로드`,
                '조치 완료 후 팀장 확인 서명',
            ];

            return {
                key: insight.key,
                caseId: buildSafetyCaseId({
                    planKey: insight.key,
                    workerName: insight.name,
                    jobField: insight.jobField,
                    riskLabel,
                }),
                sourceRecordId: insight.latestRecord.id,
                workerId: getWorkerIdentityKey(insight.latestRecord),
                priority,
                owner,
                workerName: insight.name,
                jobField: insight.jobField,
                teamLeader: insight.teamLeader,
                riskLabel,
                actionTitle,
                dueLabel,
                dueAt: resolveSafetyCaseDueAt(dueLabel),
                checkItems,
            };
        });
    }, [nextMonth, riskInsights]);

    const executionPlanMap = useMemo(() => {
        const map = new Map<string, ActionExecutionPlan>();
        for (const plan of executionPlans) {
            map.set(plan.key, plan);
        }
        return map;
    }, [executionPlans]);

    useEffect(() => {
        try {
            if (typeof window === 'undefined') return;
            window.localStorage.setItem(PLAN_STATUS_STORAGE_KEY, JSON.stringify(planStatusMap));
        } catch {
            // ignore storage failures
        }
    }, [planStatusMap]);

    const loadPlanStatusesFromServer = useCallback(async () => {
        if (!isPlanSyncAvailable) {
            setPredictiveSyncState(hasPredictiveSourceData ? 'idle' : 'error');
            setPredictiveSyncError(hasPredictiveSourceData ? null : PREDICTIVE_STATUS_COPY.syncNoData);
            setPredictiveSyncMessage(hasPredictiveSourceData ? PREDICTIVE_STATUS_COPY.syncReady : PREDICTIVE_STATUS_COPY.syncNoData);
            return;
        }

        if (executionPlans.length === 0) {
            setPredictiveSyncState(hasPredictiveSourceData ? 'idle' : 'error');
            setPredictiveSyncError(hasPredictiveSourceData ? null : PREDICTIVE_STATUS_COPY.syncNoData);
            setPredictiveSyncMessage(hasPredictiveSourceData ? PREDICTIVE_STATUS_COPY.syncReady : PREDICTIVE_STATUS_COPY.syncNoData);
            return;
        }

        setPredictiveSyncState('loading');
        setPredictiveSyncError(null);
        setPredictiveSyncMessage(PREDICTIVE_STATUS_COPY.syncLoading);

        try {
            const response = await postAdminJson<{ ok: boolean; items?: PlanStatusApiItem[] }>(
                '/api/admin/predictive-plan-status',
                {
                    action: 'list',
                    payload: {
                        boardScope,
                        planKeys: executionPlans.map((plan) => plan.key),
                    },
                },
                { fallbackMessage: '실행 계획 조회 지연 (잠시 후 다시 시도해 주세요)' }
            );

            const serverMap: Record<string, PlanStatus> = {};
            const serverAuditMap: Record<string, PlanAuditMeta> = {};
            for (const item of response.items || []) {
                if (!item?.planKey || !item?.status) continue;
                serverMap[item.planKey] = item.status;
                serverAuditMap[item.planKey] = {
                    updatedAt: item.updatedAt || null,
                    updatedBy: item.updatedBy || null,
                };
            }

            setPlanStatusMap((previous) => {
                const next: Record<string, PlanStatus> = { ...previous };
                for (const plan of executionPlans) {
                    next[plan.key] = serverMap[plan.key] || previous[plan.key] || 'not-started';
                }
                return next;
            });

            setPlanAuditMap((previous) => {
                const next: Record<string, PlanAuditMeta> = { ...previous };
                for (const plan of executionPlans) {
                    next[plan.key] = serverAuditMap[plan.key] || previous[plan.key] || { updatedAt: null, updatedBy: null };
                }
                return next;
            });

            setPredictiveSyncState('success');
            setPredictiveSyncError(null);
            setPredictiveSyncMessage(PREDICTIVE_STATUS_COPY.syncSuccess);
        } catch (error) {
            const message = extractMessage(error);
            console.warn('[PredictiveAnalysis] 실행 계획 상태 서버 조회 실패:', message);
            setPredictiveSyncState('error');
            setPredictiveSyncError(toVercelFriendlyMessage(error, message));
            setPredictiveSyncMessage(PREDICTIVE_STATUS_COPY.syncError);
        }
    }, [boardScope, executionPlans, hasPredictiveSourceData, isPlanSyncAvailable]);

    useEffect(() => {
        void loadPlanStatusesFromServer();
    }, [loadPlanStatusesFromServer]);

    useEffect(() => {
        setPlanStatusMap((previous) => {
            const next: Record<string, PlanStatus> = {};
            for (const plan of executionPlans) {
                next[plan.key] = previous[plan.key] || 'not-started';
            }
            return next;
        });

        setPlanAuditMap((previous) => {
            const next: Record<string, PlanAuditMeta> = {};
            for (const plan of executionPlans) {
                next[plan.key] = previous[plan.key] || { updatedAt: null, updatedBy: null };
            }
            return next;
        });

        setPlanHistoryMap((previous) => {
            const next: Record<string, PlanStatusHistoryItem[]> = {};
            for (const plan of executionPlans) {
                next[plan.key] = previous[plan.key] || [];
            }
            return next;
        });

        setPlanHistoryLoadingMap((previous) => {
            const next: Record<string, boolean> = {};
            for (const plan of executionPlans) {
                next[plan.key] = previous[plan.key] || false;
            }
            return next;
        });
    }, [executionPlans]);

    const handleRecalculatePredictive = useCallback(() => {
        if (!hasPredictiveSourceData || predictiveSyncState === 'loading') return;

        setShowAllRiskInsights(false);
        setShowAllExecutionPlans(false);
        setShowAllMeetingAgenda(false);
        setShowMobileExtendedPanels(false);
        setExpandedPlanDetailKey(null);
        setExpandedHistoryPlanKey(null);
        setExecutionPlanFilter('urgent');
        setPredictiveRefreshTick((previous) => previous + 1);
        hasAutoCenteredRef.current = false;

        requestAnimationFrame(() => {
            centerOntologyViewport();
        });

        if (isPlanSyncAvailable) {
            void loadPlanStatusesFromServer();
        } else {
            setPredictiveSyncState('idle');
            setPredictiveSyncError(null);
            setPredictiveSyncMessage(PREDICTIVE_STATUS_COPY.syncReady);
        }
    }, [hasPredictiveSourceData, isPlanSyncAvailable, loadPlanStatusesFromServer, predictiveSyncState]);

    const handleRetryPredictiveSync = useCallback(() => {
        if (!isPlanSyncAvailable || predictiveSyncState === 'loading') return;
        void loadPlanStatusesFromServer();
    }, [isPlanSyncAvailable, loadPlanStatusesFromServer, predictiveSyncState]);

    const predictiveActionState = useMemo(() => {
        const canRecalculate = hasPredictiveSourceData && predictiveSyncState !== 'loading';
        const canRetry = isPlanSyncAvailable && predictiveSyncState === 'error';

        return {
            canRecalculate,
            canRetry,
            showRetry: predictiveSyncState === 'error',
            statusTone:
                predictiveSyncState === 'error'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : predictiveSyncState === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : predictiveSyncState === 'loading'
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600',
        };
    }, [hasPredictiveSourceData, isPlanSyncAvailable, predictiveSyncState]);

    const statusSummary = useMemo(() => {
        const summary: Record<PlanStatus, number> = {
            'not-started': 0,
            'in-progress': 0,
            completed: 0,
        };

        for (const plan of executionPlans) {
            const status = planStatusMap[plan.key] || 'not-started';
            summary[status] += 1;
        }

        return summary;
    }, [executionPlans, planStatusMap]);

    const executionCompletionRate = useMemo(() => {
        if (executionPlans.length === 0) return 0;
        return Math.round((statusSummary.completed / executionPlans.length) * 100);
    }, [executionPlans.length, statusSummary.completed]);

    const executionPlanFilterOptions = useMemo<Array<{ key: ExecutionPlanFilter; label: string; count: number }>>(() => {
        const urgentCount = executionPlans.filter((plan) => plan.priority === '즉시' || plan.priority === '고').length;
        return [
            { key: 'urgent', label: '긴급 우선', count: urgentCount },
            { key: 'all', label: '전체', count: executionPlans.length },
            { key: 'not-started', label: '미착수', count: statusSummary['not-started'] },
            { key: 'in-progress', label: '진행중', count: statusSummary['in-progress'] },
            { key: 'completed', label: '완료', count: statusSummary.completed },
        ];
    }, [executionPlans, statusSummary]);

    const filteredExecutionPlans = useMemo(() => {
        if (executionPlanFilter === 'all') return executionPlans;
        if (executionPlanFilter === 'urgent') {
            return executionPlans.filter((plan) => plan.priority === '즉시' || plan.priority === '고');
        }
        return executionPlans.filter((plan) => (planStatusMap[plan.key] || 'not-started') === executionPlanFilter);
    }, [executionPlanFilter, executionPlans, planStatusMap]);

    const visibleExecutionPlans = useMemo(() => {
        return showAllExecutionPlans ? filteredExecutionPlans : filteredExecutionPlans.slice(0, 3);
    }, [filteredExecutionPlans, showAllExecutionPlans]);

    const topInterventionPlanKey = useMemo(() => {
        const urgentPlan = executionPlans.find((plan) => plan.priority === '즉시' || plan.priority === '고');
        return urgentPlan?.key || executionPlans[0]?.key || null;
    }, [executionPlans]);

    const moveToInterventionCoaching = useCallback((planKey?: string | null) => {
        const targetKey = planKey || topInterventionPlanKey;
        try {
            if (typeof window !== 'undefined' && targetKey) {
                window.localStorage.setItem(INTERVENTION_FOCUS_PLAN_KEY, targetKey);
                window.dispatchEvent(new Event(INTERVENTION_FOCUS_EVENT));
            }
        } catch {
            // ignore storage failures
        }

        if (onNavigateToPage) {
            onNavigateToPage('intervention-coaching');
        }
    }, [onNavigateToPage, topInterventionPlanKey]);

    useEffect(() => {
        try {
            if (typeof window === 'undefined') return;
            const handoffPayload = {
                generatedAt: new Date().toISOString(),
                topRiskLabel: summary.topRiskLabel,
                plans: executionPlans.map((plan) => ({
                    key: plan.key,
                    caseId: plan.caseId,
                    sourceRecordId: plan.sourceRecordId,
                    workerId: plan.workerId,
                    priority: plan.priority,
                    owner: plan.owner,
                    workerName: plan.workerName,
                    jobField: plan.jobField,
                    teamLeader: plan.teamLeader,
                    riskLabel: plan.riskLabel,
                    actionTitle: plan.actionTitle,
                    dueLabel: plan.dueLabel,
                    dueAt: plan.dueAt,
                    status: planStatusMap[plan.key] || 'not-started',
                    checkItems: plan.checkItems,
                })),
            };
            window.localStorage.setItem(PREDICTIVE_INTERVENTION_HANDOFF_KEY, JSON.stringify(handoffPayload));
            syncSafetyCasesFromPlans(executionPlans.map((plan) => ({
                planKey: plan.key,
                sourceRecordId: plan.sourceRecordId,
                workerId: plan.workerId,
                workerName: plan.workerName,
                jobField: plan.jobField,
                teamLeader: plan.teamLeader,
                riskLabel: plan.riskLabel,
                actionTitle: plan.actionTitle,
                owner: plan.owner,
                dueLabel: plan.dueLabel,
            })));
            window.dispatchEvent(new Event(PREDICTIVE_INTERVENTION_HANDOFF_EVENT));
        } catch {
            // ignore storage failures
        }
    }, [executionPlans, planStatusMap, summary.topRiskLabel]);

    const registeredJobFieldLabels = useMemo(() => {
        const configured = getRegisteredJobFields();
        const observed = Array.from(new Set(sourceRecords.map((record) => String(record.jobField || '').trim()).filter((value) => value.length > 0)));
        return Array.from(new Set([...configured, ...observed]));
    }, [sourceRecords]);

    const groupedJobStatLabels = useMemo(() => {
        const grouped = new Set<string>();

        for (const baseJob of registeredJobFieldLabels) {
            if (isFormworkJob(baseJob)) {
                const formworkPlans = executionPlans.filter((plan) => plan.jobField === baseJob || plan.jobField.includes(baseJob));
                if (formworkPlans.length === 0) {
                    grouped.add(`${baseJob} · 팀미지정`);
                } else {
                    for (const plan of formworkPlans) {
                        grouped.add(`${baseJob} · ${normalizeTeamLabel(plan.teamLeader)}`);
                    }
                }
            } else {
                grouped.add(baseJob);
            }
        }

        return Array.from(grouped);
    }, [executionPlans, registeredJobFieldLabels]);

    const customJobActionRates = useMemo(() => {
        return groupedJobStatLabels.map((jobLabel) => {
            const targetPlans = executionPlans.filter((plan) => getPlanGroupLabel(plan) === jobLabel);
            const total = targetPlans.length;
            const completed = targetPlans.filter((plan) => (planStatusMap[plan.key] || 'not-started') === 'completed').length;
            const inProgress = targetPlans.filter((plan) => (planStatusMap[plan.key] || 'not-started') === 'in-progress').length;
            const notStarted = Math.max(0, total - completed - inProgress);
            const actionRate = total === 0 ? 0 : Math.round((completed / total) * 100);

            return {
                jobLabel,
                total,
                completed,
                inProgress,
                notStarted,
                actionRate,
            };
        });
    }, [executionPlans, groupedJobStatLabels, planStatusMap]);

    const sortedCustomJobActionRates = useMemo(() => {
        return [...customJobActionRates].sort((a, b) => {
            if (a.actionRate !== b.actionRate) return a.actionRate - b.actionRate;
            if (a.total !== b.total) return b.total - a.total;
            return a.jobLabel.localeCompare(b.jobLabel, 'ko');
        });
    }, [customJobActionRates]);

    const visibleJobActionRates = useMemo(() => {
        return showAllJobActionRates ? sortedCustomJobActionRates : sortedCustomJobActionRates.slice(0, 4);
    }, [showAllJobActionRates, sortedCustomJobActionRates]);

    const jobActionRateSummary = useMemo(() => {
        if (sortedCustomJobActionRates.length === 0) {
            return {
                averageRate: 0,
                zeroRateCount: 0,
                focusLabels: [] as string[],
            };
        }

        const totalRate = sortedCustomJobActionRates.reduce((sum, item) => sum + item.actionRate, 0);
        return {
            averageRate: Math.round(totalRate / sortedCustomJobActionRates.length),
            zeroRateCount: sortedCustomJobActionRates.filter((item) => item.total > 0 && item.actionRate === 0).length,
            focusLabels: sortedCustomJobActionRates
                .filter((item) => item.total > 0)
                .slice(0, 3)
                .map((item) => item.jobLabel),
        };
    }, [sortedCustomJobActionRates]);

    const predictiveSummaryCards: InterpretationCardItem[] = useMemo(() => [
        {
            key: 'predictive-status',
            eyebrow: '지금 상태',
            title: `${summary.highRiskCount}명의 우선 개입 대상과 ${executionPlans.length}건의 실행 계획을 보고 있습니다.`,
            description: riskInsights.length > 0
                ? `현재 가장 반복되는 위험 테마는 ${summary.topRiskLabel}이며, 최근 급락군 ${summary.rapidDropCount}명을 함께 추적하고 있습니다.`
                : '예측 분석을 위한 실무 근로자 데이터가 충분하지 않아 우선 개입 대상 산정이 제한됩니다.',
            tone: riskInsights.length > 0 ? 'border-indigo-200 bg-indigo-50/70' : 'border-slate-200 bg-slate-50',
        },
        {
            key: 'predictive-evidence',
            eyebrow: '판단 근거',
            title: '위험인식 신호 추세, 반복 취약, 현재 신호, 자가 위험수준이 함께 반영됩니다.',
            description: '예측 위험신호는 단일 수치 대신 최근 변화와 반복 신호를 함께 읽어 누가 먼저 보호 개입이 필요한지 설명 중심으로 정리합니다.',
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'predictive-action',
            eyebrow: '다음 행동',
            title: summary.highRiskCount > 0 ? '보호 우선군부터 실행 계획과 TBM 안건으로 연결하세요.' : '반복 위험테마를 다음 달 예방 안건으로 정리하세요.',
            description: '우선 개입 대상, 온톨로지 맵, 실행 계획, 공종별 조치율을 같은 흐름으로 연결해 감시가 아니라 선제 보호 동선이 되도록 구성했습니다.',
            tone: summary.highRiskCount > 0 ? 'border-amber-200 bg-amber-50/80' : 'border-emerald-200 bg-emerald-50/80',
        },
    ], [executionPlans.length, riskInsights.length, summary.highRiskCount, summary.rapidDropCount, summary.topRiskLabel]);

    const ontologyInterpretationCards: InterpretationCardItem[] = useMemo(() => [
        {
            key: 'ontology-status',
            eyebrow: '지금 상태',
            title: graphData.nodes.length > 0 ? `${graphData.nodes.length}개 노드로 위험 연결 구조를 시각화했습니다.` : '온톨로지 맵 생성 전 단계입니다.',
            description: graphData.nodes.length > 0
                ? `상위 위험 근로자 ${Math.min(riskInsights.length, 10)}명을 중심으로 근로자·공종·위험요인·예방대책 관계를 묶어 보여줍니다.`
                : '상위 위험 근로자 데이터가 쌓이면 관계 구조를 자동으로 시각화해 반복 위험의 맥락을 읽을 수 있습니다.',
            tone: graphData.nodes.length > 0 ? 'border-indigo-200 bg-indigo-50/70' : 'border-slate-200 bg-slate-50',
        },
        {
            key: 'ontology-evidence',
            eyebrow: '판단 근거',
            title: '선의 굵기와 노드 분류가 연관성의 근거입니다.',
            description: '반복 위험이 많은 근로자일수록 더 강한 연결로 표시되어, 어떤 예방대책을 먼저 전파해야 하는지 시각적으로 빠르게 파악할 수 있습니다.',
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'ontology-action',
            eyebrow: '다음 행동',
            title: '위험요인에서 예방대책 노드까지 이어서 읽으세요.',
            description: '지도형 그래프는 설명 자료이기도 하므로 회의 중에는 취약 근로자를 지적하기보다 어떤 보호 조치를 먼저 전파할지 논의하는 데 활용할 수 있습니다.',
            tone: BRAND_TONE.amberSoft80,
        },
    ], [graphData.nodes.length, riskInsights.length]);

    const ontologyMobileSummary = useMemo(() => {
        const topWorkers = riskInsights.slice(0, 3).map((item) => `${item.name}(${item.jobField})`).join(', ') || '대상 집계 대기';
        const firstAgenda = meetingAgenda[0]?.title || '다음 달 중점 안건 정리 대기';
        const firstFocusJob = jobActionRateSummary.focusLabels[0] || '공종 재집계 필요';

        return [
            `상위 위험 대상: ${topWorkers}`,
            `반복 위험 테마: ${summary.topRiskLabel}`,
            `즉시 개입 필요: ${summary.highRiskCount}명`,
            `우선 확인 공종/팀: ${firstFocusJob}`,
            `다음 안건 연결: ${firstAgenda}`,
        ];
    }, [jobActionRateSummary.focusLabels, meetingAgenda, riskInsights, summary.highRiskCount, summary.topRiskLabel]);

    const executionInterpretationCards: InterpretationCardItem[] = useMemo(() => [
        {
            key: 'execution-status',
            eyebrow: '지금 상태',
            title: `${executionCompletionRate}% 완료율로 실행 계획을 추적 중입니다.`,
            description: `미착수 ${statusSummary['not-started']}건, 진행중 ${statusSummary['in-progress']}건, 완료 ${statusSummary.completed}건으로 현재 실행 흐름을 읽을 수 있습니다.`,
            tone: executionCompletionRate >= 70 ? 'border-emerald-200 bg-emerald-50/80' : executionCompletionRate >= 40 ? 'border-amber-200 bg-amber-50/80' : 'border-rose-200 bg-rose-50/80',
        },
        {
            key: 'execution-evidence',
            eyebrow: '판단 근거',
            title: executionPlanFilter === 'urgent' ? '긴급·고 우선안만 선별 중입니다.' : '필터 기준에 따라 실행 상태를 보고 있습니다.',
            description: `현재 필터 조건에서 ${filteredExecutionPlans.length}건이 보이며, 최근 변경 이력과 담당자 정보로 조치 신뢰도를 함께 확인할 수 있습니다.`,
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'execution-action',
            eyebrow: '다음 행동',
            title: filteredExecutionPlans.length > 0 ? '미착수 또는 진행중 계획부터 갱신하세요.' : '필터를 바꿔 다른 실행 계획을 확인하세요.',
            description: '누가·무엇을·언제 구조를 유지해 현장 책임자와 팀장이 같은 언어로 후속 조치를 이어갈 수 있도록 했습니다.',
            tone: filteredExecutionPlans.length > 0 ? 'border-indigo-200 bg-indigo-50/70' : 'border-slate-200 bg-slate-50',
        },
    ], [executionCompletionRate, executionPlanFilter, filteredExecutionPlans.length, statusSummary]);

    const jobRateInterpretationCards: InterpretationCardItem[] = useMemo(() => [
        {
            key: 'jobrate-status',
            eyebrow: '지금 상태',
            title: `${jobActionRateSummary.averageRate}% 평균 조치율을 보고 있습니다.`,
            description: `조치율 0% 공종(또는 팀) ${jobActionRateSummary.zeroRateCount}곳이 우선 확인 대상으로 올라와 있습니다.`,
            tone: jobActionRateSummary.zeroRateCount > 0 ? 'border-amber-200 bg-amber-50/80' : 'border-emerald-200 bg-emerald-50/80',
        },
        {
            key: 'jobrate-evidence',
            eyebrow: '판단 근거',
            title: '완료 · 진행중 · 미착수 분포가 조치율의 기준입니다.',
            description: '형틀 공종은 팀 단위로 세분화해 같은 공종 안에서도 어느 팀에서 조치가 막히는지 더 세밀하게 읽을 수 있습니다.',
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'jobrate-action',
            eyebrow: '다음 행동',
            title: jobActionRateSummary.focusLabels.length > 0 ? '우선 확인 공종부터 팀장과 후속 일정을 맞추세요.' : '실행 계획이 쌓이면 공종별 조치율도 함께 살아납니다.',
            description: '낮은 조치율 공종을 그대로 두지 말고 TBM 안건, 현장 지적, 추가 코칭 흐름과 연결해 실제 현장 보완으로 이어가야 합니다.',
            tone: BRAND_TONE.indigoSoft70,
        },
    ], [jobActionRateSummary]);

    const setPlanStatus = (planKey: string, status: PlanStatus) => {
        const nowIso = new Date().toISOString();

        setPlanStatusMap((previous) => ({
            ...previous,
            [planKey]: status,
        }));

        setPlanAuditMap((previous) => ({
            ...previous,
            [planKey]: {
                updatedAt: nowIso,
                updatedBy: currentAdminActor,
            },
        }));

        const plan = executionPlanMap.get(planKey);
        if (!plan || !isAdminAuthenticated()) return;

        const linkedCase = readSafetyCases().find((record) => record.caseId === plan.caseId);
        if (linkedCase && status !== 'not-started') {
            const startedCase = markSafetyCaseActionStarted(
                linkedCase,
                currentAdminActor,
                `${plan.actionTitle} 조치를 시작했습니다.`,
                nowIso,
            );
            const nextCase = status === 'completed'
                ? completeSafetyCaseStage(
                    startedCase,
                    'action',
                    currentAdminActor,
                    `${plan.actionTitle} 조치를 완료했습니다.`,
                    { occurredAt: nowIso },
                )
                : startedCase;
            upsertSafetyCase(nextCase);
            void saveSafetyCaseToServer(nextCase).catch(() => {
                // 원격 스키마 적용 전에도 로컬 보호사건 흐름은 유지한다.
            });
        }

        void postAdminJson<{ ok: boolean; item?: PlanStatusApiItem }>(
            '/api/admin/predictive-plan-status',
            {
                action: 'upsert',
                payload: {
                    boardScope,
                    planKey,
                    caseId: plan.caseId,
                    status,
                    updatedBy: currentAdminActor,
                    workerName: plan.workerName,
                    jobField: plan.jobField,
                    teamLeader: plan.teamLeader || null,
                    riskLabel: plan.riskLabel,
                    actionTitle: plan.actionTitle,
                    dueLabel: plan.dueLabel,
                },
            },
            { fallbackMessage: '실행 계획 상태 저장 확인 필요' }
        )
            .then((response) => {
                const item = response?.item;
                if (!item?.planKey) return;
                setPlanAuditMap((previous) => ({
                    ...previous,
                    [item.planKey]: {
                        updatedAt: item.updatedAt || previous[item.planKey]?.updatedAt || nowIso,
                        updatedBy: item.updatedBy || previous[item.planKey]?.updatedBy || currentAdminActor,
                    },
                }));
            })
            .catch((error) => {
                console.warn('[PredictiveAnalysis] 실행 계획 상태 서버 저장 실패:', extractMessage(error));
            });
    };

    const togglePlanHistory = async (planKey: string) => {
        if (expandedHistoryPlanKey === planKey) {
            setExpandedHistoryPlanKey(null);
            return;
        }

        setExpandedHistoryPlanKey(planKey);

        if (!isAdminAuthenticated()) return;
        if ((planHistoryMap[planKey] || []).length > 0) return;

        setPlanHistoryLoadingMap((previous) => ({
            ...previous,
            [planKey]: true,
        }));

        try {
            const response = await postAdminJson<{ ok: boolean; items?: PlanStatusHistoryItem[] }>(
                '/api/admin/predictive-plan-status',
                {
                    action: 'history',
                    payload: {
                        boardScope,
                        planKey,
                        limit: 5,
                    },
                },
                { fallbackMessage: '실행 계획 이력 조회 지연 (잠시 후 다시 시도해 주세요)' }
            );

            setPlanHistoryMap((previous) => ({
                ...previous,
                [planKey]: Array.isArray(response.items) ? response.items : [],
            }));
        } catch (error) {
            console.warn('[PredictiveAnalysis] 실행 계획 상태 이력 조회 실패:', extractMessage(error));
        } finally {
            setPlanHistoryLoadingMap((previous) => ({
                ...previous,
                [planKey]: false,
            }));
        }
    };

    const handleOntologyMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        const viewport = ontologyViewportRef.current;
        if (!viewport) return;

        setIsPanningOntology(true);
        panStartRef.current = {
            x: event.clientX,
            y: event.clientY,
            scrollLeft: viewport.scrollLeft,
            scrollTop: viewport.scrollTop,
        };
    };

    const handleOntologyMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!isPanningOntology) return;
        const viewport = ontologyViewportRef.current;
        if (!viewport) return;

        const deltaX = event.clientX - panStartRef.current.x;
        const deltaY = event.clientY - panStartRef.current.y;
        viewport.scrollLeft = panStartRef.current.scrollLeft - deltaX;
        viewport.scrollTop = panStartRef.current.scrollTop - deltaY;
    };

    const stopOntologyPanning = () => {
        setIsPanningOntology(false);
    };

    const centerOntologyViewport = () => {
        const viewport = ontologyViewportRef.current;
        if (!viewport) return;
        viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
        viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2);
    };

    const handleResetOntologyView = () => {
        setOntologyZoom(1);
        requestAnimationFrame(() => {
            centerOntologyViewport();
        });
    };

    useEffect(() => {
        if (hasAutoCenteredRef.current) return;
        if (graphData.nodes.length === 0) return;

        requestAnimationFrame(() => {
            centerOntologyViewport();
            hasAutoCenteredRef.current = true;
        });
    }, [graphData.nodes.length]);

    const handleOntologyTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
        const viewport = ontologyViewportRef.current;
        if (!viewport) return;

        if (event.touches.length === 1) {
            const touch = event.touches[0];
            touchStateRef.current = {
                ...touchStateRef.current,
                mode: 'pan',
                startX: touch.clientX,
                startY: touch.clientY,
                startScrollLeft: viewport.scrollLeft,
                startScrollTop: viewport.scrollTop,
            };
            setIsPanningOntology(true);
            return;
        }

        if (event.touches.length === 2) {
            touchStateRef.current = {
                ...touchStateRef.current,
                mode: 'pinch',
                startDistance: getTouchDistance(event.touches),
                startZoom: ontologyZoom,
            };
            setIsPanningOntology(false);
        }
    };

    const handleOntologyTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
        const viewport = ontologyViewportRef.current;
        if (!viewport) return;

        if (touchStateRef.current.mode === 'pan' && event.touches.length === 1) {
            event.preventDefault();
            const touch = event.touches[0];
            const deltaX = touch.clientX - touchStateRef.current.startX;
            const deltaY = touch.clientY - touchStateRef.current.startY;
            viewport.scrollLeft = touchStateRef.current.startScrollLeft - deltaX;
            viewport.scrollTop = touchStateRef.current.startScrollTop - deltaY;
            return;
        }

        if (touchStateRef.current.mode === 'pinch' && event.touches.length === 2) {
            event.preventDefault();
            const nextDistance = getTouchDistance(event.touches);
            if (touchStateRef.current.startDistance <= 0 || nextDistance <= 0) return;
            const scaleRatio = nextDistance / touchStateRef.current.startDistance;
            const nextZoom = clampOntologyZoom(touchStateRef.current.startZoom * scaleRatio);
            setOntologyZoom(nextZoom);
        }
    };

    const handleOntologyTouchEnd = () => {
        touchStateRef.current = {
            ...touchStateRef.current,
            mode: 'none',
            startDistance: 0,
        };
        setIsPanningOntology(false);
    };

    const isCompactMobile = viewportWidth < 640;

    /* ── 모바일 7번 화면용 상태 배지 ── */
    const mobileRiskBadge =
        aiRiskScore >= 70
            ? { label: '🔴 위험', tone: 'bg-rose-500/20 text-rose-200 border border-rose-400/40' }
            : aiRiskScore >= 40
              ? { label: '🟡 주의', tone: 'bg-amber-400/20 text-amber-100 border border-amber-300/40' }
              : { label: '🟢 안정', tone: 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40' };

    return (
        <div className="space-y-6 sm:space-y-8 animate-fade-in-up">
            {/* ── 7번 화면: 선행 위험신호 (모바일 전용) ── */}
            <div className="sm:hidden mb-2 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-4 text-white">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-300">7) 선행 위험신호</p>
                        <h2 className="mt-1 text-lg font-black">조치 우선순위 분석</h2>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${mobileRiskBadge.tone}`}>{mobileRiskBadge.label}</span>
                </div>
                {/* 위험 점수 + 버킷 */}
                <div className="mt-3 flex items-center gap-3">
                    <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-4 border-indigo-700 bg-indigo-900/60">
                        <p className="text-2xl font-black leading-none">{aiRiskScore}</p>
                        <p className="text-[9px] font-bold text-indigo-300">/100</p>
                    </div>
                    <div className="grid flex-1 grid-cols-3 gap-1.5">
                        <div className="rounded-xl border border-rose-700/40 bg-rose-900/30 px-2 py-1.5 text-center">
                            <p className="text-[9px] font-black text-rose-300">위험</p>
                            <p className="text-base font-black text-rose-100">{riskBucketSummary.red}</p>
                        </div>
                        <div className="rounded-xl border border-amber-700/40 bg-amber-900/30 px-2 py-1.5 text-center">
                            <p className="text-[9px] font-black text-amber-300">주의</p>
                            <p className="text-base font-black text-amber-100">{riskBucketSummary.yellow}</p>
                        </div>
                        <div className="rounded-xl border border-emerald-700/40 bg-emerald-900/30 px-2 py-1.5 text-center">
                            <p className="text-[9px] font-black text-emerald-300">안정</p>
                            <p className="text-base font-black text-emerald-100">{riskBucketSummary.green}</p>
                        </div>
                    </div>
                </div>
                {/* 하네스 요약 */}
                <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: uiAudienceMode === 'developer' ? 'repeat(4, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))' }}>
                    {[
                        { label: uiAudienceMode === 'developer' ? '연결' : '기록 연동', value: harnessSummary.connected, tone: 'text-indigo-300', visible: true },
                        { label: uiAudienceMode === 'developer' ? '즉시' : '즉시 보호', value: harnessSummary.immediateAttention, tone: harnessSummary.immediateAttention > 0 ? 'text-rose-300' : 'text-slate-400', visible: true },
                        { label: '관리자 검토 대기', value: harnessSummary.approvalBacklog, tone: harnessSummary.approvalBacklog > 0 ? 'text-amber-300' : 'text-slate-400', visible: true },
                        { label: '저장 보완', value: harnessSummary.fallback + harnessSummary.pending, tone: 'text-slate-400', visible: uiAudienceMode === 'developer' },
                    ].filter(chip => chip.visible).map((chip) => (
                        <div key={chip.label} className="rounded-xl border border-slate-700 bg-slate-900/60 px-1.5 py-2 text-center">
                            <p className="text-[9px] font-black text-slate-500">{chip.label}</p>
                            <p className={`text-sm font-black ${chip.tone}`}>{chip.value}</p>
                        </div>
                    ))}
                </div>
                {/* CTA 버튼 */}
                <div className="mt-3 flex gap-2">
                    <button
                        type="button"
                        onClick={() => setShowAllRiskInsights(true)}
                        className="flex-1 min-h-[44px] rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-500 transition-colors"
                    >
                        위험 인사이트 보기
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setExecutionPlanFilter('urgent');
                            moveToInterventionCoaching();
                        }}
                        className="flex-1 min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-700 transition-colors"
                    >
                        즉시 개입 계획
                    </button>
                </div>
            </div>
            {/* Header: Meeting Context */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-900 rounded-2xl sm:rounded-[30px] p-4 sm:p-6 text-white shadow-2xl border border-slate-700 relative overflow-hidden">
                <div data-mobile-overflow-allow="true" className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl -mr-32 -mt-32"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 sm:gap-4">
                    <div>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                            <span className="bg-indigo-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg">Monthly Meeting</span>
                            <span className="text-indigo-300 text-xs font-bold">{todayDate} 기준 분석</span>
                            <span className="sm:hidden inline-flex items-center rounded-full border border-cyan-300/60 bg-cyan-400/20 px-2.5 py-1 text-[10px] font-black text-cyan-100 shadow-sm">모바일 검증 2026-06-19</span>
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-black mb-2">AI 리스크 분석 · 우선 개입 대시보드</h2>
                        <p className="text-slate-300 max-w-2xl text-xs sm:text-sm font-medium leading-relaxed">
                            1) 현재 위험군 식별 → 2) 다음 달 악화 가능성 예측 → 3) 개입 우선순위 제시 순서로 구성했습니다.
                        </p>
                    </div>
                    <div className="hidden sm:flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => moveToInterventionCoaching()}
                            className="inline-flex px-5 py-3 bg-emerald-500 text-white rounded-xl font-black text-sm shadow-lg hover:bg-emerald-400 transition-all items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                            개입 추천으로 이동
                        </button>
                        <button type="button" onClick={() => window.print()} className="inline-flex px-6 py-3 bg-white text-indigo-900 rounded-xl font-black text-sm shadow-lg hover:bg-indigo-50 transition-all items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                            회의 자료 인쇄
                        </button>
                    </div>
                </div>
            </div>

            <div className={`${MOBILE_CARD_PANEL_CLASS} bg-white border-slate-200`}>
                <div className="grid grid-cols-1 md:grid-cols-[160px_minmax(0,1fr)] gap-4 items-center">
                    <div className="mx-auto h-36 w-36 rounded-full border-8 border-indigo-100 bg-slate-50 flex flex-col items-center justify-center">
                        <p className="text-4xl font-black text-slate-900 leading-none">{aiRiskScore}</p>
                        <p className="mt-1 text-xs font-black text-slate-500">/100 위험 점수</p>
                    </div>
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                                <p className="text-[10px] font-black text-rose-700">위험 (Red)</p>
                                <p className="mt-1 text-xl font-black text-rose-900">{riskBucketSummary.red}건</p>
                            </div>
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                                <p className="text-[10px] font-black text-amber-700">주의 (Yellow)</p>
                                <p className="mt-1 text-xl font-black text-amber-900">{riskBucketSummary.yellow}건</p>
                            </div>
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                                <p className="text-[10px] font-black text-emerald-700">안정 (Green)</p>
                                <p className="mt-1 text-xl font-black text-emerald-900">{riskBucketSummary.green}건</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <button type="button" onClick={() => setShowAllRiskInsights((prev) => !prev)} className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">경향 분석</button>
                            <button type="button" onClick={() => setExecutionPlanFilter('urgent')} className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">개별 점검 영역</button>
                            <button type="button" onClick={() => setShowAllExecutionPlans((prev) => !prev)} className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">자동 분석 의견</button>
                        </div>
                        {isDevMode && <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">AI Risk 상태 제어</p>
                                    <p className="mt-1 text-[12px] font-semibold leading-relaxed text-slate-600">{predictiveSyncMessage}</p>
                                    {predictiveSyncError ? <p className="mt-1 text-[11px] font-bold text-rose-600">오류: {predictiveSyncError}</p> : null}
                                </div>
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black ${predictiveActionState.statusTone}`}>
                                    {predictiveSyncState === 'loading' ? '동기화 중' : predictiveSyncState === 'success' ? '최신 상태 반영' : predictiveSyncState === 'error' ? '재시도 필요' : '재계산 가능'}
                                </span>
                            </div>
                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={handleRecalculatePredictive}
                                    disabled={!predictiveActionState.canRecalculate}
                                    className={`min-h-[48px] rounded-2xl border px-4 py-3 text-sm font-black transition-colors ${predictiveActionState.canRecalculate ? 'border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50 active:scale-[0.99]' : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                >
                                    {predictiveSyncState === 'loading' ? 'AI 리스크 재계산 준비 중...' : 'AI 리스크 재계산'}
                                </button>
                                {predictiveActionState.showRetry ? (
                                    <button
                                        type="button"
                                        onClick={handleRetryPredictiveSync}
                                        disabled={!predictiveActionState.canRetry}
                                        className={`min-h-[48px] rounded-2xl border px-4 py-3 text-sm font-black transition-colors ${predictiveActionState.canRetry ? 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50 active:scale-[0.99]' : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                    >
                                        상태 동기화 재시도
                                    </button>
                                ) : (
                                    <div className="flex items-center rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-3 text-[11px] font-bold text-slate-500">
                                        {isPlanSyncAvailable ? '오류 발생 시 재시도 버튼이 여기에 표시됩니다.' : '관리자 로그인 시 상태 동기화 재시도가 활성화됩니다.'}
                                    </div>
                                )}
                            </div>
                        </div>}
                        {isDevMode && viewportWidth >= 1024 && (
                            <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-700">PC 운영 바로가기</p>
                                <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-4">
                                    <button type="button" onClick={() => { trackQuickAction('focus_urgent_bucket'); setExecutionPlanFilter('urgent'); }} className="min-h-[44px] rounded-xl border border-amber-200 bg-white px-3 py-2 text-left text-xs font-black text-amber-700 hover:bg-amber-50">버킷 중심 조치 보기</button>
                                    <button type="button" onClick={() => { trackQuickAction('expand_risk_insights'); setShowAllRiskInsights(true); }} className="min-h-[44px] rounded-xl border border-rose-200 bg-white px-3 py-2 text-left text-xs font-black text-rose-700 hover:bg-rose-50">리스크 인사이트 펼치기</button>
                                    <button type="button" onClick={() => { trackQuickAction('expand_execution_plans'); setShowAllExecutionPlans(true); }} className="min-h-[44px] rounded-xl border border-violet-200 bg-white px-3 py-2 text-left text-xs font-black text-violet-700 hover:bg-violet-50">실행 계획 전체 보기</button>
                                    <button type="button" onClick={() => { trackQuickAction('print_meeting_report', { uiVariant: 'v2-lowfreq-tuning-1' }); window.print(); }} className="min-h-[44px] rounded-xl border border-sky-200 bg-white px-3 py-2 text-left text-xs font-black text-sky-700 hover:bg-sky-50">회의용 리포트 인쇄</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isDevMode && <InterpretationCardGrid
                items={predictiveSummaryCards}
                cardClassName={MOBILE_CARD_GRID_ITEM_CLASS}
            />}

            {isDevMode && <SummaryMetricGrid
                items={harnessSummaryMetrics}
                className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"
                cardClassName={MOBILE_CARD_GRID_ITEM_CLASS}
            />}

            {isDevMode && (harnessSummary.immediateAttention > 0 || harnessSummary.approvalBacklog > 0 || harnessSummary.fallback > 0) && (
                <NoticeCallout
                    variant={harnessSummary.immediateAttention > 0 ? 'rose' : harnessSummary.fallback > 0 ? 'amber' : 'indigo'}
                    eyebrow="안전 이행 검증 상태"
                    title={harnessSummary.immediateAttention > 0
                        ? `예측 계획보다 앞서 즉시 관찰 보호 대상 ${harnessSummary.immediateAttention}명을 먼저 조치해야 합니다.`
                        : harnessSummary.fallback > 0
                            ? `저장 연동 확인이 필요한 대상 ${harnessSummary.fallback}명이 있습니다.`
                            : `검토 대기 항목이 ${harnessSummary.approvalBacklog}명 남아 있어 다음 달 계획 전에 현재 승인 대기 건을 먼저 정리해야 합니다.`}
                    description={harnessSummary.immediateAttention > 0
                        ? '예측 대시보드는 미래 개입 우선순위를 정하는 곳이지만, 이미 위험이 확정된 인원은 소장 결재 및 보완 조치 흐름으로 먼저 연결해야 보호 공백을 줄일 수 있습니다.'
                        : '저장 연동 및 승인 상태를 함께 확인해 실제 보호 조치가 끊긴 지점을 먼저 보완합니다.'}
                    className={MOBILE_CARD_PANEL_COMPACT_CLASS}
                    bodyClassName="block"
                    titleClassName="text-sm font-black"
                    descriptionClassName="mt-1 text-xs font-semibold leading-relaxed"
                />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className={`${MOBILE_CARD_GRID_ITEM_CLASS} bg-white border-rose-100`}>
                    <p className="text-[11px] font-black text-rose-600">보호 우선 대상</p>
                    <p className="mt-1 text-2xl font-black text-slate-900">{summary.highRiskCount}명</p>
                </div>
                <div className={`${MOBILE_CARD_GRID_ITEM_CLASS} bg-white border-amber-100`}>
                    <p className="text-[11px] font-black text-amber-700">급락군 (최근 -10점 이하)</p>
                    <p className="mt-1 text-2xl font-black text-slate-900">{summary.rapidDropCount}명</p>
                </div>
                <div className={`${MOBILE_CARD_GRID_ITEM_CLASS} bg-white border-indigo-100`}>
                    <p className="text-[11px] font-black text-indigo-700">핵심 위험테마</p>
                    <p className="mt-1 text-xl font-black text-slate-900">{summary.topRiskLabel}</p>
                </div>
            </div>

            <div key={`predictive-risk-panel-${predictiveRefreshTick}`} className={`${MOBILE_CARD_PANEL_CLASS} bg-white border-slate-100`}>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base sm:text-lg font-black text-slate-900">우선 개입 대상 TOP 5</h3>
                    <span className="text-[11px] font-black text-slate-500">기본 3건만 우선 표시</span>
                </div>
                <InterpretationCardGrid
                    items={executionInterpretationCards}
                    cardClassName={MOBILE_CARD_GRID_ITEM_CLASS}
                />
                {riskInsights.length === 0 ? (
                    <EmptyStatePanel
                        variant="slate"
                        className="px-4 py-8"
                        title={PREDICTIVE_STATUS_COPY.riskInsightEmpty.title}
                        description={PREDICTIVE_STATUS_COPY.riskInsightEmpty.description}
                        titleClassName="text-sm font-bold text-slate-500"
                        descriptionClassName="mt-2 text-xs font-semibold leading-relaxed text-slate-400"
                    />
                ) : (
                    <div className="space-y-3">
                        {visibleRiskInsights.map((item, index) => (
                            <div key={item.key} className={`${MOBILE_CARD_GRID_COMPACT_CLASS} border-slate-200 bg-slate-50`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className="text-sm font-black text-slate-900">{index + 1}. {item.name} · {item.jobField}</p>
                                        <p className="text-[11px] font-bold text-slate-500">{item.nationality} · 최신점수 {item.latestScore}점 {item.scoreDelta !== null ? `(${item.scoreDelta >= 0 ? '+' : ''}${item.scoreDelta})` : ''}</p>
                                    </div>
                                    <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-black">{item.riskScore}</span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {item.reasonLabels.map((reason) => (
                                        <span key={reason} className="px-2 py-1 rounded-full bg-white border border-slate-200 text-[10px] font-black text-slate-600">
                                            {reason}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {riskInsights.slice(0, 5).length > 3 && (
                            <button
                                type="button"
                                onClick={() => setShowAllRiskInsights((prev) => !prev)}
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
                            >
                                {showAllRiskInsights ? '우선 개입 대상 접기' : `우선 개입 대상 ${riskInsights.slice(0, 5).length - visibleRiskInsights.length}건 더 보기`}
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className={`grid grid-cols-1 gap-6 sm:gap-8 ${isDevMode ? 'lg:grid-cols-3' : ''}`}>
                {/* Left: Ontology Graph (Visual Evidence) */}
                {isDevMode && <div className="lg:col-span-2 bg-slate-900 p-4 sm:p-6 rounded-2xl sm:rounded-[30px] shadow-xl border border-slate-800 flex flex-col">
                    <div className="mb-4">
                        <InterpretationCardGrid
                            items={ontologyInterpretationCards}
                            cardClassName={MOBILE_CARD_GRID_ITEM_CLASS}
                        />
                    </div>
                    <div className="mb-6 rounded-2xl border border-slate-700 bg-slate-800/40 p-3 sm:p-4">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="min-w-0">
                                <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2 leading-tight">
                                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0"></span>
                                    <span className="break-keep">위험 요인 관계도</span>
                                </h3>
                                <p className="mt-1 text-[11px] sm:text-xs font-semibold text-slate-400 break-keep">노드에 마우스를 올리면 전체 라벨과 분류를 확인할 수 있습니다.</p>
                            </div>

                            {(!isCompactMobile || showOntologyMobile) && (
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-2 py-1">
                                <button
                                    type="button"
                                    onClick={() => setOntologyZoom((prev) => clampOntologyZoom(prev - 0.1))}
                                    className="w-7 h-7 rounded-lg bg-slate-700 text-slate-100 font-black hover:bg-slate-600"
                                    aria-label="온톨리지 축소"
                                >
                                    −
                                </button>
                                <span className="text-[11px] font-black text-slate-200 min-w-[52px] text-center">{Math.round(ontologyZoom * 100)}%</span>
                                <button
                                    type="button"
                                    onClick={() => setOntologyZoom((prev) => clampOntologyZoom(prev + 0.1))}
                                    className="w-7 h-7 rounded-lg bg-slate-700 text-slate-100 font-black hover:bg-slate-600"
                                    aria-label="온톨리지 확대"
                                >
                                    +
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOntologyZoom(1)}
                                    className="ml-1 px-2 h-7 rounded-lg bg-slate-700 text-[11px] font-black text-slate-100 hover:bg-slate-600"
                                >
                                    100%
                                </button>
                                <button
                                    type="button"
                                    onClick={handleResetOntologyView}
                                    className="px-2 h-7 rounded-lg bg-indigo-700 text-[11px] font-black text-white hover:bg-indigo-600"
                                >
                                    초기화
                                </button>
                                </div>
                                <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-2 py-1">
                                    <span className="text-[11px] font-black text-slate-300 whitespace-nowrap">간격</span>
                                    <input
                                        type="range"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={ontologySpacingStrength}
                                        onChange={(event) => setOntologySpacingStrength(Number(event.target.value))}
                                        className="w-20 accent-indigo-500"
                                        aria-label="온톨리지 노드 간격 조절"
                                    />
                                    <span className="text-[11px] font-black text-slate-200 w-8 text-right">{Math.round(ontologySpacingStrength * 100)}</span>
                                </div>
                            </div>
                            )}
                        </div>

                        {(!isCompactMobile || showOntologyMobile) && (
                        <div className="mt-3 flex flex-wrap gap-2 text-[10px] sm:text-[11px] font-bold text-slate-200">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/30 bg-blue-500/10 px-2.5 py-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div>근로자</span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>공종</span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/10 px-2.5 py-1"><div className="w-2 h-2 rounded-full bg-rose-500"></div>위험요인</span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1"><div className="w-2 h-2 rounded-full bg-amber-500"></div>예방대책</span>
                        </div>
                        )}
                    </div>
                    {isCompactMobile && (
                        <div className="mb-3 rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">모바일 요약</p>
                            <ul className="mt-2 space-y-1.5 text-[11px] font-semibold leading-relaxed text-slate-200">
                                {ontologyMobileSummary.map((item) => (
                                    <li key={item} className="flex items-start gap-2">
                                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => setShowOntologyMobile((prev) => !prev)}
                        className="sm:hidden mb-3 w-full min-h-[48px] rounded-2xl border border-slate-700 bg-slate-800/60 px-4 py-3 text-sm font-black text-slate-100 transition-colors hover:bg-slate-700/70 active:scale-[0.99]"
                    >
                        {showOntologyMobile ? '텍스트 요약만 보기' : '온톨로지 맵 보기'}
                    </button>
                    <div
                        ref={ontologyViewportRef}
                        className={`flex-1 min-h-[320px] sm:min-h-[400px] relative border border-slate-800 rounded-2xl bg-slate-950/50 overflow-auto ${isPanningOntology ? 'cursor-grabbing' : 'cursor-grab'} ${showOntologyMobile ? 'block' : 'hidden sm:block'}`}
                        onMouseDown={handleOntologyMouseDown}
                        onMouseMove={handleOntologyMouseMove}
                        onMouseUp={stopOntologyPanning}
                        onMouseLeave={stopOntologyPanning}
                        onTouchStart={handleOntologyTouchStart}
                        onTouchMove={handleOntologyTouchMove}
                        onTouchEnd={handleOntologyTouchEnd}
                        onTouchCancel={handleOntologyTouchEnd}
                        style={{ touchAction: 'none' }}
                    >
                        {graphData.nodes.length > 0 ? (
                            <div className="min-w-[760px] sm:min-w-[900px] min-h-[560px] sm:min-h-[620px] w-full h-full flex items-center justify-center p-3 sm:p-4">
                                <div
                                    className="w-full h-full transition-transform duration-200"
                                    style={{ transform: `scale(${ontologyZoom})`, transformOrigin: 'center center' }}
                                >
                                    <OntologyGraph nodes={graphData.nodes} links={graphData.links} spacingStrength={ontologySpacingStrength} />
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-600">
                                <p>데이터 부족 또는 분석 대기 중</p>
                            </div>
                        )}
                        <div className="absolute bottom-4 right-4 bg-slate-800/80 backdrop-blur px-4 py-2 rounded-xl border border-slate-700 text-xs text-slate-300">
                            * 선의 굵기는 위험 발생 빈도와 연관성을 나타냅니다.
                        </div>
                    </div>
                </div>}

                {/* Right: Next Month Agenda & Action Items */}
                <div className="space-y-6">
                    {/* Agenda Card */}
                    <div key={`predictive-plan-panel-${predictiveRefreshTick}`} className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-[30px] shadow-lg border border-slate-100">
                        <div className="flex items-start justify-between gap-3 mb-4">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                                    {nextMonth} 중점 관리 안건
                                </h3>
                                <p className="mt-1 text-[11px] font-bold text-slate-500">핵심 안건 2건만 먼저 보여주고 필요 시 펼쳐보도록 구성했습니다.</p>
                            </div>
                            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-center shrink-0">
                                <p className="text-[10px] font-black text-indigo-700">안건 수</p>
                                <p className="text-base font-black text-indigo-900">{meetingAgenda.length}</p>
                            </div>
                        </div>
                        <div className="space-y-4">
                            {meetingAgenda.length > 0 ? visibleMeetingAgenda.map((item) => (
                                <div key={item.rank} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 hover:border-indigo-300 transition-colors group">
                                    <div className="flex items-start gap-3">
                                        <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-black text-xs shadow-md group-hover:scale-110 transition-transform">
                                            {item.rank}
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-black text-slate-800 mb-1">{item.title}</h4>
                                            <p className="text-xs text-slate-500 leading-relaxed font-medium">
                                                {item.desc}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )) : (
                                <div className="text-center py-10 text-slate-400 text-sm">
                                    분석된 데이터가 충분하지 않습니다.
                                </div>
                            )}
                        </div>
                        {meetingAgenda.length > 2 && (
                            <button
                                type="button"
                                onClick={() => setShowAllMeetingAgenda((prev) => !prev)}
                                className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
                            >
                                {showAllMeetingAgenda ? '중점 관리 안건 접기' : `중점 관리 안건 ${meetingAgenda.length - visibleMeetingAgenda.length}건 더 보기`}
                            </button>
                        )}
                        <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                            <p className="text-[10px] text-slate-400 font-bold">
                                * 위 안건은 OCR 및 사용자 수정 데이터를 기반으로 자동 생성되었습니다.
                            </p>
                        </div>
                    </div>

                    <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-[30px] shadow-lg border border-slate-100">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-black text-slate-900">실행 계획 (누가 · 무엇을 · 언제)</h3>
                                <p className="mt-1 text-[11px] font-bold text-slate-500">긴급 우선안만 먼저 보여주고, 필요 시 전체 계획을 펼쳐보도록 단순화했습니다.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:min-w-[220px]">
                                <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-center">
                                    <p className="text-[10px] font-black text-indigo-700">완료율</p>
                                    <p className="text-lg font-black text-indigo-900">{executionCompletionRate}%</p>
                                </div>
                                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center">
                                    <p className="text-[10px] font-black text-rose-700">긴급/고</p>
                                    <p className="text-lg font-black text-rose-900">{executionPlanFilterOptions.find((item) => item.key === 'urgent')?.count || 0}건</p>
                                </div>
                            </div>
                        </div>
                        <InterpretationCardGrid
                            items={executionInterpretationCards}
                            cardClassName="rounded-2xl border p-4"
                        />
                        <div className="mb-3 grid grid-cols-3 gap-2">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-center">
                                <p className="text-[10px] font-black text-slate-500">미착수</p>
                                <p className="text-base font-black text-slate-900">{statusSummary['not-started']}</p>
                            </div>
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-center">
                                <p className="text-[10px] font-black text-amber-700">진행중</p>
                                <p className="text-base font-black text-amber-800">{statusSummary['in-progress']}</p>
                            </div>
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-center">
                                <p className="text-[10px] font-black text-emerald-700">완료</p>
                                <p className="text-base font-black text-emerald-800">{statusSummary.completed}</p>
                            </div>
                        </div>
                        <div className="mb-3 flex flex-wrap gap-2">
                            {executionPlanFilterOptions.map((option) => {
                                const active = executionPlanFilter === option.key;
                                return (
                                    <button
                                        key={option.key}
                                        type="button"
                                        onClick={() => {
                                            setExecutionPlanFilter(option.key);
                                            setShowAllExecutionPlans(false);
                                        }}
                                        className={`rounded-full border px-3 py-1.5 text-[11px] font-black transition-colors ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        {option.label} · {option.count}
                                    </button>
                                );
                            })}
                        </div>
                        {executionPlans.length === 0 ? (
                            <EmptyStatePanel
                                variant="slate"
                                className="px-4 py-8"
                                title={PREDICTIVE_STATUS_COPY.executionPlanEmpty.title}
                                description={PREDICTIVE_STATUS_COPY.executionPlanEmpty.description}
                                titleClassName="text-sm font-bold text-slate-500"
                                descriptionClassName="mt-2 text-xs font-semibold leading-relaxed text-slate-400"
                            />
                        ) : filteredExecutionPlans.length === 0 ? (
                            <EmptyStatePanel
                                variant="slate"
                                title={PREDICTIVE_STATUS_COPY.executionPlanFilteredEmpty.title}
                                description={PREDICTIVE_STATUS_COPY.executionPlanFilteredEmpty.description}
                                titleClassName="text-sm font-bold text-slate-500"
                                descriptionClassName="mt-2 text-xs font-semibold leading-relaxed text-slate-400"
                            />
                        ) : (
                            <div className="space-y-3">
                                {visibleExecutionPlans.map((plan) => (
                                    <div key={plan.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="text-sm font-black text-slate-900">{plan.workerName} · {plan.jobField}</p>
                                                <p className="text-[11px] font-bold text-slate-500">{plan.teamLeader ? `팀: ${plan.teamLeader} · ` : ''}위험: {plan.riskLabel}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${plan.priority === '즉시' ? 'bg-rose-100 text-rose-700' : plan.priority === '고' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                                    우선순위 {plan.priority}
                                                </span>
                                                <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${PLAN_STATUS_META[planStatusMap[plan.key] || 'not-started'].chipClass}`}>
                                                    {PLAN_STATUS_META[planStatusMap[plan.key] || 'not-started'].label}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="mt-2 rounded-xl bg-white border border-slate-200 p-2.5">
                                            <p className="text-[11px] font-black text-slate-700">무엇을: {plan.actionTitle}</p>
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black text-slate-600">누가: {plan.owner}</span>
                                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black text-slate-600">언제: {plan.dueLabel}까지</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setExpandedPlanDetailKey((previous) => previous === plan.key ? null : plan.key)}
                                                className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-slate-700 underline underline-offset-2"
                                            >
                                                {expandedPlanDetailKey === plan.key ? '세부 계획 접기' : '세부 계획 보기'}
                                            </button>
                                            {expandedPlanDetailKey === plan.key && (
                                                <div className="mt-2 border-t border-slate-100 pt-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => { void togglePlanHistory(plan.key); }}
                                                        className="text-[11px] font-bold text-indigo-600 underline underline-offset-2"
                                                    >
                                                        최근 변경: {planAuditMap[plan.key]?.updatedBy || '-'} · {formatAuditTime(planAuditMap[plan.key]?.updatedAt)}
                                                    </button>
                                                    {expandedHistoryPlanKey === plan.key && (
                                                        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                                                            <p className="text-[10px] font-black text-slate-500 mb-1">최근 변경 이력 (최대 5건)</p>
                                                            {planHistoryLoadingMap[plan.key] ? (
                                                                <p className="text-[10px] font-bold text-slate-400">{PREDICTIVE_STATUS_COPY.planHistoryLoading}</p>
                                                            ) : (planHistoryMap[plan.key] || []).length === 0 ? (
                                                                <p className="text-[10px] font-bold text-slate-400">{PREDICTIVE_STATUS_COPY.planHistoryEmpty}</p>
                                                            ) : (
                                                                <div className="space-y-1.5">
                                                                    {(planHistoryMap[plan.key] || []).map((history, idx) => (
                                                                        <div key={`${plan.key}-history-${idx}`} className="text-[10px] font-bold text-slate-600">
                                                                            <div className="flex items-center gap-1">
                                                                                {history.previousStatus != null ? (
                                                                                    <>
                                                                                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-black ${PLAN_STATUS_META[history.previousStatus].chipClass}`}>{PLAN_STATUS_META[history.previousStatus].label}</span>
                                                                                        <span className="text-slate-400">→</span>
                                                                                    </>
                                                                                ) : null}
                                                                                <span className={`rounded px-1.5 py-0.5 text-[9px] font-black ${PLAN_STATUS_META[history.status].chipClass}`}>{PLAN_STATUS_META[history.status].label}</span>
                                                                            </div>
                                                                            <div className="mt-0.5 text-slate-400">{history.updatedBy || '-'} · {formatAuditTime(history.updatedAt)}</div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                                        {plan.checkItems.map((item) => (
                                                            <span key={item} className="px-2 py-1 rounded-full border border-slate-200 bg-white text-[10px] font-black text-slate-600">
                                                                {item}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="mt-2 grid grid-cols-3 gap-1.5">
                                            {(['not-started', 'in-progress', 'completed'] as PlanStatus[]).map((statusKey) => {
                                                const isActive = (planStatusMap[plan.key] || 'not-started') === statusKey;
                                                return (
                                                    <button
                                                        key={statusKey}
                                                        type="button"
                                                        onClick={() => setPlanStatus(plan.key, statusKey)}
                                                        className={`rounded-lg border px-2 py-1 text-[10px] font-black transition-colors ${isActive ? PLAN_STATUS_META[statusKey].chipClass : PLAN_STATUS_META[statusKey].buttonClass}`}
                                                    >
                                                        {PLAN_STATUS_META[statusKey].label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                                {filteredExecutionPlans.length > 3 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowAllExecutionPlans((prev) => !prev)}
                                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
                                    >
                                        {showAllExecutionPlans
                                            ? '실행 계획 접기'
                                            : `실행 계획 ${filteredExecutionPlans.length - visibleExecutionPlans.length}건 더 보기`}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {isCompactMobile && (
                        <button
                            type="button"
                            onClick={() => setShowMobileExtendedPanels((prev) => !prev)}
                            className="w-full min-h-[48px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700 transition-colors hover:bg-slate-100 active:scale-[0.99]"
                        >
                            {showMobileExtendedPanels ? '심화 분석 패널 접기' : '심화 분석 패널 펼치기'}
                        </button>
                    )}

                    {(!isCompactMobile || showMobileExtendedPanels) && (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-[30px] shadow-lg border border-slate-100">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-black text-slate-900">등록 공종별 조치율</h3>
                                <p className="mt-1 text-[11px] font-bold text-slate-500">낮은 조치율 공종을 상단에 우선 배치해 바로 확인할 수 있게 정리했습니다.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:min-w-[220px]">
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-center">
                                    <p className="text-[10px] font-black text-emerald-700">평균 조치율</p>
                                    <p className="text-lg font-black text-emerald-900">{jobActionRateSummary.averageRate}%</p>
                                </div>
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center">
                                    <p className="text-[10px] font-black text-amber-700">즉시 확인</p>
                                    <p className="text-lg font-black text-amber-900">{jobActionRateSummary.zeroRateCount}곳</p>
                                </div>
                            </div>
                        </div>
                        <InterpretationCardGrid
                            items={jobRateInterpretationCards}
                            cardClassName="rounded-2xl border p-4"
                        />
                        {jobActionRateSummary.focusLabels.length > 0 && (
                            <div className="mb-3 rounded-2xl border border-amber-100 bg-amber-50 p-3">
                                <p className="text-[10px] font-black text-amber-700">우선 확인 공종</p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {jobActionRateSummary.focusLabels.map((label) => (
                                        <span key={label} className="rounded-full bg-white dark:bg-slate-900 px-2.5 py-1 text-[10px] font-black text-slate-700 dark:text-slate-200 border border-amber-200 dark:border-amber-900/40">
                                            {label}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {visibleJobActionRates.map((item) => (
                                <div key={item.jobLabel} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-black text-slate-900">{item.jobLabel}</p>
                                        <p className={`text-xs font-black ${item.actionRate < 40 ? 'text-rose-700' : item.actionRate < 70 ? 'text-amber-700' : 'text-emerald-700'}`}>조치율 {item.actionRate}%</p>
                                    </div>
                                    <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
                                        <div className={`h-full ${item.actionRate < 40 ? 'bg-rose-500' : item.actionRate < 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${item.actionRate}%` }}></div>
                                    </div>
                                    <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                                        <div className="rounded-lg bg-white border border-slate-200 py-1">
                                            <p className="text-[10px] font-black text-slate-500">전체</p>
                                            <p className="text-xs font-black text-slate-900">{item.total}</p>
                                        </div>
                                        <div className="rounded-lg bg-white border border-emerald-200 py-1">
                                            <p className="text-[10px] font-black text-emerald-700">완료</p>
                                            <p className="text-xs font-black text-emerald-800">{item.completed}</p>
                                        </div>
                                        <div className="rounded-lg bg-white border border-amber-200 py-1">
                                            <p className="text-[10px] font-black text-amber-700">진행중</p>
                                            <p className="text-xs font-black text-amber-800">{item.inProgress}</p>
                                        </div>
                                        <div className="rounded-lg bg-white border border-slate-200 py-1">
                                            <p className="text-[10px] font-black text-slate-500">미착수</p>
                                            <p className="text-xs font-black text-slate-800">{item.notStarted}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {sortedCustomJobActionRates.length > 4 && (
                            <button
                                type="button"
                                onClick={() => setShowAllJobActionRates((prev) => !prev)}
                                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
                            >
                                {showAllJobActionRates
                                    ? '공종별 조치율 접기'
                                    : `공종별 조치율 ${sortedCustomJobActionRates.length - visibleJobActionRates.length}건 더 보기`}
                            </button>
                        )}
                        <p className="mt-3 text-[10px] font-bold text-slate-500">* 형틀 공종은 팀장 기준으로 팀 단위 세분화되며, 조치율 = 완료 건수 / 해당 공종(또는 팀) 실행계획 건수</p>
                    </div>

                    {/* AI Insight Card */}
                    <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-4 sm:p-6 rounded-2xl sm:rounded-[30px] shadow-lg shadow-orange-200 text-white relative overflow-hidden">
                        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white opacity-20 rounded-full blur-xl"></div>
                        <h3 className="text-lg font-black mb-2 flex items-center gap-2">
                            <span className="text-2xl">📢</span> TBM 전파 교육 제안
                        </h3>
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                            <p className="text-xs font-bold opacity-80 mb-1">위험성평가 기록지 작성 가이드:</p>
                            <p className="text-sm font-black leading-relaxed">
                                "{nextMonth}은 계절적 요인과 맞물려 <span className="underline decoration-white">추락 및 미끄러짐</span> 사고 위험이 높습니다. 
                                작업 전 안전대 고리 체결 확인을 필수 항목으로 기재하도록 지도하십시오."
                            </p>
                        </div>
                    </div>
                    </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PredictiveAnalysis;

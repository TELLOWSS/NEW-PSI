import type { HarnessWorkflowTransitionAction } from '../services/harnessService';
import { BRAND_TONE } from './brandToneTokens';

const ACTION_REASON_LABELS: Record<string, string> = {
    approve: '승인',
    reject: '반려',
    'request-reanalysis': '재분석 요청',
    reanalyze: '재분석 실행',
};

export const getHarnessTransitionActionLabel = (action: HarnessWorkflowTransitionAction['action']): string => {
    switch (action) {
        case 'approve': return '승인';
        case 'reject': return '반려';
        case 'request-reanalysis': return '재분석 요청';
        case 'reanalyze': return '재분석 실행';
        default: return action;
    }
};

export const getHarnessTransitionActionSummaryText = (
    action: HarnessWorkflowTransitionAction,
    getWorkflowStateLabel: (state: NonNullable<HarnessWorkflowTransitionAction['nextWorkflowState']>) => string,
): string => {
    const nextStateLabel = action.nextWorkflowState ? getWorkflowStateLabel(action.nextWorkflowState) : '현재 상태 유지';

    switch (action.action) {
        case 'approve':
            return `증빙과 코멘트가 충분하면 ${nextStateLabel} 흐름으로 마감할 수 있습니다.`;
        case 'reject':
            return `보완이 필요하면 반려 사유를 남기고 ${nextStateLabel} 또는 후속 보완 흐름으로 넘겨야 합니다.`;
        case 'request-reanalysis':
            return `수정 뒤 다시 판정해야 하면 판단 근거와 함께 ${nextStateLabel} 흐름으로 되돌립니다.`;
        case 'reanalyze':
            return `재분석 실행 시 현재 변경사항을 반영해 ${nextStateLabel} 단계로 다시 진입합니다.`;
        default:
            return `${nextStateLabel} 기준으로 다음 상태 전이를 진행합니다.`;
    }
};

export const normalizeHarnessTransitionReason = (
    reason: string | null | undefined,
    getWorkflowStateLabel?: (state: NonNullable<HarnessWorkflowTransitionAction['nextWorkflowState']>) => string,
): string => {
    const normalized = String(reason || '').trim();
    if (!normalized) return '차단 사유 미기록';

    const stateActionMatch = normalized.match(/^현재 상태\(([^)]+)\)에서는 ([^ ]+) 전이를 진행하실 수 없습니다\.$/);
    if (stateActionMatch) {
        const [, rawState, rawAction] = stateActionMatch;
        const stateLabel = getWorkflowStateLabel ? getWorkflowStateLabel(rawState as NonNullable<HarnessWorkflowTransitionAction['nextWorkflowState']>) : rawState;
        const actionLabel = ACTION_REASON_LABELS[rawAction] || getHarnessTransitionActionLabel(rawAction as HarnessWorkflowTransitionAction['action']);
        return `${stateLabel} 상태에서는 ${actionLabel}할 수 없습니다.`;
    }

    const reanalyzeStateMatch = normalized.match(/^현재 상태\(([^)]+)\)에서는 재분석을 시작하실 수 없습니다\.$/);
    if (reanalyzeStateMatch) {
        const [, rawState] = reanalyzeStateMatch;
        const stateLabel = getWorkflowStateLabel ? getWorkflowStateLabel(rawState as NonNullable<HarnessWorkflowTransitionAction['nextWorkflowState']>) : rawState;
        return `${stateLabel} 상태에서는 재분석을 시작할 수 없습니다.`;
    }

    if (normalized.includes('이미 승인 완료된 워크플로우')) {
        return '이미 승인 완료된 건이라 바로 다시 승인할 수 없습니다.';
    }
    if (normalized.includes('2차 재분석이 진행 중일 때는 승인/반려/재분석 요청을 동시에 진행하실 수 없습니다')) {
        return '2차 재분석 진행 중에는 승인·반려·재분석 요청을 함께 처리할 수 없습니다.';
    }
    if (normalized.includes('완료 상태에서는 반려 전이를 적용하실 수 없습니다')) {
        return '완료 상태는 바로 반려할 수 없어 먼저 재검토 흐름으로 돌려야 합니다.';
    }
    if (normalized.includes('완료 또는 승인 확정된 워크플로우에서는 바로 재분석을 시작하실 수 없습니다')) {
        return '완료 또는 승인 확정 상태는 바로 재분석을 시작할 수 없습니다.';
    }
    if (normalized.includes('이미 2차 재분석이 진행 중입니다')) {
        return '이미 2차 재분석이 진행 중입니다.';
    }
    if (normalized.includes('반려 또는 재분석 요청 시에는 8자 이상의 판단 근거 코멘트가 필요합니다')) {
        return '반려 또는 재분석 요청에는 8자 이상 근거 코멘트가 필요합니다.';
    }
    if (normalized.includes('승인 완료된 워크플로우는 바로 재분석으로 전이하실 수 없습니다')) {
        return '승인 완료된 건은 바로 재분석으로 넘길 수 없습니다.';
    }
    if (normalized.includes('이미 재분석이 진행 중이므로 중복 재분석을 시작하실 수 없습니다')) {
        return '이미 재분석이 진행 중이라 중복 재분석을 시작할 수 없습니다.';
    }

    return normalized;
};

export const formatHarnessTransitionActionLine = (
    action: HarnessWorkflowTransitionAction,
    getWorkflowStateLabel: (state: NonNullable<HarnessWorkflowTransitionAction['nextWorkflowState']>) => string,
): string => {
    const actionLabel = getHarnessTransitionActionLabel(action.action);
    const nextStateLabel = action.nextWorkflowState ? getWorkflowStateLabel(action.nextWorkflowState) : '현재 상태 유지';
    return `${actionLabel}${action.nextWorkflowState ? ` → ${nextStateLabel}` : ''}`;
};

export const formatHarnessTransitionStatusText = (
    action: HarnessWorkflowTransitionAction,
    getWorkflowStateLabel: (state: NonNullable<HarnessWorkflowTransitionAction['nextWorkflowState']>) => string,
): string => {
    if (action.allowed) {
        return `가능 · 다음 상태 ${action.nextWorkflowState ? getWorkflowStateLabel(action.nextWorkflowState) : '유지'}`;
    }

    return normalizeHarnessTransitionReason(action.reason, getWorkflowStateLabel);
};

export const buildHarnessTransitionNarrative = (
    actions: HarnessWorkflowTransitionAction[],
    getWorkflowStateLabel: (state: NonNullable<HarnessWorkflowTransitionAction['nextWorkflowState']>) => string,
) => {
    const allowed = actions.filter((item) => item.allowed);
    const blocked = actions.filter((item) => !item.allowed);
    const recommended = allowed[0] || null;

    if (actions.length === 0) {
        return {
            title: '현재 액션 가능 여부 정보가 아직 없습니다.',
            description: 'workflow-status 저장 응답이 누적되면 승인, 반려, 재분석 가능 여부를 같은 문구 기준으로 읽을 수 있습니다.',
            action: '현재는 상태 배지와 승인 diff를 기준으로 다음 행동을 판단해 주십시오.',
            tone: BRAND_TONE.slate,
        };
    }

    if (recommended) {
        return {
            title: `지금 우선 액션은 ${getHarnessTransitionActionLabel(recommended.action)}입니다.`,
            description: allowed.map((item) => formatHarnessTransitionActionLine(item, getWorkflowStateLabel)).join(' / '),
            action: blocked.length > 0
                ? `차단 액션 ${blocked.length}개는 보류 상태입니다. 대표 사유: ${normalizeHarnessTransitionReason(blocked[0]?.reason, getWorkflowStateLabel)}`
                : getHarnessTransitionActionSummaryText(recommended, getWorkflowStateLabel),
            tone: recommended.action === 'approve'
                ? BRAND_TONE.emeraldSoft80
                : recommended.action === 'reject'
                    ? BRAND_TONE.roseSoft80
                    : BRAND_TONE.indigoSoft80,
        };
    }

    return {
        title: '현재는 즉시 실행 가능한 액션이 없습니다.',
        description: normalizeHarnessTransitionReason(blocked[0]?.reason, getWorkflowStateLabel) || '상태머신 규칙상 현재 전이를 진행할 수 없습니다.',
        action: '선행 상태 전이 또는 판단 근거 보강 후 다시 확인해 주십시오.',
        tone: BRAND_TONE.amberSoft80,
    };
};

export const buildHarnessTransitionExecutionGuide = (
    actions: HarnessWorkflowTransitionAction[],
    getWorkflowStateLabel: (state: NonNullable<HarnessWorkflowTransitionAction['nextWorkflowState']>) => string,
) => {
    const allowed = actions.filter((item) => item.allowed);
    const blocked = actions.filter((item) => !item.allowed);
    const recommended = allowed[0] || null;
    const primaryBlockedReason = blocked[0]?.reason || null;

    if (!recommended) {
        return {
            variant: 'amber' as const,
            title: '현재는 선행 보완 없이 바로 진행할 수 있는 승인 액션이 없습니다.',
            description: primaryBlockedReason
                ? `우선 차단 사유는 “${normalizeHarnessTransitionReason(primaryBlockedReason, getWorkflowStateLabel)}”입니다. 상태, 코멘트 길이, 재분석 진행 여부를 먼저 정리해 주십시오.`
                : '상태 전이 조건 또는 코멘트 기준이 충족되지 않아 선행 보완이 필요합니다.',
            checklistItems: [
                {
                    key: 'blocked-primary',
                    content: primaryBlockedReason
                        ? `가장 먼저 풀어야 할 차단 사유: ${normalizeHarnessTransitionReason(primaryBlockedReason, getWorkflowStateLabel)}`
                        : '차단 사유가 명확하지 않다면 workflow / approval / second pass 상태를 다시 확인합니다.',
                },
                {
                    key: 'blocked-comment',
                    content: '반려 또는 재분석 요청을 하려면 판단 근거 코멘트를 더 구체적으로 남겨야 합니다.',
                },
                {
                    key: 'blocked-proof',
                    content: '원문, 번역, 증빙, 오버라이드 유무를 먼저 정리한 뒤 허용 액션이 생기는지 다시 확인합니다.',
                },
            ],
        };
    }

    return {
        variant: recommended.action === 'approve'
            ? 'emerald' as const
            : recommended.action === 'reject'
                ? 'rose' as const
                : 'indigo' as const,
        title: `지금 우선 액션은 ${getHarnessTransitionActionLabel(recommended.action)}입니다.`,
        description: getHarnessTransitionActionSummaryText(recommended, getWorkflowStateLabel),
        checklistItems: [
            {
                key: 'recommended-action',
                content: `${getHarnessTransitionActionLabel(recommended.action)} 전에는 현재 상태 배지와 최신 승인 diff가 서로 모순되지 않는지 먼저 확인합니다.`,
            },
            {
                key: 'recommended-comment',
                content: recommended.action === 'reject' || recommended.action === 'request-reanalysis'
                    ? '반려/재분석 요청은 8자 이상 판단 근거 코멘트를 남겨야 운영 QA 재확인이 쉬워집니다.'
                    : '승인이라면 왜 지금 승인 가능한지 근거 코멘트를 짧고 분명하게 남겨 추후 QA 재확인을 줄입니다.',
            },
            {
                key: 'recommended-next-state',
                content: `실행 후 예상 다음 상태는 ${recommended.nextWorkflowState ? getWorkflowStateLabel(recommended.nextWorkflowState) : '현재 상태 유지'}입니다. 후속 검토자도 같은 흐름으로 읽을 수 있게 기록을 맞춥니다.`,
            },
        ],
    };
};

import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../../adminAuthGuard.js';
import { fetchPersistedHarnessWorkflowStatus } from '../persistence.js';
import { getHarnessTransitionActionStatuses } from '../router.js';

export default async function handler(req: any, res: any) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    if (!isValidAdminAuthRequest(req)) {
        return sendUnauthorizedAdminResponse(res);
    }

    const workflowRunId = String(req.query?.workflowRunId || req.body?.workflowRunId || '').trim();
    if (!workflowRunId) {
        return res.status(400).json({ ok: false, message: 'workflowRunId 필수' });
    }

    const persisted = await fetchPersistedHarnessWorkflowStatus(workflowRunId);
    if (persisted.found && persisted.data) {
        const transitionActions = getHarnessTransitionActionStatuses({
            currentWorkflowState: persisted.data.workflowState,
            currentApprovalState: persisted.data.approvalState,
            currentSecondPassStatus: persisted.data.secondPassStatus,
        });

        return res.status(200).json({
            ok: true,
            data: {
                ...persisted.data,
                transitionActions,
                persistence: {
                    persisted: persisted.persisted,
                    warning: persisted.warning,
                },
                diagnostics: persisted.diagnostics,
            },
        });
    }

    const lookupMissWarning = persisted.persisted && !persisted.warning
        ? '저장 환경은 연결됐지만 조회한 처리 기록에 해당하는 중앙 저장 데이터는 아직 없습니다.'
        : persisted.warning;

    return res.status(200).json({
        ok: true,
        data: {
            workflowRunId,
            workflowState: 'awaiting_manager_approval',
            riskDecision: 'SUPPLEMENTARY_REVIEW',
            approvalState: 'PENDING',
            secondPassStatus: 'NEEDED',
            transitionActions: getHarnessTransitionActionStatuses({
                currentWorkflowState: 'awaiting_manager_approval',
                currentApprovalState: 'PENDING',
                currentSecondPassStatus: 'NEEDED',
            }),
            persistence: {
                persisted: persisted.persisted,
                warning: lookupMissWarning,
            },
            diagnostics: persisted.diagnostics || {
                lookupValue: workflowRunId,
                found: false,
                resolvedBy: null,
                sourceRecordId: null,
                eventCount: 0,
                approvalCount: 0,
                overrideCount: 0,
                timelineCount: 0,
            },
            overrides: [],
            approvals: [],
            contextSnapshot: null,
            promptVersion: null,
            policyVersion: null,
            analyzerSummary: {
                summary: null,
                confidence: null,
            },
            evaluatorSummary: {
                evidenceSufficiency: null,
                requiresHumanApproval: null,
                flags: [],
            },
            latestApprovalDiff: null,
            versionDetails: {
                prompt: [],
                policy: [],
                rule: [],
            },
            versionChangeSummary: {
                prompt: [],
                policy: [],
                rule: [],
            },
            ruleImpactSummary: {
                items: [],
                narrative: '현재 저장된 가드레일 오버라이드는 없습니다.',
                totalCount: 0,
                criticalCount: 0,
            },
            decisionPayload: null,
            timeline: [
                {
                    stage: 'uploaded',
                    timestamp: new Date().toISOString(),
                    note: lookupMissWarning || '워크플로우 상태 조회 초안 응답',
                },
            ],
        },
    });
}

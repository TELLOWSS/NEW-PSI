import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../../lib/server/adminAuthGuard.js';
import { fetchPersistedHarnessWorkflowStatus } from '../../lib/server/harness/persistence.js';

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
        return res.status(200).json({
            ok: true,
            data: {
                ...persisted.data,
                persistence: {
                    persisted: persisted.persisted,
                    warning: persisted.warning,
                },
                diagnostics: persisted.diagnostics,
            },
        });
    }

    const lookupMissWarning = persisted.persisted && !persisted.warning
        ? '저장 환경은 연결됐지만 조회한 workflow run에 해당하는 영속 데이터는 아직 없습니다.'
        : persisted.warning;

    return res.status(200).json({
        ok: true,
        data: {
            workflowRunId,
            workflowState: 'awaiting_manager_approval',
            riskDecision: 'SUPPLEMENTARY_REVIEW',
            approvalState: 'PENDING',
            secondPassStatus: 'NEEDED',
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
                timelineCount: 0,
            },
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

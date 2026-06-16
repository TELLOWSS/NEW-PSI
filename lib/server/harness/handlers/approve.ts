import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../../adminAuthGuard.js';
import { fetchPersistedHarnessWorkflowStatus, persistHarnessApproval } from '../persistence.js';
import { assertHarnessApprovalCommentAllowed, buildHarnessApprovalDecision, HarnessTransitionError } from '../router.js';
import type { HarnessApprovalAction, HarnessRiskDecision } from '../workflowTypes.js';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    if (!isValidAdminAuthRequest(req)) {
        return sendUnauthorizedAdminResponse(res);
    }

    try {
        const action = String(req.body?.action || '').trim() as HarnessApprovalAction;
        const workflowRunId = String(req.body?.workflowRunId || '').trim();
        const approver = String(req.body?.approver || '').trim();
        const comment = String(req.body?.comment || '').trim();
        const currentDecision = String(req.body?.currentDecision || 'SUPPLEMENTARY_REVIEW').trim() as HarnessRiskDecision;
        const sourceRecordId = String(req.body?.recordId || '').trim();

        if (!workflowRunId || !approver || !action) {
            return res.status(400).json({ ok: false, message: 'workflowRunId, approver, action 필수' });
        }

        if (!['approve', 'reject', 'request-reanalysis'].includes(action)) {
            return res.status(400).json({ ok: false, message: '지원하지 않는 승인 액션입니다.' });
        }

        assertHarnessApprovalCommentAllowed({
            action,
            comment,
        });

        const currentWorkflow = await fetchPersistedHarnessWorkflowStatus(workflowRunId);

        if (currentWorkflow.persisted && !currentWorkflow.found) {
            return res.status(404).json({ ok: false, message: '해당 처리 기록을 찾지 못했습니다. 승인 전에 저장 연결 상태를 먼저 확인해 주십시오.' });
        }

        const persistedWorkflow = currentWorkflow.data;

        const approvalDecision = buildHarnessApprovalDecision({
            action,
            currentDecision: persistedWorkflow?.riskDecision ?? currentDecision,
            currentWorkflowState: persistedWorkflow?.workflowState,
            currentApprovalState: persistedWorkflow?.approvalState,
            currentSecondPassStatus: persistedWorkflow?.secondPassStatus,
        });

        const persistence = await persistHarnessApproval({
            workflowRunId,
            sourceRecordId: sourceRecordId || undefined,
            approver,
            action,
            comment: comment || undefined,
            decision: approvalDecision,
        });

        return res.status(200).json({
            ok: true,
            data: {
                workflowRunId: persistence.workflowRunId || workflowRunId,
                approver,
                comment,
                action,
                approvedAt: persistence.approvedAt,
                persistence,
                ...approvalDecision,
            },
        });
    } catch (error: any) {
        if (error instanceof HarnessTransitionError) {
            return res.status(error.statusCode || 400).json({ ok: false, message: error.message });
        }
        return res.status(500).json({ ok: false, message: error?.message || 'Harness approve failed' });
    }
}

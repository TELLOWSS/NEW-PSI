import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../../lib/server/adminAuthGuard.js';
import { persistHarnessApproval } from '../../lib/server/harness/persistence.js';
import { buildHarnessApprovalDecision } from '../../lib/server/harness/router.js';
import type { HarnessApprovalAction, HarnessRiskDecision } from '../../lib/server/harness/workflowTypes.js';

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

        if (!workflowRunId || !approver || !action) {
            return res.status(400).json({ ok: false, message: 'workflowRunId, approver, action 필수' });
        }

        if (!['approve', 'reject', 'request-reanalysis'].includes(action)) {
            return res.status(400).json({ ok: false, message: '지원하지 않는 승인 액션입니다.' });
        }

        const approvalDecision = buildHarnessApprovalDecision({
            action,
            currentDecision,
        });

        const persistence = await persistHarnessApproval({
            workflowRunId,
            sourceRecordId: String(req.body?.recordId || '').trim() || undefined,
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
        return res.status(500).json({ ok: false, message: error?.message || 'Harness approve failed' });
    }
}

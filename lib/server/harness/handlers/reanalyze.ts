import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../../adminAuthGuard.js';
import { buildHarnessAuditEvents } from '../auditLogger.js';
import { buildHarnessContextSnapshot } from '../contextAssembler.js';
import { validateHarnessInput } from '../inputValidators.js';
import { buildHarnessPromptSnapshot } from '../promptLayers.js';
import { fetchPersistedHarnessWorkflowStatus, persistHarnessAnalysis } from '../persistence.js';
import { assertHarnessReanalysisAllowed, buildHarnessDecision, HarnessTransitionError } from '../router.js';
import { evaluateHarnessRules } from '../ruleEngine.js';
import { buildDeterministicAnalyzerOutput } from '../agents/analyzer.js';
import { buildDeterministicEvaluatorOutput } from '../agents/evaluator.js';
import type { HarnessAnalyzeRequest, HarnessDecisionResult } from '../workflowTypes.js';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    if (!isValidAdminAuthRequest(req)) {
        return sendUnauthorizedAdminResponse(res);
    }

    try {
        const payload = (req.body || {}) as HarnessAnalyzeRequest & { workflowRunId?: string; revisedBy?: string };
        const lookupId = String(payload.workflowRunId || payload.recordId || '').trim();

        if (lookupId) {
            const currentWorkflow = await fetchPersistedHarnessWorkflowStatus(lookupId);

            if (payload.workflowRunId && currentWorkflow.persisted && !currentWorkflow.found) {
                return res.status(404).json({ ok: false, message: '재분석 대상 workflow run을 찾지 못했습니다. 저장 연결 상태를 먼저 확인해 주십시오.' });
            }

            if (currentWorkflow.found && currentWorkflow.data) {
                assertHarnessReanalysisAllowed({
                    currentWorkflowState: currentWorkflow.data.workflowState,
                    currentApprovalState: currentWorkflow.data.approvalState,
                    currentSecondPassStatus: currentWorkflow.data.secondPassStatus,
                });
            }
        }

        const validation = validateHarnessInput(payload);
        const context = buildHarnessContextSnapshot(payload);
        const prompt = buildHarnessPromptSnapshot(payload, context);
        const analyzer = buildDeterministicAnalyzerOutput(payload, context);
        const evaluator = buildDeterministicEvaluatorOutput({ analyzer, validation });
        const { decision, overrides } = evaluateHarnessRules({ payload, validation, context, evaluation: evaluator });
        const decisionResult = buildHarnessDecision({ validation, evaluation: evaluator, decision, overrides });
        const auditEvents = buildHarnessAuditEvents({
            validation,
            context,
            decision: decisionResult,
            overrides,
            analyzer,
            evaluator,
        });
        // secondPassStatus 를 workflowState 에 맞게 정확히 설정
        const reanalysisWorkflowState = decisionResult.workflowState === 'completed'
            ? 'completed'
            : 'second_pass_analyzing';
        const reanalysisDecision: HarnessDecisionResult = {
            ...decisionResult,
            workflowState: reanalysisWorkflowState,
            secondPassStatus: reanalysisWorkflowState === 'completed' ? 'DONE' : 'IN_PROGRESS',
        };
        const persistence = await persistHarnessAnalysis({
            workflowRunId: payload.workflowRunId,
            payload,
            decision: reanalysisDecision,
            analyzer: {
                summary: analyzer.summary,
                confidence: analyzer.confidence,
            },
            validation,
            evaluator,
            context,
            promptSnapshot: prompt,
            auditEvents,
            overrides,
        });

        return res.status(200).json({
            ok: true,
            data: {
                workflowRunId: persistence.workflowRunId || payload.workflowRunId || null,
                revisedBy: payload.revisedBy || null,
                reanalysisType: 'second-pass',
                analyzer,
                evaluator,
                persistence,
                decision: reanalysisDecision,
                overrides,
                prompt,
                auditEvents,
            },
        });
    } catch (error: any) {
        if (error instanceof HarnessTransitionError) {
            return res.status(error.statusCode || 400).json({ ok: false, message: error.message });
        }
        return res.status(500).json({ ok: false, message: error?.message || 'Harness reanalyze failed' });
    }
}

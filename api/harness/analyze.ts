import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../../lib/server/adminAuthGuard.js';
import { buildHarnessAuditEvents } from '../../lib/server/harness/auditLogger.js';
import { buildHarnessContextSnapshot } from '../../lib/server/harness/contextAssembler.js';
import { validateHarnessInput } from '../../lib/server/harness/inputValidators.js';
import { getDefaultHarnessPolicy } from '../../lib/server/harness/policyRegistry.js';
import { buildHarnessPromptSnapshot } from '../../lib/server/harness/promptLayers.js';
import { buildHarnessDecision } from '../../lib/server/harness/router.js';
import { evaluateHarnessRules } from '../../lib/server/harness/ruleEngine.js';
import { buildDeterministicAnalyzerOutput } from '../../lib/server/harness/agents/analyzer.js';
import { buildDeterministicEvaluatorOutput } from '../../lib/server/harness/agents/evaluator.js';
import { validateAnalyzerOutput } from '../../lib/server/harness/outputValidators.js';
import { persistHarnessAnalysis } from '../../lib/server/harness/persistence.js';
import type { HarnessAnalyzeRequest } from '../../lib/server/harness/workflowTypes.js';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    if (!isValidAdminAuthRequest(req)) {
        return sendUnauthorizedAdminResponse(res);
    }

    try {
        const payload = (req.body || {}) as HarnessAnalyzeRequest;
        const validation = validateHarnessInput(payload);
        const context = buildHarnessContextSnapshot(payload);
        const prompt = buildHarnessPromptSnapshot(payload, context);
        const analyzer = buildDeterministicAnalyzerOutput(payload, context);
        const analyzerValidation = validateAnalyzerOutput(analyzer);

        const evaluator = buildDeterministicEvaluatorOutput({
            analyzer,
            validation,
        });

        const { decision, overrides } = evaluateHarnessRules({
            payload,
            validation,
            context,
            evaluation: evaluator,
        });

        const decisionResult = buildHarnessDecision({
            validation,
            evaluation: evaluator,
            decision,
            overrides,
        });

        const auditEvents = buildHarnessAuditEvents({
            validation,
            context,
            decision: decisionResult,
            overrides,
        });

        const persistence = await persistHarnessAnalysis({
            workflowRunId: String((req.body || {}).workflowRunId || '').trim() || undefined,
            payload,
            decision: decisionResult,
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
                workflowRunId: persistence.workflowRunId,
                persistence,
                policy: getDefaultHarnessPolicy(),
                validation,
                analyzer,
                analyzerValidation,
                evaluator,
                decision: decisionResult,
                overrides,
                context,
                prompt,
                auditEvents,
            },
        });
    } catch (error: any) {
        return res.status(500).json({
            ok: false,
            message: error?.message || 'Harness analyze failed',
        });
    }
}

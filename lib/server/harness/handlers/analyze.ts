import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../../adminAuthGuard.js';
import { buildHarnessAuditEvents } from '../auditLogger.js';
import { buildHarnessContextSnapshot } from '../contextAssembler.js';
import { validateHarnessInput } from '../inputValidators.js';
import { getDefaultHarnessPolicy } from '../policyRegistry.js';
import { buildHarnessPromptSnapshot } from '../promptLayers.js';
import { buildHarnessDecision } from '../router.js';
import { evaluateHarnessRules } from '../ruleEngine.js';
import { buildDeterministicAnalyzerOutput } from '../agents/analyzer.js';
import { buildDeterministicEvaluatorOutput } from '../agents/evaluator.js';
import { validateAnalyzerOutput, validateEvaluatorOutput } from '../outputValidators.js';
import { persistHarnessAnalysis } from '../persistence.js';
import type { HarnessAnalyzeRequest } from '../workflowTypes.js';

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
        const evaluatorValidation = validateEvaluatorOutput(evaluator);

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
            analyzer,
            evaluator,
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
                evaluatorValidation,
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

import { DEFAULT_HARNESS_POLICY, PROMPT_VERSION } from './policyRegistry.js';
import {
    normalizeSensorEvents,
    normalizeWeatherContext,
    normalizeWorkPlanContext,
} from './contextProviders/dynamicContext.js';
import type { HarnessAnalyzeRequest, HarnessContextSnapshot } from './workflowTypes.js';

export function buildHarnessContextSnapshot(payload: HarnessAnalyzeRequest): HarnessContextSnapshot {
    return {
        capturedAt: new Date().toISOString(),
        promptVersion: PROMPT_VERSION,
        policyVersion: DEFAULT_HARNESS_POLICY.version,
        weather: normalizeWeatherContext(payload),
        workPlan: normalizeWorkPlanContext(payload),
        sensorEvents: normalizeSensorEvents(payload),
    };
}

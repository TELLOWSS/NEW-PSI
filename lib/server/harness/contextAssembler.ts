import { DEFAULT_HARNESS_POLICY, PROMPT_VERSION } from './policyRegistry.js';
import type { HarnessAnalyzeRequest, HarnessContextSnapshot } from './workflowTypes.js';

export function buildHarnessContextSnapshot(payload: HarnessAnalyzeRequest): HarnessContextSnapshot {
    return {
        capturedAt: new Date().toISOString(),
        promptVersion: PROMPT_VERSION,
        policyVersion: DEFAULT_HARNESS_POLICY.version,
        weather: {
            condition: payload.weather?.condition || null,
            windSpeedMps: payload.weather?.windSpeedMps ?? null,
            rainfallMm: payload.weather?.rainfallMm ?? null,
        },
        workPlan: {
            taskName: payload.workPlan?.taskName || null,
            concurrentHighRiskTasks: Array.isArray(payload.workPlan?.concurrentHighRiskTasks)
                ? payload.workPlan?.concurrentHighRiskTasks.filter(Boolean)
                : [],
        },
        sensorEvents: Array.isArray(payload.sensorEvents)
            ? payload.sensorEvents.map((event) => ({
                type: String(event.type || 'unknown'),
                severity: String(event.severity || 'info'),
                message: event.message ? String(event.message) : null,
            }))
            : [],
    };
}

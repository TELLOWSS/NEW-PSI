import type { HarnessAnalyzeRequest, HarnessContextSnapshot } from '../workflowTypes.js';

export function normalizeWeatherContext(payload: HarnessAnalyzeRequest): HarnessContextSnapshot['weather'] {
    return {
        condition: payload.weather?.condition || null,
        windSpeedMps: payload.weather?.windSpeedMps ?? null,
        rainfallMm: payload.weather?.rainfallMm ?? null,
    };
}

export function normalizeWorkPlanContext(payload: HarnessAnalyzeRequest): HarnessContextSnapshot['workPlan'] {
    return {
        taskName: payload.workPlan?.taskName || null,
        concurrentHighRiskTasks: Array.isArray(payload.workPlan?.concurrentHighRiskTasks)
            ? payload.workPlan.concurrentHighRiskTasks.filter((task): task is string => Boolean(String(task || '').trim()))
            : [],
    };
}

export function normalizeSensorEvents(payload: HarnessAnalyzeRequest): HarnessContextSnapshot['sensorEvents'] {
    return Array.isArray(payload.sensorEvents)
        ? payload.sensorEvents.map((event) => ({
            type: String(event.type || 'unknown'),
            severity: String(event.severity || 'info'),
            message: event.message ? String(event.message) : null,
        }))
        : [];
}

export function buildDynamicContextPromptLines(payload: HarnessAnalyzeRequest, context: HarnessContextSnapshot): string[] {
    const lines: string[] = [];

    if (payload.jobType) {
        lines.push(`공종: ${payload.jobType}`);
    }

    if (context.workPlan.taskName) {
        lines.push(`당일 작업 계획: ${context.workPlan.taskName}`);
    }

    if (context.workPlan.concurrentHighRiskTasks.length > 0) {
        lines.push(`동시 고위험 작업: ${context.workPlan.concurrentHighRiskTasks.join(', ')}`);
    }

    if (context.weather.condition) {
        lines.push(`기상 상태: ${context.weather.condition}`);
    }

    if (typeof context.weather.windSpeedMps === 'number') {
        lines.push(`풍속: ${context.weather.windSpeedMps}m/s`);
    }

    if (typeof context.weather.rainfallMm === 'number') {
        lines.push(`강우량: ${context.weather.rainfallMm}mm`);
    }

    if (context.sensorEvents.length > 0) {
        lines.push(`센서 이벤트: ${context.sensorEvents.map((event) => `${event.type}:${event.severity}${event.message ? `(${event.message})` : ''}`).join(' | ')}`);
    }

    const metadata = payload.metadata && typeof payload.metadata === 'object'
        ? Object.entries(payload.metadata)
            .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
            .slice(0, 6)
            .map(([key, value]) => `${key}: ${String(value)}`)
        : [];

    if (metadata.length > 0) {
        lines.push(`현장 메타데이터: ${metadata.join(', ')}`);
    }

    return lines;
}

export type UIViewMetricEventName =
    | 'view_enter'
    | 'view_exit'
    | 'view_mode_change'
    | 'cta_click'
    | 'control_change';

export interface UIViewMetricRecord {
    timestamp: string;
    event: UIViewMetricEventName;
    page: string;
    sessionId: string;
    payload?: Record<string, unknown>;
}

const UI_VIEW_MODE_METRICS_KEY = 'psi_view_mode_metrics';
const UI_VIEW_MODE_METRICS_MAX = 300;

export const createMetricSessionId = (page: string): string => {
    const seed = Math.random().toString(36).slice(2, 8);
    return `${page}-${Date.now()}-${seed}`;
};

export const trackUIViewMetric = (
    event: UIViewMetricEventName,
    page: string,
    sessionId: string,
    payload?: Record<string, unknown>,
): void => {
    const record: UIViewMetricRecord = {
        timestamp: new Date().toISOString(),
        event,
        page,
        sessionId,
        payload,
    };

    try {
        const raw = localStorage.getItem(UI_VIEW_MODE_METRICS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        const existing: UIViewMetricRecord[] = Array.isArray(parsed) ? parsed : [];
        const next = [record, ...existing].slice(0, UI_VIEW_MODE_METRICS_MAX);
        localStorage.setItem(UI_VIEW_MODE_METRICS_KEY, JSON.stringify(next));
        console.info('[PSI][UIViewMetric]', record);
    } catch (error) {
        console.warn('[PSI][UIViewMetric] localStorage parse/store failed:', error);
    }
};

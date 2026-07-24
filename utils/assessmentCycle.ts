import type {
    AssessmentCadence,
    AssessmentCyclePolicySnapshot,
    AssessmentCycleSettings,
    Page,
} from '../types';

export const PSI_APP_SETTINGS_STORAGE_KEY = 'psi_app_settings';
export const PSI_APP_SETTINGS_CHANGED_EVENT = 'psi-app-settings-changed';

const DEFAULT_ANCHOR_DATE = '2026-01-01';
const DEFAULT_RECORD_LABEL = '위험성평가 기록지';
const DEFAULT_POLICY_VERSION = 'legacy-monthly-v1';
const DEFAULT_EFFECTIVE_FROM = '1970-01-01';
const DEFAULT_TIME_ZONE = 'Asia/Seoul';
const WEEKDAY_LABELS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'] as const;

export const ASSESSMENT_CADENCE_OPTIONS: Array<{
    value: AssessmentCadence;
    label: string;
    description: string;
}> = [
    { value: 'daily', label: '일일', description: '매일 작성하고 다음 작업일에 바로 환류합니다.' },
    { value: 'weekly', label: '주간', description: '매주 지정한 요일을 기준으로 작성·검토합니다.' },
    { value: 'biweekly', label: '격주', description: '기준일에서 2주 간격으로 작성·검토합니다.' },
    { value: 'monthly', label: '월간', description: '매월 지정한 날짜를 기준으로 작성·검토합니다.' },
    { value: 'custom', label: '맞춤', description: '현장 운영에 맞춰 원하는 일수 간격을 사용합니다.' },
];

export const DEFAULT_ASSESSMENT_CYCLE: AssessmentCycleSettings = {
    cadence: 'monthly',
    recordLabel: DEFAULT_RECORD_LABEL,
    weeklyDueDay: 1,
    monthlyDueDay: 1,
    customIntervalDays: 30,
    anchorDate: DEFAULT_ANCHOR_DATE,
    policyVersion: DEFAULT_POLICY_VERSION,
    effectiveFrom: DEFAULT_EFFECTIVE_FROM,
    timeZone: DEFAULT_TIME_ZONE,
};

export type AssessmentCycleCopy = {
    cadenceLabel: string;
    shortLabel: string;
    frequencyLabel: string;
    recordLabel: string;
    currentCycleLabel: string;
    previousCycleLabel: string;
    nextCycleLabel: string;
    basisLabel: string;
    reportLabel: string;
    trackingLabel: string;
    educationReturnLabel: string;
    scheduleDescription: string;
    periodDays: number;
};

const clampInteger = (value: unknown, minimum: number, maximum: number, fallback: number): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
};

const normalizeAnchorDate = (value: unknown): string => {
    if (typeof value !== 'string') return DEFAULT_ANCHOR_DATE;
    const normalized = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return DEFAULT_ANCHOR_DATE;
    const [year, month, day] = normalized.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day
        ? normalized
        : DEFAULT_ANCHOR_DATE;
};

const normalizeTimeZone = (value: unknown): string => {
    if (typeof value !== 'string' || !value.trim()) return DEFAULT_TIME_ZONE;
    const candidate = value.trim().slice(0, 80);
    try {
        new Intl.DateTimeFormat('ko-KR', { timeZone: candidate }).format();
        return candidate;
    } catch {
        return DEFAULT_TIME_ZONE;
    }
};

const normalizeCadence = (value: unknown): AssessmentCadence =>
    ['daily', 'weekly', 'biweekly', 'monthly', 'custom'].includes(String(value))
        ? (value as AssessmentCadence)
        : DEFAULT_ASSESSMENT_CYCLE.cadence;

const normalizePolicySnapshot = (
    input?: Partial<AssessmentCyclePolicySnapshot> | null,
): AssessmentCyclePolicySnapshot => ({
    cadence: normalizeCadence(input?.cadence),
    weeklyDueDay: clampInteger(input?.weeklyDueDay, 0, 6, DEFAULT_ASSESSMENT_CYCLE.weeklyDueDay),
    monthlyDueDay: clampInteger(input?.monthlyDueDay, 1, 28, DEFAULT_ASSESSMENT_CYCLE.monthlyDueDay),
    customIntervalDays: clampInteger(
        input?.customIntervalDays,
        1,
        365,
        DEFAULT_ASSESSMENT_CYCLE.customIntervalDays,
    ),
    anchorDate: normalizeAnchorDate(input?.anchorDate),
    policyVersion: typeof input?.policyVersion === 'string' && input.policyVersion.trim()
        ? input.policyVersion.trim().slice(0, 80)
        : DEFAULT_POLICY_VERSION,
    effectiveFrom: normalizeAnchorDate(input?.effectiveFrom || DEFAULT_EFFECTIVE_FROM),
    timeZone: normalizeTimeZone(input?.timeZone),
});

export const normalizeAssessmentCycle = (
    input?: Partial<AssessmentCycleSettings> | null,
): AssessmentCycleSettings => {
    const recordLabel = typeof input?.recordLabel === 'string' && input.recordLabel.trim()
        ? input.recordLabel.trim().slice(0, 40)
        : DEFAULT_RECORD_LABEL;
    const policy = normalizePolicySnapshot(input);
    const policyHistory = Array.isArray(input?.policyHistory)
        ? input.policyHistory
            .filter((item): item is AssessmentCyclePolicySnapshot => Boolean(item && typeof item === 'object'))
            .map((item) => normalizePolicySnapshot(item))
            .filter((item, index, items) =>
                items.findIndex((candidate) => candidate.policyVersion === item.policyVersion) === index,
            )
            .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))
            .slice(-50)
        : [];

    return {
        ...policy,
        recordLabel,
        ...(policyHistory.length > 0 ? { policyHistory } : {}),
    };
};

const PERIOD_POLICY_KEYS: Array<keyof AssessmentCycleSettings> = [
    'cadence',
    'weeklyDueDay',
    'monthlyDueDay',
    'customIntervalDays',
    'anchorDate',
];

export const hasAssessmentCyclePolicyChanged = (
    previous?: Partial<AssessmentCycleSettings> | null,
    next?: Partial<AssessmentCycleSettings> | null,
): boolean => {
    const before = normalizeAssessmentCycle(previous);
    const after = normalizeAssessmentCycle(next);
    return PERIOD_POLICY_KEYS.some((key) => before[key] !== after[key]);
};

export const getDateOnlyInTimeZone = (
    value = new Date(),
    timeZone = DEFAULT_TIME_ZONE,
): string => {
    const safeTimeZone = normalizeTimeZone(timeZone);
    const parts = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: safeTimeZone,
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((item) => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
};

export const activateAssessmentCyclePolicy = (
    input?: Partial<AssessmentCycleSettings> | null,
    previous?: Partial<AssessmentCycleSettings> | null,
    effectiveFrom?: string,
): AssessmentCycleSettings => {
    const cycle = normalizeAssessmentCycle(input);
    const priorCycle = normalizeAssessmentCycle(previous);
    const priorSnapshot = normalizePolicySnapshot(priorCycle);
    const policyHistory = [
        ...(cycle.policyHistory || []),
        ...(priorCycle.policyHistory || []),
        priorSnapshot,
    ].filter((item, index, items) =>
        items.findIndex((candidate) => candidate.policyVersion === item.policyVersion) === index,
    ).slice(-50);

    return {
        ...cycle,
        policyHistory,
        effectiveFrom: normalizeAnchorDate(
            effectiveFrom || getDateOnlyInTimeZone(new Date(), cycle.timeZone),
        ),
        policyVersion: `cycle-${cycle.cadence}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
};

export const getAssessmentCycleCopy = (
    input?: Partial<AssessmentCycleSettings> | null,
): AssessmentCycleCopy => {
    const cycle = normalizeAssessmentCycle(input);
    const weekday = WEEKDAY_LABELS[cycle.weeklyDueDay];

    if (cycle.cadence === 'daily') {
        return {
            cadenceLabel: '일일 운영',
            shortLabel: '일일',
            frequencyLabel: '매일',
            recordLabel: cycle.recordLabel,
            currentCycleLabel: '오늘',
            previousCycleLabel: '직전 작업일',
            nextCycleLabel: '다음 작업일',
            basisLabel: '기준일',
            reportLabel: '일일 계도 리포트',
            trackingLabel: '일일 계도·추적자료',
            educationReturnLabel: '다음 작업일 교육 환류',
            scheduleDescription: `매일 ${cycle.recordLabel}를 작성하고 다음 작업일 교육·조치에 반영합니다.`,
            periodDays: 1,
        };
    }

    if (cycle.cadence === 'weekly') {
        return {
            cadenceLabel: '주간 운영',
            shortLabel: '주간',
            frequencyLabel: `매주 ${weekday}`,
            recordLabel: cycle.recordLabel,
            currentCycleLabel: '이번 주',
            previousCycleLabel: '지난 주',
            nextCycleLabel: '다음 주',
            basisLabel: '기준주',
            reportLabel: '주간 계도 리포트',
            trackingLabel: '주간 계도·추적자료',
            educationReturnLabel: '다음 주 교육 환류',
            scheduleDescription: `매주 ${weekday}에 ${cycle.recordLabel}를 정리하고 다음 주 교육·조치에 반영합니다.`,
            periodDays: 7,
        };
    }

    if (cycle.cadence === 'biweekly') {
        return {
            cadenceLabel: '격주 운영',
            shortLabel: '격주',
            frequencyLabel: `2주마다 · 기준 ${cycle.anchorDate}`,
            recordLabel: cycle.recordLabel,
            currentCycleLabel: '이번 2주',
            previousCycleLabel: '직전 2주',
            nextCycleLabel: '다음 2주',
            basisLabel: '기준기간',
            reportLabel: '격주 계도 리포트',
            trackingLabel: '격주 계도·추적자료',
            educationReturnLabel: '다음 2주 교육 환류',
            scheduleDescription: `${cycle.anchorDate}을 기준으로 2주마다 ${cycle.recordLabel}를 정리해 다음 운영 주기에 반영합니다.`,
            periodDays: 14,
        };
    }

    if (cycle.cadence === 'custom') {
        return {
            cadenceLabel: '맞춤 주기 운영',
            shortLabel: `${cycle.customIntervalDays}일`,
            frequencyLabel: `${cycle.customIntervalDays}일마다 · 기준 ${cycle.anchorDate}`,
            recordLabel: cycle.recordLabel,
            currentCycleLabel: '이번 운영 주기',
            previousCycleLabel: '직전 운영 주기',
            nextCycleLabel: '다음 운영 주기',
            basisLabel: '기준기간',
            reportLabel: `${cycle.customIntervalDays}일 계도 리포트`,
            trackingLabel: `${cycle.customIntervalDays}일 계도·추적자료`,
            educationReturnLabel: '다음 운영 주기 교육 환류',
            scheduleDescription: `${cycle.anchorDate}을 기준으로 ${cycle.customIntervalDays}일마다 ${cycle.recordLabel}를 정리해 다음 운영 주기에 반영합니다.`,
            periodDays: cycle.customIntervalDays,
        };
    }

    return {
        cadenceLabel: '월간 운영',
        shortLabel: '월간',
        frequencyLabel: `매월 ${cycle.monthlyDueDay}일`,
        recordLabel: cycle.recordLabel,
        currentCycleLabel: '이번 달',
        previousCycleLabel: '지난 달',
        nextCycleLabel: '다음 달',
        basisLabel: '기준월',
        reportLabel: '월간 계도 리포트',
        trackingLabel: '월간 계도·추적자료',
        educationReturnLabel: '다음 달 교육 환류',
        scheduleDescription: `매월 ${cycle.monthlyDueDay}일을 기준으로 ${cycle.recordLabel}를 정리하고 다음 달 교육·조치에 반영합니다.`,
        periodDays: 30,
    };
};

export type AssessmentPeriod = {
    key: string;
    startDate: string;
    endDate: string;
    label: string;
    cadence: AssessmentCadence;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toUtcDateOnly = (
    value: string | Date,
    timeZone = DEFAULT_TIME_ZONE,
): Date => {
    if (value instanceof Date) {
        const localDate = getDateOnlyInTimeZone(value, timeZone);
        return toUtcDateOnly(localDate, timeZone);
    }
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
        const fallback = new Date(value);
        if (Number.isNaN(fallback.getTime())) return toUtcDateOnly(new Date(), timeZone);
        return toUtcDateOnly(fallback, timeZone);
    }
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
};

const formatUtcDate = (date: Date): string => date.toISOString().slice(0, 10);
const addUtcDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);
const formatPeriodRange = (start: Date, end: Date): string => {
    const startLabel = new Intl.DateTimeFormat('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        timeZone: 'UTC',
    }).format(start);
    const endLabel = new Intl.DateTimeFormat('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        timeZone: 'UTC',
    }).format(end);
    return `${startLabel}~${endLabel}`;
};

export const resolveAssessmentPeriod = (
    value: string | Date,
    input?: Partial<AssessmentCycleSettings> | null,
): AssessmentPeriod => {
    const configuredCycle = normalizeAssessmentCycle(input);
    const date = toUtcDateOnly(value, configuredCycle.timeZone);
    const policies = [
        ...(configuredCycle.policyHistory || []),
        normalizePolicySnapshot(configuredCycle),
    ];
    const selectedPolicy = policies.reduce<AssessmentCyclePolicySnapshot | null>((selected, candidate) => {
        const effectiveFrom = toUtcDateOnly(candidate.effectiveFrom, candidate.timeZone);
        if (effectiveFrom.getTime() > date.getTime()) return selected;
        if (!selected) return candidate;
        const selectedEffectiveFrom = toUtcDateOnly(selected.effectiveFrom, selected.timeZone);
        return effectiveFrom.getTime() >= selectedEffectiveFrom.getTime() ? candidate : selected;
    }, null);
    const cycle: AssessmentCycleSettings = selectedPolicy
        ? {
            ...configuredCycle,
            ...selectedPolicy,
        }
        : DEFAULT_ASSESSMENT_CYCLE;
    let start = date;
    let end = date;

    if (cycle.cadence === 'weekly') {
        const daysUntilDueDay = (cycle.weeklyDueDay - date.getUTCDay() + 7) % 7;
        end = addUtcDays(date, daysUntilDueDay);
        start = addUtcDays(end, -6);
    } else if (cycle.cadence === 'biweekly' || cycle.cadence === 'custom') {
        const interval = cycle.cadence === 'biweekly' ? 14 : cycle.customIntervalDays;
        const anchor = toUtcDateOnly(cycle.anchorDate, cycle.timeZone);
        const elapsedDays = Math.floor((date.getTime() - anchor.getTime()) / DAY_MS);
        const periodIndex = Math.floor(elapsedDays / interval);
        start = addUtcDays(anchor, periodIndex * interval);
        end = addUtcDays(start, interval - 1);
    } else if (cycle.cadence === 'monthly') {
        const year = date.getUTCFullYear();
        const month = date.getUTCMonth();
        const thisMonthStart = new Date(Date.UTC(year, month, cycle.monthlyDueDay));
        start = date.getTime() >= thisMonthStart.getTime()
            ? thisMonthStart
            : new Date(Date.UTC(year, month - 1, cycle.monthlyDueDay));
        const nextStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, cycle.monthlyDueDay));
        end = addUtcDays(nextStart, -1);
    }

    const startDate = formatUtcDate(start);
    const endDate = formatUtcDate(end);
    const label = cycle.cadence === 'daily'
        ? startDate
        : cycle.cadence === 'monthly' && cycle.monthlyDueDay === 1
            ? startDate.slice(0, 7)
            : formatPeriodRange(start, end);

    return {
        key: `${cycle.cadence}:${startDate}:${endDate}`,
        startDate,
        endDate,
        label,
        cadence: cycle.cadence,
    };
};

export const groupRecordsByAssessmentPeriod = <T extends { date?: string }>(
    records: T[],
    input?: Partial<AssessmentCycleSettings> | null,
): Map<string, { period: AssessmentPeriod; records: T[] }> => {
    const groups = new Map<string, { period: AssessmentPeriod; records: T[] }>();
    records.forEach((record) => {
        const period = resolveAssessmentPeriod(record.date || new Date(), input);
        const current = groups.get(period.key);
        if (current) {
            current.records.push(record);
        } else {
            groups.set(period.key, { period, records: [record] });
        }
    });
    return groups;
};

export const readAssessmentCycleFromStorage = (): AssessmentCycleSettings => {
    if (typeof window === 'undefined') return DEFAULT_ASSESSMENT_CYCLE;

    try {
        const raw = window.localStorage.getItem(PSI_APP_SETTINGS_STORAGE_KEY);
        if (!raw) return DEFAULT_ASSESSMENT_CYCLE;
        const parsed = JSON.parse(raw) as { assessmentCycle?: Partial<AssessmentCycleSettings> };
        return normalizeAssessmentCycle(parsed.assessmentCycle);
    } catch {
        return DEFAULT_ASSESSMENT_CYCLE;
    }
};

export const notifyAssessmentCycleChanged = (): void => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(PSI_APP_SETTINGS_CHANGED_EVENT));
};

export const getCycleAwareRouteLabel = (
    page: Page,
    fallbackLabel: string,
    copy: AssessmentCycleCopy,
): string => {
    if (page === 'monthly-guidance-report') return copy.reportLabel;
    return fallbackLabel;
};

export const getCycleAwareRouteDescription = (
    page: Page,
    fallbackDescription: string,
    copy: AssessmentCycleCopy,
): string => {
    if (page === 'education-return') {
        return `검증된 기록을 원페이지 교육자료, 개인 보호 리포트, ${copy.trackingLabel}로 연결합니다.`;
    }
    if (page === 'monthly-guidance-report') {
        return `${copy.recordLabel}의 위험 신호를 익명화·종합해 ${copy.nextCycleLabel} 교육과 조치 기준으로 환류합니다.`;
    }
    if (page === 'reports') {
        return `개인별 분석 결과를 관리자 관점에서 확인하고 ${copy.shortLabel} 변화와 개선 이행을 추적합니다.`;
    }
    if (page === 'a4-education-material') {
        return `${copy.recordLabel}와 현장 근거를 바탕으로 ${copy.nextCycleLabel} 전파교육용 한 장 자료를 만듭니다.`;
    }
    if (page === 'predictive-analysis') {
        return `6대 지표와 반복 위험신호를 해석해 ${copy.nextCycleLabel} 보호조치와 교육 우선순위를 제안합니다.`;
    }
    if (page === 'introduction') {
        return `${copy.recordLabel}를 6대 지표, 보호조치, ${copy.nextCycleLabel} 교육 환류로 연결하는 PSI의 운영 가치를 소개합니다.`;
    }
    return fallbackDescription;
};

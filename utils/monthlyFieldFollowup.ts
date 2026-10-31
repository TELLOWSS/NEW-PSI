import type { WorkerRecord, WorkerRiskFollowupEvent } from '../types';
import { collectWorkerRiskFollowupCases } from './workerRiskFollowup';

/** Anonymous, dated education signals from persisted manager action logs only. */
export const MONTHLY_FOLLOWUP_EDUCATION_VERSION = 'psi-monthly-followup-education-v1';

export type MonthlyFollowupQuestion = {
    number: 1 | 2 | 3 | 4 | 5;
    unresolved: number;
    overdue: number;
    reopened: number;
    educationPrompt: string;
};

export interface MonthlyFieldFollowupSummary {
    asOfDate: string;
    periodStartDate: string;
    totalCases: number;
    unresolved: number;
    completed: number;
    overdue: number;
    interimControl: number;
    scheduled: number;
    reopened: number;
    carriedOver: number;
    touchedInPeriod: number;
    questionGroups: MonthlyFollowupQuestion[];
    educationFocus: string[];
}

const Q_PROMPTS: Record<1 | 2 | 3 | 4 | 5, string> = {
    1: '위험 작업 위치·순서와 통제방법을 작업 전에 함께 확인합니다.',
    2: '기록된 위험요인이 실제 발생할 조건과 차단조치를 현장에서 확인합니다.',
    3: '근로자의 위험 인식과 현장 공식 위험성평가를 별도로 대조합니다.',
    4: '예방조치와 보호구·안전시설의 실제 적용 증빙을 확인합니다.',
    5: '안전실천 약속을 TBM 및 작업 전 실제 확인 행동과 연결합니다.',
};

const validDay = (value: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const day = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value;
};

export const getKoreanCalendarDay = (date: Date = new Date()): string => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const get = (type: string) => parts.find(part => part.type === type)?.value || '';
    return get('year') + '-' + get('month') + '-' + get('day');
};

const eventDay = (timestamp: string): string => {
    const date = new Date(timestamp);
    return Number.isFinite(date.getTime()) ? getKoreanCalendarDay(date) : '';
};

export const buildMonthlyFieldFollowupSummary = (
    records: readonly WorkerRecord[],
    options: { asOfDate: string; periodStartDate?: string; workType?: string },
): MonthlyFieldFollowupSummary => {
    const today = getKoreanCalendarDay();
    const requestedAsOf = validDay(options.asOfDate) ? options.asOfDate : today;
    const asOfDate = requestedAsOf < today ? requestedAsOf : today;
    const periodStartDate = validDay(options.periodStartDate || '') && String(options.periodStartDate) <= asOfDate
        ? String(options.periodStartDate)
        : '';
    const groupedEvents = new Map<string, Map<string, WorkerRiskFollowupEvent>>();

    for (const record of records) {
        if (options.workType && options.workType !== '전체 공종' && record.jobField !== options.workType) continue;
        const recordDay = String(record.date || '').slice(0, 10);
        if (validDay(recordDay) && recordDay > asOfDate) continue;
        const id = String(record.id || '').trim();
        if (!id) continue;
        const row = groupedEvents.get(id) || new Map<string, WorkerRiskFollowupEvent>();
        for (const event of record.riskFollowupEvents || []) {
            if (!event || !event.id || !event.caseId) continue;
            const day = eventDay(event.timestamp);
            if (!day || day > asOfDate) continue;
            if (!row.has(event.id)) row.set(event.id, event);
        }
        if (row.size > 0) groupedEvents.set(id, row);
    }

    const questionGroups: MonthlyFollowupQuestion[] = ([1, 2, 3, 4, 5] as const).map(number => ({
        number, unresolved: 0, overdue: 0, reopened: 0, educationPrompt: Q_PROMPTS[number],
    }));
    const result: MonthlyFieldFollowupSummary = {
        asOfDate, periodStartDate,
        totalCases: 0, unresolved: 0, completed: 0, overdue: 0,
        interimControl: 0, scheduled: 0, reopened: 0,
        carriedOver: 0, touchedInPeriod: 0,
        questionGroups, educationFocus: [],
    };

    for (const events of groupedEvents.values()) {
        const chronological = [...events.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
        for (const item of collectWorkerRiskFollowupCases(chronological)) {
            const latest = item.latest;
            const firstDay = eventDay(item.opened.timestamp);
            const isCompleted = latest.status === 'completed';
            const hasReopened = item.events.some(event => event.status === 'reopened');
            const dueDate = validDay(String(latest.dueDate || '')) ? String(latest.dueDate) : '';
            const isOverdue = !isCompleted && Boolean(dueDate) && dueDate < asOfDate;
            const bucket = questionGroups.find(row => row.number === item.opened.questionNumber);
            if (!bucket) continue;
            result.totalCases += 1;
            if (isCompleted) result.completed += 1;
            else { result.unresolved += 1; bucket.unresolved += 1; }
            if (latest.status === 'interim_control') result.interimControl += 1;
            if (latest.status === 'scheduled') result.scheduled += 1;
            if (isOverdue) { result.overdue += 1; bucket.overdue += 1; }
            if (hasReopened) { result.reopened += 1; bucket.reopened += 1; }
            if (periodStartDate && firstDay < periodStartDate && !isCompleted) result.carriedOver += 1;
            if (periodStartDate && item.events.some(event => eventDay(event.timestamp) >= periodStartDate)) result.touchedInPeriod += 1;
        }
    }

    // Generic prompts only; never publish handwritten answers, names, free-form
    // observation descriptions, employee IDs, or unverified official risk grades.
    result.educationFocus = questionGroups
        .filter(row => row.unresolved > 0 || row.overdue > 0 || row.reopened > 0)
        .sort((a, b) => (b.overdue - a.overdue) || (b.reopened - a.reopened) || (b.unresolved - a.unresolved) || (a.number - b.number))
        .slice(0, 3)
        .map(row => 'Q' + row.number + ' 확인사항 · 미완료 ' + row.unresolved + '건 / 기한 초과 ' + row.overdue
            + '건 / 재개방 ' + row.reopened + '건 — ' + row.educationPrompt);

    return result;
};

/** This is a safety education prompt, not evidence of a violation or high-risk grade. */
export const formatMonthlyFollowupEducationLines = (summary: MonthlyFieldFollowupSummary): string[] => {
    if (!summary.totalCases) return [];
    return [
        '[현장 후속조치 환류 · 기준일 ' + summary.asOfDate + ']',
        '관리자 후속조치 ' + summary.totalCases + '건 중 진행 ' + summary.unresolved
            + '건, 기한 초과 ' + summary.overdue + '건, 완료 확인 ' + summary.completed
            + '건, 재개방 이력 ' + summary.reopened + '건.',
        ...(summary.carriedOver ? ['이전 평가주기에서 미완료 상태로 이어진 조치 ' + summary.carriedOver + '건은 담당자와 임시통제를 재확인합니다.'] : []),
        ...(summary.educationFocus.length ? summary.educationFocus : ['등록된 후속조치의 작업 전 확인 결과를 교육 담당자가 검토합니다.']),
        '위 자료는 교육용 익명 집계입니다. 근로자 위반·사고 발생·공식 상등급 위험으로 자동 분류하거나 조치 완료로 간주하지 않습니다.',
    ];
};

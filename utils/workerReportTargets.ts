import type { WorkerRecord } from '../types';
import { buildWorkerTimelineGroups, type WorkerTimelineGroup } from './workerIdentity';

const toDateValue = (value: string): number => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const toMonthLabel = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export interface WorkerReportTarget extends WorkerTimelineGroup {
    recordCount: number;
    periodLabel: string;
    latestDateLabel: string;
}

export const buildWorkerReportTargets = (records: WorkerRecord[]): WorkerReportTarget[] => (
    buildWorkerTimelineGroups(records)
        .map((group) => ({
            ...group,
            recordCount: group.records.length,
            periodLabel: group.firstDate === group.lastDate
                ? toMonthLabel(group.lastDate)
                : `${toMonthLabel(group.firstDate)} - ${toMonthLabel(group.lastDate)}`,
            latestDateLabel: group.lastDate,
        }))
        .sort((left, right) => {
            const nameOrder = String(left.latestRecord.name || '').localeCompare(String(right.latestRecord.name || ''), 'ko');
            if (nameOrder !== 0) return nameOrder;
            return toDateValue(right.lastDate) - toDateValue(left.lastDate);
        })
);

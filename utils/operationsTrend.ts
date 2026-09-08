import type { WorkerRecord } from '../types';
import { hasOperationsRiskSignal } from './operationsBoard';

export type TrendGranularity = 'daily' | 'weekly' | 'monthly' | 'yearly';
export const TREND_PERIODS: Record<TrendGranularity, { label: string; count: number; range: string }> = {
    daily: { label: '일간', count: 14, range: '14일' },
    weekly: { label: '주간', count: 12, range: '12주 · 월요일 시작' },
    monthly: { label: '월간', count: 12, range: '12개월' },
    yearly: { label: '년간', count: 5, range: '5년' },
};
const key = (date: Date) => date.toISOString().slice(0, 10);
const recordDay = (value: string): Date | null => {
    let day = String(value || '').trim();
    if (day.includes('T')) {
        const instant = new Date(day);
        if (!Number.isFinite(instant.getTime())) return null;
        day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const date = new Date(`${day}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && key(date) === day ? date : null;
};
const startOf = (day: Date, period: TrendGranularity): Date => {
    const date = new Date(day);
    if (period === 'weekly') date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    if (period === 'monthly') date.setUTCDate(1);
    if (period === 'yearly') date.setUTCMonth(0, 1);
    return date;
};
const shift = (date: Date, period: TrendGranularity, offset: number): Date => {
    const next = new Date(date);
    if (period === 'monthly') next.setUTCMonth(next.getUTCMonth() + offset);
    else if (period === 'yearly') next.setUTCFullYear(next.getUTCFullYear() + offset);
    else next.setUTCDate(next.getUTCDate() + offset * (period === 'weekly' ? 7 : 1));
    return next;
};

export const buildOperationsTrend = (records: WorkerRecord[], period: TrendGranularity, threshold: number, now = new Date()) => {
    const dated = records.flatMap(record => {
        const date = recordDay(record.date);
        return date ? [{ record, date }] : [];
    });
    const latest = dated.length ? new Date(dated.reduce((max, item) => Math.max(max, item.date.getTime()), -Infinity)) : recordDay(now.toISOString())!;
    const anchor = startOf(latest, period);
    const points = Array.from({ length: TREND_PERIODS[period].count }, (_, index) => {
        const start = shift(anchor, period, index - TREND_PERIODS[period].count + 1);
        const end = shift(start, period, 1);
        end.setUTCDate(end.getUTCDate() - 1);
        const dateKey = key(start);
        return { key: dateKey, end: key(end), label: period === 'yearly' ? dateKey.slice(0, 4) : period === 'monthly' ? dateKey.slice(2, 7) : dateKey.slice(5), value: 0, total: 0 };
    });
    const buckets = new Map(points.map(point => [point.key, point]));
    for (const { record, date } of dated) {
        const bucket = buckets.get(key(startOf(date, period)));
        if (!bucket) continue;
        bucket.total++;
        if (hasOperationsRiskSignal(record, threshold)) bucket.value++;
    }
    return { points, latestDate: dated.length ? key(latest) : null, invalidDateCount: records.length - dated.length,
        total: points.reduce((sum, point) => sum + point.total, 0), risks: points.reduce((sum, point) => sum + point.value, 0) };
};

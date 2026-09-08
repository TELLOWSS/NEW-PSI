import type { WorkerRecord } from '../types';

export const formatOcrAnalysisTime = (record: Pick<WorkerRecord, 'ocrAnalyzedAt' | 'ocrTrace'>): string => {
    const value = record.ocrAnalyzedAt || record.ocrTrace?.recordedAt;
    if (!value || !/T\d{2}:\d{2}/.test(value)) return '분석 시각 미기록';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '분석 시각 미기록';
    return new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(date) + ' (한국시간)';
};

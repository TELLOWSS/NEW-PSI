import type { WorkerRecord } from '../types';

export type SurveyRiskLevel = '상' | '중' | '하';
export type RiskGapDirection = 'under-recognition' | 'over-recognition' | 'aligned' | 'unavailable';
export type RiskGapStatus = 'urgent' | 'attention' | 'aligned' | 'low-sample' | 'no-baseline' | 'no-worker-data';

export interface ManagerRiskBaseline {
    trade: string;
    monthKey: string;
    level: SurveyRiskLevel;
    updatedAt: string;
}

export type ManagerRiskBaselineMap = Record<string, ManagerRiskBaseline>;

export interface SurveyRiskGapRow {
    trade: string;
    managerScore: number | null;
    workerScore: number | null;
    signedGap: number | null;
    absoluteGap: number | null;
    direction: RiskGapDirection;
    status: RiskGapStatus;
    workerResponseCount: number;
    comparableCount: number;
    baselineCoverage: number;
}

export const MANAGER_RISK_BASELINES_STORAGE_KEY = 'psi_survey_manager_risk_baselines_v1';
export const MIN_COMPARABLE_SAMPLE = 3;

const round = (value: number): number => Math.round(value * 10) / 10;

export const riskLevelToScore = (level: SurveyRiskLevel): number => {
    if (level === '상') return 100;
    if (level === '중') return 50;
    return 0;
};

export const parseSurveyRiskLevel = (text: string | undefined | null): SurveyRiskLevel | null => {
    const normalized = String(text || '').trim();
    if (!normalized) return null;

    if (/high|높음|고위험/i.test(normalized)) return '상';
    if (/medium|middle|보통|중위험/i.test(normalized)) return '중';
    if (/low|낮음|저위험/i.test(normalized)) return '하';

    const compact = normalized.replace(/\s+/g, '');
    if (/^(상|상등급|위험등급상)$/.test(compact)) return '상';
    if (/^(중|중등급|위험등급중)$/.test(compact)) return '중';
    if (/^(하|하등급|위험등급하)$/.test(compact)) return '하';

    const isolated = normalized.match(/(?:^|[\s()[\]{}:：,./-])(상|중|하)(?:$|[\s()[\]{}:：,./-])/);
    return isolated?.[1] as SurveyRiskLevel | undefined || null;
};

export const getRecordMonthKey = (dateValue: string | undefined | null): string | null => {
    if (!dateValue) return null;
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export const formatSurveyMonth = (monthKey: string): string => {
    const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
    if (!match) return monthKey;
    return `${match[1]}년 ${Number(match[2])}월`;
};

export const formatSurveyMonthShort = (monthKey: string): string => {
    const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
    if (!match) return monthKey;
    return `${match[1].slice(2)}.${match[2]}`;
};

export const getManagerRiskBaselineKey = (monthKey: string, trade: string): string => (
    `${monthKey}::${trade.trim() || '기타'}`
);

export const readManagerRiskBaselines = (): ManagerRiskBaselineMap => {
    if (typeof window === 'undefined') return {};
    try {
        const parsed = JSON.parse(window.localStorage.getItem(MANAGER_RISK_BASELINES_STORAGE_KEY) || '{}') as Record<string, unknown>;
        return Object.entries(parsed).reduce<ManagerRiskBaselineMap>((acc, [key, raw]) => {
            if (!raw || typeof raw !== 'object') return acc;
            const item = raw as Partial<ManagerRiskBaseline>;
            if (
                typeof item.trade !== 'string'
                || typeof item.monthKey !== 'string'
                || !['상', '중', '하'].includes(String(item.level))
            ) return acc;
            acc[key] = {
                trade: item.trade,
                monthKey: item.monthKey,
                level: item.level as SurveyRiskLevel,
                updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
            };
            return acc;
        }, {});
    } catch {
        return {};
    }
};

export const writeManagerRiskBaselines = (baselines: ManagerRiskBaselineMap): void => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(MANAGER_RISK_BASELINES_STORAGE_KEY, JSON.stringify(baselines));
};

export const getWorkerRiskLevel = (record: WorkerRecord): SurveyRiskLevel | null => {
    if (['상', '중', '하'].includes(String(record.selfAssessedRiskLevel))) {
        return record.selfAssessedRiskLevel;
    }
    const answer = (record.handwrittenAnswers || []).find(
        item => item.questionNumber === '3' || item.questionNumber === 'Q3',
    );
    return parseSurveyRiskLevel(answer?.koreanTranslation || answer?.answerText);
};

const resolveStatus = (
    absoluteGap: number | null,
    comparableCount: number,
    workerResponseCount: number,
): RiskGapStatus => {
    if (workerResponseCount === 0) return 'no-worker-data';
    if (comparableCount === 0 || absoluteGap === null) return 'no-baseline';
    if (comparableCount < MIN_COMPARABLE_SAMPLE) return 'low-sample';
    if (absoluteGap >= 25) return 'urgent';
    if (absoluteGap >= 10) return 'attention';
    return 'aligned';
};

export const buildSurveyRiskGapRows = (
    records: WorkerRecord[],
    baselines: ManagerRiskBaselineMap,
    normalizeTrade: (trade: string) => string = trade => trade.trim() || '기타',
): SurveyRiskGapRow[] => {
    const trades = Array.from(new Set(records.map(record => normalizeTrade(record.jobField || '기타')))).sort();

    return trades.map((trade) => {
        const tradeRecords = records.filter(record => normalizeTrade(record.jobField || '기타') === trade);
        const managerScores: number[] = [];
        const workerScores: number[] = [];
        let workerResponseCount = 0;

        tradeRecords.forEach((record) => {
            const workerLevel = getWorkerRiskLevel(record);
            if (!workerLevel) return;
            workerResponseCount += 1;

            const monthKey = getRecordMonthKey(record.date);
            if (!monthKey) return;
            const baseline = baselines[getManagerRiskBaselineKey(monthKey, trade)];
            if (!baseline) return;

            managerScores.push(riskLevelToScore(baseline.level));
            workerScores.push(riskLevelToScore(workerLevel));
        });

        const comparableCount = workerScores.length;
        const managerScore = comparableCount > 0
            ? round(managerScores.reduce((sum, value) => sum + value, 0) / comparableCount)
            : null;
        const workerScore = comparableCount > 0
            ? round(workerScores.reduce((sum, value) => sum + value, 0) / comparableCount)
            : null;
        const signedGap = managerScore !== null && workerScore !== null
            ? round(managerScore - workerScore)
            : null;
        const absoluteGap = signedGap === null ? null : Math.abs(signedGap);
        const direction: RiskGapDirection = signedGap === null
            ? 'unavailable'
            : signedGap >= 10
                ? 'under-recognition'
                : signedGap <= -10
                    ? 'over-recognition'
                    : 'aligned';

        return {
            trade,
            managerScore,
            workerScore,
            signedGap,
            absoluteGap,
            direction,
            status: resolveStatus(absoluteGap, comparableCount, workerResponseCount),
            workerResponseCount,
            comparableCount,
            baselineCoverage: workerResponseCount > 0 ? Math.round((comparableCount / workerResponseCount) * 100) : 0,
        };
    });
};

export const getTopComparableGap = (rows: SurveyRiskGapRow[]): SurveyRiskGapRow | null => {
    const comparable = rows.filter(row => (
        row.absoluteGap !== null
        && row.status !== 'low-sample'
        && row.status !== 'no-baseline'
        && row.status !== 'no-worker-data'
    ));
    return [...comparable].sort((left, right) => (
        (right.absoluteGap || 0) - (left.absoluteGap || 0)
        || right.comparableCount - left.comparableCount
    ))[0] || null;
};

export const getRiskGapStatusLabel = (status: RiskGapStatus): string => {
    if (status === 'urgent') return '즉시 확인';
    if (status === 'attention') return '주의';
    if (status === 'aligned') return '인식 정렬';
    if (status === 'low-sample') return '표본 부족';
    if (status === 'no-baseline') return '기준 미등록';
    return '응답 없음';
};

export const getRiskGapDirectionLabel = (direction: RiskGapDirection): string => {
    if (direction === 'under-recognition') return '근로자가 위험을 낮게 인식';
    if (direction === 'over-recognition') return '근로자가 위험을 더 높게 인식';
    if (direction === 'aligned') return '관리자 기준과 대체로 일치';
    return '비교 불가';
};

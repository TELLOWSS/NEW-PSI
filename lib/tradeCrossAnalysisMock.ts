// ============================================================
// 공종 x 국적 교차 안전 숙련도 분석 - Mock 데이터
// ============================================================

export const TRADES = ['형틀', '철근', '비계', '타설', '방수', '전기'] as const;
export const NATIONALITIES = ['한국', '베트남', '미얀마', '중국'] as const;

export type Trade = typeof TRADES[number];
export type Nationality = typeof NATIONALITIES[number];

/** 6대 지표 키 */
export const SIX_METRIC_KEYS = [
    'psychological',
    'jobUnderstanding',
    'riskAssessmentUnderstanding',
    'proficiency',
    'improvementExecution',
    'repeatViolationPenalty',
] as const;

export const SIX_METRIC_LABELS: Record<typeof SIX_METRIC_KEYS[number], string> = {
    psychological: '심리지표',
    jobUnderstanding: '업무이해도',
    riskAssessmentUnderstanding: '위험성평가',
    proficiency: '숙련도',
    improvementExecution: '개선이행도',
    repeatViolationPenalty: '반복위반 패널티',
};

export type SixMetricKey = typeof SIX_METRIC_KEYS[number];

export interface SixMetricValues {
    psychological: number;
    jobUnderstanding: number;
    riskAssessmentUnderstanding: number;
    proficiency: number;
    improvementExecution: number;
    repeatViolationPenalty: number;
}

export interface TradeNationalityScore {
    trade: Trade;
    nationality: Nationality;
    compositeScore: number;
    metrics: SixMetricValues;
    workerCount: number;
}

/** 공종 x 국적 교차 종합 점수 Mock 데이터 */
export const TRADE_NATIONALITY_MOCK: TradeNationalityScore[] = [
    // 형틀
    { trade: '형틀', nationality: '한국',   compositeScore: 78, workerCount: 5,  metrics: { psychological: 8, jobUnderstanding: 16, riskAssessmentUnderstanding: 16, proficiency: 24, improvementExecution: 17, repeatViolationPenalty: -3 } },
    { trade: '형틀', nationality: '베트남', compositeScore: 54, workerCount: 8,  metrics: { psychological: 5, jobUnderstanding: 10, riskAssessmentUnderstanding: 9,  proficiency: 18, improvementExecution: 12, repeatViolationPenalty: 0  } },
    { trade: '형틀', nationality: '미얀마', compositeScore: 62, workerCount: 4,  metrics: { psychological: 6, jobUnderstanding: 12, riskAssessmentUnderstanding: 11, proficiency: 20, improvementExecution: 13, repeatViolationPenalty: 0  } },
    { trade: '형틀', nationality: '중국',   compositeScore: 70, workerCount: 3,  metrics: { psychological: 7, jobUnderstanding: 14, riskAssessmentUnderstanding: 13, proficiency: 22, improvementExecution: 15, repeatViolationPenalty: -1 } },
    // 철근
    { trade: '철근', nationality: '한국',   compositeScore: 83, workerCount: 6,  metrics: { psychological: 9, jobUnderstanding: 17, riskAssessmentUnderstanding: 18, proficiency: 26, improvementExecution: 17, repeatViolationPenalty: -4 } },
    { trade: '철근', nationality: '베트남', compositeScore: 67, workerCount: 10, metrics: { psychological: 7, jobUnderstanding: 13, riskAssessmentUnderstanding: 12, proficiency: 22, improvementExecution: 14, repeatViolationPenalty: -1 } },
    { trade: '철근', nationality: '미얀마', compositeScore: 59, workerCount: 5,  metrics: { psychological: 6, jobUnderstanding: 11, riskAssessmentUnderstanding: 10, proficiency: 19, improvementExecution: 13, repeatViolationPenalty: 0  } },
    { trade: '철근', nationality: '중국',   compositeScore: 74, workerCount: 4,  metrics: { psychological: 7, jobUnderstanding: 15, riskAssessmentUnderstanding: 14, proficiency: 24, improvementExecution: 16, repeatViolationPenalty: -2 } },
    // 비계
    { trade: '비계', nationality: '한국',   compositeScore: 76, workerCount: 4,  metrics: { psychological: 8, jobUnderstanding: 15, riskAssessmentUnderstanding: 15, proficiency: 23, improvementExecution: 16, repeatViolationPenalty: -1 } },
    { trade: '비계', nationality: '베트남', compositeScore: 58, workerCount: 7,  metrics: { psychological: 6, jobUnderstanding: 11, riskAssessmentUnderstanding: 10, proficiency: 19, improvementExecution: 12, repeatViolationPenalty: 0  } },
    { trade: '비계', nationality: '미얀마', compositeScore: 65, workerCount: 3,  metrics: { psychological: 7, jobUnderstanding: 13, riskAssessmentUnderstanding: 12, proficiency: 21, improvementExecution: 14, repeatViolationPenalty: -2 } },
    { trade: '비계', nationality: '중국',   compositeScore: 71, workerCount: 2,  metrics: { psychological: 7, jobUnderstanding: 14, riskAssessmentUnderstanding: 14, proficiency: 22, improvementExecution: 15, repeatViolationPenalty: -1 } },
    // 타설
    { trade: '타설', nationality: '한국',   compositeScore: 80, workerCount: 3,  metrics: { psychological: 8, jobUnderstanding: 16, riskAssessmentUnderstanding: 16, proficiency: 25, improvementExecution: 17, repeatViolationPenalty: -2 } },
    { trade: '타설', nationality: '베트남', compositeScore: 61, workerCount: 6,  metrics: { psychological: 6, jobUnderstanding: 12, riskAssessmentUnderstanding: 11, proficiency: 20, improvementExecution: 13, repeatViolationPenalty: -1 } },
    { trade: '타설', nationality: '미얀마', compositeScore: 55, workerCount: 4,  metrics: { psychological: 5, jobUnderstanding: 10, riskAssessmentUnderstanding: 9,  proficiency: 18, improvementExecution: 13, repeatViolationPenalty: 0  } },
    { trade: '타설', nationality: '중국',   compositeScore: 69, workerCount: 2,  metrics: { psychological: 7, jobUnderstanding: 13, riskAssessmentUnderstanding: 13, proficiency: 22, improvementExecution: 15, repeatViolationPenalty: -1 } },
    // 방수
    { trade: '방수', nationality: '한국',   compositeScore: 85, workerCount: 2,  metrics: { psychological: 9, jobUnderstanding: 18, riskAssessmentUnderstanding: 17, proficiency: 27, improvementExecution: 18, repeatViolationPenalty: -4 } },
    { trade: '방수', nationality: '베트남', compositeScore: 72, workerCount: 3,  metrics: { psychological: 7, jobUnderstanding: 14, riskAssessmentUnderstanding: 14, proficiency: 23, improvementExecution: 16, repeatViolationPenalty: -2 } },
    { trade: '방수', nationality: '미얀마', compositeScore: 63, workerCount: 2,  metrics: { psychological: 6, jobUnderstanding: 12, riskAssessmentUnderstanding: 11, proficiency: 21, improvementExecution: 14, repeatViolationPenalty: -1 } },
    { trade: '방수', nationality: '중국',   compositeScore: 76, workerCount: 1,  metrics: { psychological: 8, jobUnderstanding: 15, riskAssessmentUnderstanding: 15, proficiency: 24, improvementExecution: 16, repeatViolationPenalty: -2 } },
    // 전기
    { trade: '전기', nationality: '한국',   compositeScore: 88, workerCount: 4,  metrics: { psychological: 9, jobUnderstanding: 18, riskAssessmentUnderstanding: 18, proficiency: 28, improvementExecution: 19, repeatViolationPenalty: -4 } },
    { trade: '전기', nationality: '베트남', compositeScore: 74, workerCount: 3,  metrics: { psychological: 7, jobUnderstanding: 15, riskAssessmentUnderstanding: 14, proficiency: 24, improvementExecution: 16, repeatViolationPenalty: -2 } },
    { trade: '전기', nationality: '미얀마', compositeScore: 68, workerCount: 2,  metrics: { psychological: 7, jobUnderstanding: 13, riskAssessmentUnderstanding: 12, proficiency: 22, improvementExecution: 15, repeatViolationPenalty: -1 } },
    { trade: '전기', nationality: '중국',   compositeScore: 79, workerCount: 2,  metrics: { psychological: 8, jobUnderstanding: 16, riskAssessmentUnderstanding: 15, proficiency: 25, improvementExecution: 17, repeatViolationPenalty: -2 } },
];

// ============================================================
// 개인별 트렌드 Mock 데이터
// ============================================================
export interface WorkerTrendRecord {
    id: string;
    name: string;
    trade: Trade;
    nationality: Nationality;
    trend: { month: string; score: number }[];
}

export const WORKER_TRENDS_MOCK: WorkerTrendRecord[] = [
    // 형틀-베트남
    { id: 'w1',  name: 'Nguyen Van A', trade: '형틀', nationality: '베트남', trend: [{ month: '10월' ,score:49},{ month:'11월',score:52},{ month:'12월',score:50},{ month:'1월',score:53},{ month:'2월',score:54},{ month:'3월',score:56}] },
    { id: 'w2',  name: 'Tran Van B',   trade: '형틀', nationality: '베트남', trend: [{ month: '10월' ,score:44},{ month:'11월',score:46},{ month:'12월',score:48},{ month:'1월',score:47},{ month:'2월',score:51},{ month:'3월',score:53}] },
    { id: 'w3',  name: 'Pham Thi C',   trade: '형틀', nationality: '베트남', trend: [{ month: '10월' ,score:60},{ month:'11월',score:58},{ month:'12월',score:55},{ month:'1월',score:57},{ month:'2월',score:59},{ month:'3월',score:61}] },
    { id: 'w4',  name: 'Le Van D',     trade: '형틀', nationality: '베트남', trend: [{ month: '10월' ,score:51},{ month:'11월',score:50},{ month:'12월',score:52},{ month:'1월',score:54},{ month:'2월',score:55},{ month:'3월',score:57}] },
    { id: 'w5',  name: 'Hoang Van E',  trade: '형틀', nationality: '베트남', trend: [{ month: '10월' ,score:42},{ month:'11월',score:44},{ month:'12월',score:43},{ month:'1월',score:45},{ month:'2월',score:48},{ month:'3월',score:50}] },
    // 형틀-미얀마
    { id: 'w6',  name: 'Aung Kyaw',    trade: '형틀', nationality: '미얀마', trend: [{ month: '10월' ,score:58},{ month:'11월',score:60},{ month:'12월',score:62},{ month:'1월',score:61},{ month:'2월',score:63},{ month:'3월',score:65}] },
    // 철근-베트남
    { id: 'w7',  name: 'Nguyen Minh F',trade: '철근', nationality: '베트남', trend: [{ month: '10월' ,score:62},{ month:'11월',score:64},{ month:'12월',score:66},{ month:'1월',score:65},{ month:'2월',score:67},{ month:'3월',score:69}] },
    { id: 'w8',  name: 'Bui Thi G',    trade: '철근', nationality: '베트남', trend: [{ month: '10월' ,score:55},{ month:'11월',score:57},{ month:'12월',score:59},{ month:'1월',score:60},{ month:'2월',score:62},{ month:'3월',score:64}] },
    // 비계-베트남
    { id: 'w9',  name: 'Vo Thi H',     trade: '비계', nationality: '베트남', trend: [{ month: '10월' ,score:53},{ month:'11월',score:55},{ month:'12월',score:57},{ month:'1월',score:56},{ month:'2월',score:58},{ month:'3월',score:60}] },
    // 타설-미얀마
    { id: 'w10', name: 'Kyaw Zin',     trade: '타설', nationality: '미얀마', trend: [{ month: '10월' ,score:50},{ month:'11월',score:52},{ month:'12월',score:51},{ month:'1월',score:53},{ month:'2월',score:54},{ month:'3월',score:56}] },
    // 한국 - 형틀
    { id: 'w11', name: '김철수',        trade: '형틀', nationality: '한국', trend: [{ month: '10월' ,score:74},{ month:'11월',score:75},{ month:'12월',score:76},{ month:'1월',score:77},{ month:'2월',score:78},{ month:'3월',score:80}] },
];

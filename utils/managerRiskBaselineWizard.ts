import type { WorkerRecord } from '../types';
import {
    buildSurveyRiskGapRows,
    getManagerRiskBaselineKey,
    getRecordMonthKey,
    getWorkerRiskLevel,
    MIN_COMPARABLE_SAMPLE,
    type BaselineControl,
    type BaselineExposure,
    type BaselineSeverity,
    type ManagerBaselineWizardAnswers,
    type SurveyRiskGapRow,
    type SurveyRiskLevel,
} from './surveyRiskGap';
export type {
    BaselineControl,
    BaselineExposure,
    BaselineSeverity,
    ManagerBaselineWizardAnswers,
} from './surveyRiskGap';

export interface ManagerBaselineRecommendation {
    level: SurveyRiskLevel;
    reasons: string[];
}

export interface TradeWorkerRiskReference {
    responseCount: number;
    levelCounts: Record<SurveyRiskLevel, number>;
    topWeakAreas: string[];
}

const TRADE_DECISION_CUES: Record<string, string[]> = {
    형틀: ['개구부·단부 추락', '동바리·거푸집 붕괴', '자재 인양·낙하'],
    철근: ['인양 중 낙하·충돌', '철근 돌출부 찔림', '결속·가공 중 끼임'],
    갱폼: ['갱폼 인양·해체', '작업발판 추락', '고정·지지상태'],
    알폼: ['패널 인양·낙하', '해체 중 충돌', '작업발판·개구부'],
    시스템: ['비계 조립·해체 추락', '벽이음·가새 상태', '상하 동시작업 낙하'],
    바닥미장: ['바닥 미끄러짐', '장시간 반복작업', '장비 전선·감전'],
    할석미장견출: ['비래물·안면 손상', '분진 노출', '고소작업 추락'],
    해체정리: ['해체물 낙하·비래', '불안정 구조물 붕괴', '혼재 작업 충돌'],
    직영: ['당일 실제 작업내용', '타 공종 간섭', '임시 작업·예외상황'],
    용역: ['당일 실제 작업내용', '작업 숙련도·전달상태', '타 공종 간섭'],
    콘크리트비계: ['타설 중 붕괴', '비계·작업발판 추락', '펌프카·차량 충돌'],
};

const severityReasons: Record<BaselineSeverity, string> = {
    minor: '사고가 나도 응급처치 수준의 경미한 피해가 예상됩니다.',
    serious: '치료·휴업이 필요한 중대 부상이 발생할 수 있습니다.',
    fatal: '사망 또는 다수의 중대 부상으로 이어질 수 있습니다.',
};

const exposureReasons: Record<BaselineExposure, string> = {
    rare: '작업 노출이 예외적이거나 월 1회 이하입니다.',
    repeated: '주기적으로 반복되거나 매일 일부 시간 노출됩니다.',
    continuous: '작업시간 대부분 또는 다수 인원이 계속 노출됩니다.',
};

const controlReasons: Record<BaselineControl, string> = {
    controlled: '방호시설과 작업절차가 설치·확인되어 정상 작동합니다.',
    partial: '안전조치는 있으나 일부 누락 또는 추가 확인이 필요합니다.',
    weak: '안전조치가 없거나 현장 작동 여부를 확신하기 어렵습니다.',
};

export const recommendManagerRiskLevel = (
    answers: ManagerBaselineWizardAnswers,
): ManagerBaselineRecommendation | null => {
    const { severity, exposure, control } = answers;
    if (!severity || !exposure || !control) return null;

    let level: SurveyRiskLevel = '중';
    if (
        severity === 'fatal'
        || (severity === 'serious' && (exposure === 'continuous' || control === 'weak'))
        || (exposure === 'continuous' && control === 'weak')
    ) {
        level = '상';
    } else if (severity === 'minor' && exposure === 'rare' && control === 'controlled') {
        level = '하';
    }

    return {
        level,
        reasons: [severityReasons[severity], exposureReasons[exposure], controlReasons[control]],
    };
};

export const getPreviousMonthKey = (monthKey: string): string => {
    const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
    if (!match) return '';
    const date = new Date(Number(match[1]), Number(match[2]) - 2, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export const buildTradeWorkerRiskReference = (
    records: WorkerRecord[],
): TradeWorkerRiskReference => {
    const levelCounts: Record<SurveyRiskLevel, number> = { 상: 0, 중: 0, 하: 0 };
    const weakAreaCounts = new Map<string, number>();
    let responseCount = 0;

    records.forEach((record) => {
        const level = getWorkerRiskLevel(record);
        if (level) {
            levelCounts[level] += 1;
            responseCount += 1;
        }
        (record.weakAreas || []).forEach((area) => {
            const normalized = String(area || '').trim();
            if (!normalized) return;
            weakAreaCounts.set(normalized, (weakAreaCounts.get(normalized) || 0) + 1);
        });
    });

    return {
        responseCount,
        levelCounts,
        topWeakAreas: [...weakAreaCounts.entries()]
            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
            .slice(0, 2)
            .map(([area]) => area),
    };
};

export const getTradeDecisionCues = (trade: string): string[] => (
    TRADE_DECISION_CUES[String(trade || '').replace(/\s+/g, '')]
    || ['당일 실제 작업내용', '사람·장비 동선 간섭', '안전조치 작동상태']
);

export const previewManagerWorkerRiskGap = (
    records: WorkerRecord[],
    monthKey: string,
    trade: string,
    managerLevel: SurveyRiskLevel,
): SurveyRiskGapRow | null => {
    const scopedRecords = records.filter((record) => getRecordMonthKey(record.date) === monthKey);
    if (scopedRecords.length === 0) return null;

    const key = getManagerRiskBaselineKey(monthKey, trade);
    const rows = buildSurveyRiskGapRows(
        scopedRecords,
        {
            [key]: {
                trade,
                monthKey,
                level: managerLevel,
                updatedAt: '',
            },
        },
        () => trade,
    );
    return rows[0] || null;
};

export const getManagerWorkerComparisonAction = (
    comparison: SurveyRiskGapRow | null,
): string => {
    if (!comparison || comparison.workerResponseCount === 0) {
        return '근로자 응답이 쌓이면 관리자 기준과 자동 비교됩니다.';
    }
    if (comparison.status === 'low-sample') {
        return `응답 ${comparison.workerResponseCount}건은 참고만 하고 ${Math.max(0, MIN_COMPARABLE_SAMPLE - comparison.workerResponseCount)}건 이상 추가 확보 후 재확인하세요.`;
    }
    if (comparison.direction === 'under-recognition') {
        return '근로자가 위험을 낮게 보고 있습니다. TBM에서 핵심 위험과 작업중지 기준을 먼저 확인하세요.';
    }
    if (comparison.direction === 'over-recognition') {
        return '근로자가 더 위험하게 느낍니다. 작업조건 변화와 방호조치의 실제 작동 여부를 다시 확인하세요.';
    }
    return '관리자 기준과 체감이 대체로 일치합니다. 현재 조치를 유지하고 변화를 관찰하세요.';
};

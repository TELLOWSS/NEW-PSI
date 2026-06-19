import type { WorkerRecord } from '../types';
import {
    getWorkerRiskLevel,
    type BaselineControl,
    type BaselineExposure,
    type BaselineSeverity,
    type ManagerBaselineWizardAnswers,
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

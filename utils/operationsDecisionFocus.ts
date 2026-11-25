import type { Page } from '../types';

export type DecisionFocusTone = 'critical' | 'review' | 'progress' | 'neutral';
export interface OperationsDecisionFocusInput {
    selectedCount: number;
    protectionPriorityCount: number;
    pendingReviewCount: number;
    inProgressCount: number;
    sourceReviewCount: number;
}
export interface OperationsDecisionFocusModel {
    tone: DecisionFocusTone;
    status: string;
    headline: string;
    guidance: string;
    actionLabel: string;
    actionPage: Page;
}

/** Presentation guidance for an EXISTING, filtered record set.
 * No safety decision, emergency declaration, database change or AI inference.
 * A zero count never represents an "all clear" for an actual work area.
 */
export const buildOperationsDecisionFocus = ({
    selectedCount,
    protectionPriorityCount,
    pendingReviewCount,
    inProgressCount,
    sourceReviewCount,
}: OperationsDecisionFocusInput): OperationsDecisionFocusModel => {
    if (selectedCount === 0) {
        return {
            tone: 'neutral',
            status: '선택 범위 기록 없음',
            headline: '표시할 위험성평가 기록이 없습니다',
            guidance: '기록이 없다는 사실은 현장에 위험이 없다는 뜻이 아닙니다. 범위와 원본 기록을 먼저 확인해 주세요.',
            actionLabel: '위험성평가 기록 확인',
            actionPage: 'ocr-analysis',
        };
    }
    if (protectionPriorityCount > 0) {
        return {
            tone: 'critical',
            status: '보호 우선 기록',
            headline: `보호 우선 ${protectionPriorityCount}건 · 현장 확인 필요`,
            guidance: '우선 신호가 있는 기록의 원문과 실제 작업 상태를 대조하고, 담당자가 필요한 보호조치와 접근통제를 판단해 주세요.',
            actionLabel: '현장 보호조치 확인',
            actionPage: 'safety-compliance-hub',
        };
    }
    if (pendingReviewCount > 0) {
        return {
            tone: 'review',
            status: '관리자 검토 대기',
            headline: `검토 대기 ${pendingReviewCount}건 · 원문 대조 필요`,
            guidance: '승인 또는 보완 판단이 필요한 기록입니다. 원본과 분석 결과를 관리자가 확인하기 전에는 승인 완료로 보지 않습니다.',
            actionLabel: '관리자 검토 열기',
            actionPage: 'ocr-analysis',
        };
    }
    if (sourceReviewCount > 0) {
        return {
            tone: 'review',
            status: '원문 확인 필요',
            headline: `원문 확인 필요 ${sourceReviewCount}건`,
            guidance: '인식 오류 또는 낮은 인식 신뢰 신호가 있는 기록을 확인해 주세요. 자동 분석은 관리자 승인을 대신하지 않습니다.',
            actionLabel: '원문 대조하기',
            actionPage: 'ocr-analysis',
        };
    }
    if (inProgressCount > 0) {
        return {
            tone: 'progress',
            status: '분석 진행 중',
            headline: `분석 진행 ${inProgressCount}건 · 결과 확인 필요`,
            guidance: '분석 중인 기록의 진행 상태를 확인해 주세요. 분석 중은 검토·현장조치 완료를 의미하지 않습니다.',
            actionLabel: '기록 진행 상태',
            actionPage: 'ocr-analysis',
        };
    }
    return {
        tone: 'neutral',
        status: '다음 확인 단계',
        headline: '검토된 기록을 교육과 재확인으로 연결',
        guidance: '선택한 기록에서 현재 우선 신호가 표시되지 않았더라도 현장의 위험 해소나 작업 재개가 확정된 것은 아닙니다.',
        actionLabel: '교육 환류 확인',
        actionPage: 'education-return',
    };
};

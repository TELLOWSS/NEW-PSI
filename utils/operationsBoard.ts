import type { Page, WorkerRecord } from '../types';

export type OperationsQueueTone = 'critical' | 'warning' | 'progress' | 'normal';

export type OperationsQueueItem = {
    record: WorkerRecord;
    tone: OperationsQueueTone;
    statusLabel: string;
    riskLabel: string;
    actionLabel: string;
    actionPage: Page;
};

const hasValidSafetyScore = (record: Partial<WorkerRecord>): boolean => {
    const score = Number(record.safetyScore);
    return Number.isFinite(score) && score >= 0 && score <= 100;
};

export const isProtectionPriorityRecord = (
    record: Partial<WorkerRecord>,
    protectionPriorityThreshold: number,
): boolean => (
    record.riskDecision === 'CRITICAL_STOP'
    || record.riskDecision === 'IMMEDIATE_ATTENTION'
    || record.selfAssessedRiskLevel === '상'
    || (hasValidSafetyScore(record) && Number(record.safetyScore) < protectionPriorityThreshold)
);

export const isPendingOperationsReviewRecord = (record: Partial<WorkerRecord>): boolean => (
    record.reviewStatus === 'PENDING'
    || record.approvalStatus === 'PENDING'
    || record.approvalState === 'PENDING'
    || record.workflowState === 'manual_review_required'
    || record.workflowState === 'awaiting_manager_approval'
    || record.secondPassStatus === 'NEEDED'
);

export const isOperationsRecordInProgress = (record: Partial<WorkerRecord>): boolean => (
    record.secondPassStatus === 'IN_PROGRESS'
    || record.workflowState === 'ocr_validating'
    || record.workflowState === 'first_pass_analyzing'
    || record.workflowState === 'second_pass_analyzing'
    || record.workflowState === 'evaluator_review'
);

export const isOperationsRecordCompleted = (record: Partial<WorkerRecord>): boolean => (
    record.reviewStatus === 'APPROVED'
    || record.approvalStatus === 'APPROVED'
    || record.approvalState === 'APPROVED'
    || record.secondPassStatus === 'DONE'
    || record.workflowState === 'completed'
);

export const hasOperationsRiskSignal = (
    record: Partial<WorkerRecord>,
    protectionPriorityThreshold: number,
): boolean => (
    isProtectionPriorityRecord(record, protectionPriorityThreshold)
    || (Array.isArray(record.weakAreas) && record.weakAreas.length > 0)
);

export const resolveOperationsQueueItem = (
    record: WorkerRecord,
    protectionPriorityThreshold: number,
): OperationsQueueItem => {
    const riskLabel =
        record.weakAreas?.find((item) => String(item || '').trim())
        || record.improvement
        || record.ocrErrorMessage
        || '관리자 확인이 필요한 기록';

    if (record.riskDecision === 'CRITICAL_STOP') {
        return {
            record,
            tone: 'critical',
            statusLabel: '작업중지 확인',
            riskLabel,
            actionLabel: '조치 확인',
            actionPage: 'safety-compliance-hub',
        };
    }
    if (isProtectionPriorityRecord(record, protectionPriorityThreshold)) {
        return {
            record,
            tone: 'critical',
            statusLabel: '보호 우선',
            riskLabel,
            actionLabel: '근거 검토',
            actionPage: 'ocr-analysis',
        };
    }
    if (isPendingOperationsReviewRecord(record)) {
        return {
            record,
            tone: 'warning',
            statusLabel: '검토 대기',
            riskLabel,
            actionLabel: '승인 검토',
            actionPage: 'ocr-analysis',
        };
    }
    if (isOperationsRecordInProgress(record)) {
        return {
            record,
            tone: 'progress',
            statusLabel: '분석 중',
            riskLabel,
            actionLabel: '진행 확인',
            actionPage: 'ocr-analysis',
        };
    }
    return {
        record,
        tone: 'normal',
        statusLabel: isOperationsRecordCompleted(record) ? '검토 완료' : '확인 필요',
        riskLabel,
        actionLabel: '기록 확인',
        actionPage: 'ocr-analysis',
    };
};

const getRecordTime = (record: Partial<WorkerRecord>): number => {
    const parsed = new Date(String(record.date || '')).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
};

const QUEUE_TONE_PRIORITY: Record<OperationsQueueTone, number> = {
    critical: 0,
    warning: 1,
    progress: 2,
    normal: 3,
};

export const selectOperationsPriorityQueue = (
    records: WorkerRecord[],
    protectionPriorityThreshold: number,
    limit = 4,
): OperationsQueueItem[] => records
    .filter((record) => (
        isProtectionPriorityRecord(record, protectionPriorityThreshold)
        || isPendingOperationsReviewRecord(record)
        || isOperationsRecordInProgress(record)
    ))
    .map((record) => resolveOperationsQueueItem(record, protectionPriorityThreshold))
    .sort((left, right) => {
        const priorityDifference = QUEUE_TONE_PRIORITY[left.tone] - QUEUE_TONE_PRIORITY[right.tone];
        if (priorityDifference !== 0) return priorityDifference;

        const leftScore = hasValidSafetyScore(left.record) ? Number(left.record.safetyScore) : 101;
        const rightScore = hasValidSafetyScore(right.record) ? Number(right.record.safetyScore) : 101;
        if (leftScore !== rightScore) return leftScore - rightScore;

        return getRecordTime(right.record) - getRecordTime(left.record);
    })
    .slice(0, Math.max(0, limit));

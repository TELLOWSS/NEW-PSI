import type { AuditTrailEntry, WorkerRecord } from '../types';
import { deriveCompetencyProfile, enforceSafetyLevel } from './evidenceUtils';
import {
    evaluateOcrVerificationCompleteness,
    evaluateOcrVerificationQuality,
    getNativeLanguageLabel,
    isKoreanNationality,
} from './ocrVerificationLanguageUtils';
import {
    evaluateNativeGuidanceRevisionSync,
    evaluatePsiFormIntegrity,
} from './psiFormIntegrity';

export const MANAGER_REVIEW_SYNC_RULE_VERSION = 'psi-manager-review-sync-2026-07-04-v1';

export type ManagerReviewSyncIssue = {
    code:
        | 'NATIVE_GUIDANCE_MISSING'
        | 'NATIVE_GUIDANCE_REFRESH_REQUIRED'
        | 'NATIVE_TRANSLATION_QUALITY'
        | 'SCORE_BREAKDOWN_MISSING'
        | 'COMPETENCY_PROFILE_REFRESHED'
        | 'FORM_INTEGRITY_WARNING';
    message: string;
    severity: 'info' | 'warning' | 'error';
};

export type ManagerReviewSyncResult<T extends WorkerRecord = WorkerRecord> = {
    record: T;
    issues: ManagerReviewSyncIssue[];
    nativeGuidanceReady: boolean;
    competencyProfileRefreshed: boolean;
    ruleVersion: string;
};

export type ManagerReviewApprovalReadiness = {
    nativeLanguageLabel: string;
    canApprove: boolean;
    blockers: string[];
    warnings: string[];
    badgeLabel: string;
    badgeTone: 'ready' | 'warning' | 'blocked';
    headline: string;
    description: string;
};

const toComparableJson = (value: unknown): string => {
    try {
        return JSON.stringify(value ?? null);
    } catch {
        return String(value ?? '');
    }
};

const buildSyncAuditEntry = (
    record: WorkerRecord,
    issues: ManagerReviewSyncIssue[],
    actor: string,
    previousWeightedScore: number | null,
): AuditTrailEntry => {
    const nextWeightedScore = record.competencyProfile?.weightedScore ?? null;
    const nativeLabel = getNativeLanguageLabel(record.nationality, record.language);
    const issueSummary = issues.length > 0
        ? issues.map((issue) => issue.message).join(' / ')
        : `${nativeLabel} 안내와 개인 안전역량 세부지표 동기화 정상`;
    const scoreSummary = previousWeightedScore === null
        ? `역량 ${nextWeightedScore ?? '-'}점`
        : `역량 ${previousWeightedScore}→${nextWeightedScore ?? '-'}점`;

    return {
        stage: 'validation',
        timestamp: new Date().toISOString(),
        actor,
        note: `관리자 수정 동기화 검증(${MANAGER_REVIEW_SYNC_RULE_VERSION}) | ${scoreSummary} | ${issueSummary}`,
    };
};

export const synchronizeManagerReviewedRecord = <T extends WorkerRecord>(
    record: T,
    options?: {
        appendAuditTrail?: boolean;
        actor?: string;
        previousRecord?: WorkerRecord;
    },
): ManagerReviewSyncResult<T> => {
    const previousProfileJson = toComparableJson(record.competencyProfile);
    const previousWeightedScore = typeof record.competencyProfile?.weightedScore === 'number'
        ? record.competencyProfile.weightedScore
        : null;
    const refreshedProfile = deriveCompetencyProfile(record);
    const withFreshProfile = enforceSafetyLevel({
        ...record,
        competencyProfile: refreshedProfile,
    });
    const competencyProfileRefreshed = previousProfileJson !== toComparableJson(withFreshProfile.competencyProfile);

    const completeness = evaluateOcrVerificationCompleteness(withFreshProfile);
    const quality = evaluateOcrVerificationQuality(withFreshProfile);
    const formIntegrity = evaluatePsiFormIntegrity(withFreshProfile);
    const nativeRevisionSync = evaluateNativeGuidanceRevisionSync(withFreshProfile, options?.previousRecord);
    const nativeLabel = getNativeLanguageLabel(withFreshProfile.nationality, withFreshProfile.language);
    const issues: ManagerReviewSyncIssue[] = [];

    if (!completeness.isComplete) {
        completeness.issues.forEach((message) => {
            issues.push({
                code: message.includes('보호 안내') || message.includes('문항 해석')
                    ? 'NATIVE_GUIDANCE_MISSING'
                    : 'NATIVE_TRANSLATION_QUALITY',
                message,
                severity: isKoreanNationality(withFreshProfile.nationality, withFreshProfile.language) ? 'warning' : 'error',
            });
        });
    }

    if (!quality.isHealthy) {
        quality.issues.forEach((message) => {
            issues.push({
                code: 'NATIVE_TRANSLATION_QUALITY',
                message,
                severity: 'warning',
            });
        });
    }

    if (nativeRevisionSync.needsRefresh) {
        nativeRevisionSync.issues.forEach((message) => {
            issues.push({
                code: 'NATIVE_GUIDANCE_REFRESH_REQUIRED',
                message,
                severity: isKoreanNationality(withFreshProfile.nationality, withFreshProfile.language) ? 'warning' : 'error',
            });
        });
    }

    if (formIntegrity.issues.length > 0) {
        formIntegrity.issues.forEach((issue) => {
            issues.push({
                code: 'FORM_INTEGRITY_WARNING',
                message: issue.message,
                severity: issue.severity,
            });
        });
    }

    if (!withFreshProfile.scoreBreakdown) {
        issues.push({
            code: 'SCORE_BREAKDOWN_MISSING',
            message: '6대 세부지표가 없어 개인 안전역량은 보정식 기준으로 임시 계산됨',
            severity: 'warning',
        });
    }

    if (competencyProfileRefreshed) {
        issues.push({
            code: 'COMPETENCY_PROFILE_REFRESHED',
            message: '관리자 수정 결과로 개인 안전역량 세부지표를 재계산함',
            severity: 'info',
        });
    }

    const shouldAppendAudit = options?.appendAuditTrail === true;
    const dedupedIssues = issues.filter((issue, index, array) => (
        array.findIndex((candidate) => candidate.code === issue.code && candidate.message === issue.message) === index
    ));
    const nextRecord = shouldAppendAudit
        ? {
            ...withFreshProfile,
            auditTrail: [
                ...(withFreshProfile.auditTrail || []),
                buildSyncAuditEntry(withFreshProfile, dedupedIssues, options?.actor || 'system', previousWeightedScore),
            ],
        }
        : withFreshProfile;

    return {
        record: nextRecord as T,
        issues: dedupedIssues,
        nativeGuidanceReady: !dedupedIssues.some((issue) => (
            issue.code === 'NATIVE_GUIDANCE_MISSING' ||
            issue.code === 'NATIVE_GUIDANCE_REFRESH_REQUIRED' ||
            (issue.code === 'NATIVE_TRANSLATION_QUALITY' && issue.message.includes(nativeLabel))
        )),
        competencyProfileRefreshed,
        ruleVersion: MANAGER_REVIEW_SYNC_RULE_VERSION,
    };
};

const isNativeGuidanceBlockingIssue = (issue: ManagerReviewSyncIssue): boolean => {
    if (issue.code === 'NATIVE_GUIDANCE_MISSING') return issue.severity === 'error';
    if (issue.code === 'NATIVE_GUIDANCE_REFRESH_REQUIRED') return issue.severity === 'error';
    return issue.code === 'NATIVE_TRANSLATION_QUALITY' && issue.severity === 'error';
};

export const getManagerReviewApprovalReadiness = (
    record: WorkerRecord,
    previousRecord?: WorkerRecord,
): ManagerReviewApprovalReadiness => {
    const syncResult = synchronizeManagerReviewedRecord(record, { previousRecord });
    const nativeLanguageLabel = getNativeLanguageLabel(record.nationality, record.language);
    const isKoreanWorker = isKoreanNationality(record.nationality, record.language);
    const nativeIssues = syncResult.issues.filter((issue) => (
        (issue.code === 'NATIVE_GUIDANCE_MISSING' && !isKoreanWorker) ||
        (issue.code === 'NATIVE_GUIDANCE_REFRESH_REQUIRED' && !isKoreanWorker) ||
        issue.code === 'NATIVE_TRANSLATION_QUALITY'
    ));
    const formIssues = syncResult.issues.filter((issue) => issue.code === 'FORM_INTEGRITY_WARNING');
    const blockers = nativeIssues
        .filter(isNativeGuidanceBlockingIssue)
        .map((issue) => issue.message)
        .concat(formIssues.filter((issue) => issue.severity === 'error').map((issue) => issue.message));
    const warnings = nativeIssues
        .filter((issue) => !isNativeGuidanceBlockingIssue(issue))
        .map((issue) => issue.message)
        .concat(formIssues.filter((issue) => issue.severity !== 'error').map((issue) => issue.message));
    const canApprove = blockers.length === 0;

    if (!canApprove) {
        return {
            nativeLanguageLabel,
            canApprove,
            blockers,
            warnings,
            badgeLabel: '모국어 안내 갱신 필요',
            badgeTone: 'blocked',
            headline: `${nativeLanguageLabel} 안내가 확정되지 않아 최종 승인 전 보강이 필요합니다.`,
            description: '관리자 수정 내용은 한국어 판단만 바뀌는 것이 아니라 근로자에게 전달될 모국어 보호 안내까지 함께 맞아야 합니다.',
        };
    }

    if (warnings.length > 0) {
        return {
            nativeLanguageLabel,
            canApprove,
            blockers,
            warnings,
            badgeLabel: '모국어 안내 품질 확인',
            badgeTone: 'warning',
            headline: `${nativeLanguageLabel} 안내는 있으나 품질 확인이 권장됩니다.`,
            description: '최종 승인은 가능하지만 문항 번역, 영어 혼입, 점수 과대 산정 신호를 확인하면 대외 설명력이 좋아집니다.',
        };
    }

    return {
        nativeLanguageLabel,
        canApprove,
        blockers,
        warnings,
        badgeLabel: '모국어 안내 준비',
        badgeTone: 'ready',
        headline: `${nativeLanguageLabel} 안내와 개인 안전역량 지표가 같은 기준으로 맞춰졌습니다.`,
        description: `동기화 규칙 ${MANAGER_REVIEW_SYNC_RULE_VERSION} 기준으로 관리자 수정 반영 상태를 확인했습니다.`,
    };
};

export const getManagerReviewApprovalBlockers = (record: WorkerRecord): string[] => (
    getManagerReviewApprovalReadiness(record).blockers.map((message) => `모국어 안내 보강 필요: ${message}`)
);

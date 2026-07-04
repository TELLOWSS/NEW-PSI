import type { AuditTrailEntry, WorkerRecord } from '../types';
import { deriveCompetencyProfile, enforceSafetyLevel } from './evidenceUtils';
import {
    evaluateOcrVerificationCompleteness,
    evaluateOcrVerificationQuality,
    getNativeLanguageLabel,
    isKoreanNationality,
} from './ocrVerificationLanguageUtils';

export const MANAGER_REVIEW_SYNC_RULE_VERSION = 'psi-manager-review-sync-2026-07-04-v1';

export type ManagerReviewSyncIssue = {
    code:
        | 'NATIVE_GUIDANCE_MISSING'
        | 'NATIVE_TRANSLATION_QUALITY'
        | 'SCORE_BREAKDOWN_MISSING'
        | 'COMPETENCY_PROFILE_REFRESHED';
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
    const nativeLabel = getNativeLanguageLabel(withFreshProfile.nationality, withFreshProfile.language);
    const issues: ManagerReviewSyncIssue[] = [];

    if (!completeness.isComplete) {
        completeness.issues.forEach((message) => {
            issues.push({
                code: message.includes('보호 안내') || message.includes('문항 해석')
                    ? 'NATIVE_GUIDANCE_MISSING'
                    : 'NATIVE_TRANSLATION_QUALITY',
                message,
                severity: isKoreanNationality(withFreshProfile.nationality) ? 'warning' : 'error',
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
            (issue.code === 'NATIVE_TRANSLATION_QUALITY' && issue.message.includes(nativeLabel))
        )),
        competencyProfileRefreshed,
        ruleVersion: MANAGER_REVIEW_SYNC_RULE_VERSION,
    };
};

import type { WorkerRecord, AuditTrailEntry, CorrectionEntry, SafetyCompetencyProfile, AppSettings } from '../types';
import { getSafetyLevelFromScore } from './safetyLevelUtils';

const textEncoder = new TextEncoder();

export async function sha256Hex(input: string): Promise<string> {
    const data = textEncoder.encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function deriveIntegrityScore(record: WorkerRecord): number {
    let score = 100;

    if (record.psychologicalAnalysis?.pressureLevel === 'high') score -= 8;
    if (record.psychologicalAnalysis?.hasLayoutIssue) score -= 8;

    const weakCount = Array.isArray(record.weakAreas) ? record.weakAreas.length : 0;
    score -= Math.min(20, weakCount * 3);

    if (record.selfAssessedRiskLevel === '상') score -= 12;
    if (record.selfAssessedRiskLevel === '중') score -= 5;

    if ((record.aiInsights || '').includes('반복')) score -= 10;

    const adjustmentHistory = record.scoreAdjustmentHistory || [];
    const invalidAdjustmentCount = adjustmentHistory.filter((entry) => {
        const hasValidDrop = entry.previousScore > entry.nextScore;
        const hasCode = !!entry.reasonCode;
        const hasEvidence = (entry.evidenceSummary || '').trim().length >= 3;
        const hasDetail = (entry.reasonDetail || '').trim().length >= 3;
        return hasValidDrop && (!hasCode || !hasEvidence || !hasDetail);
    }).length;
    if (invalidAdjustmentCount > 0) {
        score -= Math.min(20, invalidAdjustmentCount * 8);
    }

    return Math.max(0, Math.min(100, score));
}

const clampScore = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

const defaultCompetencyWeights = {
    psychological: 0.20,
    jobUnderstanding: 0.22,
    riskAssessmentUnderstanding: 0.22,
    proficiency: 0.18,
    improvementExecution: 0.18,
    repeatViolationPenalty: 1,
    version: 'v1.0.0',
};

const getConfiguredWeights = () => {
    try {
        if (typeof localStorage === 'undefined') return defaultCompetencyWeights;
        const raw = localStorage.getItem('psi_app_settings');
        if (!raw) return defaultCompetencyWeights;

        const parsed = JSON.parse(raw) as AppSettings;
        const configured = parsed.competencyWeights;
        if (!configured) return defaultCompetencyWeights;

        return {
            psychological: Number(configured.psychological) || defaultCompetencyWeights.psychological,
            jobUnderstanding: Number(configured.jobUnderstanding) || defaultCompetencyWeights.jobUnderstanding,
            riskAssessmentUnderstanding: Number(configured.riskAssessmentUnderstanding) || defaultCompetencyWeights.riskAssessmentUnderstanding,
            proficiency: Number(configured.proficiency) || defaultCompetencyWeights.proficiency,
            improvementExecution: Number(configured.improvementExecution) || defaultCompetencyWeights.improvementExecution,
            repeatViolationPenalty: Number(configured.repeatViolationPenalty) || defaultCompetencyWeights.repeatViolationPenalty,
            version: configured.version || defaultCompetencyWeights.version,
        };
    } catch {
        return defaultCompetencyWeights;
    }
};

export function deriveCompetencyProfile(record: WorkerRecord): SafetyCompetencyProfile {
    const weights = getConfiguredWeights();
    const confidence = typeof record.ocrConfidence === 'number' ? record.ocrConfidence : 0.85;
    const baseSafety = typeof record.safetyScore === 'number' ? record.safetyScore : 0;
    const weakCount = Array.isArray(record.weakAreas) ? record.weakAreas.length : 0;
    const strengthCount = Array.isArray(record.strengths) ? record.strengths.length : 0;
    const actionCount = Array.isArray(record.actionHistory) ? record.actionHistory.length : 0;
    const approvedCount = (record.approvalHistory || []).filter((entry) => entry.status === 'approved').length;
    const repeatedViolationSignal = (record.aiInsights || '').includes('반복') || (record.weakAreas || []).some((item) => item.includes('반복'));

    let psychologicalScore = baseSafety * 0.35 + confidence * 100 * 0.35 + 30;
    if (record.psychologicalAnalysis?.pressureLevel === 'high') psychologicalScore -= 12;
    if (record.psychologicalAnalysis?.pressureLevel === 'low') psychologicalScore -= 6;
    if (record.psychologicalAnalysis?.hasLayoutIssue) psychologicalScore -= 10;
    psychologicalScore = clampScore(psychologicalScore);

    let jobUnderstandingScore = baseSafety * 0.65 + strengthCount * 6 - weakCount * 4 + 20;
    jobUnderstandingScore = clampScore(jobUnderstandingScore);

    let riskAssessmentUnderstandingScore = baseSafety * 0.55 + confidence * 100 * 0.25 + 20;
    if (record.selfAssessedRiskLevel === '상') riskAssessmentUnderstandingScore -= 12;
    if (record.selfAssessedRiskLevel === '중') riskAssessmentUnderstandingScore -= 5;
    riskAssessmentUnderstandingScore = clampScore(riskAssessmentUnderstandingScore);

    let proficiencyScore = baseSafety * 0.7 + approvedCount * 6 + 15;
    if (record.role === 'leader') proficiencyScore += 8;
    if (record.role === 'sub_leader') proficiencyScore += 4;
    proficiencyScore = clampScore(proficiencyScore);

    let improvementExecutionScore = 35 + actionCount * 12 + approvedCount * 8;
    improvementExecutionScore = clampScore(improvementExecutionScore);

    const repeatViolationPenalty = clampScore(repeatedViolationSignal ? Math.min(20, 8 + weakCount * 2) : 0);

    const weightedScore = clampScore(
        psychologicalScore * weights.psychological +
        jobUnderstandingScore * weights.jobUnderstanding +
        riskAssessmentUnderstandingScore * weights.riskAssessmentUnderstanding +
        proficiencyScore * weights.proficiency +
        improvementExecutionScore * weights.improvementExecution -
        repeatViolationPenalty * weights.repeatViolationPenalty
    );

    return {
        psychologicalScore,
        jobUnderstandingScore,
        riskAssessmentUnderstandingScore,
        proficiencyScore,
        improvementExecutionScore,
        repeatViolationPenalty,
        weightedScore,
        weightVersion: weights.version,
    };
}

export function getApprovalBlockers(record: WorkerRecord, approverRole: 'safety-manager' | 'site-manager' = 'safety-manager'): string[] {
    const blockers: string[] = [];
    const confidence = typeof record.ocrConfidence === 'number' ? record.ocrConfidence : 1;
    const signatureScore = typeof record.signatureMatchScore === 'number' ? record.signatureMatchScore : null;
    const isStrict = approverRole === 'safety-manager';

    if (confidence < 0.7) {
        blockers.push('OCR 신뢰도가 70% 미만입니다. (검증 대기열 대상)');
    }
    if (isStrict && !record.employeeId && !record.qrId && (signatureScore === null || signatureScore < 0.6)) {
        blockers.push('사번/QR/서명 검증값 중 승인 기준(서명 0.6 이상)을 충족하지 못했습니다.');
    }
    if (!record.name || !record.name.trim()) {
        blockers.push('근로자 이름이 비어 있습니다.');
    }
    if (!record.jobField || !record.jobField.trim()) {
        blockers.push('공종 정보가 비어 있습니다.');
    }
    if (!record.handwrittenAnswers || record.handwrittenAnswers.length === 0) {
        blockers.push('수기 답변 추출 데이터가 없습니다.');
    }
    if (isStrict && (!record.aiInsights || !record.aiInsights.trim())) {
        blockers.push('AI 인사이트가 비어 있어 검토 근거가 부족합니다.');
    }

    if (!isStrict && signatureScore !== null && signatureScore < 0.4) {
        blockers.push('서명 점수가 0.4 미만으로 현장소장 승인 기준 미달입니다.');
    }

    return blockers;
}

export function enforceSafetyLevel(record: WorkerRecord): WorkerRecord {
    const integrity = typeof record.integrityScore === 'number' ? record.integrityScore : deriveIntegrityScore(record);
    const score = typeof record.safetyScore === 'number' ? record.safetyScore : 0;
    const safetyLevel = getSafetyLevelFromScore(score);

    return {
        ...record,
        integrityScore: integrity,
        competencyProfile: record.competencyProfile || deriveCompetencyProfile(record),
        safetyLevel,
    };
}

export function appendAuditTrail(record: WorkerRecord, entry: AuditTrailEntry): WorkerRecord {
    return {
        ...record,
        auditTrail: [...(record.auditTrail || []), entry],
    };
}

export function appendCorrectionHistory(record: WorkerRecord, previous: WorkerRecord | undefined, actor = 'manager'): WorkerRecord {
    if (!previous) return record;

    const watchFields: (keyof WorkerRecord)[] = [
        'name',
        'employeeId',
        'qrId',
        'jobField',
        'teamLeader',
        'role',
        'signatureMatchScore',
        'safetyScore',
        'safetyLevel',
        'ocrConfidence',
        'integrityScore',
        'selfAssessedRiskLevel',
        'psychologicalAnalysis',
        'handwrittenAnswers',
        'aiInsights',
        'aiInsights_native',
        'competencyProfile'
    ];

    const changedFields = watchFields.filter((field) => JSON.stringify(previous[field]) !== JSON.stringify(record[field])).map((field) => String(field));
    if (changedFields.length === 0) return record;

    const previousValues = changedFields.reduce<Record<string, unknown>>((acc, field) => {
        const key = field as keyof WorkerRecord;
        acc[field] = previous[key] ?? null;
        return acc;
    }, {});

    const nextValues = changedFields.reduce<Record<string, unknown>>((acc, field) => {
        const key = field as keyof WorkerRecord;
        acc[field] = record[key] ?? null;
        return acc;
    }, {});

    const candidateReasons = [
        record.reviewReason,
        record.adminComment,
        record.approvalReason,
    ].map((item) => String(item || '').trim()).filter((item) => item.length >= 3);

    const previousReasons = new Set([
        previous.reviewReason,
        previous.adminComment,
        previous.approvalReason,
    ].map((item) => String(item || '').trim()).filter(Boolean));

    const explicitReason = candidateReasons.find((item) => !previousReasons.has(item)) || candidateReasons[0];

    const entry: CorrectionEntry = {
        timestamp: new Date().toISOString(),
        actor,
        changedFields,
        reason: explicitReason || '관리자 정정/재분석 반영',
        previousValues,
        nextValues,
    };

    return {
        ...record,
        correctionHistory: [...(record.correctionHistory || []), entry],
    };
}

export async function attachEvidenceHash(record: WorkerRecord): Promise<WorkerRecord> {
    const payload = {
        id: record.id,
        originalImage: Boolean(record.originalImage),
        fullText: record.fullText || '',
        koreanTranslation: record.koreanTranslation || '',
        safetyScore: record.safetyScore,
        safetyLevel: record.safetyLevel,
        ocrConfidence: record.ocrConfidence ?? null,
        integrityScore: record.integrityScore ?? null,
        competencyProfile: record.competencyProfile ?? null,
        correctionHistory: record.correctionHistory || [],
        scoreAdjustmentHistory: record.scoreAdjustmentHistory || [],
        actionHistory: record.actionHistory || [],
        approvalHistory: record.approvalHistory || [],
        auditTrail: record.auditTrail || [],
    };

    const evidenceHash = await sha256Hex(JSON.stringify(payload));
    return {
        ...record,
        evidenceHash,
    };
}

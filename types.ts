
export type Page = 
    'dashboard' | 
    'ocr-analysis' | 
    'worker-management' | 
    'predictive-analysis' |
    'performance-analysis' |
    'safety-checks' |
    'site-issue-management' |
    'reports' |
    'feedback' |
    'introduction' |
    'individual-report' |
    'admin-training' |
    'worker-training' |
    'safety-behavior-management' |
    'safety-compliance-hub' |
    'settings'; // Added

export type ModalState = {
    type: 'workerHistory' | 'recordDetail' | null;
    record?: WorkerRecord;
    workerName?: string;
    source?: 'worker-management-photo-queue';
    queueRecordIds?: string[];
};

export interface AppSettings {
    siteName: string;
    siteManager: string;
    safetyManager: string;
    jobFields: string[];
    apiKey: string;
    trainingLanguagePreset?: string[];
    competencyWeights?: {
        psychological: number;
        jobUnderstanding: number;
        riskAssessmentUnderstanding: number;
        proficiency: number;
        improvementExecution: number;
        repeatViolationPenalty: number;
        version: string;
    };
    safetyLevelThresholds?: {
        advancedMin: number;
        intermediateMin: number;
    };
    batchSplitSize?: number; // 일괄 재분석 분할 단위 (기본 50건)
    approvalPolicy?: {
        strictRoleGate: boolean;
    };
    feedbackChannel?: {
        webhookUrl: string;
        timeoutMs: number;
        includeMetadata: boolean;
    };
}

export interface PsiFeedbackMetadata {
    appVersion: string;
    userAgentSummary: string;
    timezone: string;
}

export type PsiFeedbackType =
    | '긴급'
    | '버그'
    | '기능'
    | 'Gemini협업'
    | '디자인'
    | '번역OCR'
    | '모바일UX'
    | '특허법무'
    | '운영';

export interface PsiFeedbackPayload {
    id: string;
    type: PsiFeedbackType;
    content: string;
    timestamp: string;
    metadata: PsiFeedbackMetadata;
}

export type OcrErrorType =
    | 'QUALITY'
    | 'RESOLUTION'
    | 'HANDWRITING'
    | 'LAYOUT'
    | 'UNKNOWN';

export interface HandwrittenAnswer {
    questionNumber: string;
    answerText: string;
    koreanTranslation: string;
}

export interface PsychologicalAnalysis {
    pressureLevel: 'high' | 'medium' | 'low';
    hasLayoutIssue: boolean;
}

export interface CorrectionEntry {
    timestamp: string;
    actor: string;
    changedFields: string[];
    reason: string;
    previousValues?: Record<string, unknown>;
    nextValues?: Record<string, unknown>;
}

export type ScoreAdjustmentReasonCode =
    | 'BEHAVIOR_NON_COMPLIANCE'
    | 'UNDERSTANDING_GAP'
    | 'DOCUMENT_INCONSISTENCY'
    | 'EVIDENCE_INSUFFICIENT'
    | 'OTHER';

export interface ScoreAdjustmentEntry {
    timestamp: string;
    actor: string;
    previousScore: number;
    nextScore: number;
    reasonCode: ScoreAdjustmentReasonCode;
    reasonDetail: string;
    evidenceSummary: string;
}

export interface SafetyCompetencyProfile {
    psychologicalScore: number;
    jobUnderstandingScore: number;
    riskAssessmentUnderstandingScore: number;
    proficiencyScore: number;
    improvementExecutionScore: number;
    repeatViolationPenalty: number;
    weightedScore: number;
    weightVersion: string;
}

/**
 * [6대 핵심 평가 지표 - 월간 안전보건정기교육 전용]
 * 총 100점 + 감점(repeatViolationPenalty)
 */
export interface SixMetricBreakdown {
    /** ① 심리지표 (10점): 성의·진지한 문장 작성 태도 */
    psychological: number;
    /** ② 업무이해도 (20점): 본인 공종·자재·도구 명시 수준 */
    jobUnderstanding: number;
    /** ③ 위험성평가 이해도 (20점): 교육 핵심 위험요인을 본인 작업에 연결 */
    riskAssessmentUnderstanding: number;
    /** ④ 숙련도 (30점): 현장 경험이 녹아있는 실효성 있는 대책 */
    proficiency: number;
    /** ⑤ 개선이행도 (20점): 구체적으로 작성하려는 노력 */
    improvementExecution: number;
    /** ⑥ 반복위반 패널티 (감점): 껍데기 단어 반복 시 최대 -30점 */
    repeatViolationPenalty: number;
}

export interface ActionEntry {
    timestamp: string;
    actor: string;
    actionType: string;
    detail: string;
}

export interface ApprovalEntry {
    timestamp: string;
    actor: string;
    status: 'pending' | 'approved' | 'rejected';
    comment?: string;
}

export interface AuditTrailEntry {
    stage: 'ocr' | 'validation' | 'correction' | 'action' | 'approval' | 'reassessment';
    timestamp: string;
    actor: string;
    note?: string;
}

export interface WorkerRecord {
    id: string; // Unique ID for each record
    worker_uuid?: string;
    workerUuid?: string;
    name: string;
    employeeId?: string;
    qrId?: string;
    jobField: string;
    teamLeader?: string; // 팀장 이름 (식별용)
    matchMethod?: 'employeeId' | 'qr' | 'signature' | 'role' | 'name' | 'unmatched';
    signatureMatchScore?: number; // 0-1
    role?: 'worker' | 'leader' | 'sub_leader'; // 위계(Hierarchy)만 관리
    isTranslator?: boolean; // [NEW] 통역 담당 여부 (겸직 가능)
    isSignalman?: boolean;  // [NEW] 신호수 담당 여부 (겸직 가능)
    date: string;
    nationality: string;
    language: string;
    handwrittenAnswers: HandwrittenAnswer[];
    fullText: string;
    koreanTranslation: string;
    safetyScore: number;
    ocrConfidence?: number; // 0-1
    ocrErrorType?: OcrErrorType;
    ocrErrorMessage?: string;
    integrityScore?: number; // 0-100
    safetyLevel: '초급' | '중급' | '고급';
    strengths: string[];
    strengths_native: string[];
    weakAreas: string[];
    weakAreas_native: string[];
    improvement: string;
    improvement_native: string;
    suggestions: string[];
    suggestions_native: string[];
    aiInsights: string;
    aiInsights_native: string;
    scoreReasoning?: string[];
    /** [6대 지표] 항목별 점수 (월간 안전보건정기교육 전용) */
    scoreBreakdown?: SixMetricBreakdown;
    /** 상세 채점 근거: 팩트 기반 감점/가점 사유 서술 (한국어) */
    score_reason?: string;
    /** 상세 채점 근거: 모국어 번역 (관리자 확인용 한국어와 병기) */
    score_reason_native?: string;
    /** 안전 코칭: 다음 달 구체적 개선 행동 가이드 (한국어) */
    actionable_coaching?: string;
    /** 안전 코칭: 모국어 번역 (외국인 근로자 직접 확인용) */
    actionable_coaching_native?: string;
    selfAssessedRiskLevel: '상' | '중' | '하';
    psychologicalAnalysis?: PsychologicalAnalysis;
    originalImage?: string; // Base64 encoded document image from OCR
    profileImage?: string;  // Base64 encoded worker profile photo (Managed by User)
    filename?: string; // Original filename for reference
    correctionHistory?: CorrectionEntry[];
    scoreAdjustmentHistory?: ScoreAdjustmentEntry[];
    actionHistory?: ActionEntry[];
    approvalHistory?: ApprovalEntry[];
    auditTrail?: AuditTrailEntry[];
    evidenceHash?: string;
    competencyProfile?: SafetyCompetencyProfile;
    approvalStatus?: 'APPROVED' | 'PENDING' | 'OVERRIDDEN';
    approvedBy?: string;
    approvedAt?: string;
    approvalReason?: string;
    reviewStatus?: 'APPROVED' | 'REJECTED' | 'PENDING';
    adminComment?: string;
    reviewReason?: string;
}

export interface HighRiskWorker {
    name: string;
    score: number;
}

export interface SafetyBriefing {
    greeting: string;
    focus_area: {
        korean: string;
    };
    priority_workers: {
        name:string;
        reason_korean: string;
    }[];
    encouragement: {
        korean: string;
    };
}

export interface SafetyCheckRecord {
    id: string;
    workerName: string;
    date: string;
    type: 'unsafe_action' | 'unsafe_condition';
    reason: string;
    details: string;
    image?: string;
}

// Data type for Monthly Briefing Hub
export interface BriefingData {
    month: string;
    avgScore: number;
    totalWorkers: number;
    topWeakness: string;
    bestWorker: WorkerRecord | null;
    script: string;
    kpiAnalysis: string;
}

// Type for Risk Forecast Data
export interface RiskForecastData {
    nextMonth: string;
    predictedRisks: {
        risk: string;
        probability: string; // 'High' | 'Medium' | 'Low'
        action: string;
    }[];
    focusTeams: string[];
    aiAdvice: string;
}

// ============================================================
// 개인안전역량 무결성 검증 타입 (2026-03-18 추가)
// supabase_safety_integrity_migration.sql 테이블 구조와 대응
// ============================================================

/** 불안전행동 심각도 */
export type UnsafeBehaviorSeverity = '낮음' | '보통' | '높음' | '즉시조치';

/** 코칭·재교육 조치 유형 */
export type CoachingActionType = '재교육' | '현장코칭' | '작업중지' | '보호구개선' | '기타';

/** 코칭 후 후속 확인 결과 */
export type CoachingFollowupResult = '개선됨' | '재발' | '확인중';

/** 월별 무결성 판정 상태 */
export type IntegrityStatus = '확정' | '검증보류' | '재교육필요' | '관리자검토';

/** 무결성 판정 사유 코드 */
export type IntegrityReasonCode =
    | 'EDUCATION_INCOMPLETE'     // 교육/서명 미완료
    | 'COACHING_MISSING'         // 불안전행동 후 코칭 이력 없음
    | 'REPEAT_VIOLATION'         // 동일 위험행동 2회 이상 재발
    | 'TIMELINE_MISMATCH'        // 시간 순서 불일치 (관찰→코칭→교육→작성 역전)
    | 'DOCUMENT_INSUFFICIENT'    // 기록지 품질 미달
    | 'FOLLOWUP_PENDING';        // 후속확인 미완료(확인중 상태)

/**
 * safety_behavior_observations 테이블 대응
 * 현장에서 관찰된 불안전행동 기록.
 * unsafe_behavior_flag = false 이면 "해당 월 이상 없음" 확인 기록으로 사용.
 */
export interface SafetyBehaviorObservation {
    id: string;
    worker_id: string;
    assessment_month: string;          // 'YYYY-MM'
    observed_at?: string;              // ISO 8601
    observer_name?: string;
    unsafe_behavior_flag: boolean;
    unsafe_behavior_type?: string;
    severity_level?: UnsafeBehaviorSeverity;
    evidence_note?: string;
    evidence_photo_url?: string;
    related_risk_category?: string;
    created_at: string;
}

/**
 * safety_coaching_actions 테이블 대응
 * 불안전행동 관찰 후 실시된 재교육·코칭·시정조치.
 * source_observation_id 로 관찰 건과 연결.
 */
export interface SafetyCoachingAction {
    id: string;
    worker_id: string;
    assessment_month: string;
    source_observation_id?: string;
    action_type: CoachingActionType;
    action_detail?: string;
    action_completed_at?: string;
    coach_name?: string;
    followup_result?: CoachingFollowupResult;
    followup_checked_at?: string;
    created_at: string;
}

/**
 * worker_integrity_reviews 테이블 대응
 * 월별 무결성 자동판정 결과 (문서축 + 실천축).
 */
export interface WorkerIntegrityReview {
    id: string;
    worker_id: string;
    assessment_month: string;
    education_session_id?: string;

    // 점수 구성요소
    document_score?: number;           // w1·w2·w3 기록지 품질 합산
    education_score?: number;          // w4 교육이수도
    improvement_score?: number;        // w5 개선이행도
    repeat_violation_penalty: number;  // w6 월별 반복위반 패널티

    // 판정 결과
    integrity_status: IntegrityStatus;
    integrity_reason_codes: IntegrityReasonCode[];
    computed_total_score?: number;

    // 자동판정 메타
    auto_evaluated_at?: string;

    // 관리자 최종 처리
    approved_by?: string;
    approved_at?: string;
    approval_comment?: string;

    created_at: string;
    updated_at: string;
}

/**
 * 관리자 화면용 근로자별 월별 무결성 요약
 * (worker_integrity_reviews + safety_behavior_observations + safety_coaching_actions 조인 뷰)
 */
export interface WorkerMonthlyIntegritySummary {
    worker_id: string;
    worker_name: string;
    assessment_month: string;
    nationality?: string;
    job_field?: string;
    unsafe_behavior_count: number;
    coaching_completed_count: number;
    repeat_violation_count: number;
    education_completed: boolean;
    document_score?: number;
    integrity_status: IntegrityStatus;
    integrity_reason_codes: IntegrityReasonCode[];
    last_observation_date?: string;
    last_coaching_date?: string;
    approved_by?: string;
    approved_at?: string;
}

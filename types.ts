
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
    'settings'; // Added

export type ModalState = {
    type: 'workerHistory' | 'recordDetail' | null;
    record?: WorkerRecord;
    workerName?: string;
};

export interface AppSettings {
    siteName: string;
    siteManager: string;
    safetyManager: string;
    jobFields: string[];
    apiKey: string;
    competencyWeights?: {
        psychological: number;
        jobUnderstanding: number;
        riskAssessmentUnderstanding: number;
        proficiency: number;
        improvementExecution: number;
        repeatViolationPenalty: number;
        version: string;
    };
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
    selfAssessedRiskLevel: '상' | '중' | '하';
    psychologicalAnalysis?: PsychologicalAnalysis;
    originalImage?: string; // Base64 encoded document image from OCR
    profileImage?: string;  // Base64 encoded worker profile photo (Managed by User)
    filename?: string; // Original filename for reference
    correctionHistory?: CorrectionEntry[];
    actionHistory?: ActionEntry[];
    approvalHistory?: ApprovalEntry[];
    auditTrail?: AuditTrailEntry[];
    evidenceHash?: string;
    competencyProfile?: SafetyCompetencyProfile;
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

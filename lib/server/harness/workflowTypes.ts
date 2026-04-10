export type HarnessWorkflowState =
    | 'uploaded'
    | 'ocr_validating'
    | 'manual_review_required'
    | 'context_ready'
    | 'first_pass_analyzing'
    | 'evaluator_review'
    | 'awaiting_manager_approval'
    | 'manager_revised'
    | 'second_pass_analyzing'
    | 'completed';

export type HarnessRiskDecision =
    | 'SAFE_TO_PROCEED'
    | 'SUPPLEMENTARY_REVIEW'
    | 'IMMEDIATE_ATTENTION'
    | 'CRITICAL_STOP';

export type HarnessApprovalState =
    | 'NOT_REQUIRED'
    | 'REQUIRED'
    | 'PENDING'
    | 'APPROVED'
    | 'REJECTED';

export type HarnessApprovalAction = 'approve' | 'reject' | 'request-reanalysis';

export type HarnessTriggerSeverity = 'info' | 'warning' | 'high' | 'critical';

export interface HarnessAnalyzeRequest {
    recordId?: string;
    documentText?: string;
    ocrConfidence?: number | null;
    jobType?: string;
    fileName?: string;
    imageQualityScore?: number | null;
    weather?: {
        condition?: string;
        windSpeedMps?: number | null;
        rainfallMm?: number | null;
    };
    workPlan?: {
        taskName?: string;
        concurrentHighRiskTasks?: string[];
    };
    sensorEvents?: Array<{
        type: string;
        severity?: string;
        message?: string;
    }>;
    metadata?: Record<string, unknown>;
}

export interface HarnessValidationIssue {
    code: string;
    message: string;
    severity: HarnessTriggerSeverity;
}

export interface HarnessInputValidationResult {
    ok: boolean;
    normalizedText: string;
    textLength: number;
    specialCharacterRatio: number;
    detectedKeywords: string[];
    issues: HarnessValidationIssue[];
}

export interface HarnessPolicySnapshot {
    version: string;
    minTextLength: number;
    minOcrConfidence: number;
    criticalOcrConfidence: number;
    highRiskJobTypes: string[];
}

export interface HarnessContextSnapshot {
    capturedAt: string;
    promptVersion: string;
    policyVersion: string;
    weather: {
        condition: string | null;
        windSpeedMps: number | null;
        rainfallMm: number | null;
    };
    workPlan: {
        taskName: string | null;
        concurrentHighRiskTasks: string[];
    };
    sensorEvents: Array<{
        type: string;
        severity: string;
        message: string | null;
    }>;
}

export interface HarnessPromptLayerSnapshot {
    version: string;
    systemInstruction: string[];
    staticKnowledge: string[];
    dynamicContext: string[];
    assembledPrompt: string;
}

export interface HarnessAnalyzerOutput {
    summary: string;
    extractedHazards: string[];
    recommendedActions: string[];
    confidence: number;
}

export interface HarnessEvaluationOutput {
    evidenceSufficiency: number;
    requiresHumanApproval: boolean;
    flags: string[];
}

export interface HarnessGuardrailOverride {
    ruleCode: string;
    ruleVersion: string;
    severity: HarnessTriggerSeverity;
    message: string;
    originalDecision: HarnessRiskDecision;
    overriddenDecision: HarnessRiskDecision;
}

export interface HarnessDecisionResult {
    workflowState: HarnessWorkflowState;
    riskDecision: HarnessRiskDecision;
    approvalState: HarnessApprovalState;
    secondPassStatus: 'NEEDED' | 'IN_PROGRESS' | 'DONE';
    requiresManagerApproval: boolean;
}

export interface HarnessAuditEvent {
    stage: string;
    timestamp: string;
    note: string;
    payload?: Record<string, unknown>;
}

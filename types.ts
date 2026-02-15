
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
}

export interface HandwrittenAnswer {
    questionNumber: string;
    answerText: string;
    koreanTranslation: string;
}

export interface PsychologicalAnalysis {
    pressureLevel: 'high' | 'medium' | 'low';
    hasLayoutIssue: boolean;
}

export interface WorkerRecord {
    id: string; // Unique ID for each record
    name: string;
    jobField: string;
    teamLeader?: string; // 팀장 이름 (식별용)
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
    selfAssessedRiskLevel: '상' | '중' | '하';
    psychologicalAnalysis?: PsychologicalAnalysis;
    originalImage?: string; // Base64 encoded document image from OCR
    profileImage?: string;  // Base64 encoded worker profile photo (Managed by User)
    filename?: string; // Original filename for reference
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

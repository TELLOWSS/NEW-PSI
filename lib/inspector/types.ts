export type VisionImport = {
    schema_version: '1.1'; inspection_id: string; photo_id: string; source_photo_sha256: string;
    processing_mode: 'CHATGPT_MANUAL' | 'PAID_API_APPROVED';
    observed_facts: { text: string; visual_basis: string; confidence: 'high' | 'medium' | 'low' }[];
    ai_hypotheses: { text: string; reason: string }[];
    requires_confirmation: { question: string; why: string }[];
    recommended_controls: { action: string; priority: 'immediate' | 'soon' | 'routine' }[];
    /** Optional extension: legacy manual imports and frozen reports remain valid. */
    risk_findings?: {observation_index:'0'|'1'|'2'|'3'|'4'|'5';problem:string;risk:string;action:string;priority:'immediate'|'soon'|'routine'}[];
    law_candidate_keywords: string[]; limitations: string[];
};
export type InspectorAction = { id: string; title: string; owner: string; dueDate: string;
    status: 'open' | 'review-requested' | 'verified'; completionPhotoId: string; note: string; verifiedAt?: string };
export type OcrResult = { rawText: string; recognizedText: string; confidence: number; language: 'kor'|'eng'|'vie'|'chi_sim'; engine: 'LOCAL_TESSERACT'; reviewStatus: 'unreviewed'|'corrected'|'accepted' };
export type ConfirmationAnswer = { questionIndex: number; question: string; answer: 'confirmed' | 'not-confirmed' | 'unknown'; note: string };
export const confirmationAnswerLabel = { confirmed: '현장 확인됨', 'not-confirmed': '확인 결과와 다름', unknown: '아직 확인하지 못함' } as const;
export type OptimizationReceipt = { version: 'browser-jpeg-v2'; source_kind: 'optimized'; source_bytes: number; source_width: number; source_height: number; uploaded_bytes: number; uploaded_width: number; uploaded_height: number; quality: number; uploaded_asset_sha256: string; created_at: string };
export type MaterialCompletion = { revision: number; completedAt: string; photoIds: string[] };
export type InspectionDocument = {
    photoNotes?: Record<string,string>; apiEnabled?: boolean; materialCompletion?: MaterialCompletion;
    title: string; siteName: string; location: string; workType: string; eventAt: string;
    notes: string; urgent: boolean; ocrResults: Record<string, OcrResult>; photoIds: string[]; analyses: Record<string, VisionImport>;
    reviews: Record<string, { decision: 'accepted' | 'rejected'; note: string; confirmedAt?: string; actor?: 'dedicated-admin' }>;
    confirmationAnswers?: Record<string, ConfirmationAnswer[]>;
    actions: InspectorAction[];
};
export type Inspection = { id: string; revision: number; document: InspectionDocument; created_at: string; updated_at: string };
export type Evidence = { id: string; inspection_id: string; sha256: string; mime_type: string; byte_size: number; created_at: string; optimization_receipt?: OptimizationReceipt | null };
export type InspectionReport = { id: string; inspection_id: string; inspection_revision: number; snapshot_sha256: string;
    snapshot: { inspection: Inspection; evidence: Evidence[]; legalStatus: 'UNVERIFIED'; reportStatus: 'DRAFT'; generatedAt: string; legalReference?: import('./legal.js').LegalReference }; created_at: string };
export const inspectionState = (doc: InspectionDocument) => doc.urgent ? '긴급 검토' : doc.actions.length
    ? (doc.actions.every(a => a.status === 'verified') ? '조치 확인 · 법령 검토 대기' : '개선조치 진행')
    : Object.values(doc.reviews).some(r => r.decision === 'accepted') ? '사실 검토됨'
    : Object.keys(doc.analyses).length ? 'AI 결과 검토 대기' : doc.photoIds.length ? '증거 등록됨' : '작성 중';
export const newInspectionDocument = (): InspectionDocument => ({ title: '새 현장점검', siteName: '', location: '', workType: '',
    eventAt: new Date().toISOString(), notes: '', urgent: false, ocrResults: {}, photoIds: [], analyses: {}, reviews: {}, actions: [] });

export type InspectionSummary = { id: string; revision: number; title: string; work_type: string; location: string; urgent: boolean; open_actions: number; needs_review: boolean; created_at: string; updated_at: string };
export function summarizeInspection(item: Inspection): InspectionSummary {
    const d=item.document;
    return {id:item.id,revision:item.revision,title:d.title,work_type:d.workType,location:d.location,urgent:d.urgent,open_actions:d.actions.filter(a=>a.status!=='verified').length,needs_review:Object.keys(d.analyses).some(id=>!d.reviews[id]),created_at:item.created_at,updated_at:item.updated_at};
}

export interface TenantTrainingDraft {
    id: string;
    title: string;
    siteName: string;
    sourceTextKo: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
}
export interface TenantTrainingDraftEvent {
    revision: number;
    title: string;
    siteName: string;
    sourceTextKo: string;
    occurredAt: string;
}

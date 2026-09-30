export interface TenantTrainingDraft {
    id: string;
    title: string;
    siteName: string;
    sourceTextKo: string;
    workerIds: string[];
    revision: number;
    createdAt: string;
    updatedAt: string;
}
export interface TenantTrainingDraftEvent {
    revision: number;
    title: string;
    siteName: string;
    sourceTextKo: string;
    workerIds: string[];
    occurredAt: string;
}

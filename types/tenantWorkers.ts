export interface TenantWorker {
    id: string; name: string; workerCode: string; trade: string; active: boolean;
    revision: number; createdAt: string; updatedAt: string;
}
export interface TenantWorkerEvent {
    revision: number; name: string; workerCode: string; trade: string; active: boolean; occurredAt: string;
}

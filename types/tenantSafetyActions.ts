export type TenantActionStatus = 'open' | 'in-progress' | 'review-requested' | 'closed';
export interface TenantSafetyAction {
    id: string;
    title: string;
    siteName: string;
    description: string;
    dueDate: string | null;
    status: TenantActionStatus;
    verificationNote: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
}
export interface TenantActionEvent {
    revision: number;
    fromStatus: TenantActionStatus | null;
    toStatus: TenantActionStatus;
    verificationNote: string;
    occurredAt: string;
}

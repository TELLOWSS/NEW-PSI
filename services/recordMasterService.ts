import { postAdminJson } from '../utils/adminApiClient';

export type RecordMasterTemplate = {
    id: string;
    name: string;
    version: string;
    fieldSchema: string;
    updatedAt: string;
};

export type RecordMasterGroup = {
    id: string;
    name: string;
    updatedAt?: string;
};

export type RecordMasterAssignment = {
    id: string;
    groupId: string;
    templateId: string;
    status: 'active' | 'inactive';
    effectiveDate: string;
    updatedAt?: string;
};

type RecordMasterData = {
    templates: RecordMasterTemplate[];
    groups: RecordMasterGroup[];
    assignments: RecordMasterAssignment[];
};

type RecordMasterAction =
    | 'list'
    | 'create-template'
    | 'delete-template'
    | 'create-group'
    | 'delete-group'
    | 'upsert-assignment'
    | 'delete-assignment'
    | 'set-assignment-status';

type RecordMasterResponse<T> = {
    ok: true;
    action: RecordMasterAction;
    data: T;
};

const callRecordMaster = async <T>(
    action: RecordMasterAction,
    payload: Record<string, unknown> = {},
): Promise<T> => {
    const response = await postAdminJson<RecordMasterResponse<T>>(
        '/api/admin/record-master',
        { action, payload },
        { fallbackMessage: '기록 마스터 서버 요청에 실패했습니다.' },
    );
    return response.data;
};

export const listRecordMasterData = (): Promise<RecordMasterData> => (
    callRecordMaster<RecordMasterData>('list')
);

export const createRecordMasterTemplate = (
    payload: { name: string; version: string; fieldSchema: string },
): Promise<{ template: RecordMasterTemplate }> => (
    callRecordMaster('create-template', payload)
);

export const deleteRecordMasterTemplate = (templateId: string): Promise<{ templateId: string }> => (
    callRecordMaster('delete-template', { templateId })
);

export const createRecordMasterGroup = (name: string): Promise<{ group: RecordMasterGroup }> => (
    callRecordMaster('create-group', { name })
);

export const deleteRecordMasterGroup = (groupId: string): Promise<{ groupId: string }> => (
    callRecordMaster('delete-group', { groupId })
);

export const upsertRecordMasterAssignment = (payload: {
    groupId: string;
    templateId: string;
    effectiveDate: string;
}): Promise<{ assignment: RecordMasterAssignment }> => (
    callRecordMaster('upsert-assignment', payload)
);

export const deleteRecordMasterAssignment = (
    assignmentId: string,
): Promise<{ assignmentId: string }> => (
    callRecordMaster('delete-assignment', { assignmentId })
);

export const setRecordMasterAssignmentStatus = (
    assignmentId: string,
    status: 'active' | 'inactive',
): Promise<{ assignment: RecordMasterAssignment }> => (
    callRecordMaster('set-assignment-status', { assignmentId, status })
);

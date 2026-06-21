import { postAdminJson } from '../utils/adminApiClient';
import type { SafetyCaseRecord } from '../utils/safetyCase';

export interface SafetyCaseSaveResult {
    ok: boolean;
    schemaReady?: boolean;
    mode?: 'fallback-local';
    caseId?: string;
}

export interface SafetyCaseListResult {
    ok: boolean;
    schemaReady?: boolean;
    mode?: 'fallback-local';
    items: SafetyCaseRecord[];
}

export async function saveSafetyCaseToServer(record: SafetyCaseRecord): Promise<SafetyCaseSaveResult> {
    return postAdminJson<SafetyCaseSaveResult>(
        '/api/admin/safety-cases',
        {
            action: 'save',
            payload: { record },
        },
        {
            fallbackMessage: '보호사건 서버 저장 확인 필요',
        },
    );
}

export async function loadSafetyCasesFromServer(): Promise<SafetyCaseListResult> {
    return postAdminJson<SafetyCaseListResult>(
        '/api/admin/safety-cases',
        {
            action: 'list',
            payload: {},
        },
        {
            fallbackMessage: '보호사건 서버 목록을 확인하지 못했습니다.',
        },
    );
}

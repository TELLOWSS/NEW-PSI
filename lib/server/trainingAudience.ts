const denied = (statusCode: number, code: string, message: string) => Object.assign(new Error(message), { statusCode, code });

export async function loadActiveTrainingWorker(client: any, workerId: string) {
    const { data, error } = await client.from('workers').select('id, name, nationality, deleted_at').eq('id', workerId).is('deleted_at', null).maybeSingle();
    if (error) throw denied(503, 'TRAINING_ACCESS_UNAVAILABLE', '교육 접근 권한을 확인하지 못했습니다. 관리자에게 문의하세요.');
    if (!data?.id || !data?.name || data.deleted_at) throw denied(403, 'WORKER_NOT_FOUND', '등록된 근로자 정보를 확인할 수 없습니다. 관리자에게 문의하세요.');
    return { id: String(data.id).trim(), name: String(data.name).trim(), nationality: String(data.nationality || '').trim() };
}

// Names are not an authorization identity: legacy name-only lists must be reassigned by an administrator.
export function assertTrainingAudience(session: any, workerId: string) {
    if (!session?.id) throw denied(404, 'TRAINING_NOT_FOUND', '교육자료를 찾을 수 없습니다.');
    if (!Object.hasOwn(session, 'target_mode')) throw denied(503, 'TRAINING_ACCESS_UNAVAILABLE', '교육 대상 설정을 확인해 주세요.');
    if (session.target_mode == null || session.target_mode === 'submitted_only') return;
    if (session.target_mode !== 'attendance_only') throw denied(503, 'TRAINING_ACCESS_UNAVAILABLE', '교육 대상 설정을 확인해 주세요.');
    const targets = Array.isArray(session.target_worker_names) ? session.target_worker_names : [];
    const allowed = targets.some((entry: any) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
        const id = String(entry.id || entry.workerId || entry.worker_id || '').trim();
        return Boolean(id) && id.toLowerCase() === workerId.trim().toLowerCase();
    });
    if (!allowed) throw denied(403, 'TRAINING_AUDIENCE_DENIED', '이 교육의 지정 대상자가 아닙니다. 관리자에게 대상자 등록을 문의하세요.');
}

export async function authorizeTrainingWorker(client: any, sessionId: string, workerId: string) {
    const worker = await loadActiveTrainingWorker(client, workerId);
    const { data, error } = await client.from('training_sessions').select('id, target_mode, target_worker_names').eq('id', sessionId).maybeSingle();
    if (error) throw denied(503, 'TRAINING_ACCESS_UNAVAILABLE', '교육 접근 권한을 확인하지 못했습니다. 관리자에게 문의하세요.');
    assertTrainingAudience(data, worker.id);
    return worker;
}

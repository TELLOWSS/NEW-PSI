import { describe, expect, it, vi } from 'vitest';
import { assertTrainingAudience, authorizeTrainingWorker } from '../lib/server/trainingAudience';

const worker = { id: 'worker-1', name: '동명이인', nationality: '한국', deleted_at: null };
const restricted = { id: 'session-1', target_mode: 'attendance_only', target_worker_names: [{ id: worker.id, name: '변경 전 이름' }] };
function client(session: any = restricted, active: any = worker, error: any = null) {
    const make = (data: any) => {
        const chain: any = { select: vi.fn(() => chain), eq: vi.fn(() => chain), is: vi.fn(() => chain), maybeSingle: vi.fn(async () => ({ data, error })) };
        return chain;
    };
    const workers = make(active), sessions = make(session);
    return { workers, sessions, from: vi.fn((table: string) => table === 'workers' ? workers : sessions) };
}
describe('training audience authorization', () => {
    it('allows a designated stable ID even after the worker name changes', async () => {
        const db = client();
        expect(await authorizeTrainingWorker(db, restricted.id, worker.id)).toEqual({ id: worker.id, name: worker.name, nationality: worker.nationality });
        expect(db.workers.is).toHaveBeenCalledWith('deleted_at', null);
        expect(db.sessions.eq).toHaveBeenCalledWith('id', restricted.id);
    });
    it.each([[], ['동명이인'], [{ name: '동명이인' }], [{ id: 'worker-2', name: '동명이인' }], null, 'invalid'])('denies empty, legacy name-only, different IDs and malformed lists: %j', (targets) => {
        expect(() => assertTrainingAudience({ ...restricted, target_worker_names: targets }, worker.id)).toThrow('지정 대상자');
    });
    it('supports stored workerId and worker_id aliases, but never client-provided names', () => {
        for (const entry of [{ workerId: worker.id }, { worker_id: worker.id }]) expect(() => assertTrainingAudience({ ...restricted, target_worker_names: [entry] }, worker.id)).not.toThrow();
    });
    it('keeps unscoped and legacy null-mode education accessible to registered workers', () => {
        for (const target_mode of ['submitted_only', null]) expect(() => assertTrainingAudience({ ...restricted, target_mode }, 'other-worker')).not.toThrow();
    });
    it('fails closed for missing sessions, missing settings and unknown modes', () => {
        expect(() => assertTrainingAudience(null, worker.id)).toThrow('찾을 수');
        for (const session of [{ id: 'session-1' }, { ...restricted, target_mode: 'corrupt' }]) expect(() => assertTrainingAudience(session, worker.id)).toThrow('설정');
    });
    it('denies removed workers even with an old valid identity proof', async () => {
        for (const active of [null, { ...worker, deleted_at: '2026-09-30' }]) {
            const db = client(restricted, active);
            await expect(authorizeTrainingWorker(db, restricted.id, worker.id)).rejects.toMatchObject({ statusCode: 403 });
            expect(db.sessions.maybeSingle).not.toHaveBeenCalled();
        }
    });
    it('rechecks a changed target list instead of caching a previous grant', async () => {
        const db = client();
        await authorizeTrainingWorker(db, restricted.id, worker.id);
        db.sessions.maybeSingle.mockResolvedValueOnce({ data: { ...restricted, target_worker_names: [] }, error: null });
        await expect(authorizeTrainingWorker(db, restricted.id, worker.id)).rejects.toMatchObject({ statusCode: 403, code: 'TRAINING_AUDIENCE_DENIED' });
    });
    it('does not expose database error details or bypass missing schema', async () => {
        await expect(authorizeTrainingWorker(client(restricted, worker, { message: 'private provider detail', code: '42703' }), restricted.id, worker.id)).rejects.toMatchObject({ statusCode: 503, message: '교육 접근 권한을 확인하지 못했습니다. 관리자에게 문의하세요.' });
    });
});

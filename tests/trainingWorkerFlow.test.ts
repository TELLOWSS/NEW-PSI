import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('../lib/server/supabaseServer.js', () => ({ createSupabaseServerClient: () => state.db }));
import gateway from '../api/gateway';
import signatureEndpoint from '../api/training/submit-signature';
import { generateTrainingLinkToken } from '../lib/server/trainingLinkToken';

// Entirely synthetic fixtures; no network, production credentials or customer data.
const origin = 'https://training-fixture.supabase.co';
const sessionId = '00000000-0000-4000-8000-000000000002';
const workerId = '00000000-0000-4000-8000-000000000001';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
const envKeys = ['TRAINING_LINK_SECRET', 'PSI_DEPLOYMENT_MODEL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'] as const;
const oldEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
beforeEach(() => {
    process.env.TRAINING_LINK_SECRET = 'synthetic-full-flow-secret';
    delete process.env.PSI_DEPLOYMENT_MODEL;
    process.env.VITE_SUPABASE_URL = origin;
    process.env.NEXT_PUBLIC_SUPABASE_URL = origin;
});
afterEach(() => {
    vi.useRealTimers();
    for (const key of envKeys) if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key];
    vi.restoreAllMocks();
});

function database() {
    const worker = { id: workerId, name: '교육 검증용 근로자', nationality: '대한민국', deleted_at: null as string | null };
    const audio = `${origin}/storage/v1/object/public/training_audio/${sessionId}/ko-KR.mp3`;
    const session: any = { id: sessionId, case_id: null, target_mode: 'attendance_only', target_worker_names: [{ id: workerId, name: worker.name }], source_text_ko: '검증용 안전교육: 보호구를 확인하세요.', audio_urls: { 'ko-KR': audio }, translated_texts: { __release__: JSON.stringify({ version: 1, status: 'ready', selectedLanguages: ['ko-KR'] }) } };
    const logs: any[] = [], acknowledgements: any[] = [];
    const objects = new Map<string, Buffer>();
    const db: any = { worker, session, logs, acknowledgements, objects, commitError: null, uploadError: null };
    const upload = vi.fn(async (path: string, bytes: Buffer, options: any) => {
        if (db.uploadError) return { error: db.uploadError };
        if (objects.has(path) && !options.upsert) return { error: { message: 'already exists' } };
        objects.set(path, bytes);
        return { error: null };
    });
    const remove = vi.fn(async (paths: string[]) => { paths.forEach(path => objects.delete(path)); return { error: null }; });
    const sign = vi.fn(async (paths: string[], ttl: number) => ({ data: paths.map(path => ({ path, signedUrl: `https://synthetic.invalid/${path}?ttl=${ttl}` })), error: null }));
    db.storage = { from: vi.fn((bucket: string) => bucket === 'signatures' ? { upload, remove } : { createSignedUrls: sign }) };
    db.upload = upload; db.remove = remove; db.sign = sign;
    db.from = vi.fn((table: string) => {
        const filters: Array<[string, unknown]> = [];
        const rows = () => (table === 'workers' ? [worker] : table === 'training_sessions' ? [session] : table === 'training_logs' ? logs : []).filter(row => filters.every(([key, value]) => row[key] === value));
        const chain: any = { select: () => chain, eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; }, is: (key: string, value: unknown) => { filters.push([key, value]); return chain; }, limit: () => chain, insert: async () => ({ error: null }), maybeSingle: async () => ({ data: rows()[0] || null, error: null }), single: async () => ({ data: rows()[0] || null, error: null }), then: (resolve: any) => Promise.resolve({ data: rows(), error: null }).then(resolve) };
        return chain;
    });
    db.rpc = vi.fn(async (name: string, args: any) => {
        if (name === 'psi_lookup_worker_auth') return { data: [worker], error: null };
        if (name !== 'psi_commit_training_signature') return { data: [{ allowed: true, current_count: 1 }], error: null };
        if (db.commitError) return { error: db.commitError };
        if (logs.some(row => row.session_id === args.p_session_id && row.worker_id === args.p_worker_id)) return { error: { code: '23505' } };
        logs.push({ id: 'synthetic-log', session_id: args.p_session_id, worker_id: args.p_worker_id, worker_name: args.p_worker_name, signature_url: `private://signatures/${args.p_signature_path}` });
        acknowledgements.push({ worker_id: args.p_worker_id, comprehension_complete: args.p_comprehension_complete });
        return { data: { committed: true }, error: null };
    });
    return db;
}
async function request(action: string, body: any, signature = false) {
    let status = 0, result: any;
    const headers: Record<string, string> = {};
    const res: any = { setHeader: (key: string, value: string) => { headers[key] = value; }, status: (code: number) => { status = code; return res; }, json: (value: any) => { result = value; return value; } };
    await (signature ? signatureEndpoint : gateway)({ method: 'POST', query: { action }, headers: {}, body }, res);
    return { status, body: result, headers };
}
async function authenticate() {
    const linkExpiresAt = Date.now() + 60 * 60_000;
    const link = { sessionId, linkExpiresAt, linkToken: generateTrainingLinkToken(sessionId, linkExpiresAt) };
    const response = await request('worker.authenticate', { ...link, keyType: 'phone', keyValue: '01000000000' });
    expect(response.status).toBe(200);
    return { ...link, workerId: response.body.worker.worker_id, workerAuthToken: response.body.workerAuthToken, workerAuthExpiresAt: response.body.workerAuthExpiresAt };
}
const submission = (proof: any) => ({ ...proof, workerName: '위조된 이름', nationality: '위조된 국적', selectedLanguageCode: 'ko-KR', reviewedGuidance: true, audioPlayed: true, scrolledToEnd: true, acknowledgedRiskAssessment: true, checklist: { riskReview: true, ppeConfirm: true, emergencyConfirm: true }, signatureDataUrl: `data:image/png;base64,${png}`, isManagerProxy: true });

describe('worker authentication → material → public signature persistence', () => {
    beforeEach(() => { state.db = database(); });
    it('uses a genuinely issued proof, signs audio, saves canonical identity and private evidence, then blocks a repeat', async () => {
        const proof = await authenticate();
        const material = await request('training.material', proof);
        expect(material.status).toBe(200);
        expect(material.headers['Cache-Control']).toBe('private, no-store');
        expect(material.body.data.audio_urls['ko-KR']).toContain('synthetic.invalid');
        expect(state.db.sign.mock.calls[0][0]).toEqual([`${sessionId}/ko-KR.mp3`]);
        expect(state.db.sign.mock.calls[0][1]).toBeLessThanOrEqual(300);
        expect((await request('training.check-access', proof)).body.data.blocked).toBe(false);
        const signed = await request('training.submit', submission(proof), true);
        expect(signed.status).toBe(200);
        expect(signed.body.data.comprehensionComplete).toBe(true);
        expect(signed.body.data.signatureUrl).toMatch(/^private:\/\/signatures\//);
        const commit = state.db.rpc.mock.calls.find(([name]: any[]) => name === 'psi_commit_training_signature')[1];
        expect(commit.p_worker_name).toBe(state.db.worker.name);
        expect(commit.p_nationality).toBe(state.db.worker.nationality);
        expect(commit.p_is_manager_proxy).toBe(false);
        expect(commit.p_signature_method).toBe('worker_self');
        expect(commit.p_signature_evidence_hash).toBe(createHash('sha256').update(Buffer.from(png, 'base64')).digest('hex'));
        expect(state.db.objects.get(commit.p_signature_path)).toEqual(Buffer.from(png, 'base64'));
        expect(state.db.upload.mock.calls[0][2].upsert).toBe(false);
        expect(state.db.logs).toHaveLength(1);
        expect(state.db.acknowledgements).toHaveLength(1);
        expect((await request('training.check-access', proof)).body.data.blocked).toBe(true);
        expect((await request('training.submit', submission(proof), true)).status).toBe(409);
        expect(state.db.upload).toHaveBeenCalledTimes(1);
    });
    it.each(['draft', 'malformed', 'incomplete'])('rejects %s material before audio signing or signature upload', async (kind) => {
        const proof = await authenticate();
        if (kind === 'draft') state.db.session.translated_texts.__release__ = JSON.stringify({ version: 1, status: 'draft', selectedLanguages: ['ko-KR'] });
        if (kind === 'malformed') state.db.session.translated_texts.__release__ = '{broken';
        if (kind === 'incomplete') state.db.session.audio_urls = {};
        expect((await request('training.material', proof)).status).toBe(422);
        expect((await request('training.submit', submission(proof), true)).status).toBe(422);
        expect(state.db.sign).not.toHaveBeenCalled();
        expect(state.db.upload).not.toHaveBeenCalled();
        expect(state.db.logs).toHaveLength(0);
    });
    it('rechecks a release withdrawn after material access', async () => {
        const proof = await authenticate();
        expect((await request('training.material', proof)).status).toBe(200);
        state.db.session.translated_texts.__release__ = JSON.stringify({ version: 1, status: 'draft', selectedLanguages: ['ko-KR'] });
        expect((await request('training.submit', submission(proof), true)).status).toBe(422);
        expect(state.db.upload).not.toHaveBeenCalled();
    });
    it.each(['vi-VN', '', '__release__'])('does not accept a signature for unreleased language %s', async (language) => {
        const proof = await authenticate();
        const result = await request('training.submit', { ...submission(proof), selectedLanguageCode: language }, true);
        expect(result.status).toBe(422);
        expect(result.body.code).toBe('TRAINING_LANGUAGE_NOT_RELEASED');
        expect(state.db.upload).not.toHaveBeenCalled();
    });
    it('retains successful submission compatibility for legacy material without release metadata', async () => {
        delete state.db.session.translated_texts.__release__;
        const proof = await authenticate();
        expect((await request('training.submit', submission(proof), true)).status).toBe(200);
    });
    it.each([{ code: 'PGRST202', message: 'psi_commit_training_signature missing' }, { code: 'XX000', message: 'synthetic failure' }, { code: '23505', message: 'concurrent duplicate' }])('removes the new private object when commit fails: %j', async (error) => {
        const proof = await authenticate();
        state.db.objects.set('existing-evidence.png', Buffer.from('existing'));
        state.db.commitError = error;
        const result = await request('training.submit', submission(proof), true);
        expect(result.status).toBe(error.code === '23505' ? 409 : 503);
        expect(state.db.remove).toHaveBeenCalledExactlyOnceWith([state.db.upload.mock.calls[0][0]]);
        expect([...state.db.objects.keys()]).toEqual(['existing-evidence.png']);
        expect(state.db.logs).toHaveLength(0);
        expect(state.db.acknowledgements).toHaveLength(0);
    });
    it('never commits a record when storage upload fails', async () => {
        const proof = await authenticate();
        state.db.uploadError = { message: 'synthetic upload failure' };
        expect((await request('training.submit', submission(proof), true)).status).toBe(500);
        expect(state.db.rpc.mock.calls.filter(([name]: any[]) => name === 'psi_commit_training_signature')).toHaveLength(0);
        expect(state.db.logs).toHaveLength(0);
    });
    it('denies the issued worker proof after it expires', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        const proof = await authenticate();
        vi.setSystemTime(proof.workerAuthExpiresAt + 1);
        expect((await request('training.material', proof)).status).toBe(403);
        expect((await request('training.submit', submission(proof), true)).status).toBe(403);
        expect(state.db.upload).not.toHaveBeenCalled();
    });
});

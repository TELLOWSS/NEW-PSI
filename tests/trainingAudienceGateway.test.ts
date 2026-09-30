import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('../lib/server/supabaseServer.js', () => ({ createSupabaseServerClient: () => state.db }));
import gateway from '../api/gateway';
import signatureEndpoint from '../api/training/submit-signature';
import { generateTrainingLinkToken, generateWorkerAuthenticationToken } from '../lib/server/trainingLinkToken';

const previousSecret = process.env.TRAINING_LINK_SECRET, previousModel = process.env.PSI_DEPLOYMENT_MODEL;
beforeEach(() => { process.env.TRAINING_LINK_SECRET = 'synthetic-audience-only'; delete process.env.PSI_DEPLOYMENT_MODEL; });
afterEach(() => {
    if (previousSecret === undefined) delete process.env.TRAINING_LINK_SECRET; else process.env.TRAINING_LINK_SECRET = previousSecret;
    if (previousModel === undefined) delete process.env.PSI_DEPLOYMENT_MODEL; else process.env.PSI_DEPLOYMENT_MODEL = previousModel;
    vi.restoreAllMocks();
});
function database(allowed: boolean, deleted = false) {
    const worker = { id: 'worker-1', name: '테스트', nationality: '한국', deleted_at: deleted ? '2026-09-30' : null };
    const session = { id: 'session-1', target_mode: 'attendance_only', target_worker_names: allowed ? [{ id: worker.id, name: worker.name }] : [{ id: 'other-worker', name: worker.name }], source_text_ko: '교육', audio_urls: {}, translated_texts: {} };
    const write = vi.fn(async () => ({ error: null }));
    const from = vi.fn((table: string) => {
        const data = table === 'workers' ? worker : table === 'training_sessions' ? session : [];
        const chain: any = { select: () => chain, eq: () => chain, is: () => chain, limit: () => chain, insert: write, single: async () => ({ data, error: null }), maybeSingle: async () => ({ data, error: null }), then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve) };
        return chain;
    });
    const storage = vi.fn();
    return { from, storage: { from: storage }, write, storageCall: storage, rpc: vi.fn(async (name: string) => ({ data: name === 'psi_lookup_worker_auth' ? [worker] : [{ allowed: true, current_count: 1 }], error: null })) };
}
async function invoke(action: string, publicSignature = false) {
    const expiresAt = Date.now() + 60_000;
    const proof = { sessionId: 'session-1', workerId: 'worker-1', linkExpiresAt: expiresAt, workerAuthExpiresAt: expiresAt, linkToken: generateTrainingLinkToken('session-1', expiresAt), workerAuthToken: generateWorkerAuthenticationToken('session-1', 'worker-1', expiresAt) };
    let status = 0, body: any;
    const res: any = { setHeader: vi.fn(), status: (code: number) => { status = code; return res; }, json: (value: any) => { body = value; return value; } };
    const req = { method: 'POST', headers: {}, query: { action }, body: action === 'training.submit' ? { type: 'single', payload: { ...proof, signatureDataUrl: 'data:image/png;base64,c3ludGhldGlj' } } : { ...proof, keyType: 'phone', keyValue: '01000000000' } };
    await (publicSignature ? signatureEndpoint : gateway)(publicSignature ? { ...req, body: (req.body as any).payload } : req, res);
    return { status, body };
}
describe('gateway training audience enforcement', () => {
    it.each(['worker.authenticate', 'training.material', 'training.check-access', 'training.submit'])('denies a non-target at %s before material or signature work', async (action) => {
        state.db = database(false);
        const result = await invoke(action);
        expect(result.status).toBe(403);
        expect(result.body.code).toBe('TRAINING_AUDIENCE_DENIED');
        expect(result.body).not.toHaveProperty('workerAuthToken');
        expect(state.db.storageCall).not.toHaveBeenCalled();
    });
    it.each(['worker.authenticate', 'training.material', 'training.check-access', 'training.submit'])('denies a deleted target worker at %s', async (action) => {
        state.db = database(true, true);
        expect((await invoke(action)).status).toBe(403);
        expect(state.db.storageCall).not.toHaveBeenCalled();
    });
    it('enforces the same boundary through the public signature endpoint', async () => {
        state.db = database(false);
        const result = await invoke('training.submit', true);
        expect(result.status).toBe(403);
        expect(result.body.code).toBe('TRAINING_AUDIENCE_DENIED');
        expect(state.db.storageCall).not.toHaveBeenCalled();
    });
    it.each(['worker.authenticate', 'training.material', 'training.check-access'])('allows a registered target worker at %s', async (action) => {
        state.db = database(true);
        expect((await invoke(action)).status).toBe(200);
    });
});

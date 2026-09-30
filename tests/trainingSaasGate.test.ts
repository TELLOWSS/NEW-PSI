import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const database = vi.hoisted(() => ({ create: vi.fn(() => { throw new Error('Legacy database must not be accessed'); }) }));
vi.mock('../lib/server/supabaseServer.js', () => ({ createSupabaseServerClient: database.create }));
import gateway from '../api/gateway';
import publicSignature from '../api/training/submit-signature';
import { generateTrainingLinkToken, generateWorkerAuthenticationToken } from '../lib/server/trainingLinkToken';
const oldMode = process.env.PSI_DEPLOYMENT_MODEL, oldSecret = process.env.TRAINING_LINK_SECRET;
beforeEach(() => { process.env.PSI_DEPLOYMENT_MODEL = 'shared-saas'; process.env.TRAINING_LINK_SECRET = 'synthetic-saas-gate'; database.create.mockClear(); });
afterEach(() => {
    if (oldMode === undefined) delete process.env.PSI_DEPLOYMENT_MODEL; else process.env.PSI_DEPLOYMENT_MODEL = oldMode;
    if (oldSecret === undefined) delete process.env.TRAINING_LINK_SECRET; else process.env.TRAINING_LINK_SECRET = oldSecret;
});
async function invoke(action: string, adapter = false, type = 'single', valid = true) {
    const expiresAt = Date.now() + 60_000;
    const proof = { sessionId: 'synthetic-session', workerId: 'synthetic-worker', linkExpiresAt: expiresAt, workerAuthExpiresAt: expiresAt, linkToken: valid ? generateTrainingLinkToken('synthetic-session', expiresAt) : '', workerAuthToken: valid ? generateWorkerAuthenticationToken('synthetic-session', 'synthetic-worker', expiresAt) : '' };
    let status = 0, body: any;
    const headers: Record<string, string> = {};
    const res: any = { setHeader: (key: string, value: string) => { headers[key] = value; }, status: (code: number) => { status = code; return res; }, json: (value: any) => { body = value; return value; } };
    await (adapter ? publicSignature : gateway)({ method: 'POST', headers: {}, query: { action }, body: adapter ? proof : action === 'training.submit' ? { type, payload: proof } : { ...proof, keyType: 'phone', keyValue: '01000000000' } }, res);
    return { status, body, headers };
}
describe('shared SaaS rejects legacy education without a tenant boundary', () => {
    it.each(['worker.authenticate', 'training.material', 'training.check-access', 'training.submit'])('blocks %s even with valid server-signed legacy proofs before DB, quota or storage access', async (action) => {
        const result = await invoke(action);
        expect(result.status).toBe(503);
        expect(result.body.code).toBe('TENANT_TRAINING_NOT_READY');
        expect(result.headers['Cache-Control']).toBe('private, no-store');
        expect(database.create).not.toHaveBeenCalled();
    });
    it('blocks the public signature adapter through the same gateway gate', async () => {
        expect((await invoke('training.submit', true)).body.code).toBe('TENANT_TRAINING_NOT_READY');
        expect(database.create).not.toHaveBeenCalled();
    });
    it('also blocks group submissions before the legacy administrator check', async () => {
        expect((await invoke('training.submit', false, 'group')).status).toBe(503);
        expect(database.create).not.toHaveBeenCalled();
    });
    it('does not depend on authentication secret configuration to block shared mode', async () => {
        delete process.env.TRAINING_LINK_SECRET;
        const result = await invoke('training.material', false, 'single', false);
        expect(result.body.code).toBe('TENANT_TRAINING_NOT_READY');
        expect(database.create).not.toHaveBeenCalled();
    });
    it.each(['single-site', undefined])('preserves ordinary legacy authentication validation in mode %s', async (mode) => {
        if (mode === undefined) delete process.env.PSI_DEPLOYMENT_MODEL; else process.env.PSI_DEPLOYMENT_MODEL = mode;
        expect((await invoke('training.submit', false, 'single', false)).status).toBe(403);
        expect(database.create).not.toHaveBeenCalled();
    });
});

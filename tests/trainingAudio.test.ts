import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveTrainingAudioPath, verifyTrainingMaterialAccess, signTrainingAudioMap, readTrainingMaterial } from '../lib/server/trainingAudio';
import { generateTrainingLinkToken, generateWorkerAuthenticationToken } from '../lib/server/trainingLinkToken';
import gateway from '../api/gateway';

const origin = 'https://project.supabase.co';
const locator = `${origin}/storage/v1/object/public/training_audio/session-1/ko-KR.mp3?v=1`;
const oldSecret = process.env.TRAINING_LINK_SECRET;
const oldModel = process.env.PSI_DEPLOYMENT_MODEL;
const oldOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL;
const oldViteOrigin = process.env.VITE_SUPABASE_URL;
beforeEach(() => { process.env.TRAINING_LINK_SECRET = 'synthetic-audio-test'; delete process.env.PSI_DEPLOYMENT_MODEL; });
afterEach(() => {
    if (oldSecret === undefined) delete process.env.TRAINING_LINK_SECRET; else process.env.TRAINING_LINK_SECRET = oldSecret;
    if (oldModel === undefined) delete process.env.PSI_DEPLOYMENT_MODEL; else process.env.PSI_DEPLOYMENT_MODEL = oldModel;
    if (oldOrigin === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldOrigin;
    if (oldViteOrigin === undefined) delete process.env.VITE_SUPABASE_URL; else process.env.VITE_SUPABASE_URL = oldViteOrigin;
    vi.restoreAllMocks();
});
const proof = (linkTtl = 600000, workerTtl = 600000) => {
    const linkExpiresAt = Date.now() + linkTtl, workerAuthExpiresAt = Date.now() + workerTtl;
    return { sessionId: 'session-1', workerId: 'worker-1', linkExpiresAt, workerAuthExpiresAt,
        linkToken: generateTrainingLinkToken('session-1', linkExpiresAt),
        workerAuthToken: generateWorkerAuthenticationToken('session-1', 'worker-1', workerAuthExpiresAt) };
};
const client = (session: any) => {
    const sign = vi.fn(async (paths: string[], ttl: number) => ({ data: paths.map(path => ({ path, signedUrl: `https://signed.test/${path}?ttl=${ttl}` })) }));
    const single = vi.fn(async () => ({ data: session, error: null }));
    const chain: any = { select: vi.fn(() => chain), eq: vi.fn(() => chain), single, maybeSingle: vi.fn(async () => ({ data: session && { ...session, target_mode: 'submitted_only', target_worker_names: [] }, error: null })) };
    const worker: any = { select: vi.fn(() => worker), eq: vi.fn(() => worker), is: vi.fn(() => worker), maybeSingle: vi.fn(async () => ({ data: { id: 'worker-1', name: '테스트', nationality: '한국', deleted_at: null }, error: null })) };
    return { from: vi.fn((table: string) => table === 'workers' ? worker : chain), storage: { from: vi.fn(() => ({ createSignedUrls: sign })) }, sign, chain, worker };
};
describe('training material and audio boundary', () => {
    it('returns a service-unavailable error without revealing configuration details', () => {
        const valid = proof();
        delete process.env.TRAINING_LINK_SECRET;
        try { verifyTrainingMaterialAccess(valid); throw new Error('expected failure'); }
        catch (error: any) {
            expect(error.statusCode).toBe(503);
            expect(error.message).not.toContain('TRAINING_LINK_SECRET');
        }
    });
    it('requires both proofs bound to the same session and worker', () => {
        const valid = proof();
        expect(verifyTrainingMaterialAccess(valid).expiresIn).toBe(300);
        for (const body of [ {}, { ...valid, sessionId: 'other-session' }, { ...valid, workerId: 'other-worker' }, { ...valid, workerAuthToken: '' }, { ...valid, linkToken: '' } ]) {
            expect(() => verifyTrainingMaterialAccess(body)).toThrow();
        }
        expect(() => verifyTrainingMaterialAccess(proof(-1000))).toThrow();
        expect(() => verifyTrainingMaterialAccess(proof(600000, -1000))).toThrow();
    });
    it('bounds TTL by both proofs and rejects shared SaaS before legacy data access', () => {
        const nearExpiry = proof(4100, 2100);
        expect(verifyTrainingMaterialAccess(nearExpiry).expiresIn).toBeLessThanOrEqual(2);
        process.env.PSI_DEPLOYMENT_MODEL = 'shared-saas';
        expect(() => verifyTrainingMaterialAccess(proof())).toThrow('기업별');
    });
    it('rejects arbitrary origins, bucket names, cross-session paths and encoded path escapes', () => {
        expect(resolveTrainingAudioPath(locator, 'session-1', origin)).toBe('session-1/ko-KR.mp3');
        for (const value of [ locator.replace('project.', 'evil.'), locator.replace('training_audio', 'signatures'), locator.replace('session-1/', 'session-2/'), locator.replace('ko-KR.mp3', '%2e%2e%2fsecret'), locator.replace('ko-KR.mp3', '%5csecret'), locator.replace('ko-KR.mp3', '%00secret'), 'https://evil.test/a.mp3', 'session-1/a.mp3' ]) {
            expect(resolveTrainingAudioPath(value, 'session-1', origin)).toBeNull();
        }
    });
    it('signs only DB locators in one batch and never returns the stored public address', async () => {
        const db = client(null);
        const signed = await signTrainingAudioMap(db, 'session-1', { 'ko-KR': locator, 'vi-VN': locator.replace('session-1/', 'victim/'), __secret__: locator, constructor: locator }, 29, origin);
        expect(db.sign).toHaveBeenCalledExactlyOnceWith(['session-1/ko-KR.mp3'], 29);
        expect(signed).toEqual({ 'ko-KR': 'https://signed.test/session-1/ko-KR.mp3?ttl=29' });
        expect(JSON.stringify(signed)).not.toContain('/object/public/');
    });
    it('fails closed on signing errors or per-object failures', async () => {
        const db = client(null);
        db.sign.mockResolvedValueOnce({ error: { message: 'private provider detail' } } as any);
        await expect(signTrainingAudioMap(db, 'session-1', { 'ko-KR': locator }, 30, origin)).rejects.toThrow('교육 음성');
        db.sign.mockResolvedValueOnce({ data: [{ path: 'session-1/ko-KR.mp3', error: 'missing' }] } as any);
        expect(await signTrainingAudioMap(db, 'session-1', { 'ko-KR': locator }, 30, origin)).toEqual({});
    });
    it('filters session response and rechecks expiry after the DB read', async () => {
        const db = client({ id: 'session-1', source_text_ko: '교육', translated_texts: {}, audio_urls: {}, internal_secret: 'hidden' });
        const access = verifyTrainingMaterialAccess(proof());
        const result = await readTrainingMaterial(db, access);
        expect(result).not.toHaveProperty('internal_secret');
        expect(db.chain.eq).toHaveBeenCalledWith('id', 'session-1');
        await expect(readTrainingMaterial(db, { ...access, expiresAt: Date.now() - 1 })).rejects.toThrow('만료');
        expect(db.sign).not.toHaveBeenCalled();
    });
    it('does not issue audio for a draft or incomplete release', async () => {
        const db = client({ id: 'session-1', source_text_ko: '교육', audio_urls: {}, translated_texts: { __release__: JSON.stringify({ version: 1, status: 'draft', selectedLanguages: ['ko-KR'] }) } });
        await expect(readTrainingMaterial(db, verifyTrainingMaterialAccess(proof()))).rejects.toThrow('검수');
        expect(db.sign).not.toHaveBeenCalled();
    });
    it('issues only released languages, excluding unselected draft audio', async () => {
        delete process.env.VITE_SUPABASE_URL;
        process.env.NEXT_PUBLIC_SUPABASE_URL = origin;
        const db = client({ id: 'session-1', source_text_ko: '교육', audio_urls: { 'ko-KR': locator, 'vi-VN': locator.replace('ko-KR', 'vi-VN') }, translated_texts: { __release__: JSON.stringify({ version: 1, status: 'ready', selectedLanguages: ['ko-KR'] }) } });
        const result = await readTrainingMaterial(db, verifyTrainingMaterialAccess(proof()));
        expect(Object.keys(result.audio_urls)).toEqual(['ko-KR']);
        expect(db.sign.mock.calls[0][0]).toEqual(['session-1/ko-KR.mp3']);
        expect(db.sign.mock.calls[0][1]).toBeLessThanOrEqual(300);
    });
    it('gateway rejects unauthenticated requests with no-store before accessing DB', async () => {
        const res: any = { setHeader: vi.fn(), status: vi.fn(() => res), json: vi.fn() };
        await gateway({ method: 'POST', query: { action: 'training.material' }, body: {} }, res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    });
});

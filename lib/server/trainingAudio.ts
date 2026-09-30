import { normalizeTrainingStringMap, parseTrainingReleaseMetadata, assessTrainingReleaseReadiness } from '../../utils/trainingReleaseReadiness.js';
import { TRAINING_LANGUAGE_LABELS } from '../../utils/constructionTrainingTranslation.js';
import { verifyTrainingLinkToken, verifyWorkerAuthenticationToken } from './trainingLinkToken.js';

const failure = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });
export const trainingAudioOrigin = () => process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';

// Accept only a stored locator in this project's bucket and this session's directory.
// Never fetch or sign a client supplied URL, another project's object, or another session.
export function resolveTrainingAudioPath(value: unknown, sessionId: string, origin: string): string | null {
    if (typeof value !== 'string' || !sessionId || /[\\/]/.test(sessionId)) return null;
    try {
        const url = new URL(value);
        if (url.origin !== new URL(origin).origin || url.username || url.password) return null;
        const prefix = '/storage/v1/object/public/training_audio/';
        if (!url.pathname.startsWith(prefix)) return null;
        const path = decodeURIComponent(url.pathname.slice(prefix.length));
        const parts = path.split('/');
        if (parts.length !== 2 || parts[0] !== sessionId || !parts[1] || parts.some(p => p === '.' || p === '..' || /[\\\u0000-\u001f]/.test(p))) return null;
        return path;
    } catch { return null; }
}

export function verifyTrainingMaterialAccess(body: any, now = Date.now()) {
    if (process.env.PSI_DEPLOYMENT_MODEL === 'shared-saas') throw failure(503, '기업별 교육 접근 준비가 완료되지 않았습니다.');
    const sessionId = String(body?.sessionId || '').trim();
    const workerId = String(body?.workerId || '').trim();
    if (!verifyTrainingLinkToken(sessionId, body?.linkExpiresAt, body?.linkToken).ok) throw failure(403, '검증되지 않거나 만료된 교육 링크입니다.');
    if (!verifyWorkerAuthenticationToken(sessionId, workerId, body?.workerAuthExpiresAt, body?.workerAuthToken).ok) throw failure(403, '근로자 본인 확인을 다시 진행해 주세요.');
    const expiresIn = Math.min(300, Math.floor((Number(body.linkExpiresAt) - now) / 1000), Math.floor((Number(body.workerAuthExpiresAt) - now) / 1000));
    if (expiresIn < 1) throw failure(403, '교육 접근 시간이 만료되었습니다.');
    return { sessionId, expiresIn, expiresAt: Math.min(Number(body.linkExpiresAt), Number(body.workerAuthExpiresAt), now + expiresIn * 1000) };
}

export async function signTrainingAudioMap(client: any, sessionId: string, values: unknown, expiresIn = 300, origin = trainingAudioOrigin()) {
    const paths = Object.entries(normalizeTrainingStringMap(values)).flatMap(([code, value]) => {
        const path = resolveTrainingAudioPath(value, sessionId, origin);
        return Object.hasOwn(TRAINING_LANGUAGE_LABELS, code) && path ? [{ code, path }] : [];
    });
    if (!paths.length) return {};
    const result = await client.storage.from('training_audio').createSignedUrls(paths.map(p => p.path), expiresIn);
    if (result.error) throw failure(502, '교육 음성을 준비하지 못했습니다. 다시 시도해 주세요.');
    return Object.fromEntries(paths.flatMap(({ code, path }) => {
        const item = result.data?.find((row: any) => row.path === path);
        return item?.signedUrl && !item.error ? [[code, item.signedUrl]] : [];
    }));
}

export async function readTrainingMaterial(client: any, access: { sessionId: string; expiresIn: number; expiresAt: number }) {
    const { sessionId } = access;
    let result = await client.from('training_sessions').select('id, case_id, source_text_ko, audio_urls, translated_texts').eq('id', sessionId).single();
    if (result.error?.code === '42703' || result.error?.code === 'PGRST204') {
        result = await client.from('training_sessions').select('id, source_text_ko, audio_urls, translated_texts').eq('id', sessionId).single();
    }
    if (result.error || !result.data) throw failure(404, '교육자료를 찾을 수 없습니다.');
    const session = result.data;
    const metadata = parseTrainingReleaseMetadata(session.translated_texts);
    if (metadata) {
        const readiness = assessTrainingReleaseReadiness({ selectedLanguages: metadata.selectedLanguages, sourceTextKo: session.source_text_ko, translatedTexts: session.translated_texts, audioUrls: session.audio_urls, approvedReviewLanguages: metadata.approvedReviewLanguages });
        if (metadata.status !== 'ready' || !readiness.ready) throw failure(422, '교육자료 검수가 완료되지 않았습니다.');
    }
    const expiresIn = Math.floor((access.expiresAt - Date.now()) / 1000);
    if (expiresIn < 1) throw failure(403, '교육 접근 시간이 만료되었습니다.');
    const storedAudio = normalizeTrainingStringMap(session.audio_urls);
    const releasedAudio = metadata
        ? Object.fromEntries(metadata.selectedLanguages.filter(code => Object.hasOwn(storedAudio, code)).map(code => [code, storedAudio[code]]))
        : storedAudio;
    const audioUrls = await signTrainingAudioMap(client, sessionId, releasedAudio, expiresIn);
    return { id: session.id, case_id: session.case_id || null, source_text_ko: session.source_text_ko, translated_texts: session.translated_texts, audio_urls: audioUrls };
}

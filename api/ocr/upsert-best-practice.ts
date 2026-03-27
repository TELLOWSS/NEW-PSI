import { createClient } from '@supabase/supabase-js';
import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../../lib/server/adminAuthGuard.js';

type UpsertRequestBody = {
    sourceRecordId?: string;
    safetyScore?: number;
    koreanText?: string;
    originalLanguage?: string;
    actionableCoaching?: string;
    jobField?: string;
    nationality?: string;
    approvedAt?: string;
};

const EMBEDDING_MODEL = 'text-embedding-004';

const resolveGeminiApiKey = () => {
    return (
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        ''
    ).trim();
};

const getSupabaseClient = () => {
    const supabaseUrl =
        process.env.VITE_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        '';
    const serviceRoleKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_KEY ||
        process.env.SERVICE_ROLE_KEY ||
        '';
    const anonKey =
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        '';
    const psiAdminSecret =
        process.env.VITE_PSI_ADMIN_SECRET ||
        process.env.PSI_ADMIN_SECRET ||
        '';

    const keyToUse = serviceRoleKey || anonKey;
    if (!supabaseUrl || !keyToUse) {
        throw new Error('Supabase 환경변수 누락');
    }

    return createClient(supabaseUrl, keyToUse, {
        global: {
            headers: psiAdminSecret ? { 'x-psi-admin-secret': psiAdminSecret } : {},
        },
    });
};

const toVectorLiteral = (values: number[]): string => {
    return `[${values.map((value) => Number(value).toFixed(8)).join(',')}]`;
};

const requestEmbedding = async (apiKey: string, text: string): Promise<number[]> => {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: { parts: [{ text }] },
                taskType: 'SEMANTIC_SIMILARITY',
            }),
        }
    );

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Embedding API 실패 (${response.status}): ${detail.slice(0, 300)}`);
    }

    const payload = await response.json();
    const values = payload?.embedding?.values;

    if (!Array.isArray(values) || values.length === 0) {
        throw new Error('Embedding 응답 파싱 실패');
    }

    return values.map((item: unknown) => Number(item)).filter((item: number) => Number.isFinite(item));
};

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    if (!isValidAdminAuthRequest(req)) {
        return sendUnauthorizedAdminResponse(res);
    }

    try {
        const body = (req.body || {}) as UpsertRequestBody;

        const sourceRecordId = String(body.sourceRecordId || '').trim();
        const safetyScore = Number(body.safetyScore || 0);
        const koreanText = String(body.koreanText || '').trim();

        if (!sourceRecordId) {
            return res.status(400).json({ ok: false, message: 'sourceRecordId가 필요합니다.' });
        }

        if (!Number.isFinite(safetyScore) || safetyScore < 80) {
            return res.status(200).json({ ok: true, skipped: true, reason: 'score_below_threshold' });
        }

        if (koreanText.length < 20) {
            return res.status(200).json({ ok: true, skipped: true, reason: 'text_too_short' });
        }

        const apiKey = resolveGeminiApiKey();
        if (!apiKey) {
            return res.status(200).json({ ok: true, skipped: true, reason: 'missing_gemini_key' });
        }

        const embedding = await requestEmbedding(apiKey, koreanText);
        if (embedding.length === 0) {
            return res.status(200).json({ ok: true, skipped: true, reason: 'embedding_empty' });
        }

        const supabase = getSupabaseClient();

        const payload = {
            source_record_id: sourceRecordId,
            safety_score: Math.round(Math.max(0, Math.min(100, safetyScore))),
            original_language: String(body.originalLanguage || 'ko').trim() || 'ko',
            ko_text: koreanText,
            actionable_coaching: String(body.actionableCoaching || '').trim() || null,
            job_field: String(body.jobField || '').trim() || null,
            nationality: String(body.nationality || '').trim() || null,
            approved_at: String(body.approvedAt || '').trim() || new Date().toISOString(),
            embedding: toVectorLiteral(embedding),
        };

        const { error } = await supabase
            .from('risk_best_practice_vectors')
            .upsert(payload, { onConflict: 'source_record_id' });

        if (error) {
            throw new Error(error.message);
        }

        return res.status(200).json({ ok: true, sourceRecordId, stored: true });
    } catch (error: any) {
        return res.status(500).json({
            ok: false,
            message: error?.message || 'best practice embedding 저장 실패',
        });
    }
}

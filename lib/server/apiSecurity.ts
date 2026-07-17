import { createHash } from 'node:crypto';

type QuotaResult = {
    allowed: boolean;
    count: number;
    retryAfterSeconds: number;
    mode: 'database' | 'development-memory';
};

type QuotaOptions = {
    scope: string;
    clientKeyHash: string;
    maxRequests: number;
    windowSeconds: number;
    metadata?: Record<string, unknown>;
};

type MemoryQuotaEntry = { timestamps: number[] };
const developmentQuota = new Map<string, MemoryQuotaEntry>();

const isMissingQuotaMigration = (error: any): boolean => {
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || '').toLowerCase();
    return code === 'PGRST202'
        || code === '42883'
        || message.includes('psi_consume_api_quota')
        || message.includes('api_security_events');
};

export const resolveRequestFingerprint = (req: any): string => {
    const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    const address = forwarded
        || String(req?.headers?.['x-real-ip'] || '').trim()
        || String(req?.socket?.remoteAddress || '').trim()
        || 'unknown';
    const userAgent = String(req?.headers?.['user-agent'] || '').slice(0, 240);
    return createHash('sha256').update(`${address}|${userAgent}`).digest('hex');
};

const consumeDevelopmentQuota = (options: QuotaOptions): QuotaResult => {
    const now = Date.now();
    const windowMs = Math.max(1, options.windowSeconds) * 1000;
    const key = `${options.scope}:${options.clientKeyHash}`;
    const previous = developmentQuota.get(key)?.timestamps || [];
    const active = previous.filter((timestamp) => now - timestamp < windowMs);
    const allowed = active.length < options.maxRequests;
    if (allowed) active.push(now);
    developmentQuota.set(key, { timestamps: active });

    const retryAfterSeconds = allowed || active.length === 0
        ? 0
        : Math.max(1, Math.ceil((windowMs - (now - active[0])) / 1000));

    return {
        allowed,
        count: active.length,
        retryAfterSeconds,
        mode: 'development-memory',
    };
};

export const consumeApiQuota = async (supabase: any, options: QuotaOptions): Promise<QuotaResult> => {
    const result = await supabase.rpc('psi_consume_api_quota', {
        p_scope: options.scope,
        p_client_key_hash: options.clientKeyHash,
        p_max_requests: options.maxRequests,
        p_window_seconds: options.windowSeconds,
        p_metadata: options.metadata || {},
    });

    if (result.error) {
        if (process.env.NODE_ENV !== 'production' && isMissingQuotaMigration(result.error)) {
            return consumeDevelopmentQuota(options);
        }
        const error = new Error(
            isMissingQuotaMigration(result.error)
                ? '보안 사용량 제한 마이그레이션이 적용되지 않았습니다.'
                : `보안 사용량 제한 확인 실패: ${result.error.message}`,
        ) as Error & { statusCode?: number; code?: string };
        error.statusCode = 503;
        error.code = 'SECURITY_QUOTA_UNAVAILABLE';
        throw error;
    }

    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    return {
        allowed: Boolean(row?.allowed),
        count: Number(row?.current_count || 0),
        retryAfterSeconds: Number(row?.retry_after_seconds || 0),
        mode: 'database',
    };
};

export const recordApiUsageEvent = async (
    supabase: any,
    event: {
        scope: string;
        clientKeyHash: string;
        outcome: 'success' | 'failure' | 'blocked';
        resourceId?: string;
        latencyMs?: number;
        metadata?: Record<string, unknown>;
    },
) => {
    const { error } = await supabase.from('api_usage_events').insert({
        scope: event.scope,
        client_key_hash: event.clientKeyHash,
        outcome: event.outcome,
        resource_id: event.resourceId || null,
        latency_ms: Number.isFinite(event.latencyMs) ? event.latencyMs : null,
        metadata: event.metadata || {},
        created_at: new Date().toISOString(),
    });

    if (error && process.env.NODE_ENV === 'production') {
        console.warn('[api-security] usage audit insert failed:', error.message);
    }
};

import { createHash } from 'node:crypto';

type QuotaResult = {
    allowed: boolean;
    count: number;
    retryAfterSeconds: number;
    mode: 'database' | 'development-memory' | 'authenticated-memory';
};

type QuotaOptions = {
    scope: string;
    clientKeyHash: string;
    maxRequests: number;
    windowSeconds: number;
    metadata?: Record<string, unknown>;
    /**
     * 관리자 인증이 먼저 완료된 고비용 작업에만 허용한다.
     * DB quota 장애 시에도 프로세스 단위 제한을 유지하며 작업을 계속한다.
     */
    allowAuthenticatedMemoryFallback?: boolean;
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
    const vercelForwarded = String(req?.headers?.['x-vercel-forwarded-for'] || '').split(',')[0].trim();
    const realIp = String(req?.headers?.['x-real-ip'] || '').split(',')[0].trim();
    const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    const address = vercelForwarded
        || realIp
        || forwarded
        || String(req?.socket?.remoteAddress || '').trim()
        || 'unknown';
    // User-Agent is attacker-controlled and must not create a fresh login quota
    // bucket. Salt the platform-provided address so the stored value is neither
    // plain IP data nor trivially reusable across PSI installations.
    const salt = process.env.PSI_SECURITY_FINGERPRINT_SALT
        || process.env.ADMIN_SESSION_SECRET
        || 'psi-request-fingerprint-v1';
    return createHash('sha256').update(`${salt}|${address.slice(0, 160)}`).digest('hex');
};

const consumeMemoryQuota = (
    options: QuotaOptions,
    mode: 'development-memory' | 'authenticated-memory',
): QuotaResult => {
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
        mode,
    };
};

export const consumeApiQuota = async (supabase: any, options: QuotaOptions): Promise<QuotaResult> => {
    let result: { data?: any; error?: any };
    try {
        if (!supabase?.rpc) {
            throw Object.assign(new Error('Supabase quota client is unavailable.'), {
                code: 'SUPABASE_CLIENT_UNAVAILABLE',
            });
        }
        result = await supabase.rpc('psi_consume_api_quota', {
            p_scope: options.scope,
            p_client_key_hash: options.clientKeyHash,
            p_max_requests: options.maxRequests,
            p_window_seconds: options.windowSeconds,
            p_metadata: options.metadata || {},
        });
    } catch (cause) {
        result = {
            data: null,
            error: {
                code: String((cause as any)?.code || 'SUPABASE_TRANSPORT_ERROR'),
                message: cause instanceof Error ? cause.message : 'Supabase quota transport failed.',
            },
        };
    }

    if (result.error) {
        if (process.env.NODE_ENV !== 'production' && isMissingQuotaMigration(result.error)) {
            return consumeMemoryQuota(options, 'development-memory');
        }
        if (options.allowAuthenticatedMemoryFallback) {
            console.warn('[api-security] database quota unavailable; authenticated memory limiter enabled', {
                scope: options.scope,
                upstreamCode: String(result.error?.code || 'UNKNOWN').slice(0, 40),
            });
            return consumeMemoryQuota(options, 'authenticated-memory');
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
    try {
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
    } catch (error) {
        if (process.env.NODE_ENV === 'production') {
            console.warn(
                '[api-security] usage audit transport failed:',
                error instanceof Error ? error.message : 'unknown transport error',
            );
        }
    }
};

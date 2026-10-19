import { createClient } from '@supabase/supabase-js';

interface SupabaseServerClientOptions {
    errorMessage?: string;
    includeAdminSecret?: boolean;
}

export const createSupabaseServerClient = (options: SupabaseServerClientOptions = {}) => {
    const firstConfigured = (names: string[]) => names.map(name => String(process.env[name] || '').trim()).find(Boolean) || '';
    // Keep deployed legacy precedence; accept the standard server-only name as a fallback.
    const supabaseUrl = firstConfigured(['VITE_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_URL']);
    const serviceRoleKey = firstConfigured(['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SERVICE_KEY','SERVICE_ROLE_KEY']);
    if (!supabaseUrl || !serviceRoleKey) {
        throw Object.assign(new Error(options.errorMessage || 'Supabase 서버 환경변수가 누락되었습니다. SUPABASE_SERVICE_ROLE_KEY를 확인해 주세요.'), {
            code: 'SUPABASE_SERVER_CONFIG_MISSING',
            missingConfig: [...(!supabaseUrl ? ['url'] : []), ...(!serviceRoleKey ? ['serviceRoleKey'] : [])],
        });
    }

    const adminSecret = options.includeAdminSecret === false
        ? ''
        : process.env.PSI_ADMIN_SECRET || '';

    return createClient(supabaseUrl, serviceRoleKey, {
        global: {
            headers: adminSecret ? { 'x-psi-admin-secret': adminSecret } : {},
        },
    });
};

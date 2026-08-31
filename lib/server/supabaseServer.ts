import { createClient } from '@supabase/supabase-js';

interface SupabaseServerClientOptions {
    errorMessage?: string;
    includeAdminSecret?: boolean;
}

export const createSupabaseServerClient = (options: SupabaseServerClientOptions = {}) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceRoleKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY
        || process.env.SUPABASE_SERVICE_KEY
        || process.env.SERVICE_ROLE_KEY
        || '';

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error(
            options.errorMessage
            || 'Supabase 서버 환경변수가 누락되었습니다. SUPABASE_SERVICE_ROLE_KEY를 확인해 주세요.',
        );
    }

    const adminSecret = options.includeAdminSecret === false
        ? ''
        : process.env.VITE_PSI_ADMIN_SECRET || process.env.PSI_ADMIN_SECRET || '';

    return createClient(supabaseUrl, serviceRoleKey, {
        global: {
            headers: adminSecret ? { 'x-psi-admin-secret': adminSecret } : {},
        },
    });
};

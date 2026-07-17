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
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const keyToUse = serviceRoleKey || anonKey;

    if (!supabaseUrl || !keyToUse) {
        throw new Error(options.errorMessage || 'Supabase 환경변수가 누락되었습니다.');
    }

    const adminSecret = options.includeAdminSecret === false
        ? ''
        : process.env.VITE_PSI_ADMIN_SECRET || process.env.PSI_ADMIN_SECRET || '';

    return createClient(supabaseUrl, keyToUse, {
        global: {
            headers: adminSecret ? { 'x-psi-admin-secret': adminSecret } : {},
        },
    });
};

import { createClient } from '@supabase/supabase-js';

const resolveSupabaseEnv = () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        const message = '[Supabase] 환경변수 누락: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 또는 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY를 확인하세요.';
        throw new Error(message);
    }

    return { supabaseUrl, supabaseAnonKey };
};

const { supabaseUrl, supabaseAnonKey } = resolveSupabaseEnv();
const psiAdminSecret = import.meta.env.VITE_PSI_ADMIN_SECRET;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
        headers: psiAdminSecret
            ? { 'x-psi-admin-secret': psiAdminSecret }
            : {},
    },
});

type SupabaseErrorLike = {
    message?: string;
    code?: string;
    status?: number;
    details?: string;
    hint?: string;
};

const toErrorMessage = (error: SupabaseErrorLike): string => {
    return String(error.message || error.details || error.hint || 'Unknown Supabase error');
};

export const isSupabasePermissionError = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false;
    const parsed = error as SupabaseErrorLike;
    const msg = toErrorMessage(parsed).toLowerCase();

    return (
        parsed.status === 401 ||
        parsed.status === 403 ||
        parsed.code === '42501' ||
        msg.includes('forbidden') ||
        msg.includes('permission denied') ||
        msg.includes('not authorized') ||
        msg.includes('row-level security') ||
        msg.includes('rls')
    );
};

export const handleSupabasePermissionError = (error: unknown): boolean => {
    if (!isSupabasePermissionError(error)) return false;
    window.alert('권한이 없거나 관리자 승인이 필요합니다');
    return true;
};

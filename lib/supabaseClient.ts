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

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

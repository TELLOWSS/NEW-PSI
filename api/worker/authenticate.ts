import { createClient } from '@supabase/supabase-js';

type AuthKeyType = 'phone' | 'birthDate' | 'passport';

function getSupabaseClient() {
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
        throw new Error('Supabase 환경변수가 누락되었습니다. SUPABASE_SERVICE_ROLE_KEY 또는 VITE_SUPABASE_ANON_KEY를 확인해 주세요.');
    }

    return createClient(supabaseUrl, keyToUse, {
        global: {
            headers: psiAdminSecret ? { 'x-psi-admin-secret': psiAdminSecret } : {},
        },
    });
}

const AUTH_FAIL_MESSAGE = '근로자 명부에 등록되지 않은 정보입니다. 관리자에게 문의하세요.';

const normalizePhone = (raw: string) => raw.replace(/\D/g, '');
const normalizeBirthDate = (raw: string) => raw.replace(/\D/g, '');
const normalizePassport = (raw: string) => raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    try {
        const { keyType, keyValue } = req.body || {};
        const normalizedType = String(keyType || '').trim() as AuthKeyType;
        const rawValue = String(keyValue || '').trim();

        if (!normalizedType || !rawValue) {
            return res.status(400).json({ ok: false, message: '본인 확인 정보가 필요합니다.' });
        }

        const supabase = getSupabaseClient();

        const workerRowsRes = await supabase
            .from('workers')
            .select('id, name, nationality, phone_number, birth_date, passport_number')
            .limit(5000);

        if (workerRowsRes.error) throw new Error(workerRowsRes.error.message);
        const workerRows = workerRowsRes.data || [];

        if (normalizedType === 'phone') {
            const value = normalizePhone(rawValue);
            if (!value) {
                return res.status(400).json({ ok: false, message: '핸드폰 번호를 확인해 주세요.' });
            }
            const matched = workerRows.find((row: any) => normalizePhone(String(row?.phone_number || '')) === value);
            if (!matched) {
                return res.status(403).json({ ok: false, message: AUTH_FAIL_MESSAGE });
            }

            return res.status(200).json({
                ok: true,
                worker: {
                    worker_id: String(matched.id || ''),
                    name: String(matched.name || ''),
                    nationality: String(matched.nationality || ''),
                },
            });
        }

        if (normalizedType === 'birthDate') {
            const value = normalizeBirthDate(rawValue);
            if (!(value.length === 6 || value.length === 8)) {
                return res.status(400).json({ ok: false, message: '생년월일은 6자리 또는 8자리로 입력해 주세요.' });
            }

            const matched = workerRows.find((row: any) => normalizeBirthDate(String(row?.birth_date || '')) === value);
            if (!matched) {
                return res.status(403).json({ ok: false, message: AUTH_FAIL_MESSAGE });
            }

            return res.status(200).json({
                ok: true,
                worker: {
                    worker_id: String(matched.id || ''),
                    name: String(matched.name || ''),
                    nationality: String(matched.nationality || ''),
                },
            });
        }

        if (normalizedType === 'passport') {
            const value = normalizePassport(rawValue);
            if (!value) {
                return res.status(400).json({ ok: false, message: '여권번호를 확인해 주세요.' });
            }

            const matched = workerRows.find((row: any) => normalizePassport(String(row?.passport_number || '')) === value);
            if (!matched) {
                return res.status(403).json({ ok: false, message: AUTH_FAIL_MESSAGE });
            }

            return res.status(200).json({
                ok: true,
                worker: {
                    worker_id: String(matched.id || ''),
                    name: String(matched.name || ''),
                    nationality: String(matched.nationality || ''),
                },
            });
        }

        return res.status(400).json({ ok: false, message: '지원하지 않는 본인 확인 방식입니다.' });
    } catch (error: any) {
        return res.status(500).json({ ok: false, message: error?.message || '근로자 본인 확인 실패' });
    }
}

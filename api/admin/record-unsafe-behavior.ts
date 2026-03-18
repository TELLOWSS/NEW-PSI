/**
 * POST /api/admin/record-unsafe-behavior
 *
 * 현장 불안전행동 관찰 기록 등록 (단건 + 배열 일괄 처리 모두 지원)
 *
 * Body 형식:
 *   단건: { worker_id, assessment_month, unsafe_behavior_flag, unsafe_behavior_type, ... }
 *   일괄: { records: [ { worker_id, ... }, ... ] }
 *
 * 응답:
 *   { ok: true, inserted: number, ids: string[] }
 */

import { createClient } from '@supabase/supabase-js';

// service_role 키로 RLS 우회 (관리자 전용 엔드포인트)
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// -----------------------------------------------------------------------
// 프리셋 불안전행동 목록 (API 레벨 허용값)
// 클라이언트 UI와 동기화되어야 함
// -----------------------------------------------------------------------
export const UNSAFE_BEHAVIOR_PRESETS = [
    '안전대 미체결',
    '개구부 접근',
    '보호구 미착용',
    '안전모 미착용',
    '작업발판 미설치',
    '추락방호망 미설치',
    '정리정돈 불량',
    '무단 작업구역 진입',
    '전기 안전수칙 위반',
    '화기 취급 부주의',
    '중장비 작업반경 내 접근',
    '안전통로 미확보',
    '기타',
] as const;

export type UnsafeBehaviorPreset = (typeof UNSAFE_BEHAVIOR_PRESETS)[number] | string;

// -----------------------------------------------------------------------
interface ObservationInput {
    worker_id: string;
    assessment_month: string;         // 'YYYY-MM'
    observed_at?: string;             // ISO 8601
    observer_name?: string;
    unsafe_behavior_flag: boolean;
    unsafe_behavior_type?: UnsafeBehaviorPreset;
    severity_level?: '낮음' | '보통' | '높음' | '즉시조치';
    evidence_note?: string;
    evidence_photo_url?: string;
    related_risk_category?: string;
}

function normalizeRecord(raw: ObservationInput) {
    const assessment_month = String(raw.assessment_month || '').trim();
    if (!assessment_month.match(/^\d{4}-\d{2}$/)) {
        throw new Error(`assessment_month 형식 오류: '${assessment_month}' (YYYY-MM 필요)`);
    }
    if (!raw.worker_id) throw new Error('worker_id 필수');
    return {
        worker_id: String(raw.worker_id).trim(),
        assessment_month,
        observed_at: raw.observed_at || null,
        observer_name: raw.observer_name?.trim() || null,
        unsafe_behavior_flag: Boolean(raw.unsafe_behavior_flag),
        unsafe_behavior_type: raw.unsafe_behavior_type?.trim() || null,
        severity_level: raw.severity_level || null,
        evidence_note: raw.evidence_note?.trim() || null,
        evidence_photo_url: raw.evidence_photo_url?.trim() || null,
        related_risk_category: raw.related_risk_category?.trim() || null,
        created_at: new Date().toISOString(),
    };
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    try {
        const body = req.body || {};

        // 단건 또는 일괄 처리 모두 배열로 정규화
        const rawList: ObservationInput[] = Array.isArray(body.records)
            ? body.records
            : [body];

        if (rawList.length === 0) {
            return res.status(400).json({ ok: false, message: '등록할 데이터가 없습니다.' });
        }

        if (rawList.length > 100) {
            return res.status(400).json({ ok: false, message: '1회 최대 100건까지 등록 가능합니다.' });
        }

        let normalizedRows;
        try {
            normalizedRows = rawList.map(normalizeRecord);
        } catch (validationErr: any) {
            return res.status(400).json({ ok: false, message: validationErr.message });
        }

        const { data, error } = await supabase
            .from('safety_behavior_observations')
            .insert(normalizedRows)
            .select('id');

        if (error) {
            console.error('[record-unsafe-behavior] supabase error:', error);
            return res.status(500).json({ ok: false, message: error.message });
        }

        const ids = (data || []).map((row: any) => row.id);

        // 불안전행동이 실제 발생한 경우 → 해당 월 worker_integrity_reviews 상태를 검증보류로 상향
        const flaggedWorkerMonths = normalizedRows
            .filter((r) => r.unsafe_behavior_flag)
            .map((r) => ({ worker_id: r.worker_id, assessment_month: r.assessment_month }));

        if (flaggedWorkerMonths.length > 0) {
            // upsert: 이미 검증보류·재교육필요·관리자검토인 건은 건드리지 않음
            // 확정 상태인 건만 검증보류로 내림 (불안전행동 신규 등록 시 재검토)
            for (const { worker_id, assessment_month } of flaggedWorkerMonths) {
                await supabase
                    .from('worker_integrity_reviews')
                    .upsert(
                        {
                            worker_id,
                            assessment_month,
                            integrity_status: '검증보류',
                            integrity_reason_codes: ['COACHING_MISSING'],
                            updated_at: new Date().toISOString(),
                        },
                        {
                            onConflict: 'worker_id,assessment_month',
                            ignoreDuplicates: false,
                        }
                    )
                    .eq('integrity_status', '확정');  // 확정 건만 재보류
            }
        }

        return res.status(200).json({
            ok: true,
            inserted: ids.length,
            ids,
        });
    } catch (err: any) {
        console.error('[record-unsafe-behavior] unexpected error:', err);
        return res.status(500).json({ ok: false, message: err?.message || '서버 오류' });
    }
}

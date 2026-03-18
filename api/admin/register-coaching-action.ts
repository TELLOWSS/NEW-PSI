/**
 * POST /api/admin/register-coaching-action
 *
 * 현장 코칭/재교육 조치 등록 (단건 + 배열 일괄 처리 모두 지원)
 *
 * Body 형식:
 *   단건: { worker_id, assessment_month, action_type, action_completed_at, ... }
 *   일괄: { records: [ { worker_id, ... }, ... ] }
 *
 * 응답:
 *   { ok: true, inserted: number, ids: string[] }
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// -----------------------------------------------------------------------
// 프리셋 코칭 조치 유형 (UI와 동기화)
// -----------------------------------------------------------------------
export const COACHING_ACTION_PRESETS = [
    '재교육',
    '현장코칭',
    '작업중지',
    '보호구개선',
    '안전조회 특별교육',
    '서면경고',
    '기타',
] as const;

export type CoachingActionPreset = (typeof COACHING_ACTION_PRESETS)[number] | string;

interface CoachingActionInput {
    worker_id: string;
    assessment_month: string;           // 'YYYY-MM'
    source_observation_id?: string;     // 연결된 불안전행동 observation UUID
    action_type: CoachingActionPreset;
    action_detail?: string;
    action_completed_at: string;        // ISO 8601
    coach_name?: string;
    followup_result?: '개선됨' | '재발' | '확인중';
    followup_checked_at?: string;
}

function normalizeRecord(raw: CoachingActionInput) {
    const assessment_month = String(raw.assessment_month || '').trim();
    if (!assessment_month.match(/^\d{4}-\d{2}$/)) {
        throw new Error(`assessment_month 형식 오류: '${assessment_month}' (YYYY-MM 필요)`);
    }
    if (!raw.worker_id) throw new Error('worker_id 필수');
    if (!raw.action_type) throw new Error('action_type 필수');
    if (!raw.action_completed_at) throw new Error('action_completed_at 필수');

    return {
        worker_id: String(raw.worker_id).trim(),
        assessment_month,
        source_observation_id: raw.source_observation_id?.trim() || null,
        action_type: raw.action_type,
        action_detail: raw.action_detail?.trim() || null,
        action_completed_at: raw.action_completed_at,
        coach_name: raw.coach_name?.trim() || null,
        followup_result: raw.followup_result || null,
        followup_checked_at: raw.followup_checked_at || null,
        created_at: new Date().toISOString(),
    };
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    try {
        const body = req.body || {};

        // 단건 또는 일괄 처리 정규화
        const rawList: CoachingActionInput[] = Array.isArray(body.records)
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
            .from('safety_coaching_actions')
            .insert(normalizedRows)
            .select('id');

        if (error) {
            console.error('[register-coaching-action] supabase error:', error);
            return res.status(500).json({ ok: false, message: error.message });
        }

        const ids = (data || []).map((row: any) => row.id);

        // 코칭 완료됐고 결과가 '개선됨'이면 → integrity_reviews 상태 업데이트 시도
        const improvedRecords = normalizedRows.filter(
            (r) => r.followup_result === '개선됨'
        );
        for (const rec of improvedRecords) {
            // '검증보류' 상태이고 COACHING_MISSING 코드만 있는 경우 → 삭제(코칭 완료로 해소)
            // 실제 판정은 evaluate-worker-integrity API에서 종합 처리
            // 여기서는 'COACHING_MISSING' reason code만 제거하는 부분 업데이트
            const { data: reviewData } = await supabase
                .from('worker_integrity_reviews')
                .select('id, integrity_reason_codes')
                .eq('worker_id', rec.worker_id)
                .eq('assessment_month', rec.assessment_month)
                .single();

            if (reviewData) {
                const updatedCodes = (reviewData.integrity_reason_codes || []).filter(
                    (code: string) => code !== 'COACHING_MISSING'
                );
                // 모든 reason_codes 해소 시 상태를 '확정 대기'로 표시(evaluate API가 최종 확정)
                const newStatus =
                    updatedCodes.length === 0 ? '검증보류' : undefined;

                await supabase
                    .from('worker_integrity_reviews')
                    .update({
                        integrity_reason_codes: updatedCodes,
                        ...(newStatus ? { integrity_status: newStatus } : {}),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', reviewData.id);
            }
        }

        return res.status(200).json({
            ok: true,
            inserted: ids.length,
            ids,
        });
    } catch (err: any) {
        console.error('[register-coaching-action] unexpected error:', err);
        return res.status(500).json({ ok: false, message: err?.message || '서버 오류' });
    }
}

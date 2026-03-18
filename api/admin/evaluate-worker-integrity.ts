/**
 * POST /api/admin/evaluate-worker-integrity
 *
 * 근로자 월별 안전역량 무결성 자동 판정 (5게이트 평가 로직)
 *
 * Body 형식:
 *   {
 *     worker_ids: string[],
 *     assessment_month: string,          // 'YYYY-MM'
 *     education_session_id?: string,
 *     override_document_scores?: Record<string, number>  // worker_id → 0~100 점수
 *   }
 *
 * 응답:
 *   {
 *     ok: true,
 *     assessment_month: string,
 *     results: Array<{
 *       worker_id: string,
 *       integrity_status: IntegrityStatus,
 *       integrity_reason_codes: IntegrityReasonCode[],
 *       computed_score: number,
 *       traffic_light: 'green' | 'yellow' | 'red',
 *     }>
 *   }
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// -----------------------------------------------------------------------
// 타입
// -----------------------------------------------------------------------
type IntegrityStatus = '확정' | '검증보류' | '재교육필요' | '관리자검토';
type IntegrityReasonCode =
    | 'EDUCATION_INCOMPLETE'
    | 'COACHING_MISSING'
    | 'REPEAT_VIOLATION'
    | 'TIMELINE_MISMATCH'
    | 'DOCUMENT_INSUFFICIENT'
    | 'FOLLOWUP_PENDING';
type TrafficLight = 'green' | 'yellow' | 'red';

interface EvalResult {
    worker_id: string;
    integrity_status: IntegrityStatus;
    integrity_reason_codes: IntegrityReasonCode[];
    computed_score: number;    // 0~100
    traffic_light: TrafficLight;
}

// -----------------------------------------------------------------------
// 5게이트 판정 로직
// -----------------------------------------------------------------------
interface GateContext {
    workerId: string;
    assessmentMonth: string;
    educationCompleted: boolean;
    signatureSubmitted: boolean;
    unsafeBehaviorFlag: boolean;
    unsafeBehaviorCount: number;
    repeatViolationCount: number;           // 최근 3개월 불안전행동 건수
    coachingCompletedCount: number;         // 해당 월 코칭완료 건수
    coachingPendingCount: number;           // followup_result = '확인중' 건수
    documentScore: number;                  // 0~100 (OCR/위험성평가 문서 점수)
    timelineIsValid: boolean;               // 교육 → 서명 → 기록 순서 일치 여부
}

function runGates(ctx: GateContext): { status: IntegrityStatus; codes: IntegrityReasonCode[]; score: number } {
    const codes: IntegrityReasonCode[] = [];

    // Gate 1: 교육 및 서명 완료 여부
    if (!ctx.educationCompleted || !ctx.signatureSubmitted) {
        codes.push('EDUCATION_INCOMPLETE');
    }

    // Gate 2: 문서 점수 기준 (60점 미만 → 미흡)
    if (ctx.documentScore < 60) {
        codes.push('DOCUMENT_INSUFFICIENT');
    }

    // Gate 3: 불안전행동 발생 시 코칭 완료 여부
    if (ctx.unsafeBehaviorFlag && ctx.coachingCompletedCount === 0) {
        codes.push('COACHING_MISSING');
    }
    if (ctx.coachingPendingCount > 0) {
        codes.push('FOLLOWUP_PENDING');
    }

    // Gate 4: 반복 위반 여부 (최근 3개월 2건 이상)
    if (ctx.repeatViolationCount >= 2) {
        codes.push('REPEAT_VIOLATION');
    }

    // Gate 5: 타임라인 유효성
    if (!ctx.timelineIsValid) {
        codes.push('TIMELINE_MISMATCH');
    }

    // ---- 종합 점수 계산 (0~100) ----
    let score = ctx.documentScore;                     // 기본: 문서 점수 (w1~w3)

    // 실천축 보정 (w4~w6)
    if (ctx.educationCompleted && ctx.signatureSubmitted) score = Math.min(score + 10, 100);
    if (ctx.unsafeBehaviorFlag) score = Math.max(score - 20, 0);   // 불안전행동 페널티
    if (ctx.repeatViolationCount >= 2) score = Math.max(score - 20, 0);
    if (ctx.coachingCompletedCount > 0) score = Math.min(score + 10, 100);  // 코칭 완료 보상

    // ---- 상태 결정 ----
    let status: IntegrityStatus;
    if (codes.length === 0) {
        status = score >= 80 ? '확정' : '검증보류';
    } else if (codes.includes('REPEAT_VIOLATION') || codes.includes('EDUCATION_INCOMPLETE')) {
        status = '재교육필요';
    } else if (codes.includes('TIMELINE_MISMATCH') || codes.includes('DOCUMENT_INSUFFICIENT')) {
        status = '관리자검토';
    } else {
        status = '검증보류';
    }

    return { status, codes, score };
}

function toTrafficLight(status: IntegrityStatus, score: number): TrafficLight {
    if (status === '확정' && score >= 80) return 'green';
    if (status === '재교육필요' || score < 50) return 'red';
    return 'yellow';
}

// -----------------------------------------------------------------------
// 헬퍼: 타임라인 검증
// 교육일시 ≤ 서명일시 ≤ 위험성평가 기록일시 순서여야 함
// -----------------------------------------------------------------------
function checkTimeline(
    educationAt: string | null,
    signatureAt: string | null,
    assessmentRecordAt: string | null
): boolean {
    if (!educationAt || !signatureAt) return false;
    const edu = new Date(educationAt).getTime();
    const sig = new Date(signatureAt).getTime();
    if (edu > sig) return false;
    if (assessmentRecordAt) {
        const rec = new Date(assessmentRecordAt).getTime();
        if (sig > rec) return false;
    }
    return true;
}

// -----------------------------------------------------------------------
// 메인 핸들러
// -----------------------------------------------------------------------
export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    try {
        const body = req.body || {};
        const { worker_ids, assessment_month, education_session_id, override_document_scores } = body;

        if (!Array.isArray(worker_ids) || worker_ids.length === 0) {
            return res.status(400).json({ ok: false, message: 'worker_ids 배열 필수' });
        }
        if (!assessment_month?.match(/^\d{4}-\d{2}$/)) {
            return res.status(400).json({ ok: false, message: 'assessment_month 형식 오류 (YYYY-MM)' });
        }
        if (worker_ids.length > 200) {
            return res.status(400).json({ ok: false, message: '1회 최대 200명까지 평가 가능합니다.' });
        }

        // ---- 3개월 범위 계산 (반복위반 체크용) ----
        const [year, month] = assessment_month.split('-').map(Number);
        const threeMonthsAgo = new Date(year, month - 4, 1).toISOString().slice(0, 7); // 3개월 전

        // ---- 데이터 병렬 조회 ----
        const [trainingRes, observationsRes, coachingRes, threeMonthObsRes] = await Promise.all([
            // 1) 교육 이수 현황 (현재 월)
            supabase
                .from('training_logs')
                .select('worker_id, created_at, signature_data, signature_method, selected_language_code, assessment_month')
                .in('worker_id', worker_ids)
                .eq('assessment_month', assessment_month),

            // 2) 불안전행동 관찰 기록 (현재 월)
            supabase
                .from('safety_behavior_observations')
                .select('worker_id, unsafe_behavior_flag, observed_at')
                .in('worker_id', worker_ids)
                .eq('assessment_month', assessment_month),

            // 3) 코칭 조치 현황 (현재 월)
            supabase
                .from('safety_coaching_actions')
                .select('worker_id, followup_result, action_completed_at')
                .in('worker_id', worker_ids)
                .eq('assessment_month', assessment_month),

            // 4) 최근 3개월 불안전행동 (반복위반 체크)
            supabase
                .from('safety_behavior_observations')
                .select('worker_id, unsafe_behavior_flag')
                .in('worker_id', worker_ids)
                .eq('unsafe_behavior_flag', true)
                .gte('assessment_month', threeMonthsAgo)
                .lt('assessment_month', assessment_month),
        ]);

        if (trainingRes.error) {
            console.error('[evaluate-worker-integrity] training query error:', trainingRes.error);
        }

        // ---- 근로자별 데이터 맵 ----
        const trainingMap = new Map<string, any>();
        (trainingRes.data || []).forEach((row: any) => {
            if (!trainingMap.has(row.worker_id)) trainingMap.set(row.worker_id, row);
        });

        const observationMap = new Map<string, any[]>();
        (observationsRes.data || []).forEach((row: any) => {
            if (!observationMap.has(row.worker_id)) observationMap.set(row.worker_id, []);
            observationMap.get(row.worker_id)!.push(row);
        });

        const coachingMap = new Map<string, any[]>();
        (coachingRes.data || []).forEach((row: any) => {
            if (!coachingMap.has(row.worker_id)) coachingMap.set(row.worker_id, []);
            coachingMap.get(row.worker_id)!.push(row);
        });

        const repeatViolationMap = new Map<string, number>();
        (threeMonthObsRes.data || []).forEach((row: any) => {
            if (row.unsafe_behavior_flag) {
                repeatViolationMap.set(row.worker_id, (repeatViolationMap.get(row.worker_id) || 0) + 1);
            }
        });

        // ---- 각 근로자 평가 ----
        const evalResults: EvalResult[] = [];
        const upsertRows: any[] = [];

        for (const workerId of worker_ids) {
            const training = trainingMap.get(workerId);
            const observations = observationMap.get(workerId) || [];
            const coachings = coachingMap.get(workerId) || [];

            const educationCompleted = !!training;
            const signatureSubmitted = !!(training?.signature_data || training?.signature_method);
            const unsafeBehaviorFlag = observations.some((o: any) => o.unsafe_behavior_flag);
            const unsafeBehaviorCount = observations.filter((o: any) => o.unsafe_behavior_flag).length;
            const repeatViolationCount = repeatViolationMap.get(workerId) || 0;
            const coachingCompleted = coachings.filter((c: any) => c.followup_result === '개선됨');
            const coachingPending = coachings.filter(
                (c: any) => !c.followup_result || c.followup_result === '확인중'
            );

            // 타임라인 검증 (교육 → 서명 → 기록 순서)
            const educationAt = training?.created_at || null;
            const signatureAt = training?.created_at || null; // TODO: 서명 별도 타임스탬프 컬럼 있으면 대체
            const timelineIsValid =
                educationCompleted && signatureSubmitted
                    ? checkTimeline(educationAt, signatureAt, null)
                    : false;

            // 문서 점수 (override 우선, 없으면 기본값 70점)
            const documentScore =
                override_document_scores && workerId in override_document_scores
                    ? Number(override_document_scores[workerId])
                    : 70;

            const ctx: GateContext = {
                workerId,
                assessmentMonth: assessment_month,
                educationCompleted,
                signatureSubmitted,
                unsafeBehaviorFlag,
                unsafeBehaviorCount,
                repeatViolationCount,
                coachingCompletedCount: coachingCompleted.length,
                coachingPendingCount: coachingPending.length,
                documentScore,
                timelineIsValid,
            };

            const { status, codes, score } = runGates(ctx);
            const trafficLight = toTrafficLight(status, score);

            evalResults.push({
                worker_id: workerId,
                integrity_status: status,
                integrity_reason_codes: codes,
                computed_score: score,
                traffic_light: trafficLight,
            });

            upsertRows.push({
                worker_id: workerId,
                assessment_month,
                integrity_status: status,
                integrity_reason_codes: codes,
                computed_score: score,
                education_session_id: education_session_id || null,
                updated_at: new Date().toISOString(),
            });
        }

        // ---- DB upsert (worker_id + assessment_month UNIQUE) ----
        if (upsertRows.length > 0) {
            const { error: upsertError } = await supabase
                .from('worker_integrity_reviews')
                .upsert(upsertRows, { onConflict: 'worker_id,assessment_month' });

            if (upsertError) {
                console.error('[evaluate-worker-integrity] upsert error:', upsertError);
                return res.status(500).json({ ok: false, message: upsertError.message });
            }
        }

        return res.status(200).json({
            ok: true,
            assessment_month,
            evaluated: evalResults.length,
            results: evalResults,
        });
    } catch (err: any) {
        console.error('[evaluate-worker-integrity] unexpected error:', err);
        return res.status(500).json({ ok: false, message: err?.message || '서버 오류' });
    }
}

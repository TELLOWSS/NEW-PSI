/**
 * POST /api/admin/safety-management
 *
 * 안전행동/근로자 관리 통합 API (4가지 액션)
 *
 * Body 형식:
 *   {
 *     action: 'record-unsafe-behavior' | 'register-coaching-action' | 'evaluate-worker-integrity' | 'bulk-upload-workers',
 *     payload: { ... 액션별 필드 }
 *   }
 *
 * 응답:
 *   { ok: true, action: string, data: { ... } }
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// -----------------------------------------------------------------------
// 프리셋 상수
// -----------------------------------------------------------------------
export const UNSAFE_BEHAVIOR_PRESETS = [
    '안전대 미체결', '개구부 접근', '보호구 미착용', '안전모 미착용',
    '작업발판 미설치', '추락방호망 미설치', '정리정돈 불량', '무단 작업구역 진입',
    '전기 안전수칙 위반', '화기 취급 부주의', '중장비 작업반경 내 접근',
    '안전통로 미확보', '기타',
] as const;

export const COACHING_ACTION_PRESETS = [
    '재교육', '현장코칭', '작업중지', '보호구개선', '안전조회 특별교육', '서면경고', '기타',
] as const;

const ALLOWED_JOB_FIELDS = [
    '형틀',
    '철근',
    '갱폼',
    '알폼',
    '시스템',
    '할석미장견출',
    '해체정리',
    '직영(용역포함)',
    '콘크리트비계',
] as const;

const JOB_FIELD_ALIASES: Record<string, string> = {
    '형틀': '형틀',
    '철근': '철근',
    '갱폼': '갱폼',
    '알폼': '알폼',
    '시스템': '시스템',
    '할석미장견출': '할석미장견출',
    '해체정리': '해체정리',
    '직영(용역포함)': '직영(용역포함)',
    '직영용역포함': '직영(용역포함)',
    '직영': '직영(용역포함)',
    '콘크리트비계': '콘크리트비계',
};

// -----------------------------------------------------------------------
// 유틸
// -----------------------------------------------------------------------
function checkTimeline(educationAt: string | null, signatureAt: string | null): boolean {
    if (!educationAt || !signatureAt) return false;
    return new Date(educationAt).getTime() <= new Date(signatureAt).getTime();
}

function normalizePhone(raw: string): string {
    return String(raw || '').replace(/\D/g, '');
}

function normalizeBirthDate(raw: string): string {
    return String(raw || '').replace(/\D/g, '');
}

function normalizePassport(raw: string): string {
    return String(raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function normalizeJobField(raw: string): string {
    const base = String(raw || '').trim();
    if (!base) return '';
    const compact = base.replace(/\s+/g, '');
    return JOB_FIELD_ALIASES[compact] || JOB_FIELD_ALIASES[base] || base;
}

// -----------------------------------------------------------------------
// 액션 1: 불안전행동 기록
// -----------------------------------------------------------------------
async function handleRecordUnsafeBehavior(payload: any): Promise<any> {
    const body = payload || {};
    const rawList = Array.isArray(body.records) ? body.records : [body];

    if (rawList.length === 0) throw new Error('등록할 데이터가 없습니다.');
    if (rawList.length > 100) throw new Error('1회 최대 100건까지 등록 가능합니다.');

    const normalizedRows = rawList.map((raw: any) => {
        const assessmentMonth = String(raw.assessment_month || '').trim();
        if (!assessmentMonth.match(/^\d{4}-\d{2}$/)) {
            throw new Error(`assessment_month 형식 오류: '${assessmentMonth}' (YYYY-MM 필요)`);
        }
        if (!raw.worker_id) throw new Error('worker_id 필수');

        return {
            worker_id: String(raw.worker_id).trim(),
            assessment_month: assessmentMonth,
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
    });

    const { data, error } = await supabase
        .from('safety_behavior_observations')
        .insert(normalizedRows)
        .select('id');

    if (error) throw new Error(error.message);

    const ids = (data || []).map((row: any) => row.id);

    // 불안전행동 발생 시 해당 월 무결성 상태를 검증보류로 전환
    const flaggedWorkerMonths = normalizedRows
        .filter((r) => r.unsafe_behavior_flag)
        .map((r) => ({ worker_id: r.worker_id, assessment_month: r.assessment_month }));

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
                { onConflict: 'worker_id,assessment_month', ignoreDuplicates: false }
            )
            .eq('integrity_status', '확정');
    }

    return { inserted: ids.length, ids };
}

// -----------------------------------------------------------------------
// 액션 2: 코칭 조치
// -----------------------------------------------------------------------
async function handleRegisterCoachingAction(payload: any): Promise<any> {
    const body = payload || {};
    const rawList = Array.isArray(body.records) ? body.records : [body];

    if (rawList.length === 0) throw new Error('등록할 데이터가 없습니다.');
    if (rawList.length > 100) throw new Error('1회 최대 100건까지 등록 가능합니다.');

    const normalizedRows = rawList.map((raw: any) => {
        const assessmentMonth = String(raw.assessment_month || '').trim();
        if (!assessmentMonth.match(/^\d{4}-\d{2}$/)) {
            throw new Error(`assessment_month 형식 오류: '${assessmentMonth}' (YYYY-MM 필요)`);
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
    });

    const { data, error } = await supabase
        .from('safety_coaching_actions')
        .insert(normalizedRows)
        .select('id');

    if (error) throw new Error(error.message);

    const ids = (data || []).map((row: any) => row.id);

    // 코칭 완료하고 결과가 '개선됨'이면 reason code 정리
    const improvedRecords = normalizedRows.filter((r) => r.followup_result === '개선됨');
    for (const rec of improvedRecords) {
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
            await supabase
                .from('worker_integrity_reviews')
                .update({
                    integrity_reason_codes: updatedCodes,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', reviewData.id);
        }
    }

    return { inserted: ids.length, ids };
}

// -----------------------------------------------------------------------
// 액션 3: 무결성 자동 판정
// -----------------------------------------------------------------------
async function handleEvaluateWorkerIntegrity(payload: any): Promise<any> {
    const { worker_ids, assessment_month, education_session_id, override_document_scores } = payload;

    if (!Array.isArray(worker_ids) || worker_ids.length === 0) {
        throw new Error('worker_ids 배열 필수');
    }
    if (!assessment_month?.match(/^\d{4}-\d{2}$/)) {
        throw new Error('assessment_month 형식 오류 (YYYY-MM)');
    }
    if (worker_ids.length > 200) {
        throw new Error('1회 최대 200명까지 평가 가능합니다.');
    }

    // 3개월 범위 계산
    const [year, month] = assessment_month.split('-').map(Number);
    const threeMonthsAgo = new Date(year, month - 4, 1).toISOString().slice(0, 7);

    // 병렬 조회
    const [trainingRes, observationsRes, coachingRes, threeMonthObsRes] = await Promise.all([
        supabase
            .from('training_logs')
            .select('worker_id, created_at, signature_data, signature_method, selected_language_code, assessment_month')
            .in('worker_id', worker_ids)
            .eq('assessment_month', assessment_month),

        supabase
            .from('safety_behavior_observations')
            .select('worker_id, unsafe_behavior_flag, observed_at')
            .in('worker_id', worker_ids)
            .eq('assessment_month', assessment_month),

        supabase
            .from('safety_coaching_actions')
            .select('worker_id, followup_result, action_completed_at')
            .in('worker_id', worker_ids)
            .eq('assessment_month', assessment_month),

        supabase
            .from('safety_behavior_observations')
            .select('worker_id, unsafe_behavior_flag')
            .in('worker_id', worker_ids)
            .eq('unsafe_behavior_flag', true)
            .gte('assessment_month', threeMonthsAgo)
            .lt('assessment_month', assessment_month),
    ]);

    const trainingMap = new Map();
    (trainingRes.data || []).forEach((row: any) => {
        if (!trainingMap.has(row.worker_id)) trainingMap.set(row.worker_id, row);
    });

    const observationMap = new Map();
    (observationsRes.data || []).forEach((row: any) => {
        if (!observationMap.has(row.worker_id)) observationMap.set(row.worker_id, []);
        observationMap.get(row.worker_id).push(row);
    });

    const coachingMap = new Map();
    (coachingRes.data || []).forEach((row: any) => {
        if (!coachingMap.has(row.worker_id)) coachingMap.set(row.worker_id, []);
        coachingMap.get(row.worker_id).push(row);
    });

    const repeatViolationMap = new Map();
    (threeMonthObsRes.data || []).forEach((row: any) => {
        if (row.unsafe_behavior_flag) {
            repeatViolationMap.set(row.worker_id, (repeatViolationMap.get(row.worker_id) || 0) + 1);
        }
    });

    // 5게이트 판정 로직
    const results: any[] = [];
    const upsertRows: any[] = [];

    for (const workerId of worker_ids) {
        const training = trainingMap.get(workerId);
        const observations = observationMap.get(workerId) || [];
        const coachings = coachingMap.get(workerId) || [];

        const educationCompleted = !!training;
        const signatureSubmitted = !!(training?.signature_data || training?.signature_method);
        const unsafeBehaviorFlag = observations.some((o: any) => o.unsafe_behavior_flag);
        const repeatViolationCount = repeatViolationMap.get(workerId) || 0;
        const coachingCompleted = coachings.filter((c: any) => c.followup_result === '개선됨');
        const coachingPending = coachings.filter((c: any) => !c.followup_result || c.followup_result === '확인중');

        const timelineIsValid = checkTimeline(training?.created_at || null, training?.created_at || null);
        const documentScore =
            override_document_scores && workerId in override_document_scores
                ? Number(override_document_scores[workerId])
                : 70;

        // 게이트 판정
        const reasonCodes: string[] = [];
        if (!educationCompleted || !signatureSubmitted) reasonCodes.push('EDUCATION_INCOMPLETE');
        if (documentScore < 60) reasonCodes.push('DOCUMENT_INSUFFICIENT');
        if (unsafeBehaviorFlag && coachingCompleted.length === 0) reasonCodes.push('COACHING_MISSING');
        if (coachingPending.length > 0) reasonCodes.push('FOLLOWUP_PENDING');
        if (repeatViolationCount >= 2) reasonCodes.push('REPEAT_VIOLATION');
        if (!timelineIsValid) reasonCodes.push('TIMELINE_MISMATCH');

        // 종합 점수
        let score = documentScore;
        if (educationCompleted && signatureSubmitted) score = Math.min(score + 10, 100);
        if (unsafeBehaviorFlag) score = Math.max(score - 20, 0);
        if (repeatViolationCount >= 2) score = Math.max(score - 20, 0);
        if (coachingCompleted.length > 0) score = Math.min(score + 10, 100);

        // 상태 결정
        let status: string;
        if (reasonCodes.length === 0) {
            status = score >= 80 ? '확정' : '검증보류';
        } else if (reasonCodes.includes('REPEAT_VIOLATION') || reasonCodes.includes('EDUCATION_INCOMPLETE')) {
            status = '재교육필요';
        } else if (reasonCodes.includes('TIMELINE_MISMATCH') || reasonCodes.includes('DOCUMENT_INSUFFICIENT')) {
            status = '관리자검토';
        } else {
            status = '검증보류';
        }

        // 트래픽라이트
        const trafficLight =
            status === '확정' && score >= 80
                ? 'green'
                : status === '재교육필요' || score < 50
                  ? 'red'
                  : 'yellow';

        results.push({
            worker_id: workerId,
            integrity_status: status,
            integrity_reason_codes: reasonCodes,
            computed_score: score,
            traffic_light: trafficLight,
        });

        upsertRows.push({
            worker_id: workerId,
            assessment_month,
            integrity_status: status,
            integrity_reason_codes: reasonCodes,
            computed_score: score,
            education_session_id: education_session_id || null,
            updated_at: new Date().toISOString(),
        });
    }

    // DB upsert
    if (upsertRows.length > 0) {
        const { error: upsertError } = await supabase
            .from('worker_integrity_reviews')
            .upsert(upsertRows, { onConflict: 'worker_id,assessment_month' });

        if (upsertError) throw new Error(upsertError.message);
    }

    return {
        assessment_month,
        evaluated: results.length,
        results,
    };
}

// -----------------------------------------------------------------------
// 액션 4: 근로자 대량 업로드
// -----------------------------------------------------------------------
async function handleBulkUploadWorkers(payload: any): Promise<any> {
    const workers = Array.isArray(payload?.workers) ? payload.workers : [];

    if (workers.length === 0) {
        throw new Error('workers 배열이 비어 있습니다.');
    }
    if (workers.length > 5000) {
        throw new Error('1회 최대 5000명까지 업로드 가능합니다.');
    }

    const normalizedRows = workers.map((item: any, index: number) => {
        const rowNo = index + 1;
        const name = String(item?.name || '').trim();
        const nationality = String(item?.nationality || '').trim();
        const jobField = normalizeJobField(String(item?.job_field || item?.jobField || '').trim());
        const teamName = String(item?.team_name || item?.teamName || '').trim();
        const phoneNumber = normalizePhone(item?.phone_number || item?.phoneNumber || '');
        const birthDate = normalizeBirthDate(item?.birth_date || item?.birthDate || '');
        const passportNumber = normalizePassport(item?.passport_number || item?.passportNumber || '');

        if (!name) throw new Error(`${rowNo}번째 줄: 이름 필수`);
        if (!nationality) throw new Error(`${rowNo}번째 줄: 국적 필수`);
        if (!jobField) throw new Error(`${rowNo}번째 줄: 공종 필수`);
        if (!teamName) throw new Error(`${rowNo}번째 줄: 팀명 필수`);
        if (!(ALLOWED_JOB_FIELDS as readonly string[]).includes(jobField)) {
            throw new Error(`${rowNo}번째 줄: 허용되지 않은 공종(${jobField})`);
        }
        if (!phoneNumber && !birthDate && !passportNumber) {
            throw new Error(`${rowNo}번째 줄: 핸드폰/생년월일/여권번호 중 최소 1개 필수`);
        }
        if (birthDate && !(birthDate.length === 6 || birthDate.length === 8)) {
            throw new Error(`${rowNo}번째 줄: 생년월일은 6자리 또는 8자리만 허용`);
        }

        return {
            name,
            nationality,
            job_field: jobField,
            team_name: teamName,
            phone_number: phoneNumber || null,
            birth_date: birthDate || null,
            passport_number: passportNumber || null,
            updated_at: new Date().toISOString(),
        };
    });

    const { data: existingRows, error: existingError } = await supabase
        .from('workers')
        .select('name, phone_number, birth_date, passport_number')
        .limit(100000);

    if (existingError) throw new Error(existingError.message);

    const existingByPhone = new Set<string>();
    const existingByBirth = new Set<string>();
    const existingByPassport = new Set<string>();

    (existingRows || []).forEach((row: any) => {
        const name = String(row?.name || '').trim().toLowerCase();
        const phone = normalizePhone(row?.phone_number || '');
        const birth = normalizeBirthDate(row?.birth_date || '');
        const passport = normalizePassport(row?.passport_number || '');

        if (name && phone) existingByPhone.add(`${name}|${phone}`);
        if (name && birth) existingByBirth.add(`${name}|${birth}`);
        if (name && passport) existingByPassport.add(`${name}|${passport}`);
    });

    const seenUploadByPhone = new Set<string>();
    const seenUploadByBirth = new Set<string>();
    const seenUploadByPassport = new Set<string>();

    const dedupedRows: any[] = [];
    let skippedDuplicateCount = 0;

    normalizedRows.forEach((row) => {
        const name = String(row.name || '').trim().toLowerCase();
        const phone = normalizePhone(row.phone_number || '');
        const birth = normalizeBirthDate(row.birth_date || '');
        const passport = normalizePassport(row.passport_number || '');

        const phoneKey = name && phone ? `${name}|${phone}` : '';
        const birthKey = name && birth ? `${name}|${birth}` : '';
        const passportKey = name && passport ? `${name}|${passport}` : '';

        const isDuplicate =
            (phoneKey && (existingByPhone.has(phoneKey) || seenUploadByPhone.has(phoneKey))) ||
            (birthKey && (existingByBirth.has(birthKey) || seenUploadByBirth.has(birthKey))) ||
            (passportKey && (existingByPassport.has(passportKey) || seenUploadByPassport.has(passportKey)));

        if (isDuplicate) {
            skippedDuplicateCount += 1;
            return;
        }

        dedupedRows.push(row);
        if (phoneKey) seenUploadByPhone.add(phoneKey);
        if (birthKey) seenUploadByBirth.add(birthKey);
        if (passportKey) seenUploadByPassport.add(passportKey);
    });

    if (dedupedRows.length === 0) {
        return {
            requested: normalizedRows.length,
            inserted: 0,
            skippedDuplicateCount,
        };
    }

    const { error: insertError } = await supabase
        .from('workers')
        .insert(dedupedRows);

    if (insertError) {
        if (String(insertError.message || '').includes('job_field') || String(insertError.message || '').includes('team_name')) {
            throw new Error('workers 테이블에 공종/팀 컬럼이 없습니다. DB에 job_field, team_name 컬럼을 먼저 추가해 주세요.');
        }
        const { error: upsertError } = await supabase
            .from('workers')
            .upsert(dedupedRows, { onConflict: 'id' });

        if (upsertError) {
            throw new Error(upsertError.message);
        }
    }

    return {
        requested: normalizedRows.length,
        inserted: dedupedRows.length,
        skippedDuplicateCount,
    };
}

// -----------------------------------------------------------------------
// 메인 핸들러
// -----------------------------------------------------------------------
export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    try {
        const { action, payload } = req.body || {};

        if (!action) {
            return res.status(400).json({ ok: false, message: 'action 필드 필수' });
        }

        let data;

        switch (action) {
            case 'record-unsafe-behavior':
                data = await handleRecordUnsafeBehavior(payload);
                break;

            case 'register-coaching-action':
                data = await handleRegisterCoachingAction(payload);
                break;

            case 'evaluate-worker-integrity':
                data = await handleEvaluateWorkerIntegrity(payload);
                break;

            case 'bulk-upload-workers':
                data = await handleBulkUploadWorkers(payload);
                break;

            default:
                return res.status(400).json({ ok: false, message: `Unknown action: ${action}` });
        }

        return res.status(200).json({
            ok: true,
            action,
            data,
        });
    } catch (err: any) {
        console.error('[safety-management] error:', err);
        return res.status(500).json({ ok: false, message: err?.message || '서버 오류' });
    }
}

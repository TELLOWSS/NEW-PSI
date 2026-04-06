/**
 * POST /api/admin/safety-management
 *
 * 안전행동/근로자 관리 통합 API (4가지 액션)
 *
 * Body 형식:
 *   {
 *     action: 'record-unsafe-behavior' | 'register-coaching-action' | 'evaluate-worker-integrity' | 'bulk-upload-workers' | 'list-workers' | 'get-worker-contact' | 'list-report-message-logs' | 'get-report-message-dashboard-summary' | 'update-worker' | 'delete-worker' | 'restore-worker' | 'flush-audio-storage',
 *     payload: { ... 액션별 필드 }
 *   }
 *
 * 응답:
 *   { ok: true, action: string, data: { ... } }
 */

import { createClient } from '@supabase/supabase-js';
import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../../lib/server/adminAuthGuard.js';

const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
        global: {
            headers: (process.env.VITE_PSI_ADMIN_SECRET || process.env.PSI_ADMIN_SECRET)
                ? { 'x-psi-admin-secret': process.env.VITE_PSI_ADMIN_SECRET || process.env.PSI_ADMIN_SECRET || '' }
                : {},
        },
    }
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
    '관리',
    '바닥미장',
    '할석미장견출',
    '해체정리',
    '직영',
    '용역',
    '콘크리트비계',
] as const;

const JOB_FIELD_ALIASES: Record<string, string> = {
    '형틀': '형틀',
    '철근': '철근',
    '갱폼': '갱폼',
    '알폼': '알폼',
    '시스템': '시스템',
    '관리': '관리',
    '관리도': '관리',
    '바닥미장': '바닥미장',
    '바닥 미장': '바닥미장',
    '할석미장견출': '할석미장견출',
    '해체정리': '해체정리',
    '직영(용역포함)': '직영',
    '직영용역포함': '직영',
    '직영': '직영',
    '용역': '용역',
    '콘크리트비계': '콘크리트비계',
};

const SAFETY_INTEGRITY_REQUIRED_TABLES = new Set([
    'safety_behavior_observations',
    'safety_coaching_actions',
    'worker_integrity_reviews',
]);
const REPORT_MESSAGE_LOG_TABLE = 'report_message_logs';
const REPORT_MESSAGE_SUMMARY_RELATIONS = new Set([
    'report_message_monthly_summary',
    'report_message_team_summary',
    'report_message_failure_summary',
    'report_message_retry_queue',
]);

function extractMissingPublicTableName(errorMessage: string): string | null {
    if (!errorMessage) return null;

    const couldNotFindMatch = errorMessage.match(/table\s+'public\.([a-zA-Z0-9_]+)'/i);
    if (couldNotFindMatch?.[1]) return couldNotFindMatch[1];

    const relationMatch = errorMessage.match(/relation\s+['"]?public\.([a-zA-Z0-9_]+)['"]?\s+does\s+not\s+exist/i);
    if (relationMatch?.[1]) return relationMatch[1];

    return null;
}

function buildSafetySchemaMissingMessage(errorMessage: string): string | null {
    const tableName = extractMissingPublicTableName(errorMessage);
    if (!tableName) return null;
    if (!SAFETY_INTEGRITY_REQUIRED_TABLES.has(tableName)) return null;

    return [
        `필수 테이블(public.${tableName})이 없어 안전행동 등록을 처리할 수 없습니다.`,
        'Supabase SQL Editor에서 supabase_safety_integrity_migration.sql 파일을 실행해 스키마를 먼저 생성해주세요.',
    ].join(' ');
}

function isReportMessageLogTableMissing(errorMessage: string): boolean {
    return extractMissingPublicTableName(String(errorMessage || '')) === REPORT_MESSAGE_LOG_TABLE;
}

function isReportMessageSummaryRelationMissing(errorMessage: string): boolean {
    const relationName = extractMissingPublicTableName(String(errorMessage || ''));
    return relationName ? REPORT_MESSAGE_SUMMARY_RELATIONS.has(relationName) : false;
}

function isReportMessageLogColumnMissing(errorMessage: string, columnName: string): boolean {
    const source = String(errorMessage || '').toLowerCase();
    return source.includes(columnName.toLowerCase()) && (source.includes('column') || source.includes('does not exist'));
}

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

function normalizeWorkerNameKey(raw: string): string {
    return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeWorkerTeamKey(raw: string): string {
    return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildWorkerIdentitySignature(row: {
    name?: string | null;
    job_field?: string | null;
    team_name?: string | null;
    phone_number?: string | null;
    birth_date?: string | null;
    passport_number?: string | null;
}): string {
    return [
        normalizeWorkerNameKey(String(row?.name || '')),
        normalizeJobField(String(row?.job_field || '')),
        normalizeWorkerTeamKey(String(row?.team_name || '')),
        normalizePhone(String(row?.phone_number || '')),
        normalizeBirthDate(String(row?.birth_date || '')),
        normalizePassport(String(row?.passport_number || '')),
    ].join('|');
}

function getWorkerIdentityFillScore(row: {
    nationality?: string | null;
    phone_number?: string | null;
    birth_date?: string | null;
    passport_number?: string | null;
}): number {
    let score = 0;
    if (String(row?.nationality || '').trim()) score += 1;
    if (normalizePhone(String(row?.phone_number || '')).length >= 10) score += 3;
    if (normalizeBirthDate(String(row?.birth_date || '')).length >= 6) score += 2;
    if (normalizePassport(String(row?.passport_number || '')).length >= 6) score += 4;
    return score;
}

function hasIdentityOverlap(left: {
    phone_number?: string | null;
    birth_date?: string | null;
    passport_number?: string | null;
}, right: {
    phone_number?: string | null;
    birth_date?: string | null;
    passport_number?: string | null;
}): boolean {
    const leftPhone = normalizePhone(String(left?.phone_number || ''));
    const leftBirth = normalizeBirthDate(String(left?.birth_date || ''));
    const leftPassport = normalizePassport(String(left?.passport_number || ''));
    const rightPhone = normalizePhone(String(right?.phone_number || ''));
    const rightBirth = normalizeBirthDate(String(right?.birth_date || ''));
    const rightPassport = normalizePassport(String(right?.passport_number || ''));

    return Boolean(
        (leftPhone && rightPhone && leftPhone === rightPhone) ||
        (leftBirth && rightBirth && leftBirth === rightBirth) ||
        (leftPassport && rightPassport && leftPassport === rightPassport)
    );
}

function isDeletedAtColumnMissing(error: any): boolean {
    const message = String(error?.message || '').toLowerCase();
    const details = String((error as any)?.details || '').toLowerCase();
    return message.includes('deleted_at') || details.includes('deleted_at');
}

function isPassportColumnMissing(error: any): boolean {
    const message = String(error?.message || '').toLowerCase();
    const details = String((error as any)?.details || '').toLowerCase();
    return message.includes('passport_number') || details.includes('passport_number');
}

function toTrainingAudioRelativePath(raw: unknown): string | null {
    const value = String(raw || '').trim();
    if (!value) return null;

    let candidate = value;
    if (/^https?:\/\//i.test(candidate)) {
        try {
            const parsed = new URL(candidate);
            candidate = parsed.pathname || '';
        } catch {
            return null;
        }
    }

    candidate = candidate.split('?')[0] || '';
    candidate = candidate.replace(/^\/+/, '');

    const knownPrefixes = [
        'storage/v1/object/public/training_audio/',
        'storage/v1/object/sign/training_audio/',
        'storage/v1/object/authenticated/training_audio/',
        'training_audio/',
    ];

    for (const prefix of knownPrefixes) {
        if (candidate.startsWith(prefix)) {
            candidate = candidate.slice(prefix.length);
            break;
        }
    }

    const bucketSegmentIndex = candidate.indexOf('/training_audio/');
    if (bucketSegmentIndex >= 0) {
        candidate = candidate.slice(bucketSegmentIndex + '/training_audio/'.length);
    }

    candidate = decodeURIComponent(candidate).replace(/^\/+/, '');
    if (!candidate || candidate.endsWith('/')) return null;

    return candidate;
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
            assessment_month: assessmentMonth,
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
// 액션 2-B: 관찰+코칭 통합 등록 (1회 호출)
// -----------------------------------------------------------------------
async function handleRecordSafetyClosureLoop(payload: any): Promise<any> {
    const body = payload || {};
    const rawList = Array.isArray(body.records) ? body.records : [body];

    if (rawList.length === 0) throw new Error('등록할 데이터가 없습니다.');
    if (rawList.length > 100) throw new Error('1회 최대 100건까지 등록 가능합니다.');

    const nowIso = new Date().toISOString();

    const normalizedRows = rawList.map((raw: any) => {
        const assessmentMonth = String(raw.assessment_month || '').trim();
        if (!assessmentMonth.match(/^\d{4}-\d{2}$/)) {
            throw new Error(`assessment_month 형식 오류: '${assessmentMonth}' (YYYY-MM 필요)`);
        }
        if (!raw.worker_id) throw new Error('worker_id 필수');

        const actionType = raw.action_type ? String(raw.action_type).trim() : '';
        const registerCoaching = Boolean(actionType);

        return {
            worker_id: String(raw.worker_id).trim(),
            assessment_month: assessmentMonth,
            observed_at: raw.observed_at || nowIso,
            observer_name: raw.observer_name?.trim() || null,
            unsafe_behavior_flag: Boolean(raw.unsafe_behavior_flag),
            unsafe_behavior_type: raw.unsafe_behavior_type?.trim() || null,
            severity_level: raw.severity_level || null,
            evidence_note: raw.evidence_note?.trim() || null,
            evidence_photo_url: raw.evidence_photo_url?.trim() || null,
            related_risk_category: raw.related_risk_category?.trim() || null,
            action_type: registerCoaching ? actionType : null,
            action_detail: registerCoaching ? (raw.action_detail?.trim() || null) : null,
            action_completed_at: registerCoaching ? (raw.action_completed_at || nowIso) : null,
            coach_name: registerCoaching ? (raw.coach_name?.trim() || null) : null,
            followup_result: registerCoaching ? (raw.followup_result || null) : null,
            followup_checked_at: registerCoaching ? (raw.followup_checked_at || nowIso) : null,
            created_at: nowIso,
            register_coaching: registerCoaching,
        };
    });

    const observationRows = normalizedRows.map((row) => ({
        worker_id: row.worker_id,
        assessment_month: row.assessment_month,
        observed_at: row.observed_at,
        observer_name: row.observer_name,
        unsafe_behavior_flag: row.unsafe_behavior_flag,
        unsafe_behavior_type: row.unsafe_behavior_type,
        severity_level: row.severity_level,
        evidence_note: row.evidence_note,
        evidence_photo_url: row.evidence_photo_url,
        related_risk_category: row.related_risk_category,
        created_at: row.created_at,
    }));

    const { data: observationData, error: observationError } = await supabase
        .from('safety_behavior_observations')
        .insert(observationRows)
        .select('id');

    if (observationError) throw new Error(observationError.message);

    const observationIds = (observationData || []).map((row: any) => row.id);

    const coachingRows = normalizedRows
        .map((row, index) => ({ row, sourceObservationId: observationIds[index] }))
        .filter((item) => item.row.register_coaching && item.row.action_type)
        .map((item) => ({
            worker_id: item.row.worker_id,
            assessment_month: item.row.assessment_month,
            source_observation_id: item.sourceObservationId || null,
            action_type: item.row.action_type,
            action_detail: item.row.action_detail,
            action_completed_at: item.row.action_completed_at,
            coach_name: item.row.coach_name,
            followup_result: item.row.followup_result,
            followup_checked_at: item.row.followup_checked_at,
            created_at: nowIso,
        }));

    let coachingIds: any[] = [];
    if (coachingRows.length > 0) {
        const { data: coachingData, error: coachingError } = await supabase
            .from('safety_coaching_actions')
            .insert(coachingRows)
            .select('id');

        if (coachingError) throw new Error(coachingError.message);
        coachingIds = (coachingData || []).map((row: any) => row.id);
    }

    const flaggedWorkerMonths = normalizedRows
        .filter((row) => row.unsafe_behavior_flag)
        .map((row) => ({ worker_id: row.worker_id, assessment_month: row.assessment_month }));

    for (const { worker_id, assessment_month } of flaggedWorkerMonths) {
        await supabase
            .from('worker_integrity_reviews')
            .upsert(
                {
                    worker_id,
                    assessment_month,
                    integrity_status: '검증보류',
                    integrity_reason_codes: ['COACHING_MISSING'],
                    updated_at: nowIso,
                },
                { onConflict: 'worker_id,assessment_month', ignoreDuplicates: false }
            )
            .eq('integrity_status', '확정');
    }

    const improvedRecords = coachingRows.filter((row) => row.followup_result === '개선됨');
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
                    updated_at: nowIso,
                })
                .eq('id', reviewData.id);
        }
    }

    return {
        inserted_observations: observationIds.length,
        inserted_coaching: coachingIds.length,
        observation_ids: observationIds,
        coaching_ids: coachingIds,
    };
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

    type ExistingWorkerRow = {
        id: string;
        name: string;
        nationality: string;
        job_field: string;
        team_name: string;
        phone_number: string;
        birth_date: string;
        passport_number: string;
    };

    const toMatchKey = (name: string, jobField: string, teamName: string) => {
        return `${String(name || '').trim().toLowerCase()}|${String(jobField || '').trim()}|${String(teamName || '').trim().toLowerCase()}`;
    };

    const normalizeExistingRows = (rows: any[] | null | undefined): ExistingWorkerRow[] => {
        return (rows || []).map((row: any) => ({
            id: String(row?.id || '').trim(),
            name: String(row?.name || '').trim(),
            nationality: String(row?.nationality || '').trim(),
            job_field: String(row?.job_field || '').trim(),
            team_name: String(row?.team_name || '').trim(),
            phone_number: normalizePhone(row?.phone_number || ''),
            birth_date: normalizeBirthDate(row?.birth_date || ''),
            passport_number: normalizePassport(row?.passport_number || ''),
        }));
    };

    let existingRows: ExistingWorkerRow[] = [];

    const activeWithPassport = await supabase
        .from('workers')
        .select('id, name, nationality, job_field, team_name, phone_number, birth_date, passport_number, deleted_at')
        .is('deleted_at', null)
        .limit(10000);

    if (!activeWithPassport.error) {
        existingRows = normalizeExistingRows(activeWithPassport.data);
    } else if (isDeletedAtColumnMissing(activeWithPassport.error)) {
        const fallbackNoDeleted = await supabase
            .from('workers')
            .select('id, name, nationality, job_field, team_name, phone_number, birth_date, passport_number')
            .limit(10000);

        if (!fallbackNoDeleted.error) {
            existingRows = normalizeExistingRows(fallbackNoDeleted.data);
        } else {
            const fallbackNoDeletedNoPassport = await supabase
                .from('workers')
                .select('id, name, nationality, job_field, team_name, phone_number, birth_date')
                .limit(10000);
            if (fallbackNoDeletedNoPassport.error) {
                throw new Error(fallbackNoDeletedNoPassport.error.message || 'workers 기존 데이터 조회 실패');
            }
            existingRows = normalizeExistingRows(fallbackNoDeletedNoPassport.data);
        }
    } else {
        const fallbackNoPassport = await supabase
            .from('workers')
            .select('id, name, nationality, job_field, team_name, phone_number, birth_date, deleted_at')
            .is('deleted_at', null)
            .limit(10000);
        if (fallbackNoPassport.error) {
            throw new Error(fallbackNoPassport.error.message || 'workers 기존 데이터 조회 실패');
        }
        existingRows = normalizeExistingRows(fallbackNoPassport.data);
    }

    const existingByKey = new Map<string, ExistingWorkerRow[]>();
    const existingByPhone = new Map<string, ExistingWorkerRow[]>();
    const existingByBirth = new Map<string, ExistingWorkerRow[]>();
    const existingByPassport = new Map<string, ExistingWorkerRow[]>();
    for (const row of existingRows) {
        const key = toMatchKey(row.name, row.job_field, row.team_name);
        if (!existingByKey.has(key)) existingByKey.set(key, []);
        existingByKey.get(key)!.push(row);

        if (row.phone_number) {
            const list = existingByPhone.get(row.phone_number) || [];
            existingByPhone.set(row.phone_number, [...list, row]);
        }
        if (row.birth_date) {
            const list = existingByBirth.get(row.birth_date) || [];
            existingByBirth.set(row.birth_date, [...list, row]);
        }
        if (row.passport_number) {
            const list = existingByPassport.get(row.passport_number) || [];
            existingByPassport.set(row.passport_number, [...list, row]);
        }
    }

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const row of normalizedRows) {
        const key = toMatchKey(row.name, row.job_field, row.team_name);
        const candidates = existingByKey.get(key) || [];

        let matched: ExistingWorkerRow | undefined;

        if (row.passport_number) {
            const passportMatches = existingByPassport.get(row.passport_number) || [];
            if (passportMatches.length === 1) {
                matched = passportMatches[0];
            }
        }
        if (!matched && row.phone_number) {
            const phoneMatches = existingByPhone.get(row.phone_number) || [];
            if (phoneMatches.length === 1) {
                matched = phoneMatches[0];
            }
        }
        if (!matched && row.birth_date) {
            const birthMatches = existingByBirth.get(row.birth_date) || [];
            if (birthMatches.length === 1) {
                matched = birthMatches[0];
            }
        }

        if (!matched && row.passport_number) {
            matched = candidates.find((item) => item.passport_number && item.passport_number === row.passport_number);
        }
        if (!matched && row.phone_number) {
            matched = candidates.find((item) => item.phone_number && item.phone_number === row.phone_number);
        }
        if (!matched && row.birth_date) {
            matched = candidates.find((item) => item.birth_date && item.birth_date === row.birth_date);
        }
        if (!matched && candidates.length === 1) {
            matched = candidates[0];
        }
        if (!matched && candidates.length > 1) {
            const rankedCandidate = [...candidates]
                .map((candidate) => {
                    let score = getWorkerIdentityFillScore(candidate);
                    if (hasIdentityOverlap(candidate, row)) score += 10;
                    if (normalizeWorkerNameKey(candidate.name) === normalizeWorkerNameKey(row.name)) score += 1;
                    if (normalizeWorkerTeamKey(candidate.team_name) === normalizeWorkerTeamKey(row.team_name)) score += 1;
                    if (normalizeJobField(candidate.job_field) === normalizeJobField(row.job_field)) score += 1;
                    return { candidate, score };
                })
                .sort((a, b) => b.score - a.score)[0];

            if (rankedCandidate && rankedCandidate.score >= 10) {
                matched = rankedCandidate.candidate;
            }
        }

        if (!matched) {
            const insertPayload = {
                ...row,
                updated_at: new Date().toISOString(),
            };

            const { data: insertedData, error: insertError } = await supabase
                .from('workers')
                .insert(insertPayload)
                .select('id, name, nationality, job_field, team_name, phone_number, birth_date, passport_number')
                .single();

            if (insertError) {
                const rawMessage = [insertError.message, (insertError as any).details, (insertError as any).hint]
                    .filter((item) => Boolean(String(item || '').trim()))
                    .join(' | ');
                throw new Error(rawMessage || 'workers insert failed');
            }

            insertedCount += 1;

            const insertedRow: ExistingWorkerRow = {
                id: String(insertedData?.id || '').trim(),
                name: String(insertedData?.name || row.name).trim(),
                nationality: String(insertedData?.nationality || row.nationality).trim(),
                job_field: String(insertedData?.job_field || row.job_field).trim(),
                team_name: String(insertedData?.team_name || row.team_name).trim(),
                phone_number: normalizePhone(insertedData?.phone_number || row.phone_number || ''),
                birth_date: normalizeBirthDate(insertedData?.birth_date || row.birth_date || ''),
                passport_number: normalizePassport(insertedData?.passport_number || row.passport_number || ''),
            };

            const nextKey = toMatchKey(insertedRow.name, insertedRow.job_field, insertedRow.team_name);
            const nextList = existingByKey.get(nextKey) || [];
            existingByKey.set(nextKey, [...nextList, insertedRow]);
            if (insertedRow.phone_number) {
                const nextPhoneList = existingByPhone.get(insertedRow.phone_number) || [];
                existingByPhone.set(insertedRow.phone_number, [...nextPhoneList, insertedRow]);
            }
            if (insertedRow.birth_date) {
                const nextBirthList = existingByBirth.get(insertedRow.birth_date) || [];
                existingByBirth.set(insertedRow.birth_date, [...nextBirthList, insertedRow]);
            }
            if (insertedRow.passport_number) {
                const nextPassportList = existingByPassport.get(insertedRow.passport_number) || [];
                existingByPassport.set(insertedRow.passport_number, [...nextPassportList, insertedRow]);
            }
            continue;
        }

        const merged = {
            nationality: row.nationality || matched.nationality || '',
            phone_number: row.phone_number || matched.phone_number || null,
            birth_date: row.birth_date || matched.birth_date || null,
            passport_number: row.passport_number || matched.passport_number || null,
            updated_at: new Date().toISOString(),
        };

        const isSameNationality = String(merged.nationality || '') === String(matched.nationality || '');
        const isSamePhone = normalizePhone(merged.phone_number || '') === normalizePhone(matched.phone_number || '');
        const isSameBirth = normalizeBirthDate(merged.birth_date || '') === normalizeBirthDate(matched.birth_date || '');
        const isSamePassport = normalizePassport(merged.passport_number || '') === normalizePassport(matched.passport_number || '');

        if (isSameNationality && isSamePhone && isSameBirth && isSamePassport) {
            skippedCount += 1;
            continue;
        }

        const { error: updateError } = await supabase
            .from('workers')
            .update(merged)
            .eq('id', matched.id);

        if (updateError) {
            const rawMessage = [updateError.message, (updateError as any).details, (updateError as any).hint]
                .filter((item) => Boolean(String(item || '').trim()))
                .join(' | ');
            throw new Error(rawMessage || 'workers update failed');
        }

        updatedCount += 1;
        matched.nationality = String(merged.nationality || '').trim();
        matched.phone_number = normalizePhone(merged.phone_number || '');
        matched.birth_date = normalizeBirthDate(merged.birth_date || '');
        matched.passport_number = normalizePassport(merged.passport_number || '');
    }

    return {
        requested: normalizedRows.length,
        inserted: insertedCount,
        updated: updatedCount,
        skippedDuplicateCount: skippedCount,
    };
}

// -----------------------------------------------------------------------
// 액션 5: 등록 근로자 목록 조회
// -----------------------------------------------------------------------
async function handleListWorkers(payload: any): Promise<any> {
    const requestedLimit = Number(payload?.limit || 3000);
    const includeDeleted = Boolean(payload?.includeDeleted);
    const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.floor(requestedLimit), 1), 5000)
        : 3000;

    let data: any[] | null = null;
    let error: any = null;

    if (includeDeleted) {
        const response = await supabase
            .from('workers')
            .select('id, name, job_field, team_name, birth_date, phone_number, passport_number, deleted_at')
            .limit(limit);
        data = response.data;
        error = response.error;
    } else {
        const response = await supabase
            .from('workers')
            .select('id, name, job_field, team_name, birth_date, phone_number, passport_number, deleted_at')
            .is('deleted_at', null)
            .limit(limit);
        data = response.data;
        error = response.error;
    }

    if (error && isDeletedAtColumnMissing(error)) {
        const fallback = await supabase
            .from('workers')
            .select('id, name, job_field, team_name, birth_date, phone_number, passport_number')
            .limit(limit);
        data = fallback.data;
        error = fallback.error;
    }

    if (error && isPassportColumnMissing(error)) {
        const fallbackNoPassport = includeDeleted
            ? await supabase
                .from('workers')
                .select('id, name, job_field, team_name, birth_date, phone_number, deleted_at')
                .limit(limit)
            : await supabase
                .from('workers')
                .select('id, name, job_field, team_name, birth_date, phone_number, deleted_at')
                .is('deleted_at', null)
                .limit(limit);
        data = fallbackNoPassport.data;
        error = fallbackNoPassport.error;
    }

    if (error) throw new Error(error.message || 'workers 목록 조회 실패');

    const rows = (data || []).map((row: any) => ({
        id: String(row?.id || '').trim(),
        name: String(row?.name || '').trim(),
        job_field: String(row?.job_field || '').trim(),
        team_name: String(row?.team_name || '').trim(),
        birth_date: String(row?.birth_date || '').trim(),
        phone_number: String(row?.phone_number || '').trim(),
        passport_number: String(row?.passport_number || '').trim(),
        deleted_at: String(row?.deleted_at || '').trim() || null,
    }));

    const dedupedMap = new Map<string, typeof rows[number]>();
    let hiddenExactDuplicateCount = 0;
    rows.forEach((row) => {
        const signature = buildWorkerIdentitySignature(row);
        const existing = dedupedMap.get(signature);
        if (!existing) {
            dedupedMap.set(signature, row);
            return;
        }

        const existingScore = getWorkerIdentityFillScore(existing);
        const nextScore = getWorkerIdentityFillScore(row);
        const shouldReplace = nextScore > existingScore || (nextScore === existingScore && existing.id.localeCompare(row.id) > 0);
        if (shouldReplace) {
            dedupedMap.set(signature, row);
        }
        hiddenExactDuplicateCount += 1;
    });

    const dedupedRows = Array.from(dedupedMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
    const sameNameGroupCount = Array.from(
        dedupedRows.reduce((acc, row) => {
            const key = normalizeWorkerNameKey(row.name);
            acc.set(key, (acc.get(key) || 0) + 1);
            return acc;
        }, new Map<string, number>()).values(),
    ).filter((count) => count > 1).length;

    return {
        rows: dedupedRows,
        total: dedupedRows.length,
        hiddenExactDuplicateCount,
        sameNameGroupCount,
        rawTotal: rows.length,
    };
}

// -----------------------------------------------------------------------
// 액션 5-1: 등록 근로자 연락처 단건 조회
// -----------------------------------------------------------------------
async function handleGetWorkerContact(payload: any): Promise<any> {
    const workerId = String(payload?.workerId || payload?.workerUuid || payload?.id || '').trim();
    const workerName = String(payload?.workerName || payload?.name || '').trim();
    const teamName = String(payload?.teamName || payload?.team_name || '').trim();

    let rows: any[] | null = null;
    let error: any = null;

    if (workerId) {
        const response = await supabase
            .from('workers')
            .select('id, name, team_name, job_field, phone_number, deleted_at')
            .eq('id', workerId)
            .limit(1);
        rows = response.data;
        error = response.error;

        if (error && isDeletedAtColumnMissing(error)) {
            const fallback = await supabase
                .from('workers')
                .select('id, name, team_name, job_field, phone_number')
                .eq('id', workerId)
                .limit(1);
            rows = fallback.data;
            error = fallback.error;
        }
    } else if (workerName) {
        const response = await supabase
            .from('workers')
            .select('id, name, team_name, job_field, phone_number, deleted_at')
            .eq('name', workerName)
            .limit(10);
        rows = response.data;
        error = response.error;

        if (error && isDeletedAtColumnMissing(error)) {
            const fallback = await supabase
                .from('workers')
                .select('id, name, team_name, job_field, phone_number')
                .eq('name', workerName)
                .limit(10);
            rows = fallback.data;
            error = fallback.error;
        }
    } else {
        throw new Error('workerId 또는 workerName 필수');
    }

    if (error) throw new Error(error.message || '근로자 연락처 조회 실패');

    const normalizedRows = (rows || [])
        .map((row: any) => ({
            id: String(row?.id || '').trim(),
            name: String(row?.name || '').trim(),
            team_name: String(row?.team_name || '').trim(),
            job_field: String(row?.job_field || '').trim(),
            phone_number: normalizePhone(row?.phone_number || ''),
            deleted_at: String(row?.deleted_at || '').trim() || null,
        }))
        .filter((row) => !row.deleted_at);

    const exactTeamMatch = teamName
        ? normalizedRows.find((row) => row.team_name && row.team_name === teamName)
        : null;

    const worker = exactTeamMatch || normalizedRows[0] || null;

    return {
        worker,
        matchCount: normalizedRows.length,
        matchedBy: workerId ? 'id' : exactTeamMatch ? 'name+team' : 'name',
    };
}

// -----------------------------------------------------------------------
// 액션 5-2: 리포트 문자 발송 로그 조회
// -----------------------------------------------------------------------
async function handleListReportMessageLogs(payload: any): Promise<any> {
    const workerId = String(payload?.workerId || payload?.workerUuid || payload?.id || '').trim();
    const workerName = String(payload?.workerName || payload?.name || '').trim();
    const requestedLimit = Number(payload?.limit || 10);
    const requestedOffset = Number(payload?.offset || 0);
    const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.floor(requestedLimit), 1), 50)
        : 10;
    const offset = Number.isFinite(requestedOffset)
        ? Math.max(Math.floor(requestedOffset), 0)
        : 0;

    if (!workerId && !workerName) {
        throw new Error('workerId 또는 workerName 필수');
    }

    const buildQuery = (includeFailureCategory: boolean) => {
        let query = supabase
            .from(REPORT_MESSAGE_LOG_TABLE)
            .select(includeFailureCategory
                ? 'id, worker_id, worker_name, team_name, phone_number, status, failure_category, sent_count, provider, message, created_at'
                : 'id, worker_id, worker_name, team_name, phone_number, status, sent_count, provider, message, created_at', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        return workerId ? query.eq('worker_id', workerId) : query.eq('worker_name', workerName);
    };

    let { data, error, count } = await buildQuery(true);

    if (error && isReportMessageLogColumnMissing(error.message || error.details || '', 'failure_category')) {
        ({ data, error, count } = await buildQuery(false));
    }

    if (error) {
        if (isReportMessageLogTableMissing(error.message || error.details || '')) {
            return {
                rows: [],
                total: 0,
                schemaReady: false,
            };
        }
        throw new Error(error.message || '리포트 문자 발송 로그 조회 실패');
    }

    const rows = (data || []).map((row: any) => ({
        id: String(row?.id || '').trim(),
        worker_id: String(row?.worker_id || '').trim(),
        worker_name: String(row?.worker_name || '').trim(),
        team_name: String(row?.team_name || '').trim(),
        phone_number: normalizePhone(row?.phone_number || ''),
        status: String(row?.status || '').trim() || 'UNKNOWN',
        failure_category: String(row?.failure_category || '').trim(),
        sent_count: Number(row?.sent_count || 0),
        provider: String(row?.provider || '').trim(),
        message: String(row?.message || '').trim(),
        created_at: String(row?.created_at || '').trim(),
    }));

    return {
        rows,
        total: Number(count || 0),
        offset,
        limit,
        hasMore: offset + rows.length < Number(count || 0),
        schemaReady: true,
    };
}

// -----------------------------------------------------------------------
// 액션 5-3: 리포트 문자 발송 운영 대시보드 요약
// -----------------------------------------------------------------------
async function handleGetReportMessageDashboardSummary(payload: any): Promise<any> {
    const requestedLimit = Number(payload?.limit || 6);
    const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.floor(requestedLimit), 3), 12)
        : 6;

    const [monthlyResult, teamResult, failureResult, retryResult] = await Promise.all([
        supabase.from('report_message_monthly_summary').select('month_date, month_label, total_count, success_count, failed_count, success_rate').order('month_date', { ascending: false }).limit(limit),
        supabase.from('report_message_team_summary').select('team_name, total_count, success_count, failed_count, success_rate, last_sent_at').order('total_count', { ascending: false }).limit(limit),
        supabase.from('report_message_failure_summary').select('failure_category, failure_count, last_occurred_at').order('failure_count', { ascending: false }).limit(limit),
        supabase.from('report_message_retry_queue').select('retry_key, worker_id, worker_name, team_name, phone_number, failure_category, provider, message, failed_at, priority_score').order('priority_score', { ascending: false }).order('failed_at', { ascending: false }).limit(limit),
    ]);

    const summaryError = monthlyResult.error || teamResult.error || failureResult.error || retryResult.error;
    if (summaryError) {
        const message = summaryError.message || summaryError.details || '';
        if (isReportMessageSummaryRelationMissing(message)) {
            return {
                monthlyRows: [],
                teamRows: [],
                failureRows: [],
                retryRows: [],
                overview: {
                    totalCount: 0,
                    successCount: 0,
                    failedCount: 0,
                    successRate: 0,
                    topTeam: '-',
                    topFailureCategory: '-',
                    retryCandidateCount: 0,
                },
                schemaReady: false,
            };
        }
        throw new Error(message || '리포트 문자 운영 요약 조회 실패');
    }

    const monthlyRows = (monthlyResult.data || []).map((row: any) => ({
        month_date: String(row?.month_date || '').trim(),
        month_label: String(row?.month_label || '').trim(),
        total_count: Number(row?.total_count || 0),
        success_count: Number(row?.success_count || 0),
        failed_count: Number(row?.failed_count || 0),
        success_rate: Number(row?.success_rate || 0),
    })).reverse();

    const teamRows = (teamResult.data || []).map((row: any) => ({
        team_name: String(row?.team_name || '').trim() || '미지정',
        total_count: Number(row?.total_count || 0),
        success_count: Number(row?.success_count || 0),
        failed_count: Number(row?.failed_count || 0),
        success_rate: Number(row?.success_rate || 0),
        last_sent_at: String(row?.last_sent_at || '').trim(),
    }));

    const failureRows = (failureResult.data || []).map((row: any) => ({
        failure_category: String(row?.failure_category || '').trim() || '미분류',
        failure_count: Number(row?.failure_count || 0),
        last_occurred_at: String(row?.last_occurred_at || '').trim(),
    }));

    const retryRows = (retryResult.data || []).map((row: any) => ({
        retry_key: String(row?.retry_key || '').trim(),
        worker_id: String(row?.worker_id || '').trim(),
        worker_name: String(row?.worker_name || '').trim(),
        team_name: String(row?.team_name || '').trim() || '미지정',
        phone_number: normalizePhone(row?.phone_number || ''),
        failure_category: String(row?.failure_category || '').trim() || '미분류',
        provider: String(row?.provider || '').trim(),
        message: String(row?.message || '').trim(),
        failed_at: String(row?.failed_at || '').trim(),
        priority_score: Number(row?.priority_score || 0),
    }));

    const latestMonthly = monthlyRows[monthlyRows.length - 1] || null;

    return {
        monthlyRows,
        teamRows,
        failureRows,
        retryRows,
        overview: {
            totalCount: latestMonthly?.total_count || 0,
            successCount: latestMonthly?.success_count || 0,
            failedCount: latestMonthly?.failed_count || 0,
            successRate: latestMonthly?.success_rate || 0,
            topTeam: teamRows[0]?.team_name || '-',
            topFailureCategory: failureRows[0]?.failure_category || '-',
            retryCandidateCount: retryRows.length,
        },
        schemaReady: true,
    };
}

// -----------------------------------------------------------------------
// 액션 6: 등록 근로자 정보 수정
// -----------------------------------------------------------------------
async function handleUpdateWorker(payload: any): Promise<any> {
    const id = String(payload?.id || payload?.workerId || '').trim();
    const name = String(payload?.name || '').trim();
    const jobField = normalizeJobField(String(payload?.job_field || payload?.jobField || '').trim());
    const teamName = String(payload?.team_name || payload?.teamName || '').trim();
    const phoneNumber = normalizePhone(payload?.phone_number || payload?.phoneNumber || '');
    const birthDate = normalizeBirthDate(payload?.birth_date || payload?.birthDate || '');

    if (!id) throw new Error('worker id 필수');
    if (!name) throw new Error('이름 필수');
    if (!jobField) throw new Error('공종 필수');
    if (!(ALLOWED_JOB_FIELDS as readonly string[]).includes(jobField)) {
        throw new Error(`허용되지 않은 공종(${jobField})`);
    }
    if (!teamName) throw new Error('팀명 필수');
    if (birthDate && !(birthDate.length === 6 || birthDate.length === 8)) {
        throw new Error('생년월일은 6자리 또는 8자리만 허용');
    }

    const { data, error } = await supabase
        .from('workers')
        .update({
            name,
            job_field: jobField,
            team_name: teamName,
            phone_number: phoneNumber || null,
            birth_date: birthDate || null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('id, name, job_field, team_name, birth_date, phone_number')
        .single();

    if (error) {
        throw new Error(error.message || 'workers 수정 실패');
    }

    return {
        worker: {
            id: String(data?.id || '').trim(),
            name: String(data?.name || '').trim(),
            job_field: String(data?.job_field || '').trim(),
            team_name: String(data?.team_name || '').trim(),
            birth_date: String(data?.birth_date || '').trim(),
            phone_number: String(data?.phone_number || '').trim(),
        },
    };
}

// -----------------------------------------------------------------------
// 액션 7: 등록 근로자 삭제
// -----------------------------------------------------------------------
async function handleDeleteWorker(payload: any): Promise<any> {
    const id = String(payload?.id || payload?.workerId || '').trim();
    if (!id) throw new Error('worker id 필수');

    const softDelete = await supabase
        .from('workers')
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id)
        .is('deleted_at', null)
        .select('id')
        .maybeSingle();

    if (softDelete.error && !isDeletedAtColumnMissing(softDelete.error)) {
        throw new Error(softDelete.error.message || 'workers 삭제 실패');
    }

    if (softDelete.data?.id) {
        return {
            deletedWorkerId: String(softDelete.data.id || '').trim(),
            softDeleted: true,
        };
    }

    const fallbackHardDelete = await supabase
        .from('workers')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();

    if (fallbackHardDelete.error) {
        throw new Error(fallbackHardDelete.error.message || 'workers 삭제 실패');
    }

    if (!fallbackHardDelete.data?.id) {
        throw new Error('삭제 대상 근로자를 찾지 못했습니다.');
    }

    return {
        deletedWorkerId: String(fallbackHardDelete.data.id || '').trim(),
        softDeleted: false,
    };
}

// -----------------------------------------------------------------------
// 액션 8: 등록 근로자 삭제 복구
// -----------------------------------------------------------------------
async function handleRestoreWorker(payload: any): Promise<any> {
    const id = String(payload?.id || payload?.workerId || '').trim();
    if (!id) throw new Error('worker id 필수');

    const { data, error } = await supabase
        .from('workers')
        .update({ deleted_at: null, updated_at: new Date().toISOString() })
        .eq('id', id)
        .not('deleted_at', 'is', null)
        .select('id')
        .maybeSingle();

    if (error) {
        if (isDeletedAtColumnMissing(error)) {
            throw new Error('복구 기능을 사용하려면 workers 테이블에 deleted_at 컬럼이 필요합니다.');
        }
        throw new Error(error.message || 'workers 복구 실패');
    }

    if (!data?.id) {
        throw new Error('복구 대상 근로자를 찾지 못했습니다.');
    }

    return {
        restoredWorkerId: String(data.id || '').trim(),
    };
}

// -----------------------------------------------------------------------
// 액션 9: 과거 교육 음성 스토리지 일괄 비우기
// -----------------------------------------------------------------------
async function handleFlushAudioStorage(payload: any): Promise<any> {
    const mode = payload?.mode === 'sessions' ? 'sessions' : 'all';
    const requestSessionIds: string[] = Array.isArray(payload?.sessionIds)
        ? payload.sessionIds.map((id: any) => String(id || '').trim()).filter(Boolean)
        : [];
    const excludeSessionIdSet = new Set<string>(
        Array.isArray(payload?.excludeSessionIds)
            ? payload.excludeSessionIds.map((id: any) => String(id || '').trim()).filter(Boolean)
            : []
    );
    const excludedSessionCount = excludeSessionIdSet.size;

    if (mode === 'sessions' && requestSessionIds.length === 0) {
        throw new Error('mode=sessions 인 경우 sessionIds 배열이 필요합니다.');
    }

    let targetSessionIds: string[] = requestSessionIds;
    let targetSessionRows: Array<{ id: string; audio_urls?: Record<string, string | null> | null }> = [];

    if (mode === 'all') {
        const { data: sessions, error: sessionsError } = await supabase
            .from('training_sessions')
            .select('id, audio_urls');

        if (sessionsError) throw new Error(sessionsError.message);

        targetSessionRows = (sessions || []).map((row: any) => ({
            id: String(row.id || ''),
            audio_urls: row.audio_urls && typeof row.audio_urls === 'object'
                ? row.audio_urls as Record<string, string | null>
                : null,
        })).filter((row) => Boolean(row.id));
        targetSessionIds = targetSessionRows.map((row) => row.id);
    } else {
        const { data: sessions, error: sessionsError } = await supabase
            .from('training_sessions')
            .select('id, audio_urls')
            .in('id', requestSessionIds);

        if (sessionsError) throw new Error(sessionsError.message);

        targetSessionRows = (sessions || []).map((row: any) => ({
            id: String(row.id || ''),
            audio_urls: row.audio_urls && typeof row.audio_urls === 'object'
                ? row.audio_urls as Record<string, string | null>
                : null,
        })).filter((row) => Boolean(row.id));
        if (targetSessionRows.length > 0) {
            targetSessionIds = targetSessionRows.map((row) => row.id);
        }
    }

    if (excludeSessionIdSet.size > 0) {
        targetSessionIds = targetSessionIds.filter((id) => !excludeSessionIdSet.has(id));
    }

    const uniqueSessionIds: string[] = Array.from(new Set(targetSessionIds));
    if (uniqueSessionIds.length === 0) {
        return {
            mode,
            targetSessionCount: 0,
            excludedSessionCount,
            scannedFileCount: 0,
            updatedSessionCount: 0,
            removedFileCount: 0,
            removedSessionCount: 0,
            failedSessionCount: 0,
            failedSessionIds: [],
        };
    }

    const removablePaths: string[] = [];
    const removablePathSet = new Set<string>();
    const failedSessionIds: string[] = [];
    let removedSessionCount = 0;
    let scannedFileCount = 0;

    const audioUrlPathsBySession = new Map<string, string[]>();
    for (const row of targetSessionRows) {
        if (!row?.id || !row.audio_urls || typeof row.audio_urls !== 'object') continue;
        const sessionPaths = Object.values(row.audio_urls)
            .map((urlValue) => toTrainingAudioRelativePath(urlValue))
            .filter((path): path is string => Boolean(path));
        if (sessionPaths.length > 0) {
            audioUrlPathsBySession.set(row.id, Array.from(new Set(sessionPaths)));
        }
    }

    const listAudioPathsBySession = async (sessionId: string): Promise<{ paths: string[]; listFailed: boolean }> => {
        const pageSize = 1000;
        let offset = 0;
        const paths: string[] = [];
        let listFailed = false;

        while (true) {
            const { data: listedFiles, error: listError } = await supabase.storage
                .from('training_audio')
                .list(sessionId, { limit: pageSize, offset });

            if (listError) {
                listFailed = true;
                break;
            }

            const rows = listedFiles || [];
            scannedFileCount += rows.length;

            const pagePaths = rows
                .map((file: any) => String(file?.name || ''))
                .filter((name: string) => /\.(mp3|m4a)$/i.test(name))
                .map((name: string) => `${sessionId}/${name}`);

            paths.push(...pagePaths);

            if (rows.length < pageSize) {
                break;
            }
            offset += pageSize;
        }

        return { paths, listFailed };
    };

    for (const sessionId of uniqueSessionIds) {
        const listed = await listAudioPathsBySession(sessionId);
        const fromAudioUrls = (audioUrlPathsBySession.get(sessionId) || [])
            .filter((path) => path.startsWith(`${sessionId}/`));
        const mergedPaths = Array.from(new Set([...listed.paths, ...fromAudioUrls]));

        if (listed.listFailed && mergedPaths.length === 0) {
            failedSessionIds.push(sessionId);
            continue;
        }

        if (mergedPaths.length > 0) {
            for (const path of mergedPaths) {
                if (!removablePathSet.has(path)) {
                    removablePathSet.add(path);
                    removablePaths.push(path);
                }
            }
            removedSessionCount += 1;
        }
    }

    let removedFileCount = 0;
    for (let index = 0; index < removablePaths.length; index += 100) {
        const chunk = removablePaths.slice(index, index + 100);
        if (chunk.length === 0) continue;

        const { error: removeError } = await supabase.storage
            .from('training_audio')
            .remove(chunk);

        if (removeError) {
            throw new Error(`스토리지 삭제 실패: ${removeError.message}`);
        }
        removedFileCount += chunk.length;
    }

    let updatedSessionCount = 0;
    for (let index = 0; index < uniqueSessionIds.length; index += 200) {
        const chunkSessionIds = uniqueSessionIds.slice(index, index + 200);
        if (chunkSessionIds.length === 0) continue;

        const { error: updateError } = await supabase
            .from('training_sessions')
            .update({ audio_urls: {} })
            .in('id', chunkSessionIds);

        if (updateError) {
            throw new Error(`training_sessions audio_urls 초기화 실패: ${updateError.message}`);
        }

        updatedSessionCount += chunkSessionIds.length;
    }

    return {
        mode,
        targetSessionCount: uniqueSessionIds.length,
        excludedSessionCount,
        scannedFileCount,
        updatedSessionCount,
        removedFileCount,
        removedSessionCount,
        failedSessionCount: failedSessionIds.length,
        failedSessionIds,
    };
}

// -----------------------------------------------------------------------
// 메인 핸들러
// -----------------------------------------------------------------------
export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    if (!isValidAdminAuthRequest(req)) {
        return sendUnauthorizedAdminResponse(res);
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

            case 'record-safety-closure-loop':
                data = await handleRecordSafetyClosureLoop(payload);
                break;

            case 'evaluate-worker-integrity':
                data = await handleEvaluateWorkerIntegrity(payload);
                break;

            case 'bulk-upload-workers':
                data = await handleBulkUploadWorkers(payload);
                break;

            case 'list-workers':
                data = await handleListWorkers(payload);
                break;

            case 'get-worker-contact':
                data = await handleGetWorkerContact(payload);
                break;

            case 'list-report-message-logs':
                data = await handleListReportMessageLogs(payload);
                break;

            case 'get-report-message-dashboard-summary':
                data = await handleGetReportMessageDashboardSummary(payload);
                break;

            case 'update-worker':
                data = await handleUpdateWorker(payload);
                break;

            case 'delete-worker':
                data = await handleDeleteWorker(payload);
                break;

            case 'restore-worker':
                data = await handleRestoreWorker(payload);
                break;

            case 'flush-audio-storage':
                data = await handleFlushAudioStorage(payload);
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
        const rawMessage = err?.message || '서버 오류';
        const schemaHintMessage = buildSafetySchemaMissingMessage(String(rawMessage));

        if (schemaHintMessage) {
            return res.status(500).json({
                ok: false,
                code: 'SAFETY_INTEGRITY_SCHEMA_MISSING',
                message: schemaHintMessage,
                details: rawMessage,
            });
        }

        return res.status(500).json({ ok: false, message: rawMessage });
    }
}

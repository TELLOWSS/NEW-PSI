/**
 * pages/SafetyBehaviorManagement.tsx
 *
 * 현장 불안전행동 관찰 기록 + 코칭 조치 등록 + 무결성 자동 판정 대시보드
 *
 * 핵심 UX 원칙:
 * - 프리셋 버튼 원터치 선택 (타이핑 최소화)
 * - 다중 근로자 체크박스 → 일괄 등록
 * - 트래픽라이트(🟢🟡🔴) 뱃지로 무결성 상태 시각화
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { postAdminJson } from '../utils/adminApiClient';
import type { WorkerRecord } from '../types';

// -----------------------------------------------------------------------
// 상수 / 프리셋 목록 (API와 동기화)
// -----------------------------------------------------------------------
const UNSAFE_BEHAVIOR_PRESETS = [
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

const SEVERITY_PRESETS = [
    { value: '낮음', label: '낮음', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    { value: '보통', label: '보통', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    { value: '높음', label: '높음', color: 'bg-orange-100 text-orange-700 border-orange-200' },
    { value: '즉시조치', label: '즉시조치', color: 'bg-red-100 text-red-700 border-red-200' },
] as const;

const COACHING_ACTION_PRESETS = [
    { value: '재교육', icon: '📚' },
    { value: '현장코칭', icon: '🗣️' },
    { value: '작업중지', icon: '🛑' },
    { value: '보호구개선', icon: '🦺' },
    { value: '안전조회 특별교육', icon: '📋' },
    { value: '서면경고', icon: '✉️' },
    { value: '기타', icon: '💬' },
] as const;

const FOLLOWUP_PRESETS = [
    { value: '개선됨', label: '개선됨', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    { value: '확인중', label: '확인중', color: 'text-amber-700 bg-amber-50 border-amber-200' },
    { value: '재발', label: '재발', color: 'text-red-700 bg-red-50 border-red-200' },
] as const;

// -----------------------------------------------------------------------
// 타입
// -----------------------------------------------------------------------
type Tab = 'observe' | 'review';
type TrafficLight = 'green' | 'yellow' | 'red';

interface IntegrityReviewRow {
    worker_id: string;
    worker_name: string;
    integrity_status: string;
    integrity_reason_codes: string[];
    computed_score: number;
    traffic_light: TrafficLight;
}

interface WorkerOption {
    id: string;
    name: string;
    label: string;
    trade?: string;
    nationality?: string;
    team?: string;
}

// -----------------------------------------------------------------------
// 더미 근로자 목록 (실제 구현에서는 Supabase에서 조회)
// -----------------------------------------------------------------------
const DUMMY_WORKERS: WorkerOption[] = [
    { id: 'w001', name: '김철수', label: '김철수 (철근/A팀)', trade: '철근', team: 'A팀' },
    { id: 'w002', name: '이영희', label: '이영희 (거푸집/B팀)', trade: '거푸집', team: 'B팀' },
    { id: 'w003', name: '박민준', label: '박민준 (콘크리트/C팀)', trade: '콘크리트', team: 'C팀' },
    { id: 'w004', name: '최지아', label: '최지아 (배관/D팀)', trade: '배관', team: 'D팀' },
    { id: 'w005', name: '정해진', label: '정해진 (전기/E팀)', trade: '전기', team: 'E팀' },
    { id: 'w006', name: '한승우', label: '한승우 (도장/F팀)', trade: '도장', team: 'F팀' },
];

// -----------------------------------------------------------------------
// 유틸
// -----------------------------------------------------------------------
function getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function trafficLightConfig(light: TrafficLight) {
    if (light === 'green') return { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', label: '확정' };
    if (light === 'yellow') return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-400', label: '검토중' };
    return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500', label: '위험/보류' };
}

function reasonCodeToKo(code: string): string {
    const map: Record<string, string> = {
        EDUCATION_INCOMPLETE: '교육 미완료',
        COACHING_MISSING: '코칭 미실시',
        REPEAT_VIOLATION: '반복 위반',
        TIMELINE_MISMATCH: '타임라인 불일치',
        DOCUMENT_INSUFFICIENT: '문서 점수 미달',
        FOLLOWUP_PENDING: '사후조치 미완',
    };
    return map[code] || code;
}

function buildWorkerOptionLabel(worker: Pick<WorkerRecord, 'name' | 'jobField' | 'teamLeader' | 'nationality' | 'employeeId' | 'qrId'>): string {
    const name = String(worker.name || '').trim() || '이름없음';
    const field = String(worker.jobField || '').trim();
    const team = String(worker.teamLeader || '').trim();
    const nationality = String(worker.nationality || '').trim();
    const employeeId = String(worker.employeeId || '').trim();
    const qrId = String(worker.qrId || '').trim();

    const identityTag = employeeId
        ? `사번:${employeeId}`
        : (qrId ? `QR:${qrId.slice(-6)}` : '식별자없음');
    const profileTag = field || team
        ? `${field || '미분류'}${team ? `/${team}` : ''}`
        : (nationality || '미상');

    return `${name} (${profileTag} · ${identityTag})`;
}

// -----------------------------------------------------------------------
// 공통 API 호출 헬퍼
// -----------------------------------------------------------------------
async function callApi(endpoint: string, body: object): Promise<{ ok: boolean; [key: string]: any }> {
    return postAdminJson<{ ok: boolean; [key: string]: any }>(endpoint, body, {
        fallbackMessage: '관리자 API 호출 실패',
    });
}

// -----------------------------------------------------------------------
// 탭: 불안전행동 관찰 기록
// -----------------------------------------------------------------------
const ObserveTab: React.FC<{ assessmentMonth: string; workers: WorkerOption[] }> = ({ assessmentMonth, workers }) => {
    const [selectedWorkers, setSelectedWorkers] = useState<Set<string>>(new Set());
    const [behaviorPreset, setBehaviorPreset] = useState<string | null>(null);
    const [severity, setSeverity] = useState<string>('보통');
    const [observerName, setObserverName] = useState('');
    const [evidenceNote, setEvidenceNote] = useState('');
    const [includeCoaching, setIncludeCoaching] = useState(true);
    const [actionType, setActionType] = useState<string | null>(null);
    const [followupResult, setFollowupResult] = useState<string>('확인중');
    const [coachName, setCoachName] = useState('');
    const [actionDetail, setActionDetail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

    const toggleWorker = (id: string) => {
        setSelectedWorkers((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (selectedWorkers.size === workers.length) {
            setSelectedWorkers(new Set());
        } else {
            setSelectedWorkers(new Set(workers.map((w) => w.id)));
        }
    };

    const handleSubmit = async () => {
        if (selectedWorkers.size === 0) return alert('관찰 대상 근로자를 1명 이상 선택하세요.');
        if (!behaviorPreset) return alert('불안전행동 유형을 선택하세요.');
        if (includeCoaching && !actionType) return alert('코칭 동시 등록 시 조치 유형을 선택하세요.');

        setSubmitting(true);
        setResult(null);
        try {
            const nowIso = new Date().toISOString();
            const records = Array.from(selectedWorkers).map((workerId) => ({
                worker_id: workerId,
                assessment_month: assessmentMonth,
                observed_at: nowIso,
                observer_name: observerName || undefined,
                unsafe_behavior_flag: true,
                unsafe_behavior_type: behaviorPreset,
                severity_level: severity,
                evidence_note: evidenceNote || undefined,
                action_type: includeCoaching ? (actionType || undefined) : undefined,
                action_detail: includeCoaching ? (actionDetail || undefined) : undefined,
                action_completed_at: includeCoaching ? nowIso : undefined,
                coach_name: includeCoaching ? (coachName || undefined) : undefined,
                followup_result: includeCoaching ? followupResult : undefined,
                followup_checked_at: includeCoaching ? nowIso : undefined,
            }));

            const data = await callApi('/api/admin/safety-management', {
                action: 'record-safety-closure-loop',
                payload: { records },
            });
            const observationCount = Number(data?.inserted_observations || 0);
            const coachingCount = Number(data?.inserted_coaching || 0);
            setResult({ ok: true, message: `통합 등록 완료 (관찰 ${observationCount}건 / 코칭 ${coachingCount}건)` });
            setSelectedWorkers(new Set());
            setBehaviorPreset(null);
            setEvidenceNote('');
            setActionType(null);
            setActionDetail('');
        } catch (e: any) {
            setResult({ ok: false, message: e.message });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-5">
            {/* 근로자 선택 */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-slate-800 text-sm">근로자 선택</h3>
                    <button
                        onClick={toggleAll}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                    >
                        {selectedWorkers.size === workers.length ? '전체 해제' : '전체 선택'}
                    </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {workers.map((w) => (
                        <label
                            key={w.id}
                            className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all select-none
                                ${selectedWorkers.has(w.id)
                                    ? 'border-indigo-400 bg-indigo-50 text-indigo-800'
                                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300'
                                }`}
                        >
                            <input
                                type="checkbox"
                                className="w-4 h-4 accent-indigo-600"
                                checked={selectedWorkers.has(w.id)}
                                onChange={() => toggleWorker(w.id)}
                            />
                            <span className="text-xs font-semibold">{w.label}</span>
                        </label>
                    ))}
                </div>
            </div>

            {/* 불안전행동 유형 선택 (프리셋) */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="font-bold text-slate-800 text-sm mb-3">불안전행동 유형</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {UNSAFE_BEHAVIOR_PRESETS.map((preset) => (
                        <button
                            key={preset}
                            onClick={() => setBehaviorPreset(preset === behaviorPreset ? null : preset)}
                            className={`text-xs font-semibold py-2 px-3 rounded-lg border transition-all text-left
                                ${behaviorPreset === preset
                                    ? 'bg-rose-500 text-white border-rose-500 shadow-sm'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-rose-300 hover:bg-rose-50'
                                }`}
                        >
                            {preset}
                        </button>
                    ))}
                </div>
            </div>

            {/* 심각도 */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="font-bold text-slate-800 text-sm mb-3">심각도</h3>
                <div className="flex flex-wrap gap-2">
                    {SEVERITY_PRESETS.map((s) => (
                        <button
                            key={s.value}
                            onClick={() => setSeverity(s.value)}
                            className={`text-xs font-bold py-1.5 px-3 rounded-full border transition-all
                                ${severity === s.value
                                    ? s.color + ' ring-2 ring-offset-1 ring-current'
                                    : 'bg-slate-50 text-slate-500 border-slate-200'
                                }`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 부가 정보 */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">관찰자 이름</label>
                    <input
                        type="text"
                        value={observerName}
                        onChange={(e) => setObserverName(e.target.value)}
                        placeholder="관리감독자 이름 (선택)"
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">증빙 메모</label>
                    <textarea
                        value={evidenceNote}
                        onChange={(e) => setEvidenceNote(e.target.value)}
                        placeholder="현장 상황 간략 기록 (선택)"
                        rows={2}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                    />
                </div>
            </div>

            {/* 코칭 동시 등록 */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 text-sm">코칭 조치 동시 등록</h3>
                    <button
                        type="button"
                        onClick={() => setIncludeCoaching((prev) => !prev)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${includeCoaching ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
                    >
                        {includeCoaching ? 'ON' : 'OFF'}
                    </button>
                </div>

                {includeCoaching && (
                    <>
                        <div>
                            <h4 className="font-bold text-slate-700 text-xs mb-2">조치 유형</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {COACHING_ACTION_PRESETS.map((a) => (
                                    <button
                                        key={a.value}
                                        onClick={() => setActionType(a.value === actionType ? null : a.value)}
                                        className={`flex items-center gap-2 text-xs font-semibold py-2 px-3 rounded-lg border transition-all
                                            ${actionType === a.value
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
                                            }`}
                                    >
                                        <span>{a.icon}</span>
                                        <span>{a.value}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h4 className="font-bold text-slate-700 text-xs mb-2">사후조치 결과</h4>
                            <div className="flex gap-2">
                                {FOLLOWUP_PRESETS.map((f) => (
                                    <button
                                        key={f.value}
                                        onClick={() => setFollowupResult(f.value)}
                                        className={`flex-1 text-xs font-bold py-2 px-2 rounded-lg border transition-all
                                            ${followupResult === f.value
                                                ? f.color + ' ring-2 ring-offset-1 ring-current'
                                                : 'bg-slate-50 text-slate-500 border-slate-200'
                                            }`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">코치 이름</label>
                                <input
                                    type="text"
                                    value={coachName}
                                    onChange={(e) => setCoachName(e.target.value)}
                                    placeholder="담당 관리감독자 (선택)"
                                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">조치 내용 메모</label>
                                <input
                                    type="text"
                                    value={actionDetail}
                                    onChange={(e) => setActionDetail(e.target.value)}
                                    placeholder="코칭 내용 간략 기록 (선택)"
                                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                />
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* 제출 버튼 */}
            <button
                onClick={handleSubmit}
                disabled={submitting || selectedWorkers.size === 0 || !behaviorPreset || (includeCoaching && !actionType)}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all
                    bg-rose-600 text-white hover:bg-rose-700 active:scale-95
                    disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
            >
                {submitting ? '통합 등록 중...' : `점검+코칭 통합 등록 (${selectedWorkers.size}명 / 1회 호출)`}
            </button>

            {result && (
                <div className={`rounded-xl p-3 text-sm font-semibold text-center
                    ${result.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {result.ok ? '✅ ' : '❌ '}{result.message}
                </div>
            )}
        </div>
    );
};

// -----------------------------------------------------------------------
// 탭: 코칭 조치 등록
// -----------------------------------------------------------------------
const CoachingTab: React.FC<{ assessmentMonth: string }> = ({ assessmentMonth }) => {
    const [selectedWorkers, setSelectedWorkers] = useState<Set<string>>(new Set());
    const [actionType, setActionType] = useState<string | null>(null);
    const [followupResult, setFollowupResult] = useState<string>('확인중');
    const [coachName, setCoachName] = useState('');
    const [actionDetail, setActionDetail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

    const toggleWorker = (id: string) => {
        setSelectedWorkers((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleSubmit = async () => {
        if (selectedWorkers.size === 0) return alert('코칭 대상 근로자를 1명 이상 선택하세요.');
        if (!actionType) return alert('조치 유형을 선택하세요.');

        setSubmitting(true);
        setResult(null);
        try {
            const records = Array.from(selectedWorkers).map((workerId) => ({
                worker_id: workerId,
                assessment_month: assessmentMonth,
                action_type: actionType,
                action_detail: actionDetail || undefined,
                action_completed_at: new Date().toISOString(),
                coach_name: coachName || undefined,
                followup_result: followupResult,
                followup_checked_at: new Date().toISOString(),
            }));

            const data = await callApi('/api/admin/safety-management', {
                action: 'register-coaching-action',
                payload: { records },
            });
            setResult({ ok: true, message: `${data.inserted}건 코칭 등록 완료` });
            setSelectedWorkers(new Set());
            setActionType(null);
            setActionDetail('');
        } catch (e: any) {
            setResult({ ok: false, message: e.message });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-5">
            {/* 근로자 선택 */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="font-bold text-slate-800 text-sm mb-3">코칭 대상 근로자</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {DUMMY_WORKERS.map((w) => (
                        <label
                            key={w.id}
                            className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all select-none
                                ${selectedWorkers.has(w.id)
                                    ? 'border-indigo-400 bg-indigo-50 text-indigo-800'
                                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300'
                                }`}
                        >
                            <input
                                type="checkbox"
                                className="w-4 h-4 accent-indigo-600"
                                checked={selectedWorkers.has(w.id)}
                                onChange={() => toggleWorker(w.id)}
                            />
                            <span className="text-xs font-semibold">{w.name}</span>
                        </label>
                    ))}
                </div>
            </div>

            {/* 코칭 조치 유형 프리셋 */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="font-bold text-slate-800 text-sm mb-3">조치 유형 선택</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {COACHING_ACTION_PRESETS.map((a) => (
                        <button
                            key={a.value}
                            onClick={() => setActionType(a.value === actionType ? null : a.value)}
                            className={`flex items-center gap-2 text-xs font-semibold py-2 px-3 rounded-lg border transition-all
                                ${actionType === a.value
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
                                }`}
                        >
                            <span>{a.icon}</span>
                            <span>{a.value}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* 후속 조치 결과 */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="font-bold text-slate-800 text-sm mb-3">사후조치 결과</h3>
                <div className="flex gap-2">
                    {FOLLOWUP_PRESETS.map((f) => (
                        <button
                            key={f.value}
                            onClick={() => setFollowupResult(f.value)}
                            className={`flex-1 text-xs font-bold py-2 px-2 rounded-lg border transition-all
                                ${followupResult === f.value
                                    ? f.color + ' ring-2 ring-offset-1 ring-current'
                                    : 'bg-slate-50 text-slate-500 border-slate-200'
                                }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 코치 이름 + 메모 */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">코치 이름</label>
                    <input
                        type="text"
                        value={coachName}
                        onChange={(e) => setCoachName(e.target.value)}
                        placeholder="담당 관리감독자 (선택)"
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">조치 내용 메모</label>
                    <textarea
                        value={actionDetail}
                        onChange={(e) => setActionDetail(e.target.value)}
                        placeholder="코칭 내용 간략 기록 (선택)"
                        rows={2}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                    />
                </div>
            </div>

            {/* 제출 */}
            <button
                onClick={handleSubmit}
                disabled={submitting || selectedWorkers.size === 0 || !actionType}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all
                    bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95
                    disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
            >
                {submitting ? '등록 중...' : `코칭 조치 일괄 등록 (${selectedWorkers.size}명)`}
            </button>

            {result && (
                <div className={`rounded-xl p-3 text-sm font-semibold text-center
                    ${result.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {result.ok ? '✅ ' : '❌ '}{result.message}
                </div>
            )}
        </div>
    );
};

// -----------------------------------------------------------------------
// 탭: 무결성 종합 판정 (트래픽라이트 대시보드)
// -----------------------------------------------------------------------
const ReviewTab: React.FC<{ assessmentMonth: string; workers: WorkerOption[] }> = ({ assessmentMonth, workers }) => {
    const [loading, setLoading] = useState(false);
    const [reviews, setReviews] = useState<IntegrityReviewRow[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [lastEvaluated, setLastEvaluated] = useState<string | null>(null);

    const runEvaluation = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const allWorkerIds = workers.map((w) => w.id);
            const data = await callApi('/api/admin/safety-management', {
                action: 'evaluate-worker-integrity',
                payload: {
                    worker_ids: allWorkerIds,
                    assessment_month: assessmentMonth,
                },
            });

            const nameMap = Object.fromEntries(workers.map((w) => [w.id, w.label]));

            const rows: IntegrityReviewRow[] = (data.data?.results || []).map((r: any) => ({
                worker_id: r.worker_id,
                worker_name: nameMap[r.worker_id] || r.worker_id,
                integrity_status: r.integrity_status,
                integrity_reason_codes: r.integrity_reason_codes || [],
                computed_score: r.computed_score ?? 0,
                traffic_light: r.traffic_light,
            }));

            setReviews(rows);
            setLastEvaluated(new Date().toLocaleTimeString('ko-KR'));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [assessmentMonth, workers]);

    // 집계
    const summary = {
        green: reviews.filter((r) => r.traffic_light === 'green').length,
        yellow: reviews.filter((r) => r.traffic_light === 'yellow').length,
        red: reviews.filter((r) => r.traffic_light === 'red').length,
    };

    return (
        <div className="space-y-5">
            {/* 실행 버튼 */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-bold text-slate-800 text-sm">
                        {assessmentMonth} 무결성 자동 판정
                    </h3>
                    {lastEvaluated && (
                        <p className="text-xs text-slate-400 mt-0.5">최종 실행: {lastEvaluated}</p>
                    )}
                </div>
                <button
                    onClick={runEvaluation}
                    disabled={loading}
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 active:scale-95 disabled:opacity-50 transition-all"
                >
                    {loading ? '판정 중...' : '자동 판정 실행'}
                </button>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-semibold">
                    ❌ {error}
                </div>
            )}

            {/* 요약 트래픽라이트 카드 */}
            {reviews.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { key: 'green', label: '확정', icon: '🟢', count: summary.green, bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
                        { key: 'yellow', label: '검토중', icon: '🟡', count: summary.yellow, bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
                        { key: 'red', label: '위험/보류', icon: '🔴', count: summary.red, bg: 'bg-red-50 border-red-200', text: 'text-red-700' },
                    ].map((s) => (
                        <div key={s.key} className={`${s.bg} border rounded-xl p-3 text-center`}>
                            <div className="text-2xl mb-1">{s.icon}</div>
                            <div className={`text-2xl font-black ${s.text}`}>{s.count}</div>
                            <div className={`text-xs font-bold ${s.text}`}>{s.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* 근로자별 결과 테이블 */}
            {reviews.length > 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="text-left text-xs font-bold text-slate-500 py-2 px-3">근로자</th>
                                <th className="text-center text-xs font-bold text-slate-500 py-2 px-2">점수</th>
                                <th className="text-center text-xs font-bold text-slate-500 py-2 px-2">상태</th>
                                <th className="text-left text-xs font-bold text-slate-500 py-2 px-3">사유</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reviews.map((row, idx) => {
                                const cfg = trafficLightConfig(row.traffic_light);
                                return (
                                    <tr
                                        key={row.worker_id}
                                        className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                                    >
                                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                                            {row.worker_name}
                                        </td>
                                        <td className="py-2.5 px-2 text-center">
                                            <span className={`text-xs font-black ${
                                                row.computed_score >= 80 ? 'text-emerald-600' :
                                                row.computed_score >= 60 ? 'text-amber-600' : 'text-red-600'
                                            }`}>
                                                {row.computed_score}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-2 text-center">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                                {row.integrity_status}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-3">
                                            {row.integrity_reason_codes.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {row.integrity_reason_codes.map((code) => (
                                                        <span
                                                            key={code}
                                                            className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 font-medium"
                                                        >
                                                            {reasonCodeToKo(code)}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-[10px] text-emerald-500 font-semibold">이상없음</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : !loading ? (
                <div className="bg-slate-50 rounded-xl border border-dashed border-slate-300 p-8 text-center">
                    <p className="text-sm text-slate-400 font-medium">
                        「자동 판정 실행」 버튼을 눌러 근로자별 무결성을 평가하세요.
                    </p>
                </div>
            ) : (
                <div className="bg-slate-50 rounded-xl p-8 text-center">
                    <div className="animate-spin w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto mb-3" />
                    <p className="text-sm text-slate-400 font-medium">판정 결과를 가져오는 중...</p>
                </div>
            )}
        </div>
    );
};

// -----------------------------------------------------------------------
// 메인 페이지 컴포넌트
// -----------------------------------------------------------------------
interface SafetyBehaviorManagementProps {
    workerRecords: WorkerRecord[];
}

const SafetyBehaviorManagement: React.FC<SafetyBehaviorManagementProps> = ({ workerRecords }) => {
    const [activeTab, setActiveTab] = useState<Tab>('observe');
    const [assessmentMonth, setAssessmentMonth] = useState<string>(getCurrentMonth());
    const workerOptions = useMemo(() => {
        const sorted = [...workerRecords].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const seen = new Set<string>();
        const options: WorkerOption[] = [];

        for (const worker of sorted) {
            if (seen.has(worker.id)) continue;
            seen.add(worker.id);
            options.push({
                id: worker.id,
                name: worker.name,
                label: buildWorkerOptionLabel(worker),
                trade: worker.jobField,
                nationality: worker.nationality,
                team: worker.teamLeader,
            });
        }

        return options.length > 0 ? options : DUMMY_WORKERS;
    }, [workerRecords]);

    const tabs: { id: Tab; label: string; icon: string }[] = [
        { id: 'observe', label: '점검+코칭 통합등록', icon: '⚠️' },
        { id: 'review', label: '무결성 판정', icon: '🏷️' },
    ];

    return (
        <div className="p-4 sm:p-6 max-w-4xl mx-auto">
            {/* 헤더 */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div>
                    <h1 className="text-xl font-black text-slate-900">현장 불안전행동 관리</h1>
                    <p className="text-xs text-slate-400 mt-0.5 font-medium">
                        점검+코칭 통합 등록(1회 호출) → 무결성 자동 판정 (폐루프 검증)
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">평가 월</span>
                    <input
                        type="month"
                        value={assessmentMonth}
                        onChange={(e) => setAssessmentMonth(e.target.value)}
                        className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                </div>
            </div>

            {/* 탭 네비게이션 */}
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all
                            ${activeTab === tab.id
                                ? 'bg-white text-indigo-700 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        <span>{tab.icon}</span>
                        <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* 탭 콘텐츠 */}
            <div>
                {activeTab === 'observe' && <ObserveTab assessmentMonth={assessmentMonth} workers={workerOptions} />}
                {activeTab === 'review' && <ReviewTab assessmentMonth={assessmentMonth} workers={workerOptions} />}
            </div>
        </div>
    );
};

export default SafetyBehaviorManagement;

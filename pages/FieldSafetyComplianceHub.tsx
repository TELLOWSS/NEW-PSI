/**
 * pages/FieldSafetyComplianceHub.tsx
 *
 * 현장 안전이행 종합관리
 * ▸ 탭 1. 위험성평가 이행점검   – 공종별 안전조치 이행 여부 원터치 체크리스트 + 사진
 * ▸ 탭 2. 행동관찰 · 코칭       – 불안전행동 관찰 + 코칭 통합 등록 (다중 근로자, 사진)
 * ▸ 탭 3. 현장 지적사항         – 자체 / 원도급사 / 외부감찰(고용노동부·발주처 등) 지적 관리
 * ▸ 탭 4. 이행 종합판정         – 3개 영역 통합 Traffic-Light 이행 대시보드
 *
 * 영속성: 탭1·탭3 → localStorage, 탭2 → API(/api/admin/safety-management) + fallback
 */

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { WorkerRecord } from '../types';
import { postAdminJson } from '../utils/adminApiClient';
import { isAdminAuthenticated } from '../utils/adminGuard';
import { compressImage } from '../utils/imageCompression';

// ─────────────────────────────────────────────────────────────────────────────
// 공통 유틸
// ─────────────────────────────────────────────────────────────────────────────
function getCurrentMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function todayStr(): string {
    return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso?: string | null): string {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso.slice(0, 10);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function buildWorkerLabel(w: WorkerRecord): string {
    const field = String(w.jobField || '').trim();
    const team = String(w.teamLeader || '').trim();
    const empId = String(w.employeeId || '').trim();
    const qrId = String(w.qrId || '').trim();
    const idTag = empId ? `사번:${empId}` : (qrId ? `QR:${qrId.slice(-6)}` : '식별자없음');
    const profileTag = field || team ? `${field || '미분류'}${team ? `/${team}` : ''}` : (String(w.nationality || '').trim() || '미상');
    return `${w.name} (${profileTag} · ${idTag})`;
}

function getAppSettings() {
    try { return JSON.parse(localStorage.getItem('psi_app_settings') || '{}') as Record<string, unknown>; }
    catch { return {}; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────────────────────

// --- 탭1: 위험성평가 이행점검 ---
type ComplianceStatus = 'compliant' | 'partial' | 'non-compliant';

interface RiskCheckItem {
    id: string;
    label: string;
    status: ComplianceStatus;
    note: string;
}

interface RiskCheckSession {
    id: string;
    date: string;
    jobField: string;
    teamLeader: string;
    checkerName: string;
    items: RiskCheckItem[];
    photo: string;
    createdAt: string;
}

// --- 탭3: 현장 지적사항 ---
type ViolationSource = 'self' | 'general-contractor' | 'external';
type ViolationStatus = 'open' | 'in-progress' | 'resolved';

interface SiteViolation {
    id: string;
    issueDate: string;
    source: ViolationSource;
    externalAuthority: string;
    category: string;
    description: string;
    severity: '경미' | '보통' | '중대';
    dueDate: string;
    responsibleTeam: string;
    status: ViolationStatus;
    resolutionNote: string;
    photo: string;
    createdAt: string;
}

// --- 탭4: 무결성 판정 결과 ---
type TrafficLight = 'green' | 'yellow' | 'red';
interface IntegrityRow {
    worker_id: string;
    worker_name: string;
    integrity_status: string;
    integrity_reason_codes: string[];
    computed_score: number;
    traffic_light: TrafficLight;
}

// ─────────────────────────────────────────────────────────────────────────────
// 상수 / 프리셋
// ─────────────────────────────────────────────────────────────────────────────
const COMPLIANCE_META: Record<ComplianceStatus, { label: string; activeClass: string; dotClass: string }> = {
    'compliant':     { label: '이행',    activeClass: 'bg-emerald-500 text-white border-emerald-500', dotClass: 'bg-emerald-500' },
    'partial':       { label: '부분이행', activeClass: 'bg-amber-400 text-white border-amber-400',   dotClass: 'bg-amber-400' },
    'non-compliant': { label: '미이행',  activeClass: 'bg-rose-500 text-white border-rose-500',      dotClass: 'bg-rose-500' },
};

// 공종별 위험성평가 기본 체크리스트 항목
const RISK_CHECK_PRESETS: Record<string, string[]> = {
    '형틀목공': ['안전대 체결 상태 확인', '작업발판 300mm 이상 설치', '개구부 덮개·안전망 설치', '가설구조물 구조검토서 구비', '작업 전 안전교육 실시', '관리감독자 현장 배치'],
    '거푸집': ['폼 잠금장치 체결 확인', '동바리 수직도 점검', '콘크리트 타설 중 거푸집 변형 감시', '거푸집 해체 순서 준수', '개구부 안전 덮개 설치', '추락방호망 설치 여부'],
    '철근': ['자재 전도·낙하 방지 조치', '결속선 끝단 마감 상태', '안전모·안전화 착용 확인', '자재 적재 안정성(1.5m 이하)', '크레인 작업반경 내 근로자 통제', '운반 경로 통제 조치'],
    '콘크리트': ['펌프카 아웃트리거 지반 보강', '타설 구역 접근 통제', '진동기 사용 안전수칙 준수', '거푸집 체결 최종 확인', '감전방지 접지 확인', '야간 작업 시 조명 확보'],
    '시스템비계': ['벽이음 간격 기준 준수', '작업발판 체결 상태', '안전난간 설치 높이(90cm 이상)', '발끝막이판 설치', '비계 자재 품질 확인서 구비', '풍하중 대비 보강 조치'],
    '비계': ['강관비계 벽이음 간격 준수', '작업발판 체결 안전 상태', '안전난간 90cm 이상 설치', '비계 발끝막이판 설치', '과부하 금지 안내 배치', '비계 선행 작업 중지'],
    '마감·미장': ['낙하물 방지망 설치', '고소작업차 안전벨트 체결', '작업 구간 하부 통제', '분진 방지 방호 마스크 착용', '작업발판 안전 상태', '승하강 장비 안전 작동 확인'],
    '전기': ['접지 확인', '차단기 잠금(LOTO) 확인', '절연장갑 착용 여부', '감전방지 가드 설치', '고압선 이격 거리 2m 이상 준수', '전기 작업 허가서 발부'],
    '배관': ['밀폐공간 산소농도 18% 이상 확인', '가스관 압력시험 완료 확인', '화기작업 허가서 발부', '소화기 5m 이내 배치', '배관 지지물 설치 상태', '누출 감지 센서 작동 확인'],
    '용접': ['화기작업 허가서 발부', '불꽃 비산 방지포 설치', '소화기 1m 이내 배치', '용접 흄 환기 설비 가동', '가연물 제거(반경 5m)', '보안경·방열복 착용 확인'],
    '도장': ['방독마스크 착용 확인', '후드 환기 설비 가동', 'MSDS 게시 확인', '인화성 자재 격리 보관', '흡연 금지 구역 설정', '정전기 방지 조치 확인'],
    '철골': ['볼트 체결 토크 검사', '안전대 부착 설비 설치', '낙하물 방지망 설치', '크레인 신호수 배치', '철골 조립 순서 준수', '조립 완료 전 임시 버팀대 설치'],
    '공통': ['작업 전 TBM 실시 여부', '안전모·안전화 착용 전원 확인', '위험 구역 접근 통제선 설치', '응급 상황 연락망 게시', '작업 허가서 적정 발부', '무단 작업 구역 침입 통제'],
};

const BEHAVIOR_PRESETS = [
    '안전대 미체결', '개구부 무단 접근', '보호구 미착용', '안전모 미착용',
    '작업발판 미설치', '추락방호망 미설치', '정리정돈 불량', '무단 작업구역 진입',
    '전기 안전수칙 위반', '화기 취급 부주의', '중장비 작업반경 내 접근', '안전통로 미확보', '기타',
] as const;

const SEVERITY_PRESETS = [
    { value: '낮음',   color: 'bg-blue-100 text-blue-700 border-blue-200' },
    { value: '보통',   color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    { value: '높음',   color: 'bg-orange-100 text-orange-700 border-orange-200' },
    { value: '즉시조치', color: 'bg-red-100 text-red-700 border-red-200' },
] as const;

const COACHING_PRESETS = [
    { value: '재교육', icon: '📚' }, { value: '현장코칭', icon: '🗣️' }, { value: '작업중지', icon: '🛑' },
    { value: '보호구개선', icon: '🦺' }, { value: '안전조회 특별교육', icon: '📋' }, { value: '서면경고', icon: '✉️' }, { value: '기타', icon: '💬' },
] as const;

const FOLLOWUP_PRESETS = [
    { value: '개선됨', label: '개선됨', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    { value: '확인중', label: '확인중', color: 'text-amber-700 bg-amber-50 border-amber-200' },
    { value: '재발',   label: '재발',   color: 'text-red-700 bg-red-50 border-red-200' },
] as const;

const VIOLATION_SOURCES: { value: ViolationSource; label: string; badgeClass: string }[] = [
    { value: 'self',               label: '자체 점검',    badgeClass: 'bg-slate-100 text-slate-700' },
    { value: 'general-contractor', label: '원도급사',     badgeClass: 'bg-blue-100 text-blue-700' },
    { value: 'external',           label: '외부감찰',     badgeClass: 'bg-red-100 text-red-700' },
];

const EXTERNAL_AUTHORITIES = ['고용노동부', '발주처', '소방서', '환경부', '건설안전감독부', '기타'];

const VIOLATION_CATEGORIES = [
    '추락·전락', '낙하·비래', '감전', '화재·폭발', '협착·끼임', '충돌', '정리정돈',
    '개인보호구', '가설구조물', '양중·운반', '굴착·토공', '기타',
];

const VIOLATION_STATUS_META: Record<ViolationStatus, { label: string; badgeClass: string }> = {
    'open':        { label: '미조치',  badgeClass: 'bg-rose-100 text-rose-700' },
    'in-progress': { label: '조치중',  badgeClass: 'bg-amber-100 text-amber-700' },
    'resolved':    { label: '조치완료', badgeClass: 'bg-emerald-100 text-emerald-700' },
};

// ─────────────────────────────────────────────────────────────────────────────
// localStorage 헬퍼
// ─────────────────────────────────────────────────────────────────────────────
const RISK_CHECK_KEY = 'psi_risk_check_sessions_v1';
const VIOLATIONS_KEY = 'psi_site_violations_v1';

function loadRiskCheckSessions(): RiskCheckSession[] {
    try { return JSON.parse(localStorage.getItem(RISK_CHECK_KEY) || '[]') as RiskCheckSession[]; }
    catch { return []; }
}

function saveRiskCheckSessions(sessions: RiskCheckSession[]) {
    try { localStorage.setItem(RISK_CHECK_KEY, JSON.stringify(sessions)); } catch { /* ignore */ }
}

function loadViolations(): SiteViolation[] {
    try { return JSON.parse(localStorage.getItem(VIOLATIONS_KEY) || '[]') as SiteViolation[]; }
    catch { return []; }
}

function saveViolations(violations: SiteViolation[]) {
    try { localStorage.setItem(VIOLATIONS_KEY, JSON.stringify(violations)); } catch { /* ignore */ }
}

function reasonCodeToKo(code: string): string {
    const map: Record<string, string> = {
        EDUCATION_INCOMPLETE: '교육 미완료',
        COACHING_MISSING: '코칭 미실시',
        REPEAT_VIOLATION: '반복 위반',
        TIMELINE_MISMATCH: '타임라인 불일치',
        DOCUMENT_INSUFFICIENT: '문서 점수 미달',
        FOLLOWUP_PENDING: '사후 조치 미완',
    };
    return map[code] || code;
}

function tlConfig(light: TrafficLight) {
    if (light === 'green')  return { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', label: '확정' };
    if (light === 'yellow') return { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-400',   label: '검토중' };
    return                         { bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500',     label: '위험/보류' };
}

const PANEL_CLASS = 'rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_-18px_rgba(15,23,42,0.35)]';
const SECTION_TITLE_CLASS = 'text-[15px] sm:text-base font-black tracking-tight text-slate-900';
const SECTION_SUBTEXT_CLASS = 'text-sm font-medium leading-6 text-slate-600';
const FIELD_LABEL_CLASS = 'mb-1.5 block text-[13px] font-semibold text-slate-600';
const INPUT_CLASS = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm shadow-slate-100 transition focus:outline-none focus:ring-2 focus:ring-indigo-200 focus-visible:ring-2 focus-visible:ring-indigo-300';
const INPUT_COMPACT_CLASS = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm shadow-slate-100 transition focus:outline-none focus:ring-2 focus:ring-indigo-200 focus-visible:ring-2 focus-visible:ring-indigo-300';
const SOFT_BUTTON_CLASS = 'rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300';
const EMPTY_STATE_CLASS = 'rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center';

// ─────────────────────────────────────────────────────────────────────────────
// 탭 1: 위험성평가 이행점검
// ─────────────────────────────────────────────────────────────────────────────
const RiskCheckTab: React.FC<{ workerRecords: WorkerRecord[] }> = ({ workerRecords }) => {
    const settings = useMemo(() => getAppSettings(), []);
    const registeredFields: string[] = useMemo(() => {
        const fromSettings = Array.isArray(settings.jobFields) ? (settings.jobFields as string[]) : [];
        const fromRecords = [...new Set(workerRecords.map(w => String(w.jobField || '').trim()).filter(Boolean))];
        return [...new Set([...fromSettings, ...fromRecords, '공통'])];
    }, [settings, workerRecords]);

    const [sessions, setSessions] = useState<RiskCheckSession[]>(() => loadRiskCheckSessions());
    const [selectedField, setSelectedField] = useState('');
    const [team, setTeam] = useState('');
    const [checkerName, setCheckerName] = useState('');
    const [date, setDate] = useState(todayStr());
    const [items, setItems] = useState<RiskCheckItem[]>([]);
    const [photo, setPhoto] = useState('');
    const [isCompressing, setIsCompressing] = useState(false);
    const [saved, setSaved] = useState(false);

    const photoRef = useRef<HTMLInputElement>(null);

    const allTeams = useMemo(() => [...new Set(workerRecords.map(w => String(w.teamLeader || '').trim()).filter(Boolean))], [workerRecords]);

    // 공종 선택 시 체크리스트 생성
    function handleFieldSelect(field: string) {
        setSelectedField(field);
        const presets = RISK_CHECK_PRESETS[field] ?? RISK_CHECK_PRESETS['공통'] ?? [];
        setItems(presets.map((label, i) => ({ id: `item-${i}`, label, status: 'compliant', note: '' })));
        setSaved(false);
    }

    function setItemStatus(id: string, status: ComplianceStatus) {
        setItems(prev => prev.map(it => it.id === id ? { ...it, status } : it));
    }
    function setItemNote(id: string, note: string) {
        setItems(prev => prev.map(it => it.id === id ? { ...it, note } : it));
    }

    async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsCompressing(true);
        try { setPhoto(await compressImage(file)); }
        catch { /* ignore */ }
        finally { setIsCompressing(false); }
    }

    function handleSave() {
        if (!selectedField || items.length === 0) { alert('공종을 선택해주세요.'); return; }
        const session: RiskCheckSession = {
            id: `rcs-${Date.now()}`, date, jobField: selectedField, teamLeader: team,
            checkerName, items: [...items], photo, createdAt: new Date().toISOString(),
        };
        const next = [session, ...sessions];
        setSessions(next);
        saveRiskCheckSessions(next);
        setSaved(true);
        setPhoto('');
        if (photoRef.current) photoRef.current.value = '';
    }

    function removeSession(id: string) {
        const next = sessions.filter(s => s.id !== id);
        setSessions(next);
        saveRiskCheckSessions(next);
    }

    const nonCompliantCount = items.filter(it => it.status === 'non-compliant').length;
    const partialCount = items.filter(it => it.status === 'partial').length;

    return (
        <div className="space-y-5 xl:space-y-0 xl:grid xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] 2xl:grid-cols-[minmax(0,1.2fr)_420px] xl:gap-6 xl:items-start">
            <div className="space-y-5">
            {/* 공종 선택 */}
            <div className={`${PANEL_CLASS} p-4 sm:p-5`}>
                <div className="mb-4 flex flex-col gap-1">
                    <h3 className={SECTION_TITLE_CLASS}>⑴ 점검 기본 정보</h3>
                    <p className={SECTION_SUBTEXT_CLASS}>공종, 팀, 점검 정보를 먼저 정리한 뒤 체크리스트를 시작합니다.</p>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)] gap-4 items-start">
                    <div>
                        <label className={FIELD_LABEL_CLASS}>공종 선택</label>
                        <div className="flex flex-wrap gap-2">
                            {registeredFields.map(f => (
                                <button key={f} onClick={() => handleFieldSelect(f)}
                                    className={`rounded-xl border px-3 py-2 text-[13px] font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${selectedField === f ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'}`}>
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <div>
                            <label className={FIELD_LABEL_CLASS}>팀 / 반</label>
                            <select value={team} onChange={e => setTeam(e.target.value)}
                                className={INPUT_COMPACT_CLASS}>
                                <option value="">팀 선택 (선택)</option>
                                {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                                <label className={FIELD_LABEL_CLASS}>점검일</label>
                                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                                    className={INPUT_COMPACT_CLASS} />
                            </div>
                            <div>
                                <label className={FIELD_LABEL_CLASS}>점검자</label>
                                <input type="text" value={checkerName} onChange={e => setCheckerName(e.target.value)} placeholder="이름(선택)"
                                    className={INPUT_COMPACT_CLASS} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 체크리스트 */}
            {items.length > 0 && (
                <div className={`${PANEL_CLASS} p-4 sm:p-5`}>
                    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <h3 className={SECTION_TITLE_CLASS}>⑵ 안전조치 이행 점검 ({selectedField})</h3>
                            <p className={`${SECTION_SUBTEXT_CLASS} mt-1`}>항목별 상태를 같은 높이의 버튼으로 정리해 빠르게 체크할 수 있도록 조정했습니다.</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {nonCompliantCount > 0 && <span className="text-[11px] font-bold bg-rose-100 text-rose-700 rounded-full px-2.5 py-1">미이행 {nonCompliantCount}</span>}
                            {partialCount > 0 && <span className="text-[11px] font-bold bg-amber-100 text-amber-700 rounded-full px-2.5 py-1">부분 {partialCount}</span>}
                        </div>
                    </div>
                    <div className="space-y-3.5">
                        {items.map(item => (
                            <div key={item.id} className={`rounded-2xl border p-4 transition-all ${item.status === 'non-compliant' ? 'border-rose-200 bg-rose-50/50' : item.status === 'partial' ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-slate-50/70'}`}>
                                <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                                    <p className="min-w-0 text-sm font-semibold leading-relaxed text-slate-700">{item.label}</p>
                                    <div className="flex flex-wrap gap-1.5 shrink-0">
                                        {(['compliant', 'partial', 'non-compliant'] as ComplianceStatus[]).map(s => (
                                            <button key={s} onClick={() => setItemStatus(item.id, s)}
                                                className={`min-w-[74px] rounded-xl border px-3 py-2 text-xs font-black transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${item.status === s ? COMPLIANCE_META[s].activeClass : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                                                {COMPLIANCE_META[s].label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {item.status !== 'compliant' && (
                                    <input type="text" value={item.note} onChange={e => setItemNote(item.id, e.target.value)}
                                        placeholder="미이행 사유 또는 부분 이행 내용 기록"
                                        className={`mt-3 ${INPUT_COMPACT_CLASS}`} />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 사진 + 저장 */}
            {items.length > 0 && (
                <div className={`${PANEL_CLASS} p-4 sm:p-5 space-y-4`}>
                    <div>
                        <h3 className={SECTION_TITLE_CLASS}>⑶ 현장 사진 및 저장</h3>
                        <p className={`${SECTION_SUBTEXT_CLASS} mt-1`}>증빙 사진과 저장 버튼을 같은 리듬으로 배치해 마감 동선을 단순화했습니다.</p>
                    </div>
                    <div>
                        <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
                        <button onClick={() => photoRef.current?.click()}
                            className={SOFT_BUTTON_CLASS}>
                            📷 현장 사진 첨부 (선택)
                        </button>
                        {isCompressing && <span className="ml-2 text-xs text-slate-400">최적화 중...</span>}
                        {photo && (
                            <div className="mt-2 flex items-center gap-3">
                                <img src={`data:image/jpeg;base64,${photo}`} alt="현장" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                                <button onClick={() => { setPhoto(''); if (photoRef.current) photoRef.current.value = ''; }}
                                    className="text-xs font-semibold text-rose-600 transition hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 rounded-md">삭제</button>
                            </div>
                        )}
                    </div>
                    <button onClick={handleSave}
                        className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-base font-bold text-white transition-all hover:bg-indigo-700 active:scale-95">
                        이행점검 기록 저장
                    </button>
                    {saved && <p className="text-xs font-bold text-emerald-600 text-center">✅ 저장되었습니다.</p>}
                </div>
            )}

            </div>{/* ── end 좌: 폼 영역 ── */}

            {/* ── 우: 이전기록 패널 ── */}
            <div className="mt-4 xl:mt-0 xl:sticky xl:top-4">
            {/* 이전 기록 */}
            {sessions.length > 0 && (
                <div className={`${PANEL_CLASS} p-4 sm:p-5 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto`}>
                    <div className="mb-4 flex items-end justify-between gap-2">
                        <div>
                            <h3 className={SECTION_TITLE_CLASS}>이행점검 기록 ({sessions.length}건)</h3>
                            <p className={`${SECTION_SUBTEXT_CLASS} mt-1`}>최근 등록 내역을 우측에 고정해 현재 입력과 이력을 동시에 확인할 수 있습니다.</p>
                        </div>
                    </div>
                    <div className="space-y-3.5">
                        {sessions.slice(0, 10).map(s => {
                            const nc = s.items.filter(it => it.status === 'non-compliant').length;
                            const pt = s.items.filter(it => it.status === 'partial').length;
                            const ok = s.items.filter(it => it.status === 'compliant').length;
                            return (
                                <div key={s.id} className="rounded-2xl border border-slate-200 p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-sm font-black text-slate-800">{s.jobField}</span>
                                                {s.teamLeader && <span className="text-xs text-slate-500">· {s.teamLeader}</span>}
                                                <span className="text-xs text-slate-400">{s.date}</span>
                                                {s.checkerName && <span className="text-xs text-slate-400">· {s.checkerName}</span>}
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                <span className="text-[11px] font-bold bg-emerald-100 text-emerald-800 rounded-full px-2 py-1">이행 {ok}</span>
                                                {pt > 0 && <span className="text-[11px] font-bold bg-amber-100 text-amber-800 rounded-full px-2 py-1">부분 {pt}</span>}
                                                {nc > 0 && <span className="text-[11px] font-bold bg-rose-100 text-rose-800 rounded-full px-2 py-1">미이행 {nc}</span>}
                                            </div>
                                            {nc > 0 && (
                                                <ul className="mt-2 space-y-1">
                                                    {s.items.filter(it => it.status === 'non-compliant').map(it => (
                                                        <li key={it.id} className="text-xs text-rose-600 font-semibold leading-relaxed">▸ {it.label}{it.note ? ` : ${it.note}` : ''}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {s.photo && <img src={`data:image/jpeg;base64,${s.photo}`} alt="현장" className="w-10 h-10 object-cover rounded-lg border border-slate-200" />}
                                            <button onClick={() => removeSession(s.id)} className="rounded-md text-[11px] font-semibold text-slate-500 transition hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200">삭제</button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
            </div>{/* ── end 우: 이전기록 패널 ── */}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// 탭 2: 행동관찰 · 코칭
// ─────────────────────────────────────────────────────────────────────────────
interface WorkerOption { id: string; name: string; label: string; trade?: string; team?: string; }

const BehaviorCoachingTab: React.FC<{ assessmentMonth: string; workers: WorkerOption[] }> = ({ assessmentMonth, workers }) => {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState('');
    const [filterTrade, setFilterTrade] = useState('전체');
    const [filterTeam, setFilterTeam] = useState('전체');
    const [behavior, setBehavior] = useState<string | null>(null);
    const [severity, setSeverity] = useState('보통');
    const [observerName, setObserverName] = useState('');
    const [evidenceNote, setEvidenceNote] = useState('');
    const [photo, setPhoto] = useState('');
    const [isCompressing, setIsCompressing] = useState(false);
    const [coaching, setCoaching] = useState(true);
    const [actionType, setActionType] = useState<string | null>(null);
    const [followup, setFollowup] = useState('확인중');
    const [coachName, setCoachName] = useState('');
    const [actionDetail, setActionDetail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
    const photoRef = useRef<HTMLInputElement>(null);

    const trades = useMemo(() => [...new Set(workers.map(w => w.trade).filter(Boolean))] as string[], [workers]);
    const teams  = useMemo(() => [...new Set(workers.map(w => w.team).filter(Boolean))] as string[], [workers]);

    const filtered = useMemo(() => workers.filter(w => {
        const matchSearch = !search || w.name.includes(search) || (w.team||'').includes(search) || (w.trade||'').includes(search);
        const matchTrade  = filterTrade === '전체' || w.trade === filterTrade;
        const matchTeam   = filterTeam  === '전체' || w.team  === filterTeam;
        return matchSearch && matchTrade && matchTeam;
    }), [workers, search, filterTrade, filterTeam]);

    const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleAll = () => setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(w => w.id)));

    async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsCompressing(true);
        try { setPhoto(await compressImage(file)); }
        catch { /* ignore */ }
        finally { setIsCompressing(false); }
    }

    async function handleSubmit() {
        if (selected.size === 0) return alert('관찰 대상 근로자를 1명 이상 선택하세요.');
        if (!behavior) return alert('불안전행동 유형을 선택하세요.');
        if (coaching && !actionType) return alert('코칭 등록 시 조치 유형을 선택하세요.');
        setSubmitting(true);
        setResult(null);
        try {
            const nowIso = new Date().toISOString();
            const records = Array.from(selected).map(workerId => ({
                worker_id: workerId,
                assessment_month: assessmentMonth,
                observed_at: nowIso,
                observer_name: observerName || undefined,
                unsafe_behavior_flag: true,
                unsafe_behavior_type: behavior,
                severity_level: severity,
                evidence_note: (evidenceNote || (photo ? '[사진 첨부]' : undefined)) || undefined,
                action_type: coaching ? (actionType || undefined) : undefined,
                action_detail: coaching ? (actionDetail || undefined) : undefined,
                action_completed_at: coaching ? nowIso : undefined,
                coach_name: coaching ? (coachName || undefined) : undefined,
                followup_result: coaching ? followup : undefined,
                followup_checked_at: coaching ? nowIso : undefined,
            }));

            if (isAdminAuthenticated()) {
                const data = await postAdminJson<{ ok: boolean; inserted_observations?: number; inserted_coaching?: number }>(
                    '/api/admin/safety-management',
                    { action: 'record-safety-closure-loop', payload: { records } },
                    { fallbackMessage: '관찰·코칭 등록 실패' }
                );
                const obs = Number(data.inserted_observations || 0);
                const c   = Number(data.inserted_coaching || 0);
                setResult({ ok: true, message: `통합 등록 완료 (관찰 ${obs}건 / 코칭 ${c}건)` });
            } else {
                setResult({ ok: true, message: `[오프라인] ${selected.size}명 관찰 기록 완료 (서버 미연결)` });
            }

            setSelected(new Set()); setBehavior(null); setEvidenceNote(''); setPhoto('');
            if (photoRef.current) photoRef.current.value = '';
            setActionType(null); setActionDetail('');
        } catch (e: any) {
            setResult({ ok: false, message: e.message || '등록 실패' });
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="space-y-5 xl:space-y-0 xl:grid xl:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[400px_minmax(0,1fr)] xl:gap-6 xl:items-start">
            {/* ── 좌: 근로자 선택 ── */}
            <div className="xl:sticky xl:top-4">
            {/* 근로자 선택 */}
            <div className={`${PANEL_CLASS} p-4 sm:p-5`}>
                <div className="mb-4 flex flex-col gap-3">
                    <div>
                        <h3 className={SECTION_TITLE_CLASS}>관찰 대상 근로자</h3>
                        <p className={`${SECTION_SUBTEXT_CLASS} mt-1`}>검색, 공종, 팀 기준을 한 줄 흐름으로 정리해 목록 가독성을 높였습니다.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="이름·팀·공종 검색"
                                className={INPUT_COMPACT_CLASS} />
                            <select value={filterTrade} onChange={e => setFilterTrade(e.target.value)}
                                className={INPUT_COMPACT_CLASS}>
                                <option value="전체">공종 전체</option>
                                {trades.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)}
                                className={INPUT_COMPACT_CLASS}>
                                <option value="전체">팀 전체</option>
                                {teams.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                    </div>
                    <button onClick={toggleAll} className="self-start rounded-xl px-3 py-2 text-sm font-bold text-indigo-700 transition hover:bg-indigo-50 hover:text-indigo-900 shrink-0">
                        {selected.size === filtered.length && filtered.length > 0 ? '전체 해제' : '전체 선택'}
                    </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-3">
                    {filtered.length === 0
                                                ? <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-7 text-center">
                                                        <div className="text-2xl">🔎</div>
                                                        <p className="mt-2 text-sm font-semibold text-slate-700">조회 결과가 없습니다.</p>
                                                        <p className="mt-1 text-xs text-slate-500">검색어 또는 공종/팀 필터를 완화해 다시 확인하세요.</p>
                                                    </div>
                        : filtered.map(w => (
                            <label key={w.id} className={`flex items-start gap-3 rounded-2xl border p-3.5 cursor-pointer text-sm font-semibold transition-all select-none
                                ${selected.has(w.id) ? 'border-indigo-400 bg-indigo-50 text-indigo-800 shadow-sm' : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50'}`}>
                                <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={selected.has(w.id)} onChange={() => toggle(w.id)} />
                                <span className="leading-snug">{w.label}</span>
                            </label>
                        ))}
                </div>
            </div>

            </div>{/* ── end 좌: 근로자 선택 ── */}

            {/* ── 우: 관찰·코칭 폼 ── */}
            <div className="space-y-5 mt-4 xl:mt-0">
            {/* 불안전행동 유형 */}
            <div className={`${PANEL_CLASS} p-4 sm:p-5`}>
                <div className="mb-4">
                    <h3 className={SECTION_TITLE_CLASS}>불안전행동 유형</h3>
                    <p className={`${SECTION_SUBTEXT_CLASS} mt-1`}>버튼 높이와 열 개수를 재정렬해 긴 항목도 안정적으로 보이도록 조정했습니다.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2.5">
                    {BEHAVIOR_PRESETS.map(p => (
                        <button key={p} onClick={() => setBehavior(p === behavior ? null : p)}
                            className={`min-h-[56px] rounded-2xl border px-3.5 py-3 text-left text-sm font-semibold leading-snug transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300
                                ${behavior === p ? 'bg-rose-500 text-white border-rose-500 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-rose-300 hover:bg-rose-50'}`}>
                            {p}
                        </button>
                    ))}
                </div>
            </div>

            {/* 심각도 */}
            <div className={`${PANEL_CLASS} p-4 sm:p-5`}>
                <h3 className={`${SECTION_TITLE_CLASS} mb-3`}>심각도</h3>
                <div className="flex flex-wrap gap-2">
                    {SEVERITY_PRESETS.map(s => (
                        <button key={s.value} onClick={() => setSeverity(s.value)}
                            className={`rounded-full border px-4 py-2 text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${severity === s.value ? s.color + ' ring-2 ring-offset-1 ring-current' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                            {s.value}
                        </button>
                    ))}
                </div>
            </div>

            {/* 부가 정보 + 사진 */}
            <div className={`${PANEL_CLASS} p-4 sm:p-5 space-y-4`}>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    <div>
                        <label className={FIELD_LABEL_CLASS}>관찰자 이름</label>
                        <input type="text" value={observerName} onChange={e => setObserverName(e.target.value)} placeholder="관리감독자 (선택)"
                            className={INPUT_CLASS} />
                    </div>
                    <div>
                        <label className={FIELD_LABEL_CLASS}>현장 사진</label>
                        <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
                        <button onClick={() => photoRef.current?.click()}
                            className={SOFT_BUTTON_CLASS}>
                            📷 사진 첨부
                        </button>
                        {isCompressing && <span className="ml-2 text-xs text-slate-400">최적화 중...</span>}
                        {photo && (
                            <div className="mt-2 flex items-center gap-2">
                                <img src={`data:image/jpeg;base64,${photo}`} alt="관찰" className="w-12 h-12 object-cover rounded-lg border border-slate-200" />
                                <button onClick={() => { setPhoto(''); if (photoRef.current) photoRef.current.value = ''; }} className="text-xs text-rose-500 font-semibold">삭제</button>
                            </div>
                        )}
                    </div>
                </div>
                <div>
                    <label className={FIELD_LABEL_CLASS}>증빙 메모</label>
                    <textarea value={evidenceNote} onChange={e => setEvidenceNote(e.target.value)} placeholder="현장 상황 간략 기록 (선택)" rows={2}
                        className={`${INPUT_CLASS} resize-none`} />
                </div>
            </div>

            {/* 코칭 동시 등록 */}
            <div className={`${PANEL_CLASS} p-4 sm:p-5 space-y-4`}>
                <div className="flex items-center justify-between">
                    <h3 className={SECTION_TITLE_CLASS}>코칭 조치 동시 등록</h3>
                    <button onClick={() => setCoaching(p => !p)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${coaching ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                        {coaching ? 'ON' : 'OFF'}
                    </button>
                </div>
                {coaching && (
                    <>
                        <div>
                            <h4 className="mb-2 text-sm font-bold text-slate-700">조치 유형</h4>
                            <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2.5">
                                {COACHING_PRESETS.map(a => (
                                    <button key={a.value} onClick={() => setActionType(a.value === actionType ? null : a.value)}
                                        className={`flex min-h-[52px] items-center gap-1.5 rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300
                                            ${actionType === a.value ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'}`}>
                                        <span>{a.icon}</span><span>{a.value}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h4 className="mb-2 text-sm font-bold text-slate-700">사후조치 결과</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {FOLLOWUP_PRESETS.map(f => (
                                    <button key={f.value} onClick={() => setFollowup(f.value)}
                                        className={`text-sm font-bold py-2.5 rounded-xl border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300
                                            ${followup === f.value ? f.color + ' ring-2 ring-offset-1 ring-current' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                            <div>
                                <label className={FIELD_LABEL_CLASS}>코치 이름</label>
                                <input type="text" value={coachName} onChange={e => setCoachName(e.target.value)} placeholder="담당 관리감독자 (선택)"
                                    className={INPUT_CLASS} />
                            </div>
                            <div>
                                <label className={FIELD_LABEL_CLASS}>조치 내용 메모</label>
                                <input type="text" value={actionDetail} onChange={e => setActionDetail(e.target.value)} placeholder="코칭 내용 간략 기록 (선택)"
                                    className={INPUT_CLASS} />
                            </div>
                        </div>
                    </>
                )}
            </div>

            <button onClick={handleSubmit} disabled={submitting || selected.size === 0 || !behavior || (coaching && !actionType)}
                className="w-full rounded-2xl bg-rose-600 px-4 py-3.5 text-base font-bold text-white transition-all hover:bg-rose-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                {submitting ? '등록 중...' : `관찰+코칭 통합 등록 (${selected.size}명)`}
            </button>
            {result && (
                <div className={`rounded-2xl p-3.5 text-sm font-semibold text-center ${result.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {result.ok ? '✅ ' : '❌ '}{result.message}
                </div>
            )}
            </div>{/* ── end 우: 관찰·코칭 폼 ── */}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// 탭 3: 현장 지적사항
// ─────────────────────────────────────────────────────────────────────────────
const ViolationsTab: React.FC<{ workerRecords: WorkerRecord[] }> = ({ workerRecords }) => {
    const [violations, setViolations] = useState<SiteViolation[]>(() => loadViolations());
    const [showForm, setShowForm] = useState(false);

    // 등록 폼 상태
    const [source, setSource] = useState<ViolationSource>('self');
    const [extAuth, setExtAuth] = useState('');
    const [category, setCategory] = useState('');
    const [description, setDescription] = useState('');
    const [severity, setSeverity] = useState<SiteViolation['severity']>('보통');
    const [issueDate, setIssueDate] = useState(todayStr());
    const [dueDate, setDueDate] = useState('');
    const [responsibleTeam, setResponsibleTeam] = useState('');
    const [photo, setPhoto] = useState('');
    const [isCompressing, setIsCompressing] = useState(false);
    const photoRef = useRef<HTMLInputElement>(null);

    const allTeams = useMemo(() => [...new Set(workerRecords.map(w => String(w.teamLeader || '').trim()).filter(Boolean))], [workerRecords]);

    async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsCompressing(true);
        try { setPhoto(await compressImage(file)); }
        catch { /* ignore */ }
        finally { setIsCompressing(false); }
    }

    function handleAdd() {
        if (!category) { alert('지적 분야를 선택해주세요.'); return; }
        if (!description.trim()) { alert('지적 내용을 입력해주세요.'); return; }
        const v: SiteViolation = {
            id: `sv-${Date.now()}`, issueDate, source, externalAuthority: source === 'external' ? extAuth : '',
            category, description: description.trim(), severity, dueDate, responsibleTeam,
            status: 'open', resolutionNote: '', photo, createdAt: new Date().toISOString(),
        };
        const next = [v, ...violations];
        setViolations(next);
        saveViolations(next);
        setDescription(''); setPhoto(''); setCategory(''); setDueDate(''); setShowForm(false);
        if (photoRef.current) photoRef.current.value = '';
    }

    function setStatus(id: string, status: ViolationStatus) {
        const next = violations.map(v => v.id === id ? { ...v, status } : v);
        setViolations(next);
        saveViolations(next);
    }

    function setResolution(id: string, note: string) {
        const next = violations.map(v => v.id === id ? { ...v, resolutionNote: note } : v);
        setViolations(next);
        saveViolations(next);
    }

    function remove(id: string) {
        const next = violations.filter(v => v.id !== id);
        setViolations(next);
        saveViolations(next);
    }

    const openCount = violations.filter(v => v.status === 'open').length;
    const inProgressCount = violations.filter(v => v.status === 'in-progress').length;

    return (
        <div className="space-y-5 xl:space-y-0 xl:grid xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1.08fr)_460px] xl:gap-6 xl:items-start">
            <div className="space-y-5">
            {/* 요약 바 */}
            {violations.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-center">
                        <div className="text-3xl font-black text-rose-600">{openCount}</div>
                        <div className="mt-1 text-xs font-bold text-rose-700">미조치</div>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                        <div className="text-3xl font-black text-amber-600">{inProgressCount}</div>
                        <div className="mt-1 text-xs font-bold text-amber-700">조치중</div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                        <div className="text-3xl font-black text-emerald-600">{violations.filter(v => v.status === 'resolved').length}</div>
                        <div className="mt-1 text-xs font-bold text-emerald-700">조치완료</div>
                    </div>
                </div>
            )}

            {/* 신규 등록 버튼 */}
            <button onClick={() => setShowForm(p => !p)}
                className={`w-full rounded-2xl px-4 py-3 font-bold text-base border transition-all ${showForm ? 'bg-slate-100 text-slate-700 border-slate-300' : 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 active:scale-95'}`}>
                {showForm ? '등록 폼 닫기' : '+ 현장 지적사항 등록'}
            </button>

            <div className="xl:hidden">

            {/* 등록 폼 */}
            {showForm && (
                <div className={`${PANEL_CLASS} p-4 sm:p-5 space-y-4`}>
                    {/* 출처 */}
                    <div>
                        <label className={`${FIELD_LABEL_CLASS} font-black text-slate-700`}>지적 출처</label>
                        <div className="flex gap-2">
                            {VIOLATION_SOURCES.map(s => (
                                <button key={s.value} onClick={() => setSource(s.value)}
                                    className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${source === s.value ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-indigo-300'}`}>
                                    {s.label}
                                </button>
                            ))}
                        </div>
                        {source === 'external' && (
                            <div className="mt-2">
                                <label className={FIELD_LABEL_CLASS}>감찰 기관</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {EXTERNAL_AUTHORITIES.map(a => (
                                        <button key={a} onClick={() => setExtAuth(a)}
                                            className={`rounded-xl border px-3 py-2 text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 ${extAuth === a ? 'bg-red-500 text-white border-red-500' : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-red-300'}`}>
                                            {a}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 지적 분야 + 심각도 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
                        <div>
                            <label className={FIELD_LABEL_CLASS}>지적 분야</label>
                            <div className="flex flex-wrap gap-1.5">
                                {VIOLATION_CATEGORIES.map(c => (
                                    <button key={c} onClick={() => setCategory(c)}
                                        className={`rounded-xl border px-3 py-2 text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${category === c ? 'bg-slate-700 text-white border-slate-700' : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-400'}`}>
                                        {c}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div>
                                <label className={FIELD_LABEL_CLASS}>심각도</label>
                                <div className="flex gap-2">
                                    {(['경미', '보통', '중대'] as const).map(s => (
                                        <button key={s} onClick={() => setSeverity(s)}
                                            className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300
                                                ${severity === s
                                                    ? s === '중대' ? 'bg-rose-600 text-white border-rose-600' : s === '보통' ? 'bg-amber-500 text-white border-amber-500' : 'bg-blue-500 text-white border-blue-500'
                                                    : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className={FIELD_LABEL_CLASS}>발생일</label>
                                    <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
                                        className={INPUT_COMPACT_CLASS} />
                                </div>
                                <div>
                                    <label className={FIELD_LABEL_CLASS}>조치 기한</label>
                                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                                        className={INPUT_COMPACT_CLASS} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 지적 내용 + 책임팀 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
                        <div>
                            <label className={FIELD_LABEL_CLASS}>지적 내용</label>
                            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="구체적 지적 사항 기입" rows={3}
                                className={`${INPUT_CLASS} resize-none`} />
                        </div>
                        <div className="space-y-2">
                            <div>
                                <label className={FIELD_LABEL_CLASS}>조치 책임 팀</label>
                                <select value={responsibleTeam} onChange={e => setResponsibleTeam(e.target.value)}
                                    className={INPUT_COMPACT_CLASS}>
                                    <option value="">팀 선택 (선택)</option>
                                    {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={FIELD_LABEL_CLASS}>현장 사진</label>
                                <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
                                <button onClick={() => photoRef.current?.click()}
                                    className={SOFT_BUTTON_CLASS}>
                                    📷 사진 첨부
                                </button>
                                {isCompressing && <span className="ml-2 text-xs text-slate-400">최적화 중...</span>}
                                {photo && (
                                    <div className="mt-2 flex items-center gap-2">
                                        <img src={`data:image/jpeg;base64,${photo}`} alt="지적" className="w-12 h-12 object-cover rounded-lg border border-slate-200" />
                                        <button onClick={() => { setPhoto(''); if (photoRef.current) photoRef.current.value = ''; }} className="text-xs text-rose-500 font-semibold">삭제</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <button onClick={handleAdd}
                        className="w-full rounded-2xl bg-rose-600 px-4 py-3 text-base font-bold text-white transition-all hover:bg-rose-700 active:scale-95">
                        지적사항 등록
                    </button>
                </div>
            )}
            </div>

            {/* 지적사항 목록 */}
            {violations.length > 0 ? (
                <div className="space-y-4">
                    {violations.map(v => {
                        const srcMeta = VIOLATION_SOURCES.find(s => s.value === v.source);
                        const stMeta  = VIOLATION_STATUS_META[v.status];
                        const isOverdue = v.dueDate && v.status !== 'resolved' && v.dueDate < todayStr();
                        return (
                            <div key={v.id} className={`bg-white rounded-2xl border p-5 space-y-3 shadow-[0_8px_22px_-18px_rgba(15,23,42,0.45)] ${isOverdue ? 'border-rose-300' : 'border-slate-200'}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${srcMeta?.badgeClass || ''}`}>
                                            {srcMeta?.label}{v.source === 'external' && v.externalAuthority ? ` · ${v.externalAuthority}` : ''}
                                        </span>
                                        <span className="text-[11px] font-bold bg-slate-100 text-slate-700 rounded-full px-2.5 py-1">{v.category}</span>
                                        <span className={`text-[11px] font-black rounded-full px-2.5 py-1 ${v.severity === '중대' ? 'bg-rose-100 text-rose-800' : v.severity === '보통' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>{v.severity}</span>
                                        <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${stMeta.badgeClass}`}>{v.status === 'open' ? `● ${stMeta.label}` : v.status === 'in-progress' ? `▲ ${stMeta.label}` : `✓ ${stMeta.label}`}</span>
                                        {isOverdue && <span className="text-[11px] font-black bg-rose-700 text-white rounded-full px-2.5 py-1">기한초과</span>}
                                    </div>
                                    <button onClick={() => remove(v.id)} className="shrink-0 rounded-md text-xs font-semibold text-slate-500 transition hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200">삭제</button>
                                </div>
                                <p className="text-sm text-slate-600">{v.issueDate}{v.dueDate ? ` → 기한: ${v.dueDate}` : ''}{v.responsibleTeam ? ` · ${v.responsibleTeam}` : ''}</p>
                                <p className="text-base font-semibold leading-relaxed text-slate-700">{v.description}</p>
                                {v.photo && <img src={`data:image/jpeg;base64,${v.photo}`} alt="지적" className="w-20 h-20 object-cover rounded-lg border border-slate-200" />}
                                {/* 조치 상태 변경 */}
                                <div className="flex flex-wrap gap-1.5 pt-3 border-t border-slate-100">
                                    {(['open', 'in-progress', 'resolved'] as ViolationStatus[]).map(s => (
                                        <button key={s} onClick={() => setStatus(v.id, s)}
                                            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${v.status === s ? VIOLATION_STATUS_META[s].badgeClass + ' border-current' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                                            {VIOLATION_STATUS_META[s].label}
                                        </button>
                                    ))}
                                    {v.status === 'resolved' && (
                                        <input type="text" value={v.resolutionNote} onChange={e => setResolution(v.id, e.target.value)}
                                            placeholder="조치 내용 기록 (선택)"
                                            className={`min-w-[180px] flex-1 ${INPUT_COMPACT_CLASS}`} />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className={EMPTY_STATE_CLASS}>
                    <div className="text-3xl">🗂️</div>
                    <p className="mt-3 text-base font-semibold text-slate-700">등록된 현장 지적사항이 없습니다.</p>
                    <p className="mt-1 text-sm text-slate-500">자체·원도급사·외부감찰 지적사항을 등록해 조치 흐름을 시작하세요.</p>
                </div>
            )}

            </div>

            <div className="hidden xl:block xl:sticky xl:top-4">
                <div className={`${PANEL_CLASS} p-4 sm:p-5 space-y-4`}>
                    <div className="flex items-center justify-between">
                        <h3 className={SECTION_TITLE_CLASS}>지적사항 등록</h3>
                        <span className="text-[11px] font-semibold text-slate-400">PC 빠른입력</span>
                    </div>

                    <p className={SECTION_SUBTEXT_CLASS}>출처, 심각도, 조치 기한을 같은 간격 규칙으로 정리해 빠른 입력 시 시선 이동을 줄였습니다.</p>

                    <div>
                        <label className={`${FIELD_LABEL_CLASS} font-black text-slate-700`}>지적 출처</label>
                        <div className="flex gap-2">
                            {VIOLATION_SOURCES.map(s => (
                                <button key={s.value} onClick={() => setSource(s.value)}
                                    className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition-all ${source === s.value ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                                    {s.label}
                                </button>
                            ))}
                        </div>
                        {source === 'external' && (
                            <div className="mt-2">
                                <label className={FIELD_LABEL_CLASS}>감찰 기관</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {EXTERNAL_AUTHORITIES.map(a => (
                                        <button key={a} onClick={() => setExtAuth(a)}
                                            className={`rounded-xl border px-3 py-2 text-xs font-bold transition-all ${extAuth === a ? 'bg-red-500 text-white border-red-500' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-red-300'}`}>
                                            {a}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className={FIELD_LABEL_CLASS}>지적 분야</label>
                        <div className="flex flex-wrap gap-1.5">
                            {VIOLATION_CATEGORIES.map(c => (
                                <button key={c} onClick={() => setCategory(c)}
                                    className={`rounded-xl border px-3 py-2 text-xs font-bold transition-all ${category === c ? 'bg-slate-700 text-white border-slate-700' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                                    {c}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className={FIELD_LABEL_CLASS}>심각도</label>
                        <div className="flex gap-2">
                            {(['경미', '보통', '중대'] as const).map(s => (
                                <button key={s} onClick={() => setSeverity(s)}
                                    className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition-all
                                        ${severity === s
                                            ? s === '중대' ? 'bg-rose-600 text-white border-rose-600' : s === '보통' ? 'bg-amber-500 text-white border-amber-500' : 'bg-blue-500 text-white border-blue-500'
                                            : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className={FIELD_LABEL_CLASS}>발생일</label>
                            <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
                                className={INPUT_COMPACT_CLASS} />
                        </div>
                        <div>
                            <label className={FIELD_LABEL_CLASS}>조치 기한</label>
                            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                                className={INPUT_COMPACT_CLASS} />
                        </div>
                    </div>

                    <div>
                        <label className={FIELD_LABEL_CLASS}>지적 내용</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="구체적 지적 사항 기입" rows={4}
                            className={`${INPUT_CLASS} resize-none`} />
                    </div>

                    <div>
                        <label className={FIELD_LABEL_CLASS}>조치 책임 팀</label>
                        <select value={responsibleTeam} onChange={e => setResponsibleTeam(e.target.value)}
                            className={INPUT_COMPACT_CLASS}>
                            <option value="">팀 선택 (선택)</option>
                            {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className={FIELD_LABEL_CLASS}>현장 사진</label>
                        <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
                        <button onClick={() => photoRef.current?.click()}
                            className={SOFT_BUTTON_CLASS}>
                            📷 사진 첨부
                        </button>
                        {isCompressing && <span className="ml-2 text-xs text-slate-400">최적화 중...</span>}
                        {photo && (
                            <div className="mt-2 flex items-center gap-2">
                                <img src={`data:image/jpeg;base64,${photo}`} alt="지적" className="w-12 h-12 object-cover rounded-lg border border-slate-200" />
                                <button onClick={() => { setPhoto(''); if (photoRef.current) photoRef.current.value = ''; }} className="text-xs text-rose-500 font-semibold">삭제</button>
                            </div>
                        )}
                    </div>

                    <button onClick={handleAdd}
                        className="w-full rounded-2xl bg-rose-600 px-4 py-3 text-base font-bold text-white transition-all hover:bg-rose-700 active:scale-95">
                        지적사항 등록
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// 탭 4: 이행 종합 판정
// ─────────────────────────────────────────────────────────────────────────────
const ReviewTab: React.FC<{ assessmentMonth: string; workers: WorkerOption[] }> = ({ assessmentMonth, workers }) => {
    const [loading, setLoading] = useState(false);
    const [reviews, setReviews] = useState<IntegrityRow[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [lastEvaluated, setLastEvaluated] = useState<string | null>(null);

    // 로컬 통계 (탭1·탭3 데이터)
    const localStats = useMemo(() => {
        const sessions = loadRiskCheckSessions();
        const violations = loadViolations();
        const totalItems = sessions.reduce((acc, s) => acc + s.items.length, 0);
        const compliantItems = sessions.reduce((acc, s) => acc + s.items.filter(it => it.status === 'compliant').length, 0);
        const riskComplianceRate = totalItems > 0 ? Math.round((compliantItems / totalItems) * 100) : null;
        const openViolations = violations.filter(v => v.status === 'open').length;
        const criticalViolations = violations.filter(v => v.status !== 'resolved' && v.severity === '중대').length;
        return { totalSessions: sessions.length, riskComplianceRate, openViolations, criticalViolations };
    }, []);

    const run = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await postAdminJson<{ ok: boolean; data?: { results: any[] } }>(
                '/api/admin/safety-management',
                { action: 'evaluate-worker-integrity', payload: { worker_ids: workers.map(w => w.id), assessment_month: assessmentMonth } },
                { fallbackMessage: '무결성 판정 API 호출 실패' }
            );
            const nameMap = Object.fromEntries(workers.map(w => [w.id, w.label]));
            const rows: IntegrityRow[] = (data.data?.results || []).map((r: any) => ({
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

    const summary = { green: reviews.filter(r => r.traffic_light === 'green').length, yellow: reviews.filter(r => r.traffic_light === 'yellow').length, red: reviews.filter(r => r.traffic_light === 'red').length };

    return (
        <div className="space-y-5 xl:space-y-0 xl:grid xl:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[420px_minmax(0,1fr)] xl:gap-6 xl:items-start">
            {/* 로컬 이행 현황 */}
            <div className={`${PANEL_CLASS} p-4 sm:p-5 xl:sticky xl:top-4`}>
                <div className="mb-4">
                    <h3 className={SECTION_TITLE_CLASS}>이행 현황 요약</h3>
                    <p className={`${SECTION_SUBTEXT_CLASS} mt-1`}>좌측 요약 카드의 크기와 글자 단계를 통일해 주요 지표를 한눈에 비교할 수 있게 했습니다.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-4 text-center">
                        <div className="text-lg">📋</div>
                        <div className="text-2xl font-black text-indigo-700">{localStats.totalSessions}</div>
                        <div className="mt-1 text-xs font-bold text-indigo-700">위험성평가 점검 횟수</div>
                    </div>
                    <div className={`rounded-2xl border p-4 text-center ${localStats.riskComplianceRate !== null && localStats.riskComplianceRate < 70 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                        <div className="text-lg">📈</div>
                        <div className={`text-2xl font-black ${localStats.riskComplianceRate !== null && localStats.riskComplianceRate < 70 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {localStats.riskComplianceRate !== null ? `${localStats.riskComplianceRate}%` : '-'}
                        </div>
                        <div className={`mt-1 text-xs font-bold ${localStats.riskComplianceRate !== null && localStats.riskComplianceRate < 70 ? 'text-rose-700' : 'text-emerald-700'}`}>이행률</div>
                    </div>
                    <div className={`rounded-2xl border p-4 text-center ${localStats.openViolations > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="text-lg">●</div>
                        <div className={`text-2xl font-black ${localStats.openViolations > 0 ? 'text-rose-600' : 'text-slate-500'}`}>{localStats.openViolations}</div>
                        <div className={`mt-1 text-xs font-bold ${localStats.openViolations > 0 ? 'text-rose-700' : 'text-slate-600'}`}>미조치 지적</div>
                    </div>
                    <div className={`rounded-2xl border p-4 text-center ${localStats.criticalViolations > 0 ? 'bg-red-50 border-red-300' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="text-lg">⚠️</div>
                        <div className={`text-2xl font-black ${localStats.criticalViolations > 0 ? 'text-red-700' : 'text-slate-500'}`}>{localStats.criticalViolations}</div>
                        <div className={`mt-1 text-xs font-bold ${localStats.criticalViolations > 0 ? 'text-red-700' : 'text-slate-600'}`}>중대 미조치</div>
                    </div>
                </div>
            </div>

            {/* 행동관찰 무결성 판정 */}
            <div className={`${PANEL_CLASS} p-4 sm:p-5 min-w-0`}>
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h3 className={SECTION_TITLE_CLASS}>{assessmentMonth} 행동 무결성 자동 판정</h3>
                        {lastEvaluated && <p className="mt-1 text-sm text-slate-600">최종 실행: {lastEvaluated}</p>}
                    </div>
                    <button onClick={run} disabled={loading}
                        className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-indigo-700 active:scale-95 disabled:opacity-50">
                        {loading ? '판정 중...' : '자동 판정 실행'}
                    </button>
                </div>

                {error && <div className="mb-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800">❌ {error}</div>}

                {reviews.length > 0 && (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                            {[{ key: 'green', icon: '🟢', label: '확정', count: summary.green, bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
                              { key: 'yellow', icon: '🟡', label: '검토중', count: summary.yellow, bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
                              { key: 'red', icon: '🔴', label: '위험/보류', count: summary.red, bg: 'bg-red-50 border-red-200', text: 'text-red-700' }
                            ].map(s => (
                                <div key={s.key} className={`${s.bg} border rounded-2xl p-4 text-center`}>
                                    <div className="text-xl mb-1">{s.icon}</div>
                                    <div className={`text-2xl font-black ${s.text}`}>{s.count}</div>
                                    <div className={`mt-1 text-xs font-bold ${s.text}`}>{s.label}</div>
                                </div>
                            ))}
                        </div>
                        <div className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium text-slate-700">
                            <span className="rounded-full bg-white px-2.5 py-1">🟢 확정 = 우선 확인 완료</span>
                            <span className="rounded-full bg-white px-2.5 py-1">🟡 검토중 = 보완 검토 필요</span>
                            <span className="rounded-full bg-white px-2.5 py-1">🔴 위험/보류 = 즉시 조치 필요</span>
                        </div>
                        <div className="overflow-x-auto rounded-2xl border border-slate-200">
                            <table className="w-full min-w-[760px] table-fixed text-sm">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="w-[30%] px-5 py-4 text-left text-xs font-bold text-slate-700">근로자</th>
                                        <th className="w-[11%] px-3 py-4 text-center text-xs font-bold text-slate-700">점수</th>
                                        <th className="w-[19%] px-3 py-4 text-center text-xs font-bold text-slate-700">상태</th>
                                        <th className="w-[40%] px-5 py-4 text-left text-xs font-bold text-slate-700">사유</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reviews.map((row, idx) => {
                                        const cfg = tlConfig(row.traffic_light);
                                        const statusLabel = row.traffic_light === 'green' ? '우선 확인 완료' : row.traffic_light === 'yellow' ? '보완 검토 필요' : '즉시 조치 필요';
                                        return (
                                            <tr key={row.worker_id} className={`align-top border-b border-slate-100 last:border-b-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                                <td className="px-5 py-4 text-sm font-semibold leading-7 text-slate-900">{row.worker_name}</td>
                                                <td className="px-3 py-4 text-center">
                                                    <span className={`text-sm font-black ${row.computed_score >= 80 ? 'text-emerald-700' : row.computed_score >= 60 ? 'text-amber-700' : 'text-red-700'}`}>{row.computed_score}</span>
                                                </td>
                                                <td className="px-3 py-4 text-center">
                                                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                                        {statusLabel}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4">
                                                    {row.integrity_reason_codes.length > 0
                                                        ? <div className="flex flex-wrap gap-2">{row.integrity_reason_codes.map(c => <span key={c} className="rounded-xl bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700">{reasonCodeToKo(c)}</span>)}</div>
                                                        : <span className="text-sm font-semibold text-emerald-700">이상없음</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {reviews.length === 0 && !loading && (
                    <div className={EMPTY_STATE_CLASS}>
                        <div className="text-3xl">🤖</div>
                        <p className="mt-3 text-base font-semibold text-slate-700">자동 판정 대기 상태입니다.</p>
                        <p className="mt-1 text-sm font-medium text-slate-500">상단의 「자동 판정 실행」 버튼을 눌러 근로자별 행동 무결성을 평가하세요.</p>
                    </div>
                )}
                {loading && (
                    <div className="rounded-2xl bg-slate-50 p-6 text-center">
                        <div className="animate-spin w-7 h-7 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto mb-2" />
                        <p className="text-sm font-medium text-slate-600">판정 중...</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────
type ActiveTab = 'risk-check' | 'behavior' | 'violations' | 'review';

interface FieldSafetyComplianceHubProps {
    workerRecords: WorkerRecord[];
}

const FieldSafetyComplianceHub: React.FC<FieldSafetyComplianceHubProps> = ({ workerRecords }) => {
    const [activeTab, setActiveTab] = useState<ActiveTab>('risk-check');
    const [assessmentMonth, setAssessmentMonth] = useState(getCurrentMonth());

    const workerOptions: WorkerOption[] = useMemo(() => {
        const seen = new Set<string>();
        return [...workerRecords]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .filter(w => { if (seen.has(w.id)) return false; seen.add(w.id); return true; })
            .map(w => ({ id: w.id, name: w.name, label: buildWorkerLabel(w), trade: w.jobField, team: w.teamLeader }));
    }, [workerRecords]);

    const tabs: { id: ActiveTab; label: string; shortLabel: string; icon: string; badge?: number }[] = useMemo(() => {
        const violations = loadViolations();
        const openCount = violations.filter(v => v.status === 'open').length;
        return [
            { id: 'risk-check',  label: '위험성평가 이행점검', shortLabel: '이행점검',  icon: '📋' },
            { id: 'behavior',    label: '행동관찰 · 코칭',     shortLabel: '관찰·코칭', icon: '👁️' },
            { id: 'violations',  label: '현장 지적사항',       shortLabel: '지적사항',  icon: '🚨', badge: openCount > 0 ? openCount : undefined },
            { id: 'review',      label: '이행 종합판정',       shortLabel: '종합판정',  icon: '🏷️' },
        ];
    }, []);

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:space-y-6 sm:p-6 xl:px-8 2xl:px-10">
            {/* 헤더 */}
            <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-indigo-50/70 p-4 sm:p-6 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.35)]">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div className="space-y-3">
                        <div>
                            <h1 className="text-2xl sm:text-[28px] font-black tracking-tight text-slate-900">현장 안전이행 종합관리</h1>
                            <p className="mt-1 text-sm font-medium text-slate-700 sm:text-base">
                                위험성평가 이행점검 · 행동관찰코칭 · 현장지적관리 · 종합판정
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm">정돈된 타이포그래피</span>
                            <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm">균형 잡힌 카드 그리드</span>
                            <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm">PC/모바일 가독성 강화</span>
                        </div>
                    </div>
                    <div className="w-full max-w-xs rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
                        <span className="text-sm font-semibold text-slate-700">평가 월</span>
                        <input type="month" value={assessmentMonth} onChange={e => setAssessmentMonth(e.target.value)}
                            className={`${INPUT_CLASS} mt-2`} />
                    </div>
                </div>
            </div>

            {/* 탭 네비게이션 */}
            <div className="flex gap-2 overflow-x-auto rounded-2xl bg-slate-100/90 p-2 xl:grid xl:grid-cols-4 xl:overflow-visible">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`relative flex min-h-[64px] min-w-[148px] shrink-0 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition-all xl:min-w-0
                            ${activeTab === tab.id ? 'bg-white text-indigo-800 shadow-sm shadow-slate-300/50' : 'text-slate-700 hover:bg-white/70 hover:text-slate-900'}`}>
                        <span>{tab.icon}</span>
                        <span className="hidden sm:inline">{tab.label}</span>
                        <span className="sm:hidden">{tab.shortLabel}</span>
                        {tab.badge !== undefined && (
                            <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white">{tab.badge}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* 탭 콘텐츠 */}
            {activeTab === 'risk-check'  && <RiskCheckTab workerRecords={workerRecords} />}
            {activeTab === 'behavior'    && <BehaviorCoachingTab assessmentMonth={assessmentMonth} workers={workerOptions} />}
            {activeTab === 'violations'  && <ViolationsTab workerRecords={workerRecords} />}
            {activeTab === 'review'      && <ReviewTab assessmentMonth={assessmentMonth} workers={workerOptions} />}
        </div>
    );
};

export default FieldSafetyComplianceHub;


import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { WorkerRecord } from '../types';
import { generateReportUrl } from '../utils/qrUtils';
import { extractMessage } from '../utils/errorUtils';
import { postAdminJson } from '../utils/adminApiClient';
import { getWindowProp } from '../utils/windowUtils';
import { getSafetyLevelFromScore } from '../utils/safetyLevelUtils';
import * as XLSX from 'xlsx';

// [시스템] QR 코드 생성 상태 관리 및 동기화 컴포넌트
interface QRCodeProps {
    record: WorkerRecord;
    onLoad?: (success: boolean) => void;
}

type PrintModeErrorBoundaryProps = {
    children: React.ReactNode;
    onExit: () => void;
    resetKey: string;
};

type PrintModeErrorBoundaryState = {
    hasError: boolean;
    errorMessage: string;
};

class PrintModeErrorBoundary extends React.Component<PrintModeErrorBoundaryProps, PrintModeErrorBoundaryState> {
    constructor(props: PrintModeErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, errorMessage: '' };
    }

    static getDerivedStateFromError(error: unknown): PrintModeErrorBoundaryState {
        return {
            hasError: true,
            errorMessage: extractMessage(error),
        };
    }

    componentDidCatch(error: unknown) {
        console.error('[WorkerManagement][PrintMode] render crash:', error);
    }

    componentDidUpdate(prevProps: PrintModeErrorBoundaryProps) {
        if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
            this.setState({ hasError: false, errorMessage: '' });
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="fixed inset-0 z-[5000] bg-rose-50 flex items-center justify-center p-6">
                    <div className="w-full max-w-xl rounded-3xl border border-rose-200 bg-white shadow-2xl p-6">
                        <h3 className="text-xl font-black text-rose-700">인쇄 화면을 표시하는 중 오류가 발생했습니다.</h3>
                        <p className="mt-2 text-sm font-bold text-slate-600 break-words">
                            {this.state.errorMessage || '알 수 없는 렌더링 오류'}
                        </p>
                        <div className="mt-6 flex justify-end">
                            <button
                                type="button"
                                onClick={this.props.onExit}
                                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-black"
                            >
                                인쇄 화면 닫기
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

const QRCodeComponent: React.FC<QRCodeProps> = React.memo(({ record, onLoad }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        // [Optimization] Use requestAnimationFrame to avoid blocking main thread during bulk render
        const timer = requestAnimationFrame(() => {
            const element = containerRef.current;
            if (!element) return;

            // 이미 생성되었다면 스킵 (중복 생성 방지)
            if (element.children.length > 0) return;

            // 1. 라이브러리 존재 여부 확인 (안전하게 전역 객체 접근)
            const QRCodeLib = getWindowProp<any>('QRCode');
            if (!QRCodeLib) {
                const msg = "QR Lib Missing";
                console.error(msg);
                setErrorMsg(msg);
                if (onLoad) onLoad(false); 
                return;
            }

            try {
                // 2. 초기화 및 URL 생성
                element.innerHTML = ''; 
                const qrUrl = generateReportUrl(record);
                
                if (!qrUrl) throw new Error("URL Gen Failed");

                // 3. QR 생성 시도
                new QRCodeLib(element, {
                    text: qrUrl,
                    width: 128, 
                    height: 128,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCodeLib.CorrectLevel ? QRCodeLib.CorrectLevel.L : 1 // Low level for max capacity
                });
                
                // 4. 성공 처리
                if (onLoad) onLoad(true);
                setErrorMsg(null);

            } catch (e: unknown) {
                console.error("QR Generation Error:", e);
                let visibleError = "QR Error";
                const errMsg = extractMessage(e);
                if (typeof errMsg === 'string' && errMsg.includes("code length overflow")) visibleError = "Data Too Long";
                setErrorMsg(visibleError);
                if (onLoad) onLoad(false); 
            }
        });

        return () => cancelAnimationFrame(timer);
    }, [record, onLoad]);

    if (errorMsg) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 border border-red-200">
                <span className="text-[8px] font-black text-red-500 uppercase">{errorMsg}</span>
                <span className="text-[6px] text-slate-400">{getSafeIdTail(record.id, 4)}</span>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="w-full h-full flex items-center justify-center overflow-hidden bg-white"></div>
    );
});

// [디자인] 등급별 스타일 상수 (Industrial High-Contrast)
const getGradeStyle = (level: string) => {
    switch (level) {
        case '고급': return { 
            bg: 'bg-emerald-600', 
            lightBg: 'bg-emerald-50', 
            text: 'text-emerald-800', 
            border: 'border-emerald-600',
            badge: 'bg-emerald-600 text-white'
        };
        case '중급': return { 
            bg: 'bg-amber-500', 
            lightBg: 'bg-amber-50', 
            text: 'text-amber-800', 
            border: 'border-amber-500',
            badge: 'bg-amber-500 text-white'
        };
        case '초급': return { 
            bg: 'bg-rose-600', 
            lightBg: 'bg-rose-50', 
            text: 'text-rose-800', 
            border: 'border-rose-600',
            badge: 'bg-rose-600 text-white'
        };
        default: return { 
            bg: 'bg-slate-600', 
            lightBg: 'bg-slate-50', 
            text: 'text-slate-800', 
            border: 'border-slate-600',
            badge: 'bg-slate-600 text-white'
        };
    }
};

const getRoleBadge = (record: WorkerRecord) => {
    const badges = [];
    // 팀장 판정: role이 'leader'인 경우 우선
    if (record.role === 'leader') badges.push('👑 팀장');
    else if (record.role === 'sub_leader') badges.push('🛡️ 반장');
    
    // 겸직 역할 (여러 개 선택 가능)
    if (record.isTranslator) badges.push('🗣️ 통역');
    if (record.isSignalman) badges.push('🚦 신호수');
    
    return badges;
};

const getSafeIdTail = (idValue: unknown, length: number) => {
    const raw = typeof idValue === 'string' ? idValue : (typeof idValue === 'number' || typeof idValue === 'boolean') ? String(idValue) : '';
    return raw ? raw.slice(-length).toUpperCase() : 'UNKNOWN';
};

const getSafeImageSrc = (imageValue: unknown): string | null => {
    if (typeof imageValue !== 'string') return null;
    const trimmed = imageValue.trim();
    if (!trimmed) return null;
    return trimmed.startsWith('data:') ? trimmed : `data:image/jpeg;base64,${trimmed}`;
};

const toDisplayString = (value: unknown, fallback = ''): string => {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : fallback;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return fallback;
};

const toDisplayStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.map(item => toDisplayString(item)).filter(Boolean);
};

const toRoleSafe = (value: unknown): WorkerRecord['role'] => {
    if (value === 'leader' || value === 'sub_leader' || value === 'worker') return value;
    return 'worker';
};

const toSafetyLevelSafe = (_value: unknown, score: number): WorkerRecord['safetyLevel'] => {
    return getSafetyLevelFromScore(score);
};

interface IssuanceReliabilityResult {
    trusted: boolean;
    source: 'ocr-current' | 'legacy-backup' | 'override-manual';
    reasons: string[];
}

const verifyIssuanceReliability = (worker: WorkerRecord): IssuanceReliabilityResult => {
    if (worker.approvalStatus === 'OVERRIDDEN') {
        return {
            trusted: true,
            source: 'override-manual',
            reasons: [],
        };
    }

    const reasons: string[] = [];
    const hasRequiredIdentity = Boolean(toDisplayString(worker.id)) && Boolean(toDisplayString(worker.name));
    const hasRequiredSafety = Number.isFinite(Number(worker.safetyScore)) && Boolean(worker.safetyLevel);
    const hasRequiredProfile = Boolean(toDisplayString(worker.jobField)) && Boolean(toDisplayString(worker.date));

    if (!hasRequiredIdentity) reasons.push('신원 필드 누락(ID/이름)');
    if (!hasRequiredSafety) reasons.push('안전평가 필드 누락(점수/등급)');
    if (!hasRequiredProfile) reasons.push('기본 프로필 누락(공종/일자)');

    const hasOriginalImage = typeof worker.originalImage === 'string' && worker.originalImage.length > 200;
    const hasOcrAuditTrail = Array.isArray(worker.auditTrail) && worker.auditTrail.some((entry) => entry?.stage === 'ocr');
    const hasEvidenceHash = typeof worker.evidenceHash === 'string' && worker.evidenceHash.trim().length > 10;

    if (!hasOriginalImage) reasons.push('OCR 원본 이미지 없음');
    if (!hasOcrAuditTrail) reasons.push('OCR 감사이력 없음');
    if (!hasEvidenceHash) reasons.push('증빙 해시 없음');

    const trusted = reasons.length === 0;
    return {
        trusted,
        source: trusted ? 'ocr-current' : 'legacy-backup',
        reasons,
    };
};

const normalizeWorkerForPrint = (value: unknown, fallbackIndex: number): WorkerRecord | null => {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    const safetyScore = Number(raw.safetyScore);
    const normalizedScore = Number.isFinite(safetyScore) ? safetyScore : 0;

    return {
        ...(raw as WorkerRecord),
        id: toDisplayString(raw.id, `unknown-${fallbackIndex}`),
        name: toDisplayString(raw.name, '식별 대기'),
        jobField: toDisplayString(raw.jobField, '미분류'),
        teamLeader: toDisplayString(raw.teamLeader, '미지정'),
        role: toRoleSafe(raw.role),
        isTranslator: Boolean(raw.isTranslator),
        isSignalman: Boolean(raw.isSignalman),
        date: toDisplayString(raw.date, new Date().toISOString().split('T')[0]),
        nationality: toDisplayString(raw.nationality, '미상'),
        language: toDisplayString(raw.language, 'unknown'),
        safetyScore: normalizedScore,
        safetyLevel: toSafetyLevelSafe(raw.safetyLevel, normalizedScore),
        strengths: toDisplayStringArray(raw.strengths),
        strengths_native: toDisplayStringArray(raw.strengths_native),
        weakAreas: toDisplayStringArray(raw.weakAreas),
        weakAreas_native: toDisplayStringArray(raw.weakAreas_native),
        suggestions: toDisplayStringArray(raw.suggestions),
        suggestions_native: toDisplayStringArray(raw.suggestions_native),
        handwrittenAnswers: Array.isArray(raw.handwrittenAnswers) ? (raw.handwrittenAnswers as WorkerRecord['handwrittenAnswers']) : [],
        fullText: toDisplayString(raw.fullText, ''),
        koreanTranslation: toDisplayString(raw.koreanTranslation, ''),
        improvement: toDisplayString(raw.improvement, ''),
        improvement_native: toDisplayString(raw.improvement_native, ''),
        aiInsights: toDisplayString(raw.aiInsights, ''),
        aiInsights_native: toDisplayString(raw.aiInsights_native, ''),
        selfAssessedRiskLevel: raw.selfAssessedRiskLevel === '상' || raw.selfAssessedRiskLevel === '중' || raw.selfAssessedRiskLevel === '하' ? raw.selfAssessedRiskLevel : '중',
        profileImage: typeof raw.profileImage === 'string' ? raw.profileImage : undefined,
        approvalStatus: raw.approvalStatus === 'APPROVED' || raw.approvalStatus === 'PENDING' || raw.approvalStatus === 'OVERRIDDEN' ? raw.approvalStatus : undefined,
        approvedBy: toDisplayString(raw.approvedBy, ''),
        approvedAt: toDisplayString(raw.approvedAt, ''),
        approvalReason: toDisplayString(raw.approvalReason, ''),
    };
};

// [컴포넌트] 안전모 스티커 (A4 최적화: 90mm x 60mm)
const PremiumSticker: React.FC<{ worker: WorkerRecord }> = React.memo(({ worker }) => {
    const s = getGradeStyle(worker.safetyLevel);
    const roles = getRoleBadge(worker);
    const mainRole = roles.length > 0 ? roles[0] : worker.jobField;
    // [IMPROVED] 약점이 있고 점수가 낮을 때만 주의 표시 (고점수는 주의사항 생략)
    const shouldShowWarning = worker.safetyScore < 80 && worker.weakAreas && Array.isArray(worker.weakAreas) && worker.weakAreas.length > 0;
    const safeWeakArea = shouldShowWarning ? worker.weakAreas[0] : '안전 기준 달성';

    return (
        <div className={`w-[90mm] h-[60mm] bg-white rounded-xl border-[3px] flex overflow-hidden relative break-inside-avoid box-border shadow-sm print:shadow-none ${s.border}`}>
            {/* 좌측: 등급 섹션 */}
            <div className={`w-[22mm] h-full ${s.bg} flex flex-col items-center justify-center text-white shrink-0 print-color-exact gap-2`}>
                <div className="text-center">
                    <span className="block text-[8px] font-bold opacity-80 mb-0.5">LEVEL</span>
                    <span className="block text-2xl font-black leading-none">{worker.safetyLevel === '초급' ? 'C' : worker.safetyLevel === '중급' ? 'B' : 'A'}</span>
                </div>
                <div className="w-8 h-px bg-white/30"></div>
                <div className="text-center">
                    <span className="block text-lg font-black">{worker.safetyScore}</span>
                    <span className="block text-[7px] font-bold opacity-80">SCORE</span>
                </div>
            </div>

            {/* 우측: 정보 섹션 */}
            <div className="flex-1 p-3 flex flex-col justify-between">
                <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">{worker.nationality}</span>
                            {worker.role === 'leader' && <span className="text-[10px] font-black bg-yellow-400 text-slate-900 px-1.5 py-0.5 rounded">팀장</span>}
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 leading-none truncate tracking-tight">{worker.name}</h2>
                        <p className="text-xs font-bold text-slate-500 mt-1 truncate">{mainRole} | {worker.jobField}</p>
                    </div>
                    <div className="w-[19mm] h-[19mm] bg-white border border-slate-200 rounded p-0.5 shrink-0">
                        <QRCodeComponent record={worker} />
                    </div>
                </div>

                <div className="mt-2">
                    <div className={`rounded-lg p-2 border flex items-center gap-2 ${
                        shouldShowWarning 
                            ? 'bg-rose-50 border-rose-100' 
                            : 'bg-emerald-50 border-emerald-100'
                    }`}>
                        <div className={`font-bold text-xs shrink-0 ${
                            shouldShowWarning ? 'text-rose-500' : 'text-emerald-600'
                        }`}>
                            {shouldShowWarning ? '⚠ 주의' : '✓ 양호'}
                        </div>
                        <div className={`text-[10px] font-bold truncate flex-1 ${
                            shouldShowWarning ? 'text-slate-600' : 'text-emerald-700'
                        }`}>
                            {safeWeakArea}
                        </div>
                    </div>
                    <div className="flex justify-between items-end mt-1.5">
                        <span className="text-[8px] font-bold text-indigo-600">PSI SAFETY PASS</span>
                        <span className="text-[8px] font-mono text-slate-400 tracking-tighter">ID: {getSafeIdTail(worker.id, 6)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
});

// [컴포넌트] 스마트 사원증 (A4 최적화: 54mm x 86mm)
const PremiumIDCard: React.FC<{ worker: WorkerRecord }> = React.memo(({ worker }) => {
    const s = getGradeStyle(worker.safetyLevel);
    const roles = getRoleBadge(worker);
    const profileImageSrc = getSafeImageSrc(worker.profileImage);

    return (
        <div className="w-[54mm] h-[86mm] bg-white rounded-[4mm] border border-slate-300 overflow-hidden flex flex-col relative break-inside-avoid box-border shadow-sm print:shadow-none">
            {/* Header */}
            <div className="h-[16mm] bg-slate-900 flex items-center justify-between px-3 print-color-exact">
                <span className="text-white font-black text-xs tracking-widest">PSI</span>
                <div className="flex flex-col items-end">
                    <span className="text-[6px] text-slate-400 font-bold uppercase">Safety License</span>
                    <span className="text-[8px] text-white font-bold">2026</span>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 flex flex-col items-center pt-4 px-3 relative bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                
                {/* Photo Frame */}
                <div className="w-[28mm] h-[36mm] bg-slate-100 rounded border border-slate-200 mb-3 overflow-hidden relative shadow-inner">
                    {profileImageSrc ? (
                        <img src={profileImageSrc} className="w-full h-full object-cover" alt="Profile" />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        </div>
                    )}
                    <div className={`absolute bottom-0 w-full py-0.5 text-center text-[7px] font-black text-white ${s.bg} print-color-exact`}>
                        {worker.safetyLevel} GRADE
                    </div>
                </div>

                {/* Info */}
                <div className="text-center w-full">
                    <div className="flex items-center justify-center gap-1 mb-1 flex-wrap">
                        <h2 className="text-lg font-black text-slate-900 leading-none truncate">{worker.name}</h2>
                        {/* [IMPROVED] 주요 역할 1개만 표시 (공간 제약) */}
                        {roles.length > 0 && (
                            <span className="text-[8px] font-black bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded whitespace-nowrap">
                                {roles[0]}
                            </span>
                        )}
                    </div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2 mb-2">
                        {worker.jobField} | {worker.nationality}
                    </p>
                    
                    {/* Tags - 모든 역할 표시 (공간 효율적) */}
                    {roles.length > 0 ? (
                        <div className="flex justify-center flex-wrap gap-0.5 mb-3 min-h-[12px]">
                            {roles.map((role, i) => (
                                <span key={i} className="px-1 py-0.5 rounded text-[6px] font-bold bg-slate-100 text-slate-600 border border-slate-200 leading-tight">
                                    {role}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <div className="mb-3 min-h-[12px] flex items-center justify-center">
                            <span className="text-[7px] text-slate-400">일반 근로자</span>
                        </div>
                    )}
                </div>

                {/* Footer QR */}
                <div className="mt-auto w-full mb-3 flex items-end justify-between">
                    <div className="text-left">
                        <p className="text-[6px] text-slate-400 font-bold uppercase">Issued</p>
                        <p className="text-[8px] font-bold text-slate-800">2026.01.01</p>
                    </div>
                    <div className="w-[14mm] h-[14mm] bg-white p-0.5 border border-slate-200 rounded">
                        <QRCodeComponent record={worker} />
                    </div>
                </div>
            </div>
        </div>
    );
});

// [SAMPLE DATA] For Preview Modal - [IMPROVED] 다양한 시나리오 커버
const sampleWorker: WorkerRecord = {
    id: 'SAMPLE-PREVIEW-001',
    name: '홍길동',
    jobField: '형틀목공',
    teamLeader: '홍길동',
    role: 'leader',
    isTranslator: true,  // 통역 담당
    isSignalman: false,
    date: '2026-01-01',
    nationality: '대한민국',
    language: 'Korean',
    safetyScore: 98,  // 고급 + 높은 점수
    safetyLevel: '고급',
    weakAreas: [],  // 공란 (약점 없음 = 안전 기준 달성)
    strengths: ['안전 수칙 준수'],
    profileImage: undefined,
    handwrittenAnswers: [],
    fullText: '',
    koreanTranslation: '',
    strengths_native: [],
    weakAreas_native: [],
    improvement: '',
    improvement_native: '',
    suggestions: [],
    suggestions_native: [],
    aiInsights: '',
    aiInsights_native: '',
    selfAssessedRiskLevel: '하'
};

interface WorkerManagementProps {
    workerRecords: WorkerRecord[];
    onViewDetails: (worker: WorkerRecord) => void;
    onUpdateRecord?: (worker: WorkerRecord) => Promise<void> | void;
}

interface BulkWorkerUploadRow {
    name: string;
    nationality: string;
    job_field: string;
    team_name: string;
    phone_number?: string;
    birth_date?: string;
    passport_number?: string;
}

type BulkUploadSummary = {
    status: 'success' | 'error';
    requested: number;
    inserted: number;
    skipped: number;
    fileName: string;
    message: string;
};

type ManualWorkerForm = {
    name: string;
    nationality: string;
    job_field: string;
    team_name: string;
    phone_number: string;
    birth_date: string;
    passport_number: string;
};

type RegisteredWorkerListRow = {
    id: string;
    name: string;
    job_field: string;
    team_name: string;
    birth_date: string;
    phone_number: string;
};

const ALLOWED_JOB_FIELDS = [
    '형틀',
    '철근',
    '갱폼',
    '알폼',
    '시스템',
    '관리',
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
    '관리': '관리',
    '관리도': '관리',
    '할석미장견출': '할석미장견출',
    '해체정리': '해체정리',
    '직영(용역포함)': '직영(용역포함)',
    '직영용역포함': '직영(용역포함)',
    '직영': '직영(용역포함)',
    '콘크리트비계': '콘크리트비계',
};

const WorkerManagement: React.FC<WorkerManagementProps> = ({ workerRecords, onViewDetails, onUpdateRecord }) => {
    // --- Main View States ---
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedJobField, setSelectedJobField] = useState('전체');
    const [selectedCrew, setSelectedCrew] = useState('전체');
    const [filterLevel, setFilterLevel] = useState('전체');
    const [reliabilityFilter, setReliabilityFilter] = useState<'all' | 'trusted' | 'needs-review'>('all');

    // --- Print Modal States ---
    const [isPrintMode, setIsPrintMode] = useState(false);
    const [printType, setPrintType] = useState<'sticker' | 'idcard'>('sticker');
    const [workersToPrint, setWorkersToPrint] = useState<WorkerRecord[]>([]);
    const [printTrustMode, setPrintTrustMode] = useState<'trusted' | 'fallback'>('trusted');
    const [renderLimit, setRenderLimit] = useState(0); // [NEW] For Progressive Rendering
    const [printRuntimeError, setPrintRuntimeError] = useState<string | null>(null);
    const [printDiagnostics, setPrintDiagnostics] = useState<{
        startedAt: string;
        targetType: 'sticker' | 'idcard';
        targetCount: number;
        trustedCount: number;
        fallbackUsed: boolean;
    } | null>(null);
    
    // View Mode Toggle (Grid vs Flip)
    const [viewType, setViewType] = useState<'grid' | 'flip'>('grid');
    const [currentFlipIndex, setCurrentFlipIndex] = useState(0);

    // [NEW] Sample Modal State
    const [showSampleModal, setShowSampleModal] = useState(false);
    const [overrideModalWorker, setOverrideModalWorker] = useState<WorkerRecord | null>(null);
    const [overridePin, setOverridePin] = useState('');
    const [overrideReason, setOverrideReason] = useState('');
    const [isOverrideSubmitting, setIsOverrideSubmitting] = useState(false);
    const [isBulkUploading, setIsBulkUploading] = useState(false);
    const [bulkUploadMessage, setBulkUploadMessage] = useState<string | null>(null);
    const [bulkUploadSummary, setBulkUploadSummary] = useState<BulkUploadSummary | null>(null);
    const [isManualRegistering, setIsManualRegistering] = useState(false);
    const [registeredWorkers, setRegisteredWorkers] = useState<RegisteredWorkerListRow[]>([]);
    const [isRegisteredWorkersLoading, setIsRegisteredWorkersLoading] = useState(false);
    const [registeredWorkersError, setRegisteredWorkersError] = useState('');
    const [manualWorkerForm, setManualWorkerForm] = useState<ManualWorkerForm>({
        name: '',
        nationality: '',
        job_field: ALLOWED_JOB_FIELDS[0],
        team_name: '',
        phone_number: '',
        birth_date: '',
        passport_number: '',
    });
    const bulkFileInputRef = useRef<HTMLInputElement | null>(null);
    const printAreaRef = useRef<HTMLDivElement | null>(null);
    const singlePrintBackupRef = useRef<{
        workers: WorkerRecord[];
        renderLimit: number;
        viewType: 'grid' | 'flip';
        currentFlipIndex: number;
    } | null>(null);

    const getPrintSafeId = (id: unknown) => {
        const raw = typeof id === 'string' ? id : (typeof id === 'number' || typeof id === 'boolean') ? String(id) : 'unknown';
        return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
    };

    const normalizePhone = (raw: unknown) => String(raw || '').replace(/\D/g, '');
    const normalizeBirthDate = (raw: unknown) => String(raw || '').replace(/\D/g, '');
    const normalizePassport = (raw: unknown) => String(raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const normalizeJobField = (raw: unknown) => {
        const base = String(raw || '').trim();
        if (!base) return '';
        const compact = base.replace(/\s+/g, '');
        return JOB_FIELD_ALIASES[compact] || JOB_FIELD_ALIASES[base] || base;
    };

    const normalizeHeader = (header: string) => String(header || '').trim().toLowerCase().replace(/\s+/g, '');

    const extractValueByAliases = (row: Record<string, unknown>, aliases: string[]) => {
        const entries = Object.entries(row || {});
        for (const [key, value] of entries) {
            const normalizedKey = normalizeHeader(key);
            if (aliases.some((alias) => normalizedKey === normalizeHeader(alias))) {
                return String(value ?? '').trim();
            }
        }
        return '';
    };

    const parseSpreadsheetFile = async (file: File): Promise<Record<string, unknown>[]> => {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) return [];
        const sheet = workbook.Sheets[firstSheetName];
        return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
            defval: '',
            raw: false,
            blankrows: false,
        });
    };

    const fetchRegisteredWorkers = useCallback(async () => {
        setIsRegisteredWorkersLoading(true);
        setRegisteredWorkersError('');

        try {
            const data = await postAdminJson<any>(
                '/api/admin/safety-management',
                {
                    action: 'list-workers',
                    payload: { limit: 3000 },
                },
                { fallbackMessage: '등록 근로자 목록 조회 실패' },
            );

            const rows = Array.isArray(data?.data?.rows) ? data.data.rows : [];
            setRegisteredWorkers(rows.map((row: any) => ({
                id: String(row?.id || '').trim(),
                name: String(row?.name || '').trim(),
                job_field: String(row?.job_field || '').trim(),
                team_name: String(row?.team_name || '').trim(),
                birth_date: String(row?.birth_date || '').trim(),
                phone_number: String(row?.phone_number || '').trim(),
            })));
        } catch (error) {
            setRegisteredWorkersError(extractMessage(error));
            setRegisteredWorkers([]);
        } finally {
            setIsRegisteredWorkersLoading(false);
        }
    }, []);

    const handleDownloadTemplate = () => {
        const headers = ['이름', '국적', '공종', '팀명', '핸드폰번호', '생년월일', '여권번호'];
        const sampleRows = [
            ['홍길동', '대한민국', '형틀', '김철수팀', '01012345678', '900101', 'M12345678'],
            ['왕샤오밍', '중국', '철근', '박영수팀', '01098765432', '', 'E12345678'],
        ];

        const templateSheet = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
        templateSheet['!cols'] = [
            { wch: 14 },
            { wch: 14 },
            { wch: 18 },
            { wch: 16 },
            { wch: 16 },
            { wch: 12 },
            { wch: 16 },
        ];

        const jobFieldRows = ALLOWED_JOB_FIELDS.map((item) => [item]);
        const jobFieldSheet = XLSX.utils.aoa_to_sheet([['허용 공종'], ...jobFieldRows]);

        const noteRows = [
            ['업로드 가이드'],
            ['1) 이름, 국적, 공종, 팀명은 필수 입력'],
            ['2) 핸드폰번호/생년월일/여권번호 중 1개 이상 필수'],
            ['3) 생년월일은 6자리 또는 8자리만 허용'],
            [`4) 공종은 허용 목록만 사용: ${ALLOWED_JOB_FIELDS.join(', ')}`],
        ];
        const noteSheet = XLSX.utils.aoa_to_sheet(noteRows);
        noteSheet['!cols'] = [{ wch: 120 }];

        const templateSheetWithValidation = templateSheet as any;
        templateSheetWithValidation['!dataValidation'] = [
            {
                type: 'list',
                allowBlank: false,
                sqref: 'C2:C2000',
                formula1: `'공종목록'!$A$2:$A$${ALLOWED_JOB_FIELDS.length + 1}`,
                showErrorMessage: true,
                errorTitle: '공종 입력 오류',
                error: '허용된 공종 목록에서 선택해 주세요.',
            },
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, templateSheet, '근로자업로드양식');
        XLSX.utils.book_append_sheet(workbook, jobFieldSheet, '공종목록');
        XLSX.utils.book_append_sheet(workbook, noteSheet, '안내');

        XLSX.writeFile(workbook, 'workers_bulk_upload_template.xlsx');
    };

    const validateAndNormalizeRows = (rawRows: Record<string, unknown>[]): BulkWorkerUploadRow[] => {
        return rawRows.map((row, index) => {
            const excelRowNo = index + 2;
            const name = extractValueByAliases(row, ['이름', '성명', 'name', 'worker_name']);
            const nationality = extractValueByAliases(row, ['국적', 'nationality']);
            const jobField = normalizeJobField(extractValueByAliases(row, ['공종', '직종', 'job_field', 'jobfield']));
            const teamName = extractValueByAliases(row, ['팀명', '팀', 'team_name', 'team']);
            const phoneNumber = normalizePhone(extractValueByAliases(row, ['핸드폰번호', '전화번호', '휴대폰', 'phone', 'phone_number']));
            const birthDate = normalizeBirthDate(extractValueByAliases(row, ['생년월일', 'birth', 'birth_date']));
            const passportNumber = normalizePassport(extractValueByAliases(row, ['여권번호', 'passport', 'passport_number']));

            if (!name) {
                throw new Error(`${excelRowNo}번째 줄의 필수 키(이름)가 누락되었습니다.`);
            }
            if (!nationality) {
                throw new Error(`${excelRowNo}번째 줄의 필수 키(국적)가 누락되었습니다.`);
            }
            if (!jobField) {
                throw new Error(`${excelRowNo}번째 줄의 필수 키(공종)가 누락되었습니다.`);
            }
            if (!teamName) {
                throw new Error(`${excelRowNo}번째 줄의 필수 키(팀명)가 누락되었습니다.`);
            }
            if (!(ALLOWED_JOB_FIELDS as readonly string[]).includes(jobField)) {
                throw new Error(`${excelRowNo}번째 줄의 공종(${jobField})이 허용 목록에 없습니다. 허용 공종: ${ALLOWED_JOB_FIELDS.join(', ')}`);
            }
            if (!phoneNumber && !birthDate && !passportNumber) {
                throw new Error(`${excelRowNo}번째 줄의 필수 키(핸드폰번호/생년월일/여권번호 중 1개 이상)가 누락되었습니다.`);
            }
            if (birthDate && !(birthDate.length === 6 || birthDate.length === 8)) {
                throw new Error(`${excelRowNo}번째 줄의 생년월일은 6자리 또는 8자리만 허용됩니다.`);
            }

            return {
                name,
                nationality,
                job_field: jobField,
                team_name: teamName,
                phone_number: phoneNumber || undefined,
                birth_date: birthDate || undefined,
                passport_number: passportNumber || undefined,
            };
        });
    };

    const handleBulkFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setBulkUploadMessage(null);
        setBulkUploadSummary(null);
        setIsBulkUploading(true);

        try {
            const parsedRows = await parseSpreadsheetFile(file);
            if (!parsedRows.length) {
                throw new Error('업로드 파일에서 유효한 데이터 행을 찾지 못했습니다.');
            }

            const normalizedRows = validateAndNormalizeRows(parsedRows);

            const data = await postAdminJson<any>(
                '/api/admin/safety-management',
                {
                    action: 'bulk-upload-workers',
                    payload: {
                        workers: normalizedRows,
                    },
                },
                { fallbackMessage: '근로자 대량 업로드 실패' },
            );

            const requested = Number(data?.data?.requested || normalizedRows.length);
            const inserted = Number(data?.data?.inserted || 0);
            const skipped = Number(data?.data?.skippedDuplicateCount || 0);
            setBulkUploadMessage(`✅ 업로드 완료: 요청 ${requested}명 / 신규 ${inserted}명 / 중복 건너뜀 ${skipped}명`);
            setBulkUploadSummary({
                status: 'success',
                requested,
                inserted,
                skipped,
                fileName: file.name,
                message: '엑셀 업로드가 정상 처리되었습니다.',
            });
            void fetchRegisteredWorkers();
        } catch (error: any) {
            setBulkUploadMessage(`❌ ${extractMessage(error)}`);
            setBulkUploadSummary({
                status: 'error',
                requested: 0,
                inserted: 0,
                skipped: 0,
                fileName: file.name,
                message: extractMessage(error),
            });
        } finally {
            setIsBulkUploading(false);
            if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
        }
    };

    const handleManualRegisterWorker = async () => {
        const name = manualWorkerForm.name.trim();
        const nationality = manualWorkerForm.nationality.trim();
        const jobField = normalizeJobField(manualWorkerForm.job_field);
        const teamName = manualWorkerForm.team_name.trim();
        const phoneNumber = normalizePhone(manualWorkerForm.phone_number);
        const birthDate = normalizeBirthDate(manualWorkerForm.birth_date);
        const passportNumber = normalizePassport(manualWorkerForm.passport_number);

        if (!name) return alert('이름을 입력해 주세요.');
        if (!nationality) return alert('국적을 입력해 주세요.');
        if (!jobField) return alert('공종을 선택해 주세요.');
        if (!(ALLOWED_JOB_FIELDS as readonly string[]).includes(jobField)) return alert('허용된 공종만 등록할 수 있습니다.');
        if (!teamName) return alert('팀명을 입력해 주세요.');
        if (!phoneNumber && !birthDate && !passportNumber) {
            return alert('핸드폰번호/생년월일/여권번호 중 1개 이상 입력해 주세요.');
        }
        if (birthDate && !(birthDate.length === 6 || birthDate.length === 8)) {
            return alert('생년월일은 6자리 또는 8자리만 입력해 주세요.');
        }

        setIsManualRegistering(true);
        try {
            const data = await postAdminJson<any>(
                '/api/admin/safety-management',
                {
                    action: 'bulk-upload-workers',
                    payload: {
                        workers: [
                            {
                                name,
                                nationality,
                                job_field: jobField,
                                team_name: teamName,
                                phone_number: phoneNumber || undefined,
                                birth_date: birthDate || undefined,
                                passport_number: passportNumber || undefined,
                            },
                        ],
                    },
                },
                { fallbackMessage: '근로자 등록 실패' },
            );

            const requested = Number(data?.data?.requested || 1);
            const inserted = Number(data?.data?.inserted || 0);
            const skipped = Number(data?.data?.skippedDuplicateCount || 0);
            setBulkUploadMessage(`✅ 프로그램 등록 완료: 요청 ${requested}명 / 신규 ${inserted}명 / 중복 건너뜀 ${skipped}명`);
            setBulkUploadSummary({
                status: 'success',
                requested,
                inserted,
                skipped,
                fileName: '프로그램 내 직접 등록',
                message: '프로그램에서 근로자 등록이 완료되었습니다.',
            });
            void fetchRegisteredWorkers();

            setManualWorkerForm({
                name: '',
                nationality: '',
                job_field: ALLOWED_JOB_FIELDS[0],
                team_name: '',
                phone_number: '',
                birth_date: '',
                passport_number: '',
            });
        } catch (error: any) {
            const message = extractMessage(error);
            setBulkUploadMessage(`❌ ${message}`);
            setBulkUploadSummary({
                status: 'error',
                requested: 0,
                inserted: 0,
                skipped: 0,
                fileName: '프로그램 내 직접 등록',
                message,
            });
        } finally {
            setIsManualRegistering(false);
        }
    };

    const latestRecords = useMemo(() => {
        const map = new Map<string, WorkerRecord>();
        workerRecords.forEach(r => {
            const key = `${r.name}-${r.teamLeader || '미지정'}-${r.jobField}`;
            if (!map.has(key) || new Date(r.date) > new Date(map.get(key)!.date)) map.set(key, r);
        });

        return Array.from(map.values())
            .map((record) => ({
                ...record,
                safetyLevel: getSafetyLevelFromScore(Number(record.safetyScore)),
            }))
            .sort((a,b) => a.name.localeCompare(b.name));
    }, [workerRecords]);

    const jobFields = useMemo(() => ['전체', ...Array.from(new Set(latestRecords.map(r => r.jobField))).sort()], [latestRecords]);
    const crews = useMemo(() => ['전체', ...Array.from(new Set(latestRecords.map(r => r.teamLeader || '미지정'))).sort()], [latestRecords]);

    const filteredRecords = useMemo(() => {
        return latestRecords.filter(r => {
            const safeName = toDisplayString(r.name).toLowerCase();
            const safeJobField = toDisplayString(r.jobField, '미분류');
            const safeCrew = toDisplayString(r.teamLeader, '미지정');
            const matchesSearch = safeName.includes(searchTerm.toLowerCase());
            const matchesJobField = selectedJobField === '전체' || safeJobField === selectedJobField;
            const matchesCrew = selectedCrew === '전체' || safeCrew === selectedCrew;
            const matchesLevel = filterLevel === '전체' || r.safetyLevel === filterLevel;
            const reliability = verifyIssuanceReliability(r);
            const matchesReliability =
                reliabilityFilter === 'all' ||
                (reliabilityFilter === 'trusted' && reliability.trusted) ||
                (reliabilityFilter === 'needs-review' && !reliability.trusted);
            return matchesSearch && matchesJobField && matchesCrew && matchesLevel && matchesReliability;
        });
    }, [latestRecords, searchTerm, selectedJobField, selectedCrew, filterLevel, reliabilityFilter]);

    const filteredReliabilitySummary = useMemo(() => {
        const evaluations = filteredRecords.map((worker) => verifyIssuanceReliability(worker));
        const trustedCount = evaluations.filter((result) => result.trusted).length;
        const untrustedCount = evaluations.length - trustedCount;
        return {
            total: evaluations.length,
            trustedCount,
            untrustedCount,
        };
    }, [filteredRecords]);

    const itemsPerPage = printType === 'sticker' ? 8 : 6;

    const pagedWorkers = useMemo(() => {
        const renderedWorkers = workersToPrint.slice(0, renderLimit);
        const pages: WorkerRecord[][] = [];
        for (let i = 0; i < renderedWorkers.length; i += itemsPerPage) {
            pages.push(renderedWorkers.slice(i, i + itemsPerPage));
        }
        return pages;
    }, [workersToPrint, renderLimit, itemsPerPage]);

    const startProcessing = (type: 'sticker' | 'idcard', targetWorkers: WorkerRecord[]) => {
        if (targetWorkers.length === 0) return alert('발급할 근로자 데이터가 없습니다.');

        setPrintRuntimeError(null);

        const reliabilityEvaluations = targetWorkers.map((worker) => ({
            worker,
            reliability: verifyIssuanceReliability(worker),
        }));

        const trustedCandidates = reliabilityEvaluations
            .filter((item) => item.reliability.trusted)
            .map((item) => item.worker);

        const excludedCandidates = reliabilityEvaluations.filter((item) => !item.reliability.trusted);

        const trustedPrintableWorkers = trustedCandidates
            .map((worker, index) => normalizeWorkerForPrint(worker, index))
            .filter((worker): worker is WorkerRecord => worker !== null);

        const allPrintableWorkers = targetWorkers
            .map((worker, index) => normalizeWorkerForPrint(worker, index))
            .filter((worker): worker is WorkerRecord => worker !== null);

        const printableWorkers = trustedPrintableWorkers.length > 0
            ? trustedPrintableWorkers
            : allPrintableWorkers;

        if (allPrintableWorkers.length === 0) {
            const sampleReasons = excludedCandidates
                .flatMap((item) => item.reliability.reasons)
                .slice(0, 3)
                .join(', ');
            return alert(`발급 가능한 신뢰 데이터가 없습니다.\n\n검증 기준: OCR 원본 이미지 + OCR 감사이력 + 증빙 해시\n참고 사유: ${sampleReasons || '데이터 누락'}`);
        }

        const nextPrintTrustMode: 'trusted' | 'fallback' = trustedPrintableWorkers.length === 0 ? 'fallback' : 'trusted';
        setPrintDiagnostics({
            startedAt: new Date().toISOString(),
            targetType: type,
            targetCount: printableWorkers.length,
            trustedCount: trustedPrintableWorkers.length,
            fallbackUsed: nextPrintTrustMode === 'fallback',
        });

        if (trustedPrintableWorkers.length === 0) {
            alert(`검증 통과 데이터가 없어 필터 대상 ${allPrintableWorkers.length}명을 예외 출력 모드로 진행합니다.\n\n권장: OCR 재분석 후 재발급으로 최신 증빙 정합성을 확보하세요.`);
        } else if (excludedCandidates.length > 0) {
            const reasonSummary = excludedCandidates
                .flatMap((item) => item.reliability.reasons)
                .slice(0, 3)
                .join(', ');
            alert(`신뢰성 검증 결과\n- 발급 포함: ${printableWorkers.length}명\n- 발급 제외: ${excludedCandidates.length}명\n\n제외 사유 예시: ${reasonSummary}\n\n구 백업 데이터는 OCR 재분석 후 발급해 주세요.`);
        }
        
        // Reset states
        setWorkersToPrint(printableWorkers);
        setPrintType(type);
        setPrintTrustMode(nextPrintTrustMode);
        setRenderLimit(Math.min(5, printableWorkers.length)); // 초기 프레임 즉시 표시
        setViewType('grid'); // Default to grid
        setCurrentFlipIndex(0);
        setIsPrintMode(true);
    };

    const openOverrideModal = (worker: WorkerRecord) => {
        setOverrideModalWorker(worker);
        setOverridePin('');
        setOverrideReason('');
    };

    const closeOverrideModal = () => {
        setOverrideModalWorker(null);
        setOverridePin('');
        setOverrideReason('');
        setIsOverrideSubmitting(false);
    };

    const handleOverrideApproveAndIssue = async () => {
        if (!overrideModalWorker) return;

        const adminSecret = (import.meta.env.VITE_PSI_ADMIN_SECRET || '').trim();
        if (!adminSecret) {
            alert('VITE_PSI_ADMIN_SECRET 환경변수가 설정되지 않았습니다.');
            return;
        }

        if (!overridePin.trim() || overridePin.trim() !== adminSecret) {
            alert('관리자 PIN 번호가 일치하지 않습니다.');
            return;
        }
        if (!overrideReason.trim()) {
            alert('예외 승인 사유를 입력해 주세요.');
            return;
        }

        const nowIso = new Date().toISOString();
        const updatedWorker: WorkerRecord = {
            ...overrideModalWorker,
            approvalStatus: 'OVERRIDDEN',
            approvedBy: 'ADMIN_OVERRIDE',
            approvedAt: nowIso,
            approvalReason: overrideReason.trim(),
            approvalHistory: [
                ...(overrideModalWorker.approvalHistory || []),
                {
                    timestamp: nowIso,
                    actor: 'ADMIN_OVERRIDE',
                    status: 'approved',
                    comment: `예외 승인(강제 발급): ${overrideReason.trim()}`,
                },
            ],
            auditTrail: [
                ...(overrideModalWorker.auditTrail || []),
                {
                    stage: 'approval',
                    timestamp: nowIso,
                    actor: 'ADMIN_OVERRIDE',
                    note: 'Human-in-the-loop 예외 승인 강제 발급 (스티커)',
                },
            ],
        };

        setIsOverrideSubmitting(true);
        try {
            await onUpdateRecord?.(updatedWorker);
            closeOverrideModal();
            startProcessing('sticker', [updatedWorker]);
        } catch (error) {
            const message = extractMessage(error);
            alert(`예외 승인 저장 중 오류가 발생했습니다: ${message}`);
            setIsOverrideSubmitting(false);
        }
    };

    const renderStartTimeRef = React.useRef<number | null>(null);

    // [PROGRESSIVE RENDERING ENGINE]
    // 브라우저 멈춤 방지를 위해 프레임당 렌더링 개수를 제한하여 점진적으로 로드함
    useEffect(() => {
        void fetchRegisteredWorkers();
    }, [fetchRegisteredWorkers]);

    useEffect(() => {
        if (!isPrintMode) return;

        if (renderLimit > 0 && workersToPrint.length > 0 && !renderStartTimeRef.current) {
            renderStartTimeRef.current = performance.now();
        }
        
        // 렌더링이 완료되지 않았다면 계속 진행
        if (renderLimit < workersToPrint.length) {
            // 프레임당 렌더링 개수 (PC 성능에 따라 조절 가능하지만 4~8개 정도가 UI 응답성 유지에 좋음)
            const BATCH_SIZE = 5; 
            
            const timer = requestAnimationFrame(() => {
                setRenderLimit(prev => Math.min(prev + BATCH_SIZE, workersToPrint.length));
            });
            
            return () => cancelAnimationFrame(timer);
        }

        if (renderLimit >= workersToPrint.length && renderStartTimeRef.current) {
            const elapsedMs = performance.now() - renderStartTimeRef.current;
            const metric = {
                timestamp: new Date().toISOString(),
                count: workersToPrint.length,
                elapsedMs: Math.round(elapsedMs),
                batchSize: 5,
            };
            const key = 'psi_render_metrics';
            try {
                const raw = localStorage.getItem(key);
                const parsed = raw ? JSON.parse(raw) : [];
                const existing = Array.isArray(parsed) ? parsed : [];
                const next = [metric, ...existing].slice(0, 30);
                localStorage.setItem(key, JSON.stringify(next));
                console.info('[PSI][RenderMetric]', metric);
            } catch (error) {
                console.warn('[PSI][RenderMetric] localStorage parse/store failed:', error);
            }
            renderStartTimeRef.current = null;
        }
    }, [isPrintMode, renderLimit, workersToPrint.length]);

    useEffect(() => {
        if (!isPrintMode) return;

        const handleRuntimeError = (event: ErrorEvent) => {
            const message = event?.message || '인쇄 모드 런타임 오류';
            console.error('[WorkerManagement][PrintMode][ErrorEvent]', {
                message,
                filename: event?.filename,
                lineno: event?.lineno,
                colno: event?.colno,
            });
            setPrintRuntimeError(message);
        };

        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            const message = extractMessage(event?.reason);
            console.error('[WorkerManagement][PrintMode][UnhandledRejection]', {
                message,
                reason: event?.reason,
            });
            setPrintRuntimeError(message || '인쇄 모드 비동기 오류');
        };

        window.addEventListener('error', handleRuntimeError);
        window.addEventListener('unhandledrejection', handleUnhandledRejection);

        return () => {
            window.removeEventListener('error', handleRuntimeError);
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        };
    }, [isPrintMode]);

    useEffect(() => {
        if (!isPrintMode) return;
        if (workersToPrint.length > 0) return;
        setPrintRuntimeError('인쇄할 데이터가 비어 있어 인쇄 모드를 종료했습니다. 다시 시도해 주세요.');
        setIsPrintMode(false);
    }, [isPrintMode, workersToPrint.length]);

    // Navigation for Flip View
    const handleNext = () => setCurrentFlipIndex(prev => Math.min(workersToPrint.length - 1, prev + 1));
    const handlePrev = () => setCurrentFlipIndex(prev => Math.max(0, prev - 1));

        const printUsingFallbackWindow = (title: string) => {
                const source = printAreaRef.current;
                if (!source) {
                        setPrintRuntimeError('인쇄 영역을 찾을 수 없어 새 창 인쇄를 실행할 수 없습니다.');
                        return;
                }

                const styleTags = Array.from(document.querySelectorAll('style')).map((node) => node.outerHTML).join('\n');
                const linkTags = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((node) => node.outerHTML).join('\n');
                const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1280,height=900');

                if (!printWindow) {
                        setPrintRuntimeError('브라우저 팝업 차단으로 인쇄 창을 열지 못했습니다. 팝업 허용 후 다시 시도해 주세요.');
                        return;
                }

                const html = `<!doctype html>
<html lang="ko">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    ${linkTags}
    ${styleTags}
    <style>
        @page { size: A4; margin: 0; }
        body { margin: 0; background: #fff; }
        .no-print { display: none !important; }
        .print-color-exact { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
    </style>
</head>
<body>
    <div id="print-root">${source.innerHTML}</div>
    <script>
        window.addEventListener('load', function () {
            setTimeout(function () {
                try { window.focus(); window.print(); } catch (e) {}
            }, 250);
        });
    </script>
</body>
</html>`;

                printWindow.document.open();
                printWindow.document.write(html);
                printWindow.document.close();
        };

        const performPrint = (title: string) => {
                try {
                        if (typeof window.print !== 'function') {
                                throw new Error('window.print를 사용할 수 없습니다.');
                        }
                        window.focus();
                        window.print();
                } catch (error) {
                        const message = extractMessage(error);
                        console.error('[WorkerManagement][PrintMode] primary print failed, fallback window will be used:', error);
                        setPrintRuntimeError(`${message || '인쇄 호출 실패'} 새 창 인쇄로 재시도합니다.`);
                        printUsingFallbackWindow(title);
                }
        };

    const printCurrentOnly = () => {
        const currentWorker = workersToPrint[currentFlipIndex];
        if (!currentWorker) return;

        singlePrintBackupRef.current = {
            workers: workersToPrint,
            renderLimit,
            viewType,
            currentFlipIndex,
        };

        const restore = () => {
            const backup = singlePrintBackupRef.current;
            if (!backup) return;
            setWorkersToPrint(backup.workers);
            setRenderLimit(backup.renderLimit);
            setViewType(backup.viewType);
            setCurrentFlipIndex(backup.currentFlipIndex);
            singlePrintBackupRef.current = null;
            window.removeEventListener('afterprint', restore);
        };

        setWorkersToPrint([currentWorker]);
        setRenderLimit(1);
        setViewType('grid');
        setCurrentFlipIndex(0);

        window.addEventListener('afterprint', restore);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                try {
                    performPrint(`PSI-${printType}-current`);
                } finally {
                    setTimeout(restore, 2000);
                }
            });
        });
    };

    const handlePrintAll = () => {
        requestAnimationFrame(() => {
            performPrint(`PSI-${printType}-all`);
        });
    };

    const isRenderingComplete = renderLimit >= workersToPrint.length;
    const progressPercentage = workersToPrint.length > 0 ? Math.round((renderLimit / workersToPrint.length) * 100) : 0;

    if (isPrintMode) {
        const printResetKey = `${printType}-${workersToPrint.length}-${renderLimit}-${viewType}`;
        return (
            <PrintModeErrorBoundary onExit={() => setIsPrintMode(false)} resetKey={printResetKey}>
            <div className="fixed inset-0 bg-slate-100 z-[3000] overflow-y-auto font-sans">
                {printRuntimeError && (
                    <div className="sticky top-0 z-[4000] bg-rose-50 border-b border-rose-200 px-6 py-3 no-print">
                        <p className="text-sm font-black text-rose-700">⚠️ {printRuntimeError}</p>
                    </div>
                )}
                {/* Print Control Header */}
                <div className="sticky top-0 bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center z-[3001] no-print shadow-sm">
                    <div className="flex items-center gap-6">
                        <div className={`p-3 rounded-2xl ${printType === 'sticker' ? 'bg-orange-50 text-orange-600' : 'bg-indigo-50 text-indigo-600'}`}>
                            {printType === 'sticker' 
                                ? <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                                : <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0c0 .884-.5 2-2 2h4c-1.5 0-2-1.116-2-2z" /></svg>
                            }
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-900">
                                {printType === 'sticker' ? '안전모 스티커' : '스마트 사원증'} 발급 센터
                            </h2>
                            <div className="flex items-center gap-4 mt-1">
                                <p className="text-slate-500 text-sm font-bold">
                                    총 {workersToPrint.length}명 대기 중
                                </p>
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black border ${printTrustMode === 'fallback' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                    {printTrustMode === 'fallback' ? '⚠ 예외 출력 모드' : '✅ 검증 통과 출력'}
                                </span>
                                {/* View Toggle */}
                                <div className="flex bg-slate-100 p-1 rounded-lg">
                                    <button 
                                        onClick={() => setViewType('grid')}
                                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${viewType === 'grid' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        그리드 보기 (전체)
                                    </button>
                                    <button 
                                        onClick={() => setViewType('flip')}
                                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${viewType === 'flip' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        플립 보기 (상세)
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    {/* Rendering Progress Bar */}
                    {!isRenderingComplete && (
                        <div className="flex-1 max-w-xs mx-8">
                            <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                                <span>인쇄 데이터 생성 중...</span>
                                <span>{renderLimit} / {workersToPrint.length}</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                <div 
                                    className="bg-indigo-500 h-full rounded-full transition-all duration-100 ease-linear" 
                                    style={{ width: `${progressPercentage}%` }}
                                ></div>
                            </div>
                        </div>
                    )}
                    
                    {viewType === 'flip' && isRenderingComplete && (
                        <div className="flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
                            <button onClick={handlePrev} disabled={currentFlipIndex === 0} className="p-2 hover:bg-white rounded-full disabled:opacity-30"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                            <span className="font-mono font-bold text-slate-700 w-16 text-center">{currentFlipIndex + 1} / {workersToPrint.length}</span>
                            <button onClick={handleNext} disabled={currentFlipIndex === workersToPrint.length - 1} className="p-2 hover:bg-white rounded-full disabled:opacity-30"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button onClick={() => setIsPrintMode(false)} className="px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm">
                            닫기
                        </button>
                        {viewType === 'flip' ? (
                            <button 
                                onClick={printCurrentOnly} 
                                className="px-8 py-3 bg-slate-800 text-white rounded-xl font-black shadow-lg hover:bg-slate-900 transition-transform hover:-translate-y-0.5 flex items-center gap-2 text-sm"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                현재 장만 인쇄
                            </button>
                        ) : (
                            <button 
                                onClick={handlePrintAll} 
                                disabled={!isRenderingComplete}
                                className={`px-8 py-3 rounded-xl font-black shadow-lg transition-all flex items-center gap-2 text-sm ${!isRenderingComplete ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:-translate-y-0.5'}`}
                            >
                                {isRenderingComplete ? (
                                    <>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                        전체 일괄 인쇄
                                    </>
                                ) : (
                                    <>
                                        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        데이터 준비 중...
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {printDiagnostics && (
                    <div className="px-8 py-2 no-print border-b border-slate-200 bg-slate-50">
                        <p className="text-xs font-bold text-slate-600">
                            진단: {printDiagnostics.targetType === 'sticker' ? '스티커' : '사원증'} / 대상 {printDiagnostics.targetCount}명 / 검증통과 {printDiagnostics.trustedCount}명 / 예외모드 {printDiagnostics.fallbackUsed ? 'ON' : 'OFF'} / 시작 {new Date(printDiagnostics.startedAt).toLocaleTimeString()}
                        </p>
                    </div>
                )}

                {/* Print Preview Area */}
                <div ref={printAreaRef} className="p-8 flex flex-col items-center min-h-screen bg-slate-100 print:bg-white print:p-0">
                    {printTrustMode === 'fallback' && (
                        <div className="w-full max-w-[210mm] mb-4 no-print">
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 shadow-sm">
                                <p className="text-sm font-black">예외 출력 모드로 인쇄 중입니다.</p>
                                <p className="text-xs font-bold mt-1">검증 통과 데이터가 없어 현재 필터 대상 전체를 출력합니다. 운영 권장사항은 OCR 재분석 후 재발급입니다.</p>
                            </div>
                        </div>
                    )}
                    
                    {viewType === 'grid' ? (
                        /* GRID VIEW (Progressive Rendering) */
                        <div className="w-full flex flex-col items-center print-container">
                            {pagedWorkers.map((pageWorkers, pageIndex) => (
                                <div
                                    key={`print-page-${pageIndex}`}
                                    className={`bg-white p-0 w-[210mm] min-h-[297mm] shadow-2xl print:shadow-none print:w-full print:h-auto relative ${pageIndex < pagedWorkers.length - 1 ? 'break-after-page' : ''}`}
                                >
                                    <div className={`relative z-10 w-full h-full p-[10mm] grid content-start ${
                                        printType === 'sticker'
                                            ? "grid-cols-2 gap-x-[10mm] gap-y-[10mm]"
                                            : "grid-cols-3 gap-x-[8mm] gap-y-[10mm]"
                                    }`}>
                                        {pageWorkers.map(w => (
                                            <div key={w.id} className="flex justify-center items-start break-inside-avoid page-break-inside-avoid">
                                                {printType === 'sticker'
                                                    ? <PremiumSticker worker={w} />
                                                    : <PremiumIDCard worker={w} />
                                                }
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {pagedWorkers.length === 0 && (
                                <div className="bg-white w-[210mm] min-h-[297mm] shadow-2xl print:shadow-none flex items-center justify-center text-slate-400 font-bold">
                                    출력할 근로자 데이터가 없습니다.
                                </div>
                            )}
                        </div>
                    ) : (
                        /* FLIP VIEW (For Inspection) */
                        <div className="flex flex-col items-center justify-center w-full h-full min-h-[600px]">
                            {workersToPrint.length > 0 && currentFlipIndex < workersToPrint.length ? (
                                <div className={`transform transition-all duration-300 ${printType === 'sticker' ? 'scale-150' : 'scale-150'} print-item print-item-${getPrintSafeId(workersToPrint[currentFlipIndex].id)}`}>
                                    {printType === 'sticker' 
                                        ? <PremiumSticker worker={workersToPrint[currentFlipIndex]} /> 
                                        : <PremiumIDCard worker={workersToPrint[currentFlipIndex]} />
                                    }
                                </div>
                            ) : (
                                <div className="text-slate-400 font-bold text-center">
                                    <p className="text-lg mb-2">표시할 데이터가 없습니다</p>
                                    <p className="text-xs">근로자 목록을 다시 확인해주세요</p>
                                </div>
                            )}
                            <div className="mt-20 text-slate-400 font-bold text-sm no-print animate-pulse">
                                * 확대된 미리보기 화면입니다. 인쇄 시에는 원본 크기로 출력됩니다.
                            </div>
                        </div>
                    )}
                </div>

                <style>{`
                    @media print { 
                        @page { size: A4; margin: 0; }
                        .no-print { display: none !important; } 
                        body { background: white !important; margin: 0; padding: 0; } 
                        .fixed.inset-0 { position: relative !important; overflow: visible !important; background: white !important; display: block !important; height: auto !important; }
                        .print-color-exact { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                        .break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
                    }
                `}</style>
            </div>
            </PrintModeErrorBoundary>
        );
    }

    return (
        <div className="space-y-10 animate-fade-in-up">
            {/* Header Section */}
            <div className="bg-slate-900 p-12 rounded-[40px] shadow-2xl text-white relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[100px] -mr-32 -mt-32 pointer-events-none"></div>
                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-center gap-12">
                    <div className="flex-1 text-center lg:text-left">
                        <div className="flex items-center justify-center lg:justify-start gap-3 mb-4">
                            <span className="bg-indigo-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-900/50">PSI Issuance System</span>
                        </div>
                        <h3 className="text-4xl lg:text-5xl font-black mb-4 tracking-tight leading-tight">근로자 보안 패스<br/>통합 발급 센터</h3>
                        <p className="text-slate-400 font-medium text-lg leading-relaxed max-w-xl">
                            현장의 안전 수준을 시각화하는 <span className="text-indigo-300 font-bold">스마트 스티커</span>와 <span className="text-indigo-300 font-bold">ID 카드</span>를 발급합니다.<br/>
                            <span className="text-indigo-400 font-bold text-sm bg-indigo-900/50 px-2 py-1 rounded">* 대량 출력 시 자동 분할 렌더링이 적용됩니다.</span>
                        </p>
                        
                        {/* Sample Preview Button */}
                        <div className="flex justify-center lg:justify-start mt-6">
                            <button onClick={() => setShowSampleModal(true)} className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-indigo-100 rounded-full text-xs font-bold transition-all border border-white/10 flex items-center gap-2 backdrop-blur-md">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                디자인 샘플 미리보기
                            </button>
                        </div>
                    </div>
                    <div className="flex gap-5 shrink-0">
                        <button onClick={() => startProcessing('sticker', filteredRecords)} className="group relative w-40 h-48 bg-white/5 border border-white/10 rounded-[30px] hover:bg-white/10 transition-all flex flex-col items-center justify-center gap-4 hover:-translate-y-2 duration-300">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                <span className="text-3xl">⛑</span>
                            </div>
                            <div className="text-center">
                                <span className="block text-lg font-black">안전모<br/>스티커</span>
                                <span className="text-[10px] text-slate-400 mt-1 block font-bold group-hover:text-white transition-colors">A4 라벨지 최적화</span>
                            </div>
                        </button>
                        <button onClick={() => startProcessing('idcard', filteredRecords)} className="group relative w-40 h-48 bg-indigo-600 rounded-[30px] shadow-2xl shadow-indigo-900/50 hover:bg-indigo-500 transition-all flex flex-col items-center justify-center gap-4 hover:-translate-y-2 duration-300 border border-indigo-400/30">
                            <div className="w-16 h-16 rounded-2xl bg-white text-indigo-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                <span className="text-3xl">💳</span>
                            </div>
                             <div className="text-center">
                                <span className="block text-lg font-black">스마트<br/>사원증</span>
                                <span className="text-[10px] text-indigo-200 mt-1 block font-bold group-hover:text-white transition-colors">NFC 스타일 디자인</span>
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            {/* Design Sample Modal */}
            {showSampleModal && (
                <div className="fixed inset-0 z-[4000] bg-black/90 p-4 md:p-6 backdrop-blur-md animate-fade-in overflow-y-auto" onClick={() => setShowSampleModal(false)}>
                    <div className="bg-slate-900 rounded-[40px] p-6 md:p-8 lg:p-10 max-w-5xl w-full relative overflow-hidden border border-slate-700 shadow-2xl mx-auto my-2 md:my-6" onClick={e => e.stopPropagation()}>
                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                        <button className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors" onClick={() => setShowSampleModal(false)}>
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        
                        <div className="text-center mb-8 md:mb-10 relative z-10">
                            <span className="text-indigo-400 font-bold text-xs tracking-widest uppercase mb-2 block">Premium Design System</span>
                            <h2 className="text-3xl md:text-4xl font-black text-white">PSI 안전 인증 디자인 샘플</h2>
                            <p className="text-slate-400 mt-2 font-medium">현장의 안전 수준을 한눈에 식별할 수 있는 고시인성 디자인입니다.</p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-start justify-items-center relative z-10">
                            {/* Sticker Sample */}
                            <div className="flex flex-col items-center gap-6 group">
                                <div className="relative transform transition-transform duration-500 group-hover:scale-105 group-hover:-rotate-1">
                                    <div className="absolute inset-0 bg-indigo-500 blur-2xl opacity-20 rounded-full group-hover:opacity-40 transition-opacity"></div>
                                    <div className="bg-white p-6 rounded-2xl shadow-[0_0_60px_-15px_rgba(255,255,255,0.2)] border border-slate-800">
                                        <div className="scale-125 origin-center">
                                            <PremiumSticker worker={sampleWorker} />
                                        </div>
                                    </div>
                                </div>
                                <div className="text-center">
                                    <h3 className="text-xl font-bold text-white mb-1">안전모 부착용 스마트 스티커</h3>
                                    <p className="text-slate-500 text-sm font-medium">90mm x 60mm | 방수 라벨 최적화</p>
                                    <p className="text-indigo-400 text-xs font-bold mt-2">QR 연동 • 등급 시각화</p>
                                </div>
                            </div>

                            {/* ID Card Sample */}
                            <div className="flex flex-col items-center gap-6 group">
                                <div className="relative transform transition-transform duration-500 group-hover:scale-105 group-hover:rotate-1">
                                    <div className="absolute inset-0 bg-indigo-500 blur-2xl opacity-20 rounded-full group-hover:opacity-40 transition-opacity"></div>
                                    <div className="bg-white p-3 rounded-2xl shadow-[0_0_60px_-15px_rgba(99,102,241,0.3)] border border-slate-800">
                                        <div className="scale-110 origin-center">
                                            <PremiumIDCard worker={sampleWorker} />
                                        </div>
                                    </div>
                                </div>
                                <div className="text-center">
                                    <h3 className="text-xl font-bold text-white mb-1">PSI 스마트 사원증</h3>
                                    <p className="text-slate-500 text-sm font-medium">54mm x 86mm | CR80 표준 규격</p>
                                    <p className="text-indigo-400 text-xs font-bold mt-2">직무 표시 • 보안 패턴 적용</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Human-in-the-loop Override Modal */}
            {overrideModalWorker && (
                <div className="fixed inset-0 z-[4500] bg-black/70 p-4 backdrop-blur-sm flex items-center justify-center" onClick={closeOverrideModal}>
                    <div className="bg-white w-full max-w-xl rounded-3xl border border-rose-200 shadow-2xl p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-rose-100 text-rose-700 font-black">🔒</span>
                            <h3 className="text-xl font-black text-slate-900">예외 승인 및 강제 발급</h3>
                        </div>
                        <p className="text-sm text-slate-600 font-bold mb-6">
                            대상: {overrideModalWorker.name} / {overrideModalWorker.jobField}
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-black text-slate-500 mb-2">관리자 PIN</label>
                                <input
                                    type="password"
                                    value={overridePin}
                                    onChange={(e) => setOverridePin(e.target.value)}
                                    className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 font-bold"
                                    placeholder="PIN 입력"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-500 mb-2">예외 승인 사유</label>
                                <textarea
                                    value={overrideReason}
                                    onChange={(e) => setOverrideReason(e.target.value)}
                                    className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 font-bold min-h-[100px]"
                                    placeholder="법적/운영상 강제 발급 사유를 구체적으로 입력"
                                />
                            </div>
                        </div>

                        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-end">
                            <button
                                onClick={closeOverrideModal}
                                className="px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-black hover:bg-slate-200"
                                disabled={isOverrideSubmitting}
                            >
                                취소
                            </button>
                            <button
                                onClick={handleOverrideApproveAndIssue}
                                className="px-4 py-3 rounded-xl bg-rose-600 text-white font-black hover:bg-rose-700 disabled:opacity-60"
                                disabled={isOverrideSubmitting}
                            >
                                {isOverrideSubmitting ? '처리 중...' : '🔑 예외 승인 및 강제 발급'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Controls */}
            <div className="bg-white p-6 rounded-[30px] shadow-xl border border-slate-100 flex flex-col gap-4 items-stretch no-print">
                <input
                    ref={bulkFileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleBulkFileChange}
                />
                <div className="w-full relative min-w-0">
                    <svg className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth={3}/></svg>
                    <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="근로자 이름으로 검색..." className="w-full bg-slate-50 border-transparent focus:bg-white focus:border-indigo-500 rounded-2xl pl-14 pr-6 py-4 font-bold text-base transition-all shadow-inner" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full">
                    <button
                        type="button"
                        onClick={handleDownloadTemplate}
                        className="w-full px-4 py-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs sm:text-sm font-black hover:bg-emerald-100 transition-colors"
                    >
                        업로드 양식 다운로드
                    </button>
                    <button
                        type="button"
                        onClick={() => bulkFileInputRef.current?.click()}
                        disabled={isBulkUploading}
                        className="w-full px-4 py-3 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs sm:text-sm font-black hover:bg-indigo-100 transition-colors disabled:opacity-60"
                    >
                        {isBulkUploading ? '엑셀 대량 업로드 처리 중...' : '엑셀 대량 업로드'}
                    </button>
                </div>

                <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-sm font-black text-slate-800">프로그램에서 근로자 직접 등록</p>
                    <p className="mt-1 text-[11px] font-bold text-slate-500">엑셀 없이 1명씩 바로 등록할 수 있습니다. (공종: 관리 포함)</p>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                        <input
                            type="text"
                            value={manualWorkerForm.name}
                            onChange={(e) => setManualWorkerForm((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder="이름*"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
                        />
                        <input
                            type="text"
                            value={manualWorkerForm.nationality}
                            onChange={(e) => setManualWorkerForm((prev) => ({ ...prev, nationality: e.target.value }))}
                            placeholder="국적*"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
                        />
                        <select
                            value={manualWorkerForm.job_field}
                            onChange={(e) => setManualWorkerForm((prev) => ({ ...prev, job_field: e.target.value }))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
                        >
                            {ALLOWED_JOB_FIELDS.map((field) => (
                                <option key={field} value={field}>{field}</option>
                            ))}
                        </select>
                        <input
                            type="text"
                            value={manualWorkerForm.team_name}
                            onChange={(e) => setManualWorkerForm((prev) => ({ ...prev, team_name: e.target.value }))}
                            placeholder="팀명*"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
                        />
                    </div>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input
                            type="text"
                            value={manualWorkerForm.phone_number}
                            onChange={(e) => setManualWorkerForm((prev) => ({ ...prev, phone_number: e.target.value }))}
                            placeholder="핸드폰번호 (선택)"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
                        />
                        <input
                            type="text"
                            value={manualWorkerForm.birth_date}
                            onChange={(e) => setManualWorkerForm((prev) => ({ ...prev, birth_date: e.target.value }))}
                            placeholder="생년월일 6/8자리 (선택)"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
                        />
                        <input
                            type="text"
                            value={manualWorkerForm.passport_number}
                            onChange={(e) => setManualWorkerForm((prev) => ({ ...prev, passport_number: e.target.value }))}
                            placeholder="여권번호 (선택)"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={handleManualRegisterWorker}
                        disabled={isManualRegistering || isBulkUploading}
                        className="mt-3 inline-flex items-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                    >
                        {isManualRegistering ? '프로그램 등록 처리 중...' : '프로그램에서 1명 등록'}
                    </button>
                </div>

                {bulkUploadMessage && (
                    <div className={`w-full rounded-2xl px-4 py-3 text-sm font-bold border ${bulkUploadMessage.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                        {bulkUploadMessage}
                    </div>
                )}
                {bulkUploadSummary && (
                    <div className={`w-full rounded-2xl border px-4 py-3 ${bulkUploadSummary.status === 'success' ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                        <p className={`text-xs font-black ${bulkUploadSummary.status === 'success' ? 'text-emerald-800' : 'text-rose-800'}`}>
                            업로드/등록 현황 요약
                        </p>
                        <p className={`mt-1 text-[11px] font-bold ${bulkUploadSummary.status === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>
                            소스: {bulkUploadSummary.fileName} · {bulkUploadSummary.message}
                        </p>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                            <div className="rounded-lg border border-white/70 bg-white px-2 py-2">
                                <p className="text-[10px] font-black text-slate-500">요청</p>
                                <p className="text-sm font-black text-slate-900">{bulkUploadSummary.requested}</p>
                            </div>
                            <div className="rounded-lg border border-white/70 bg-white px-2 py-2">
                                <p className="text-[10px] font-black text-slate-500">신규 등록</p>
                                <p className="text-sm font-black text-emerald-700">{bulkUploadSummary.inserted}</p>
                            </div>
                            <div className="rounded-lg border border-white/70 bg-white px-2 py-2">
                                <p className="text-[10px] font-black text-slate-500">중복 건너뜀</p>
                                <p className="text-sm font-black text-amber-700">{bulkUploadSummary.skipped}</p>
                            </div>
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 w-full">
                    <div className="min-w-0">
                        <select value={selectedJobField} onChange={e => setSelectedJobField(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-4 font-bold min-w-[140px]">
                            {jobFields.map(field => <option key={field} value={field}>{`공종: ${field}`}</option>)}
                        </select>
                    </div>
                    <div className="min-w-0">
                        <select value={selectedCrew} onChange={e => setSelectedCrew(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-4 font-bold min-w-[140px]">
                            {crews.map(crew => <option key={crew} value={crew}>{`팀: ${crew}`}</option>)}
                        </select>
                    </div>
                    <div className="min-w-0">
                        <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-4 font-bold min-w-[120px]">
                            <option value="전체">전체 등급</option>
                            <option value="초급">초급</option>
                            <option value="중급">중급</option>
                            <option value="고급">고급</option>
                        </select>
                    </div>
                    <div className="min-w-0">
                        <select value={reliabilityFilter} onChange={e => setReliabilityFilter(e.target.value as 'all' | 'trusted' | 'needs-review')} className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-4 font-bold min-w-[150px]">
                            <option value="all">검증 상태: 전체</option>
                            <option value="trusted">검증 통과만</option>
                            <option value="needs-review">검증 필요만</option>
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
                    <div className="bg-indigo-50 px-4 py-3 rounded-2xl text-indigo-700 font-bold text-sm border border-indigo-100 flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                        <span className="truncate">발급 대기: {filteredRecords.length}명</span>
                    </div>
                    <div className="bg-emerald-50 px-4 py-3 rounded-2xl text-emerald-700 font-bold text-sm border border-emerald-100 flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span className="truncate">검증통과: {filteredReliabilitySummary.trustedCount}명</span>
                    </div>
                    <div className="bg-rose-50 px-4 py-3 rounded-2xl text-rose-700 font-bold text-sm border border-rose-100 flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                        <span className="truncate">검증필요: {filteredReliabilitySummary.untrustedCount}명</span>
                    </div>
                </div>
                {filteredRecords.length > 0 && filteredReliabilitySummary.trustedCount === 0 && (
                    <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                        <p className="text-sm font-black">현재 필터 결과에는 검증 통과 데이터가 없습니다.</p>
                        <p className="text-xs font-bold mt-1">지금 인쇄하면 예외 출력 모드로 진행됩니다. 가능하면 OCR 재분석 후 출력하세요.</p>
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full">
                    <button
                        onClick={() => startProcessing('sticker', filteredRecords)}
                        className="w-full px-4 py-3 bg-orange-50 text-orange-700 border border-orange-200 rounded-xl text-xs sm:text-sm font-black hover:bg-orange-100 transition-colors whitespace-normal break-keep"
                    >
                        필터 대상 스티커 일괄 인쇄
                    </button>
                    <button
                        onClick={() => startProcessing('idcard', filteredRecords)}
                        className="w-full px-4 py-3 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs sm:text-sm font-black hover:bg-indigo-100 transition-colors whitespace-normal break-keep"
                    >
                        필터 대상 사원증 일괄 인쇄
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {filteredRecords.map(worker => {
                    const s = getGradeStyle(worker.safetyLevel);
                    const profileImageSrc = getSafeImageSrc(worker.profileImage);
                    const reliability = verifyIssuanceReliability(worker);
                    const canIssue = reliability.trusted;
                    return (
                        <div key={worker.id} className="bg-white p-5 rounded-[24px] border border-slate-100 hover:border-indigo-300 hover:shadow-2xl transition-all cursor-pointer group relative overflow-hidden flex flex-col gap-3" onClick={() => onViewDetails(worker)}>
                            {/* Glassmorphism Overlay Menu on Hover */}
                            <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-6">
                                <p className="text-white font-black mb-1">{worker.name}</p>
                                <button
                                    onClick={(e) => { e.stopPropagation(); if (canIssue) startProcessing('sticker', [worker]); }}
                                    disabled={!canIssue}
                                    title={!canIssue ? reliability.reasons.join(', ') : '스티커 인쇄'}
                                    className={`w-full py-3 font-black rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2 text-xs ${canIssue ? 'bg-white text-slate-900 hover:bg-slate-200' : 'bg-slate-500/60 text-slate-200 cursor-not-allowed'}`}
                                >
                                    <span className="text-base">⛑</span> 스티커 인쇄
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); if (canIssue) startProcessing('idcard', [worker]); }}
                                    disabled={!canIssue}
                                    title={!canIssue ? reliability.reasons.join(', ') : '사원증 인쇄'}
                                    className={`w-full py-3 font-black rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2 text-xs ${canIssue ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-slate-500/60 text-slate-200 cursor-not-allowed'}`}
                                >
                                    <span className="text-base">💳</span> 사원증 인쇄
                                </button>
                                {!canIssue && (
                                    <>
                                        <p className="text-[10px] text-rose-200 font-bold text-center mt-1">검증 필요: OCR 재분석 후 발급</p>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openOverrideModal(worker);
                                            }}
                                            className="w-full py-2 font-black rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2 text-xs bg-rose-600 text-white hover:bg-rose-500"
                                            title="관리자 예외 승인 후 강제 발급"
                                        >
                                            🔑 예외 발급
                                        </button>
                                    </>
                                )}
                            </div>

                            <div className="flex items-center gap-4 relative z-10">
                                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 shadow-inner relative">
                                    {profileImageSrc ? <img src={profileImageSrc} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl opacity-20">👷</div>}
                                    <div className={`absolute bottom-0 w-full h-1.5 ${s.bg}`}></div>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h4 className="text-lg font-black text-slate-800 truncate flex items-center gap-1">
                                        {worker.name}
                                    </h4>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase">{worker.jobField}</span>
                                        {getRoleBadge(worker).length > 0 && <span className="text-[9px] font-bold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded uppercase">{getRoleBadge(worker)[0]}</span>}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="pt-3 border-t border-slate-50 flex justify-between items-center relative z-10">
                                <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black ${s.lightBg} ${s.text} border ${s.border} border-opacity-20`}>{worker.safetyLevel} GRADE</span>
                                <span className="text-xl font-black text-slate-900 tracking-tighter">{worker.safetyScore}<span className="text-[9px] text-slate-300 ml-0.5 font-bold">PTS</span></span>
                            </div>

                            <div className="relative z-10 min-h-[42px] flex items-center">
                                {worker.approvalStatus === 'OVERRIDDEN' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black bg-amber-100 text-amber-700 border border-amber-200" title={`${worker.approvedBy || '승인자 미기록'} / ${worker.approvedAt || '-'} / ${worker.approvalReason || '-'}`}>
                                        🔐 예외 승인 발급
                                    </span>
                                ) : reliability.trusted ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black bg-emerald-100 text-emerald-700 border border-emerald-200">
                                        ✅ OCR 검증 통과
                                    </span>
                                ) : (
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black bg-rose-100 text-rose-700 border border-rose-200" title={reliability.reasons.join(', ')}>
                                            ⚠️ 검증 필요 (구백업 가능)
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openOverrideModal(worker);
                                            }}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black bg-rose-600 text-white border border-rose-700 hover:bg-rose-500 shrink-0"
                                            title="관리자 예외 승인 후 강제 발급"
                                        >
                                            🔑 예외 발급
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-8 bg-white rounded-[24px] border border-slate-100 shadow-xl p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base sm:text-lg font-black text-slate-900">등록 근로자 리스트 뷰</h3>
                    <button
                        type="button"
                        onClick={() => void fetchRegisteredWorkers()}
                        disabled={isRegisteredWorkersLoading}
                        className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-black hover:bg-indigo-100 disabled:opacity-60"
                    >
                        {isRegisteredWorkersLoading ? '불러오는 중...' : '새로고침'}
                    </button>
                </div>

                <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-black text-slate-600">이름</th>
                                <th className="px-4 py-3 text-left text-xs font-black text-slate-600">공종</th>
                                <th className="px-4 py-3 text-left text-xs font-black text-slate-600">팀명</th>
                                <th className="px-4 py-3 text-left text-xs font-black text-slate-600">생년월일</th>
                                <th className="px-4 py-3 text-left text-xs font-black text-slate-600">전화번호</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isRegisteredWorkersLoading && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-6 text-center text-xs font-bold text-slate-500">
                                        등록 근로자 목록을 불러오는 중입니다.
                                    </td>
                                </tr>
                            )}

                            {!isRegisteredWorkersLoading && registeredWorkersError && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-6 text-center text-xs font-bold text-rose-600">
                                        목록 조회 오류: {registeredWorkersError}
                                    </td>
                                </tr>
                            )}

                            {!isRegisteredWorkersLoading && !registeredWorkersError && registeredWorkers.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-6 text-center text-xs font-bold text-slate-500">
                                        등록된 근로자 데이터가 없습니다.
                                    </td>
                                </tr>
                            )}

                            {!isRegisteredWorkersLoading && !registeredWorkersError && registeredWorkers.map((worker) => (
                                <tr key={worker.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                                    <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">{worker.name || '-'}</td>
                                    <td className="px-4 py-3 font-bold text-slate-700 whitespace-nowrap">{worker.job_field || '-'}</td>
                                    <td className="px-4 py-3 font-bold text-slate-700 whitespace-nowrap">{worker.team_name || '-'}</td>
                                    <td className="px-4 py-3 font-bold text-slate-700 whitespace-nowrap">{worker.birth_date || '-'}</td>
                                    <td className="px-4 py-3 font-bold text-slate-700 whitespace-nowrap">{worker.phone_number || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
export default WorkerManagement;

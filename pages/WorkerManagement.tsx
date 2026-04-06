
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import type { WorkerRecord } from '../types';
import { generateReportUrl } from '../utils/qrUtils';
import { extractMessage } from '../utils/errorUtils';
import { postAdminJson } from '../utils/adminApiClient';
import { ensureQRCodeJs } from '../utils/externalScripts';
import { getWindowProp } from '../utils/windowUtils';
import { getSafetyLevelFromScore } from '../utils/safetyLevelUtils';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts';

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
            void (async () => {
            const element = containerRef.current;
            if (!element) return;

            // 이미 생성되었다면 스킵 (중복 생성 방지)
            if (element.children.length > 0) return;

            // 1. 라이브러리 존재 여부 확인 (안전하게 전역 객체 접근)
            const QRCodeLib = await ensureQRCodeJs().catch(() => null);
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
            })();
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

const hasProfilePhoto = (worker: Pick<WorkerRecord, 'profileImage'>): boolean => {
    return Boolean(getSafeImageSrc(worker.profileImage));
};

const normalizeIdentityToken = (value: unknown): string => {
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
};

const getWorkerPrimaryIdentityKey = (record: WorkerRecord): string => {
    const workerUuid = normalizeIdentityToken(record.worker_uuid || record.workerUuid);
    if (workerUuid) return `worker_uuid:${workerUuid}`;

    const employeeId = normalizeIdentityToken(record.employeeId);
    if (employeeId) return `employeeId:${employeeId}`;

    const qrId = normalizeIdentityToken(record.qrId);
    if (qrId) return `qrId:${qrId}`;

    return `fallback:${normalizeIdentityToken(record.name)}|${normalizeIdentityToken(record.teamLeader || '미지정')}|${normalizeIdentityToken(record.jobField)}|${normalizeIdentityToken(record.nationality)}`;
};

const getProfileLinkState = (record: WorkerRecord): 'linked' | 'manual' | 'missing' => {
    const hasPhoto = hasProfilePhoto(record);
    if (!hasPhoto) return 'missing';

    const hasStableIdentity = Boolean(
        normalizeIdentityToken(record.worker_uuid || record.workerUuid)
        || normalizeIdentityToken(record.employeeId)
        || normalizeIdentityToken(record.qrId)
    );

    return hasStableIdentity ? 'linked' : 'manual';
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

let xlsxModulePromise: Promise<typeof import('xlsx')> | null = null;
const loadXlsx = () => {
    if (!xlsxModulePromise) {
        xlsxModulePromise = import('xlsx');
    }
    return xlsxModulePromise;
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
    const profileImageSrc = getSafeImageSrc(worker.profileImage);
    // [IMPROVED] 약점이 있고 점수가 낮을 때만 주의 표시 (고점수는 주의사항 생략)
    const shouldShowWarning = worker.safetyScore < 80 && worker.weakAreas && Array.isArray(worker.weakAreas) && worker.weakAreas.length > 0;
    const safeWeakArea = shouldShowWarning
        ? worker.weakAreas[0]
        : profileImageSrc
            ? '본인 사진 확인 가능'
            : '증명사진 등록 권장';

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
                    <div className="w-[14mm] h-[18mm] bg-slate-100 rounded border border-slate-200 overflow-hidden shrink-0 relative shadow-inner">
                        {profileImageSrc ? (
                            <img src={profileImageSrc} className="w-full h-full object-cover" alt={`${worker.name} 프로필`} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300 text-sm">👷</div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-slate-900/80 text-white text-[6px] font-black text-center py-[1px] tracking-wide">
                            PHOTO
                        </div>
                    </div>
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
                            : profileImageSrc
                                ? 'bg-emerald-50 border-emerald-100'
                                : 'bg-amber-50 border-amber-100'
                    }`}>
                        <div className={`font-bold text-xs shrink-0 ${
                            shouldShowWarning ? 'text-rose-500' : profileImageSrc ? 'text-emerald-600' : 'text-amber-600'
                        }`}>
                            {shouldShowWarning ? '⚠ 주의' : profileImageSrc ? '✓ 신원' : '📷 권장'}
                        </div>
                        <div className={`text-[10px] font-bold truncate flex-1 ${
                            shouldShowWarning ? 'text-slate-600' : profileImageSrc ? 'text-emerald-700' : 'text-amber-700'
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
    onOpenPhotoRegistration?: (worker: WorkerRecord, queueRecordIds: string[]) => void;
    onUpdateRecord?: (worker: WorkerRecord) => Promise<void> | void;
}

const isUnassignedWorkerRecord = (record: WorkerRecord): boolean => {
    const hasWorkerUuid = String((record as WorkerRecord & { worker_uuid?: string; workerUuid?: string }).worker_uuid || (record as WorkerRecord & { worker_uuid?: string; workerUuid?: string }).workerUuid || '').trim().length > 0;
    const hasEmployeeId = String(record.employeeId || '').trim().length > 0;
    const hasQrId = String(record.qrId || '').trim().length > 0;
    return !hasWorkerUuid && !hasEmployeeId && !hasQrId;
};

const isUnassignedFilterFromUrl = (): boolean => {
    return new URLSearchParams(window.location.search).get('filter') === 'unassigned';
};

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
    updated: number;
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
    passport_number: string;
};

type WorkerMessageLogRow = {
    id: string;
    worker_id: string;
    worker_name: string;
    team_name: string;
    phone_number: string;
    status: string;
    failure_category?: string;
    sent_count: number;
    provider: string;
    message: string;
    created_at: string;
};

type WorkerMessageLogCacheEntry = {
    rows: WorkerMessageLogRow[];
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
    schemaReady: boolean;
    fetchedAt: string;
};

type ReportMessageDashboardMonthlyRow = {
    month_date: string;
    month_label: string;
    total_count: number;
    success_count: number;
    failed_count: number;
    success_rate: number;
};

type ReportMessageDashboardTeamRow = {
    team_name: string;
    total_count: number;
    success_count: number;
    failed_count: number;
    success_rate: number;
    last_sent_at: string;
};

type ReportMessageDashboardFailureRow = {
    failure_category: string;
    failure_count: number;
    last_occurred_at: string;
};

type ReportMessageDashboardRetryRow = {
    retry_key: string;
    worker_id: string;
    worker_name: string;
    team_name: string;
    phone_number: string;
    failure_category: string;
    provider: string;
    message: string;
    failed_at: string;
    priority_score: number;
};

type ReportMessageDashboardSummary = {
    monthlyRows: ReportMessageDashboardMonthlyRow[];
    teamRows: ReportMessageDashboardTeamRow[];
    failureRows: ReportMessageDashboardFailureRow[];
    retryRows: ReportMessageDashboardRetryRow[];
    overview: {
        totalCount: number;
        successCount: number;
        failedCount: number;
        successRate: number;
        topTeam: string;
        topFailureCategory: string;
        retryCandidateCount: number;
    };
    schemaReady: boolean;
};

type RegisteredWorkerEditDraft = {
    id: string;
    name: string;
    job_field: string;
    team_name: string;
    birth_date: string;
    phone_number: string;
};

type RegisteredWorkerSortKey = 'birth_date' | 'phone_number';

type DeletedWorkerUndoState = {
    id: string;
    name: string;
    softDeleted: boolean;
};

type RegisteredWorkerAdminTab = 'list' | 'message-history';
type MessageHistoryStatusFilter = 'all' | 'success' | 'fail';
type MessageHistoryRangeFilter = 'all' | '7d' | '30d' | '90d';
type RetryQueueFilter = 'all' | 'actionable' | 'blocked';

const MESSAGE_HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;

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

const WorkerManagement: React.FC<WorkerManagementProps> = ({ workerRecords, onViewDetails, onOpenPhotoRegistration, onUpdateRecord }) => {
    // --- Main View States ---
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedJobField, setSelectedJobField] = useState('전체');
    const [selectedCrew, setSelectedCrew] = useState('전체');
    const [filterLevel, setFilterLevel] = useState('전체');
    const [reliabilityFilter, setReliabilityFilter] = useState<'all' | 'trusted' | 'needs-review'>('all');
    const [photoFilter, setPhotoFilter] = useState<'all' | 'with-photo' | 'missing-photo'>('all');
    const [isUnassignedFilterActive, setIsUnassignedFilterActive] = useState(() => isUnassignedFilterFromUrl());

    useEffect(() => {
        const syncUnassignedFilterFromUrl = () => {
            setIsUnassignedFilterActive(isUnassignedFilterFromUrl());
        };

        syncUnassignedFilterFromUrl();
        window.addEventListener('popstate', syncUnassignedFilterFromUrl);

        return () => {
            window.removeEventListener('popstate', syncUnassignedFilterFromUrl);
        };
    }, []);

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
    const [printUserNotice, setPrintUserNotice] = useState<string | null>(null);
    
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
    const [editingWorkerId, setEditingWorkerId] = useState('');
    const [editingWorkerDraft, setEditingWorkerDraft] = useState<RegisteredWorkerEditDraft | null>(null);
    const [isSavingWorkerEdit, setIsSavingWorkerEdit] = useState(false);
    const [deletingWorkerId, setDeletingWorkerId] = useState('');
    const [registeredWorkerUpdateMessage, setRegisteredWorkerUpdateMessage] = useState<string | null>(null);
    const [registeredWorkersSort, setRegisteredWorkersSort] = useState<{ key: RegisteredWorkerSortKey; order: 'asc' | 'desc' }>({
        key: 'birth_date',
        order: 'asc',
    });
    const [registeredWorkerAdminTab, setRegisteredWorkerAdminTab] = useState<RegisteredWorkerAdminTab>('list');
    const [registeredWorkerSearchTerm, setRegisteredWorkerSearchTerm] = useState('');
    const [registeredWorkerJobFilter, setRegisteredWorkerJobFilter] = useState('전체');
    const [registeredWorkerTeamFilter, setRegisteredWorkerTeamFilter] = useState('전체');
    const [registeredWorkerMissingFilter, setRegisteredWorkerMissingFilter] = useState<'all' | 'missing-any' | 'missing-phone' | 'missing-birth' | 'missing-passport'>('all');
    const [selectedMessageHistoryWorkerId, setSelectedMessageHistoryWorkerId] = useState('');
    const [messageLogCache, setMessageLogCache] = useState<Record<string, WorkerMessageLogCacheEntry>>({});
    const [isMessageLogLoading, setIsMessageLogLoading] = useState(false);
    const [messageLogError, setMessageLogError] = useState('');
    const [messageLogSessionApiCount, setMessageLogSessionApiCount] = useState(0);
    const [messageLogLastFetchedAt, setMessageLogLastFetchedAt] = useState('');
    const [messageHistoryStatusFilter, setMessageHistoryStatusFilter] = useState<MessageHistoryStatusFilter>('all');
    const [messageHistoryRangeFilter, setMessageHistoryRangeFilter] = useState<MessageHistoryRangeFilter>('30d');
    const [messageHistorySearchTerm, setMessageHistorySearchTerm] = useState('');
    const [isMessageLogLoadingMore, setIsMessageLogLoadingMore] = useState(false);
    const [reportMessageDashboardSummary, setReportMessageDashboardSummary] = useState<ReportMessageDashboardSummary | null>(null);
    const [isReportMessageDashboardLoading, setIsReportMessageDashboardLoading] = useState(false);
    const [reportMessageDashboardError, setReportMessageDashboardError] = useState('');
    const [retryQueueFilter, setRetryQueueFilter] = useState<RetryQueueFilter>('all');
    const [deletedWorkerUndo, setDeletedWorkerUndo] = useState<DeletedWorkerUndoState | null>(null);
    const deleteUndoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    const formatPhoneForDisplay = (raw: unknown) => {
        const digits = normalizePhone(raw);
        if (digits.length <= 3) return digits;
        if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
        return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
    };
    const formatBirthDateForDisplay = (raw: unknown) => {
        const digits = normalizeBirthDate(raw);
        if (digits.length <= 2) return digits;
        if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
        if (digits.length <= 6) return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
        return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    };
    const normalizeJobField = (raw: unknown) => {
        const base = String(raw || '').trim();
        if (!base) return '';
        const compact = base.replace(/\s+/g, '');
        return JOB_FIELD_ALIASES[compact] || JOB_FIELD_ALIASES[base] || base;
    };
    const isSuccessfulMessageStatus = (status: string) => ['SUCCESS', 'SENT', 'OK'].includes(String(status || '').trim().toUpperCase());
    const isMessageHistoryCacheFresh = (fetchedAt: string) => {
        const time = new Date(fetchedAt).getTime();
        if (!Number.isFinite(time) || time <= 0) return false;
        return Date.now() - time < MESSAGE_HISTORY_CACHE_TTL_MS;
    };
    const formatMessageLogDateTime = (raw: string) => {
        if (!raw) return '-';
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) return raw;
        return new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        }).format(date);
    };
    const isMessageLogWithinRange = (createdAt: string, range: MessageHistoryRangeFilter) => {
        if (range === 'all') return true;
        const createdTime = new Date(createdAt).getTime();
        if (!Number.isFinite(createdTime) || createdTime <= 0) return false;
        const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
        return Date.now() - createdTime <= days * 24 * 60 * 60 * 1000;
    };
    const classifyFailureReason = (row: Pick<WorkerMessageLogRow, 'status' | 'message' | 'provider'>) => {
        if (isSuccessfulMessageStatus(row.status)) return '성공';
        const source = `${String(row.message || '')} ${String(row.provider || '')}`.toLowerCase();
        if (source.includes('timeout') || source.includes('time out') || source.includes('timed out')) return '타임아웃';
        if (source.includes('auth') || source.includes('인증') || source.includes('forbidden') || source.includes('unauthorized')) return '인증/권한';
        if (source.includes('phone') || source.includes('번호') || source.includes('invalid recipient') || source.includes('recipient')) return '전화번호 오류';
        if (source.includes('quota') || source.includes('limit') || source.includes('rate') || source.includes('429')) return '한도/속도 제한';
        if (source.includes('upload') || source.includes('image') || source.includes('file')) return '이미지 업로드';
        if (source.includes('network') || source.includes('fetch') || source.includes('socket') || source.includes('dns')) return '네트워크';
        return '기타 실패';
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
        const XLSX = await loadXlsx();
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
        setRegisteredWorkerUpdateMessage(null);

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
                passport_number: String(row?.passport_number || '').trim(),
            })));
        } catch (error) {
            setRegisteredWorkersError(extractMessage(error));
            setRegisteredWorkers([]);
        } finally {
            setIsRegisteredWorkersLoading(false);
        }
    }, []);

    const sortedRegisteredWorkers = useMemo(() => {
        const sorted = [...registeredWorkers];
        const direction = registeredWorkersSort.order === 'asc' ? 1 : -1;

        sorted.sort((a, b) => {
            const left = registeredWorkersSort.key === 'birth_date'
                ? normalizeBirthDate(a.birth_date)
                : normalizePhone(a.phone_number);
            const right = registeredWorkersSort.key === 'birth_date'
                ? normalizeBirthDate(b.birth_date)
                : normalizePhone(b.phone_number);
            return left.localeCompare(right) * direction;
        });

        return sorted;
    }, [registeredWorkers, registeredWorkersSort]);

    const registeredWorkerJobOptions = useMemo(
        () => ['전체', ...Array.from(new Set(registeredWorkers.map((worker) => worker.job_field || '미분류'))).sort()],
        [registeredWorkers],
    );

    const registeredWorkerTeamOptions = useMemo(
        () => ['전체', ...Array.from(new Set(registeredWorkers.map((worker) => worker.team_name || '미지정'))).sort()],
        [registeredWorkers],
    );

    const filteredRegisteredWorkers = useMemo(() => {
        const search = registeredWorkerSearchTerm.trim().toLowerCase();

        return sortedRegisteredWorkers.filter((worker) => {
            const name = (worker.name || '').toLowerCase();
            const job = worker.job_field || '미분류';
            const team = worker.team_name || '미지정';
            const phone = normalizePhone(worker.phone_number || '');
            const birth = normalizeBirthDate(worker.birth_date || '');
            const passport = normalizePassport(worker.passport_number || '');

            const matchesSearch =
                !search ||
                name.includes(search) ||
                phone.includes(search.replace(/\D/g, '')) ||
                birth.includes(search.replace(/\D/g, '')) ||
                passport.toLowerCase().includes(search.replace(/\s+/g, '').toLowerCase());
            const matchesJob = registeredWorkerJobFilter === '전체' || job === registeredWorkerJobFilter;
            const matchesTeam = registeredWorkerTeamFilter === '전체' || team === registeredWorkerTeamFilter;

            const hasPhone = Boolean(phone);
            const hasBirth = Boolean(birth);
            const hasPassport = Boolean(passport);
            const matchesMissing =
                registeredWorkerMissingFilter === 'all' ||
                (registeredWorkerMissingFilter === 'missing-any' && (!hasPhone || !hasBirth || !hasPassport)) ||
                (registeredWorkerMissingFilter === 'missing-phone' && !hasPhone) ||
                (registeredWorkerMissingFilter === 'missing-birth' && !hasBirth) ||
                (registeredWorkerMissingFilter === 'missing-passport' && !hasPassport);

            return matchesSearch && matchesJob && matchesTeam && matchesMissing;
        });
    }, [
        sortedRegisteredWorkers,
        registeredWorkerSearchTerm,
        registeredWorkerJobFilter,
        registeredWorkerTeamFilter,
        registeredWorkerMissingFilter,
    ]);

    const latestRecords = useMemo(() => {
        const map = new Map<string, WorkerRecord>();
        workerRecords.forEach((r) => {
            const key = getWorkerPrimaryIdentityKey(r);
            if (!map.has(key) || new Date(r.date) > new Date(map.get(key)!.date)) {
                map.set(key, r);
            }
        });

        return Array.from(map.values())
            .map((record) => ({
                ...record,
                safetyLevel: getSafetyLevelFromScore(Number(record.safetyScore)),
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [workerRecords]);

    const selectedMessageHistoryWorker = useMemo(
        () => registeredWorkers.find((worker) => worker.id === selectedMessageHistoryWorkerId) || null,
        [registeredWorkers, selectedMessageHistoryWorkerId],
    );

    const selectedMessageHistoryLatestRecord = useMemo(() => {
        if (!selectedMessageHistoryWorker) return null;

        const selectedId = normalizeIdentityToken(selectedMessageHistoryWorker.id);
        const selectedName = normalizeIdentityToken(selectedMessageHistoryWorker.name);
        const selectedTeam = normalizeIdentityToken(selectedMessageHistoryWorker.team_name || '미지정');

        return latestRecords.find((record) => {
            const recordWorkerUuid = normalizeIdentityToken(record.worker_uuid || record.workerUuid);
            if (selectedId && recordWorkerUuid && selectedId === recordWorkerUuid) return true;

            const recordName = normalizeIdentityToken(record.name);
            const recordTeam = normalizeIdentityToken(record.teamLeader || '미지정');
            return selectedName === recordName && selectedTeam === recordTeam;
        }) || null;
    }, [latestRecords, selectedMessageHistoryWorker]);

    const selectedMessageHistoryLogEntry = useMemo(
        () => selectedMessageHistoryWorkerId ? messageLogCache[selectedMessageHistoryWorkerId] || null : null,
        [messageLogCache, selectedMessageHistoryWorkerId],
    );

    const selectedMessageHistoryRows = useMemo(
        () => selectedMessageHistoryLogEntry?.rows || [],
        [selectedMessageHistoryLogEntry],
    );

    const filteredMessageHistoryRows = useMemo(
        () => selectedMessageHistoryRows.filter((row) => {
            const search = messageHistorySearchTerm.trim().toLowerCase();
            const matchesStatus =
                messageHistoryStatusFilter === 'all' ||
                (messageHistoryStatusFilter === 'success' && isSuccessfulMessageStatus(row.status)) ||
                (messageHistoryStatusFilter === 'fail' && !isSuccessfulMessageStatus(row.status));
            const matchesRange = isMessageLogWithinRange(row.created_at, messageHistoryRangeFilter);
            const normalizedPhone = normalizePhone(row.phone_number);
            const searchableText = [row.message, row.provider, row.status, row.team_name, row.worker_name]
                .map((value) => String(value || '').toLowerCase())
                .join(' ');
            const matchesSearch = !search || searchableText.includes(search) || normalizedPhone.includes(search.replace(/\D/g, ''));
            return matchesStatus && matchesRange && matchesSearch;
        }),
        [messageHistoryRangeFilter, messageHistorySearchTerm, messageHistoryStatusFilter, selectedMessageHistoryRows],
    );

    const selectedMessageHistorySummary = useMemo(() => {
        const successCount = filteredMessageHistoryRows.filter((row) => isSuccessfulMessageStatus(row.status)).length;
        const failureCount = filteredMessageHistoryRows.length - successCount;
        const sentPageCount = filteredMessageHistoryRows.reduce((sum, row) => sum + Math.max(0, Number(row.sent_count || 0)), 0);
        const providerMap = new Map<string, number>();
        filteredMessageHistoryRows.forEach((row) => {
            const key = String(row.provider || '미기록').trim() || '미기록';
            providerMap.set(key, (providerMap.get(key) || 0) + 1);
        });
        const topProviderEntry = Array.from(providerMap.entries()).sort((a, b) => b[1] - a[1])[0] || null;

        return {
            successCount,
            failureCount,
            sentPageCount,
            successRate: filteredMessageHistoryRows.length > 0 ? Math.round((successCount / filteredMessageHistoryRows.length) * 100) : 0,
            topProviderLabel: topProviderEntry?.[0] || '-',
            topProviderCount: topProviderEntry?.[1] || 0,
        };
    }, [filteredMessageHistoryRows]);

    const messageHistoryMonthlyTrend = useMemo(() => {
        const bucket = new Map<string, { month: string; success: number; fail: number; total: number }>();

        filteredMessageHistoryRows.forEach((row) => {
            const date = new Date(row.created_at);
            if (Number.isNaN(date.getTime())) return;
            const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const current = bucket.get(month) || { month, success: 0, fail: 0, total: 0 };
            current.total += 1;
            if (isSuccessfulMessageStatus(row.status)) current.success += 1;
            else current.fail += 1;
            bucket.set(month, current);
        });

        return Array.from(bucket.values())
            .sort((a, b) => a.month.localeCompare(b.month))
            .slice(-6)
            .map((item) => ({
                ...item,
                successRate: item.total > 0 ? Math.round((item.success / item.total) * 100) : 0,
            }));
    }, [filteredMessageHistoryRows]);

    const cachedMessageRows = useMemo(
        () => Object.values(messageLogCache).flatMap((entry) => entry.rows || []),
        [messageLogCache],
    );

    const cachedTeamSuccessTrend = useMemo(() => {
        const bucket = new Map<string, { team: string; success: number; fail: number; total: number; successRate: number }>();
        cachedMessageRows.forEach((row) => {
            if (!isMessageLogWithinRange(row.created_at, messageHistoryRangeFilter)) return;
            const team = String(row.team_name || '미지정').trim() || '미지정';
            const current = bucket.get(team) || { team, success: 0, fail: 0, total: 0, successRate: 0 };
            current.total += 1;
            if (isSuccessfulMessageStatus(row.status)) current.success += 1;
            else current.fail += 1;
            current.successRate = current.total > 0 ? Math.round((current.success / current.total) * 100) : 0;
            bucket.set(team, current);
        });

        return Array.from(bucket.values())
            .sort((a, b) => {
                if (b.total !== a.total) return b.total - a.total;
                return b.successRate - a.successRate;
            })
            .slice(0, 6);
    }, [cachedMessageRows, messageHistoryRangeFilter]);

    const failureReasonData = useMemo(() => {
        const bucket = new Map<string, number>();
        filteredMessageHistoryRows
            .filter((row) => !isSuccessfulMessageStatus(row.status))
            .forEach((row) => {
                const label = String(row.failure_category || '').trim() || classifyFailureReason(row);
                bucket.set(label, (bucket.get(label) || 0) + 1);
            });

        return Array.from(bucket.entries())
            .map(([reason, count]) => ({ reason, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
    }, [filteredMessageHistoryRows]);

    const failurePriorityActions = useMemo(() => {
        const getActionGuide = (reason: string) => {
            switch (reason) {
                case '타임아웃':
                    return '첨부 이미지 용량과 네트워크 상태를 먼저 점검한 뒤 재발송';
                case '인증/권한':
                    return 'SOLAPI 키/발신번호와 관리자 인증 상태를 즉시 확인';
                case '전화번호 오류':
                    return '등록 근로자 전화번호를 수정하고 개별 리포트에서 재발송';
                case '한도/속도 제한':
                    return '잠시 대기 후 재시도하고 대량 발송 시간대를 분산';
                case '이미지 업로드':
                    return '리포트 이미지 생성 상태와 크기 제한을 재검토';
                case '네트워크':
                    return '서버 연결 상태를 확인한 뒤 재시도';
                default:
                    return '상세 메시지를 확인하고 개별 재발송 전 원인을 재검토';
            }
        };

        return failureReasonData.slice(0, 3).map((item, index) => ({
            rank: index + 1,
            reason: item.reason,
            count: item.count,
            action: getActionGuide(item.reason),
        }));
    }, [failureReasonData]);

    const downloadMessageHistoryCsv = () => {
        if (!selectedMessageHistoryWorker || filteredMessageHistoryRows.length === 0) return;

        const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const rows = [
            ['근로자명', '팀명', '전화번호', '발송시각', '상태', '페이지수', '공급자', '메모'],
            ...filteredMessageHistoryRows.map((row) => [
                row.worker_name || selectedMessageHistoryWorker.name,
                row.team_name || selectedMessageHistoryWorker.team_name,
                formatPhoneForDisplay(row.phone_number),
                formatMessageLogDateTime(row.created_at),
                row.status,
                row.sent_count,
                row.provider || '-',
                row.message || '-',
            ]),
        ];

        const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')}`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `message_history_${(selectedMessageHistoryWorker.name || 'worker').replace(/\s+/g, '_')}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    };

    const downloadMessageHistoryJson = () => {
        if (!selectedMessageHistoryWorker || filteredMessageHistoryRows.length === 0) return;

        const payload = {
            exportedAt: new Date().toISOString(),
            worker: {
                id: selectedMessageHistoryWorker.id,
                name: selectedMessageHistoryWorker.name,
                team_name: selectedMessageHistoryWorker.team_name,
                job_field: selectedMessageHistoryWorker.job_field,
                phone_number: formatPhoneForDisplay(selectedMessageHistoryWorker.phone_number),
            },
            filters: {
                range: messageHistoryRangeFilter,
                status: messageHistoryStatusFilter,
                search: messageHistorySearchTerm,
            },
            rows: filteredMessageHistoryRows,
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `message_history_${(selectedMessageHistoryWorker.name || 'worker').replace(/\s+/g, '_')}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    };

    const downloadMessageHistoryExcel = async () => {
        if (!selectedMessageHistoryWorker || filteredMessageHistoryRows.length === 0) return;

        const XLSX = await loadXlsx();
        const exportRows = filteredMessageHistoryRows.map((row) => ({
            근로자명: row.worker_name || selectedMessageHistoryWorker.name,
            팀명: row.team_name || selectedMessageHistoryWorker.team_name,
            전화번호: formatPhoneForDisplay(row.phone_number),
            발송시각: formatMessageLogDateTime(row.created_at),
            상태: row.status,
            페이지수: row.sent_count,
            공급자: row.provider || '-',
            메모: row.message || '-',
        }));

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(exportRows);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'MessageLogs');
        XLSX.writeFile(workbook, `message_history_${(selectedMessageHistoryWorker.name || 'worker').replace(/\s+/g, '_')}.xlsx`);
    };

    const downloadDashboardSummaryJson = () => {
        if (!reportMessageDashboardSummary?.schemaReady) return;

        const payload = {
            exportedAt: new Date().toISOString(),
            source: 'report_message_dashboard_summary',
            overview: reportMessageDashboardSummary.overview,
            monthlyRows: reportMessageDashboardSummary.monthlyRows,
            teamRows: reportMessageDashboardSummary.teamRows,
            failureRows: reportMessageDashboardSummary.failureRows,
            retryRows: reportMessageDashboardSummary.retryRows,
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `message_dashboard_summary_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    };

    const downloadDashboardSummaryCsv = () => {
        if (!reportMessageDashboardSummary?.schemaReady) return;

        const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const sections = [
            ['[Overview]'],
            ['총발송', '성공', '실패', '성공률', '최다 팀', '주요 실패 원인'],
            [
                reportMessageDashboardSummary.overview.totalCount,
                reportMessageDashboardSummary.overview.successCount,
                reportMessageDashboardSummary.overview.failedCount,
                `${reportMessageDashboardSummary.overview.successRate}%`,
                reportMessageDashboardSummary.overview.topTeam,
                reportMessageDashboardSummary.overview.topFailureCategory,
            ],
            [],
            ['[Monthly Summary]'],
            ['월', '총발송', '성공', '실패', '성공률'],
            ...reportMessageDashboardSummary.monthlyRows.map((row) => [row.month_label, row.total_count, row.success_count, row.failed_count, `${row.success_rate}%`]),
            [],
            ['[Team Summary]'],
            ['팀명', '총발송', '성공', '실패', '성공률', '최근발송'],
            ...reportMessageDashboardSummary.teamRows.map((row) => [row.team_name, row.total_count, row.success_count, row.failed_count, `${row.success_rate}%`, formatMessageLogDateTime(row.last_sent_at)]),
            [],
            ['[Failure Summary]'],
            ['실패사유', '건수', '최근발생'],
            ...reportMessageDashboardSummary.failureRows.map((row) => [row.failure_category, row.failure_count, formatMessageLogDateTime(row.last_occurred_at)]),
            [],
            ['[Retry Queue]'],
            ['근로자명', '팀명', '전화번호', '실패사유', '우선점수', '실패시각', '메모'],
            ...reportMessageDashboardSummary.retryRows.map((row) => [row.worker_name, row.team_name, formatPhoneForDisplay(row.phone_number), row.failure_category, row.priority_score, formatMessageLogDateTime(row.failed_at), row.message || '-']),
        ];

        const csv = `\uFEFF${sections.map((row) => row.map(escapeCsv).join(',')).join('\r\n')}`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `message_dashboard_summary_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    };

    const downloadDashboardSummaryExcel = async () => {
        if (!reportMessageDashboardSummary?.schemaReady) return;

        const XLSX = await loadXlsx();
        const workbook = XLSX.utils.book_new();

        const overviewSheet = XLSX.utils.json_to_sheet([
            {
                총발송: reportMessageDashboardSummary.overview.totalCount,
                성공: reportMessageDashboardSummary.overview.successCount,
                실패: reportMessageDashboardSummary.overview.failedCount,
                성공률: `${reportMessageDashboardSummary.overview.successRate}%`,
                최다팀: reportMessageDashboardSummary.overview.topTeam,
                주요실패원인: reportMessageDashboardSummary.overview.topFailureCategory,
            },
        ]);
        const monthlySheet = XLSX.utils.json_to_sheet(reportMessageDashboardSummary.monthlyRows.map((row) => ({
            월: row.month_label,
            총발송: row.total_count,
            성공: row.success_count,
            실패: row.failed_count,
            성공률: `${row.success_rate}%`,
        })));
        const teamSheet = XLSX.utils.json_to_sheet(reportMessageDashboardSummary.teamRows.map((row) => ({
            팀명: row.team_name,
            총발송: row.total_count,
            성공: row.success_count,
            실패: row.failed_count,
            성공률: `${row.success_rate}%`,
            최근발송: formatMessageLogDateTime(row.last_sent_at),
        })));
        const failureSheet = XLSX.utils.json_to_sheet(reportMessageDashboardSummary.failureRows.map((row) => ({
            실패사유: row.failure_category,
            건수: row.failure_count,
            최근발생: formatMessageLogDateTime(row.last_occurred_at),
        })));
        const retrySheet = XLSX.utils.json_to_sheet(reportMessageDashboardSummary.retryRows.map((row) => ({
            근로자명: row.worker_name,
            팀명: row.team_name,
            전화번호: formatPhoneForDisplay(row.phone_number),
            실패사유: row.failure_category,
            우선점수: row.priority_score,
            실패시각: formatMessageLogDateTime(row.failed_at),
            공급자: row.provider || '-',
            메모: row.message || '-',
        })));

        XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Overview');
        XLSX.utils.book_append_sheet(workbook, monthlySheet, 'Monthly');
        XLSX.utils.book_append_sheet(workbook, teamSheet, 'Team');
        XLSX.utils.book_append_sheet(workbook, failureSheet, 'Failure');
        XLSX.utils.book_append_sheet(workbook, retrySheet, 'RetryQueue');
        XLSX.writeFile(workbook, `message_dashboard_summary_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const fetchWorkerMessageHistory = useCallback(async (worker: RegisteredWorkerListRow, options?: { force?: boolean; append?: boolean }) => {
        const workerId = String(worker?.id || '').trim();
        if (!workerId) return null;

        const cached = messageLogCache[workerId];
        if (!options?.force && cached && isMessageHistoryCacheFresh(cached.fetchedAt)) {
            setMessageLogError('');
            return cached;
        }

        const nextOffset = options?.append ? (cached?.rows.length || 0) : 0;

        if (options?.append) {
            setIsMessageLogLoadingMore(true);
        } else {
            setIsMessageLogLoading(true);
        }
        setMessageLogError('');
        try {
            const data = await postAdminJson<any>(
                '/api/admin/safety-management',
                {
                    action: 'list-report-message-logs',
                    payload: {
                        workerId,
                        workerName: worker.name,
                        limit: 30,
                        offset: nextOffset,
                    },
                },
                { fallbackMessage: '문자 발송 이력 조회 실패' },
            );

            const rows = Array.isArray(data?.data?.rows) ? data.data.rows : [];
            const normalizedRows = rows.map((row: any) => ({
                id: String(row?.id || '').trim(),
                worker_id: String(row?.worker_id || '').trim(),
                worker_name: String(row?.worker_name || '').trim(),
                team_name: String(row?.team_name || '').trim(),
                phone_number: String(row?.phone_number || '').trim(),
                status: String(row?.status || '').trim() || 'UNKNOWN',
                failure_category: String(row?.failure_category || '').trim(),
                sent_count: Number(row?.sent_count || 0),
                provider: String(row?.provider || '').trim(),
                message: String(row?.message || '').trim(),
                created_at: String(row?.created_at || '').trim(),
            }));
            const entry: WorkerMessageLogCacheEntry = {
                rows: options?.append ? [...(cached?.rows || []), ...normalizedRows] : normalizedRows,
                total: Number(data?.data?.total || rows.length || 0),
                offset: Number(data?.data?.offset || nextOffset || 0),
                limit: Number(data?.data?.limit || 30),
                hasMore: Boolean(data?.data?.hasMore),
                schemaReady: Boolean(data?.data?.schemaReady ?? true),
                fetchedAt: new Date().toISOString(),
            };

            setMessageLogCache((prev) => ({ ...prev, [workerId]: entry }));
            setMessageLogSessionApiCount((prev) => prev + 1);
            setMessageLogLastFetchedAt(entry.fetchedAt);
            return entry;
        } catch (error) {
            setMessageLogError(extractMessage(error));
            return null;
        } finally {
            if (options?.append) {
                setIsMessageLogLoadingMore(false);
            } else {
                setIsMessageLogLoading(false);
            }
        }
    }, [messageLogCache]);

    const handleOpenWorkerMessageHistory = (worker: RegisteredWorkerListRow) => {
        setRegisteredWorkerAdminTab('message-history');
        setSelectedMessageHistoryWorkerId(worker.id);
        setMessageLogError('');
    };

    const findRegisteredWorkerForRetryRow = (row: ReportMessageDashboardRetryRow) => {
        const retryWorkerId = normalizeIdentityToken(row.worker_id);
        const retryWorkerName = normalizeIdentityToken(row.worker_name);
        const retryTeamName = normalizeIdentityToken(row.team_name || '미지정');
        const retryPhone = normalizePhone(row.phone_number);

        return registeredWorkers.find((worker) => {
            const workerId = normalizeIdentityToken(worker.id);
            const workerName = normalizeIdentityToken(worker.name);
            const workerTeam = normalizeIdentityToken(worker.team_name || '미지정');
            const workerPhone = normalizePhone(worker.phone_number);

            if (retryWorkerId && workerId && retryWorkerId === workerId) return true;
            if (retryWorkerName === workerName && retryTeamName === workerTeam) return true;
            return retryPhone.length >= 10 && workerPhone === retryPhone;
        }) || null;
    };

    const findLatestRecordForRetryRow = (row: ReportMessageDashboardRetryRow) => {
        const retryWorkerId = normalizeIdentityToken(row.worker_id);
        const retryWorkerName = normalizeIdentityToken(row.worker_name);
        const retryTeamName = normalizeIdentityToken(row.team_name || '미지정');

        return latestRecords.find((record) => {
            const recordWorkerUuid = normalizeIdentityToken(record.worker_uuid || record.workerUuid);
            if (retryWorkerId && recordWorkerUuid && retryWorkerId === recordWorkerUuid) return true;

            const recordName = normalizeIdentityToken(record.name);
            const recordTeam = normalizeIdentityToken(record.teamLeader || '미지정');
            return retryWorkerName === recordName && retryTeamName === recordTeam;
        }) || null;
    };

    const handleInspectRetryQueueRow = (row: ReportMessageDashboardRetryRow) => {
        const matchedWorker = findRegisteredWorkerForRetryRow(row);
        if (matchedWorker) {
            handleOpenWorkerMessageHistory(matchedWorker);
        }
    };

    const handleOpenRetryQueueReport = (row: ReportMessageDashboardRetryRow) => {
        const matchedRecord = findLatestRecordForRetryRow(row);
        if (matchedRecord) {
            onViewDetails(matchedRecord);
        }
    };

    const buildRetryQueueBlockers = (row: ReportMessageDashboardRetryRow) => {
        const blockers: string[] = [];
        if (normalizePhone(row.phone_number).length < 10) {
            blockers.push('전화번호 확인 필요');
        }
        if (!findRegisteredWorkerForRetryRow(row)) {
            blockers.push('등록 근로자 매칭 없음');
        }
        if (!findLatestRecordForRetryRow(row)) {
            blockers.push('리포트 원본 없음');
        }
        return blockers;
    };

    const isRetryQueueRowActionable = (row: ReportMessageDashboardRetryRow) => buildRetryQueueBlockers(row).length === 0;

    const handleEditRetryQueueWorker = (row: ReportMessageDashboardRetryRow) => {
        const matchedWorker = findRegisteredWorkerForRetryRow(row);
        if (!matchedWorker) return;
        setRegisteredWorkerAdminTab('list');
        setRegisteredWorkerSearchTerm(matchedWorker.name || '');
        startEditRegisteredWorker(matchedWorker);
    };

    const openSelectedWorkerReport = () => {
        if (!selectedMessageHistoryLatestRecord) return;
        onViewDetails(selectedMessageHistoryLatestRecord);
    };

    const toggleRegisteredWorkersSort = (key: RegisteredWorkerSortKey) => {
        setRegisteredWorkersSort((prev) => {
            if (prev.key !== key) {
                return { key, order: 'asc' };
            }
            return { key, order: prev.order === 'asc' ? 'desc' : 'asc' };
        });
    };

    const clearDeleteUndoTimer = () => {
        if (deleteUndoTimerRef.current) {
            clearTimeout(deleteUndoTimerRef.current);
            deleteUndoTimerRef.current = null;
        }
    };

    const startEditRegisteredWorker = (worker: RegisteredWorkerListRow) => {
        setRegisteredWorkerUpdateMessage(null);
        setEditingWorkerId(worker.id);
        setEditingWorkerDraft({
            id: worker.id,
            name: worker.name,
            job_field: worker.job_field,
            team_name: worker.team_name,
            birth_date: worker.birth_date,
            phone_number: worker.phone_number,
        });
    };

    const cancelEditRegisteredWorker = () => {
        setEditingWorkerId('');
        setEditingWorkerDraft(null);
        setIsSavingWorkerEdit(false);
    };

    const handleDeleteRegisteredWorker = async (worker: RegisteredWorkerListRow) => {
        const ok = window.confirm(`${worker.name || '근로자'} 데이터를 삭제하시겠습니까?`);
        if (!ok) return;

        setDeletingWorkerId(worker.id);
        setRegisteredWorkerUpdateMessage(null);
        try {
            const data = await postAdminJson<any>(
                '/api/admin/safety-management',
                {
                    action: 'delete-worker',
                    payload: { id: worker.id },
                },
                { fallbackMessage: '등록 근로자 삭제 실패' },
            );

            const deletedWorkerId = String(data?.data?.deletedWorkerId || '').trim();
            const softDeleted = Boolean(data?.data?.softDeleted);
            if (!deletedWorkerId) {
                throw new Error('삭제 응답이 올바르지 않습니다.');
            }

            setRegisteredWorkers((prev) => prev.filter((item) => item.id !== deletedWorkerId));
            if (editingWorkerId === deletedWorkerId) {
                cancelEditRegisteredWorker();
            }
            clearDeleteUndoTimer();
            if (softDeleted) {
                setDeletedWorkerUndo({
                    id: deletedWorkerId,
                    name: worker.name,
                    softDeleted: true,
                });
                deleteUndoTimerRef.current = setTimeout(() => {
                    setDeletedWorkerUndo(null);
                    deleteUndoTimerRef.current = null;
                }, 7000);
                setRegisteredWorkerUpdateMessage('✅ 등록 근로자 정보가 삭제되었습니다. (7초 내 실행 취소 가능)');
            } else {
                setDeletedWorkerUndo(null);
                setRegisteredWorkerUpdateMessage('✅ 등록 근로자 정보가 삭제되었습니다.');
            }
        } catch (error) {
            setRegisteredWorkerUpdateMessage(`❌ ${extractMessage(error)}`);
        } finally {
            setDeletingWorkerId('');
        }
    };

    const handleUndoDeleteRegisteredWorker = async () => {
        if (!deletedWorkerUndo?.id || !deletedWorkerUndo.softDeleted) return;

        clearDeleteUndoTimer();
        setRegisteredWorkerUpdateMessage(null);

        try {
            await postAdminJson<any>(
                '/api/admin/safety-management',
                {
                    action: 'restore-worker',
                    payload: { id: deletedWorkerUndo.id },
                },
                { fallbackMessage: '등록 근로자 복구 실패' },
            );

            setDeletedWorkerUndo(null);
            setRegisteredWorkerUpdateMessage('✅ 삭제된 근로자 정보를 복구했습니다.');
            await fetchRegisteredWorkers();
        } catch (error) {
            setRegisteredWorkerUpdateMessage(`❌ ${extractMessage(error)}`);
            setDeletedWorkerUndo(null);
        }
    };

    const handleSaveRegisteredWorker = async () => {
        if (!editingWorkerDraft) return;

        const name = editingWorkerDraft.name.trim();
        const jobField = normalizeJobField(editingWorkerDraft.job_field);
        const teamName = editingWorkerDraft.team_name.trim();
        const birthDate = normalizeBirthDate(editingWorkerDraft.birth_date);
        const phoneNumber = normalizePhone(editingWorkerDraft.phone_number);

        if (!name) {
            setRegisteredWorkerUpdateMessage('❌ 이름은 필수입니다.');
            return;
        }
        if (!jobField) {
            setRegisteredWorkerUpdateMessage('❌ 공종은 필수입니다.');
            return;
        }
        if (!(ALLOWED_JOB_FIELDS as readonly string[]).includes(jobField)) {
            setRegisteredWorkerUpdateMessage('❌ 허용된 공종만 수정할 수 있습니다.');
            return;
        }
        if (!teamName) {
            setRegisteredWorkerUpdateMessage('❌ 팀명은 필수입니다.');
            return;
        }
        if (birthDate && !(birthDate.length === 6 || birthDate.length === 8)) {
            setRegisteredWorkerUpdateMessage('❌ 생년월일은 6자리 또는 8자리만 허용됩니다.');
            return;
        }

        setIsSavingWorkerEdit(true);
        setRegisteredWorkerUpdateMessage(null);
        try {
            const data = await postAdminJson<any>(
                '/api/admin/safety-management',
                {
                    action: 'update-worker',
                    payload: {
                        id: editingWorkerDraft.id,
                        name,
                        job_field: jobField,
                        team_name: teamName,
                        birth_date: birthDate || '',
                        phone_number: phoneNumber || '',
                    },
                },
                { fallbackMessage: '등록 근로자 수정 실패' },
            );

            const updatedWorker = data?.data?.worker as RegisteredWorkerListRow | undefined;
            if (!updatedWorker?.id) {
                throw new Error('수정된 근로자 응답이 올바르지 않습니다.');
            }

            setRegisteredWorkers((prev) => prev.map((item) => item.id === updatedWorker.id ? updatedWorker : item));
            setRegisteredWorkerUpdateMessage('✅ 등록 근로자 정보가 수정되었습니다.');
            cancelEditRegisteredWorker();
        } catch (error) {
            setRegisteredWorkerUpdateMessage(`❌ ${extractMessage(error)}`);
        } finally {
            setIsSavingWorkerEdit(false);
        }
    };

    const handleDownloadTemplate = async () => {
        const XLSX = await loadXlsx();
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
            const updated = Number(data?.data?.updated || 0);
            const skipped = Number(data?.data?.skippedDuplicateCount || 0);
            setBulkUploadMessage(`✅ 업로드 완료: 요청 ${requested}명 / 신규 ${inserted}명 / 보완 업데이트 ${updated}명 / 변경없음 ${skipped}명`);
            setBulkUploadSummary({
                status: 'success',
                requested,
                inserted,
                updated,
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
                updated: 0,
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
            const updated = Number(data?.data?.updated || 0);
            const skipped = Number(data?.data?.skippedDuplicateCount || 0);
            setBulkUploadMessage(`✅ 프로그램 등록 완료: 요청 ${requested}명 / 신규 ${inserted}명 / 보완 업데이트 ${updated}명 / 변경없음 ${skipped}명`);
            setBulkUploadSummary({
                status: 'success',
                requested,
                inserted,
                updated,
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
                updated: 0,
                skipped: 0,
                fileName: '프로그램 내 직접 등록',
                message,
            });
        } finally {
            setIsManualRegistering(false);
        }
    };

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
            const matchesUnassigned = !isUnassignedFilterActive || isUnassignedWorkerRecord(r);
            const reliability = verifyIssuanceReliability(r);
            const matchesReliability =
                reliabilityFilter === 'all' ||
                (reliabilityFilter === 'trusted' && reliability.trusted) ||
                (reliabilityFilter === 'needs-review' && !reliability.trusted);
            const matchesPhoto =
                photoFilter === 'all' ||
                (photoFilter === 'with-photo' && hasProfilePhoto(r)) ||
                (photoFilter === 'missing-photo' && !hasProfilePhoto(r));
            return matchesSearch && matchesJobField && matchesCrew && matchesLevel && matchesUnassigned && matchesReliability && matchesPhoto;
        });
    }, [latestRecords, searchTerm, selectedJobField, selectedCrew, filterLevel, reliabilityFilter, photoFilter, isUnassignedFilterActive]);

    const clearUnassignedFilter = () => {
        setIsUnassignedFilterActive(false);
        const params = new URLSearchParams(window.location.search);
        if (params.get('filter') === 'unassigned') {
            params.delete('filter');
            const query = params.toString();
            const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
            window.history.replaceState({}, '', nextUrl);
        }
    };

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

    const filteredPhotoSummary = useMemo(() => {
        const registeredCount = filteredRecords.filter((worker) => hasProfilePhoto(worker)).length;
        const linkedCount = filteredRecords.filter((worker) => getProfileLinkState(worker) === 'linked').length;
        const manualCount = filteredRecords.filter((worker) => getProfileLinkState(worker) === 'manual').length;
        return {
            total: filteredRecords.length,
            registeredCount,
            missingCount: filteredRecords.length - registeredCount,
            linkedCount,
            manualCount,
        };
    }, [filteredRecords]);

    const missingPhotoQueue = useMemo(() => {
        return filteredRecords
            .filter((worker) => !hasProfilePhoto(worker))
            .slice(0, 8);
    }, [filteredRecords]);

    const openPhotoRegistration = useCallback((worker: WorkerRecord) => {
        if (onOpenPhotoRegistration) {
            onOpenPhotoRegistration(worker, filteredRecords.filter((item) => !hasProfilePhoto(item)).map((item) => String(item.id)));
            return;
        }
        onViewDetails(worker);
    }, [filteredRecords, onOpenPhotoRegistration, onViewDetails]);

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
        setPrintUserNotice(null);

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

        const missingPhotoCount = printableWorkers.filter((worker) => !hasProfilePhoto(worker)).length;

        if (trustedPrintableWorkers.length === 0) {
            alert(`검증 통과 데이터가 없어 필터 대상 ${allPrintableWorkers.length}명을 예외 출력 모드로 진행합니다.\n\n권장: OCR 재분석 후 재발급으로 최신 증빙 정합성을 확보하세요.${missingPhotoCount > 0 ? `\n추가 권장: ${missingPhotoCount}명은 증명사진 등록 후 발급하면 현장 신뢰도가 더 높아집니다.` : ''}`);
        } else if (excludedCandidates.length > 0) {
            const reasonSummary = excludedCandidates
                .flatMap((item) => item.reliability.reasons)
                .slice(0, 3)
                .join(', ');
            alert(`신뢰성 검증 결과\n- 발급 포함: ${printableWorkers.length}명\n- 발급 제외: ${excludedCandidates.length}명${missingPhotoCount > 0 ? `\n- 사진 미등록: ${missingPhotoCount}명` : ''}\n\n제외 사유 예시: ${reasonSummary}\n\n구 백업 데이터는 OCR 재분석 후 발급해 주세요.`);
        } else if (missingPhotoCount > 0) {
            alert(`발급 대상 ${printableWorkers.length}명 중 ${missingPhotoCount}명은 증명사진이 없습니다.\n\n스티커와 사원증 모두 사진이 들어가면 현장 본인확인과 신뢰감이 더 좋아집니다.`);
        }

        const printPath = executeDirectPrint(`PSI-${type}-${printableWorkers.length}명`, printableWorkers, type);
        if (printPath) {
            setPrintUserNotice(`${type === 'sticker' ? '안전모 스티커' : '스마트 사원증'} 인쇄를 시작했습니다. (대상 ${printableWorkers.length}명 / 경로: ${printPath})`);
        } else {
            setPrintRuntimeError('인쇄 창을 열지 못했습니다. 브라우저 팝업 허용 상태를 다시 확인해 주세요.');
            setPrintUserNotice('인쇄 창 실행에 실패했습니다. 주소창의 팝업 차단 아이콘을 해제한 뒤 다시 시도해 주세요.');
        }
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
        if (registeredWorkerAdminTab !== 'message-history') return;
        if (filteredRegisteredWorkers.length === 0) {
            setSelectedMessageHistoryWorkerId('');
            return;
        }

        const hasSelectedWorker = filteredRegisteredWorkers.some((worker) => worker.id === selectedMessageHistoryWorkerId);
        if (!hasSelectedWorker) {
            setSelectedMessageHistoryWorkerId(filteredRegisteredWorkers[0].id);
        }
    }, [filteredRegisteredWorkers, registeredWorkerAdminTab, selectedMessageHistoryWorkerId]);

    useEffect(() => {
        if (registeredWorkerAdminTab !== 'message-history') return;
        if (!selectedMessageHistoryWorker) return;
        const cached = messageLogCache[selectedMessageHistoryWorker.id];
        if (cached && isMessageHistoryCacheFresh(cached.fetchedAt)) return;
        void fetchWorkerMessageHistory(selectedMessageHistoryWorker);
    }, [fetchWorkerMessageHistory, messageLogCache, registeredWorkerAdminTab, selectedMessageHistoryWorker]);

    useEffect(() => {
        if (registeredWorkerAdminTab !== 'message-history') return;
        if (reportMessageDashboardSummary) return;

        let disposed = false;

        const fetchDashboardSummary = async () => {
            setIsReportMessageDashboardLoading(true);
            setReportMessageDashboardError('');
            try {
                const response = await postAdminJson<{ ok: true; data: ReportMessageDashboardSummary }>(
                    '/api/admin/safety-management',
                    {
                        action: 'get-report-message-dashboard-summary',
                        payload: { limit: 6 },
                    },
                    { fallbackMessage: '문자 운영 집계 요약 조회 실패' },
                );

                if (!disposed) {
                    setReportMessageDashboardSummary(response?.data || null);
                }
            } catch (error) {
                if (!disposed) {
                    setReportMessageDashboardError(extractMessage(error));
                }
            } finally {
                if (!disposed) {
                    setIsReportMessageDashboardLoading(false);
                }
            }
        };

        void fetchDashboardSummary();

        return () => {
            disposed = true;
        };
    }, [registeredWorkerAdminTab, reportMessageDashboardSummary]);

    useEffect(() => {
        return () => {
            clearDeleteUndoTimer();
        };
    }, []);

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

        const escapeHtml = (value: unknown) =>
            String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

                const buildDirectPrintHtml = (title: string, targetWorkers: WorkerRecord[], targetType: 'sticker' | 'idcard') => {
                        const paletteByLevel = (level: string) => {
                                if (level === '고급') {
                                        return { primary: '#059669', soft: '#ecfdf5', text: '#065f46', accent: '#10b981' };
                                }
                                if (level === '중급') {
                                        return { primary: '#d97706', soft: '#fffbeb', text: '#92400e', accent: '#f59e0b' };
                                }
                                return { primary: '#dc2626', soft: '#fff1f2', text: '#9f1239', accent: '#f43f5e' };
                        };

                        const scoreToWarning = (score: number) => {
                                if (score >= 80) return { icon: '✓', text: '안전 기준 달성', tone: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' };
                                if (score >= 60) return { icon: '⚠', text: '주의 항목 점검 필요', tone: '#92400e', bg: '#fffbeb', border: '#fde68a' };
                                return { icon: '⚠', text: '즉시 개선 조치 필요', tone: '#9f1239', bg: '#fff1f2', border: '#fecdd3' };
                        };

                        const cardsHtml = targetWorkers.map((worker) => {
                                const level = escapeHtml(worker.safetyLevel || getSafetyLevelFromScore(Number(worker.safetyScore || 0)));
                                const score = Number.isFinite(Number(worker.safetyScore)) ? Number(worker.safetyScore) : 0;
                                const name = escapeHtml(worker.name || '식별 대기');
                                const job = escapeHtml(worker.jobField || '미분류');
                                const team = escapeHtml(worker.teamLeader || '미지정');
                                const nation = escapeHtml(worker.nationality || '미상');
                                const idTail = escapeHtml(getSafeIdTail(worker.id, 6));
                                const palette = paletteByLevel(level);
                                const warn = scoreToWarning(score);
                                const photoSrc = typeof worker.profileImage === 'string' && worker.profileImage.trim().length > 0
                                        ? (worker.profileImage.trim().startsWith('data:')
                                                ? worker.profileImage.trim()
                                                : `data:image/jpeg;base64,${worker.profileImage.trim()}`)
                                        : '';
                                const stickerStatus = score >= 80
                                    ? (photoSrc
                                        ? { icon: '👤', text: '본인 사진 확인 가능', tone: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' }
                                        : { icon: '📷', text: '증명사진 등록 권장', tone: '#92400e', bg: '#fffbeb', border: '#fde68a' })
                                    : warn;

                                if (targetType === 'sticker') {
                                        return `
<article class="card sticker" style="border-color:${palette.primary};">
    <div class="left" style="background:${palette.primary};">
        <div class="level-label">LEVEL</div>
        <div class="level">${level}</div>
        <div class="score-label">SCORE</div>
        <div class="score">${score}</div>
    </div>
    <div class="body">
        <div class="top-row top-row-main">
            <div class="photo-box">
                ${photoSrc ? `<img class="photo" src="${photoSrc}" alt="Profile" />` : `<div class="photo-empty">👷</div>`}
                <div class="photo-label">PHOTO</div>
            </div>
            <div class="title-wrap">
                <div class="top-row chips-only">
                    <span class="chip" style="background:${palette.soft};color:${palette.text};border-color:${palette.accent};">${nation}</span>
                    <span class="chip chip-dark">TEAM ${team}</span>
                </div>
                <h3>${name}</h3>
                <p class="sub">${job}</p>
            </div>
            <div class="sticker-qr">QR</div>
        </div>
        <div class="warn" style="background:${stickerStatus.bg};color:${stickerStatus.tone};border-color:${stickerStatus.border};">
            <span class="warn-icon">${stickerStatus.icon}</span>
            <span>${escapeHtml(stickerStatus.text)}</span>
        </div>
        <p class="meta">PSI SAFETY PASS · ID ${idTail}</p>
    </div>
</article>`;
                                }

                                return `
<article class="card idcard">
    <div class="head">
        <span>PSI SMART ID</span>
        <span class="head-year">2026</span>
    </div>
    <div class="id-body">
        <div class="photo-wrap">
            ${photoSrc ? `<img class="photo" src="${photoSrc}" alt="Profile" />` : `<div class="photo-empty">👷</div>`}
            <div class="grade" style="background:${palette.primary};">${level} GRADE</div>
        </div>
        <h3>${name}</h3>
        <p class="sub">${job} · ${team}</p>
        <p>${nation}</p>
        <p class="score-text">안전점수 ${score}</p>
        <div class="id-footer" style="background:${palette.soft};color:${palette.text};border-color:${palette.accent};">ID ${idTail}</div>
    </div>
</article>`;
                        }).join('');

                        return `<!doctype html>
<html lang="ko">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
        @page { size: A4; margin: 10mm; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; box-sizing: border-box; }
        body { margin: 0; font-family: 'Pretendard', 'Noto Sans KR', Arial, sans-serif; background: #fff; color: #0f172a; }
        .grid { display: grid; gap: 8mm; grid-template-columns: ${targetType === 'sticker' ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)'}; align-items: start; }
        .card { border: 1.4mm solid #cbd5e1; border-radius: 4mm; overflow: hidden; break-inside: avoid; page-break-inside: avoid; background: #fff; }
        .card .body { padding: 4mm; }
        .card h3 { margin: 0 0 2mm; font-size: 14px; font-weight: 900; letter-spacing: -0.01em; }
        .card p { margin: 0 0 1mm; font-size: 11px; font-weight: 700; color: #334155; }
        .card .meta { color: #64748b; font-size: 10px; }
        .sticker { display: flex; min-height: 60mm; }
        .sticker .left { width: 20mm; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2mm; }
        .sticker .left .level-label, .sticker .left .score-label { font-size: 7px; opacity: .85; font-weight: 800; }
        .sticker .left .level { font-size: 13px; font-weight: 900; }
        .sticker .left .score { font-size: 16px; font-weight: 900; }
        .sticker .top-row { display:flex; justify-content:space-between; gap:2mm; margin-bottom:2mm; }
        .sticker .top-row-main { align-items:flex-start; }
        .sticker .chips-only { margin-bottom:1.2mm; }
        .sticker .title-wrap { flex:1; min-width:0; }
        .sticker .photo-box { width:14mm; height:18mm; border:1px solid #cbd5e1; border-radius:2mm; overflow:hidden; position:relative; background:#f8fafc; flex-shrink:0; }
        .sticker .photo-label { position:absolute; left:0; right:0; bottom:0; background:rgba(15,23,42,.82); color:#fff; text-align:center; font-size:5.5px; font-weight:900; padding:.4mm 0; letter-spacing:.08em; }
        .sticker .sticker-qr { width:14mm; height:14mm; border:1px dashed #cbd5e1; border-radius:2mm; display:flex; align-items:center; justify-content:center; font-size:7px; font-weight:900; color:#64748b; background:#fff; flex-shrink:0; }
        .chip { display:inline-flex; align-items:center; border:1px solid; border-radius:999px; padding:0.8mm 2mm; font-size:8px; font-weight:900; }
        .chip-dark { background:#0f172a; color:#fff; border-color:#0f172a; }
        .sub { color:#475569; font-size:10px; }
        .warn { margin-top:2mm; border:1px solid; border-radius:2mm; padding:1.5mm 2mm; display:flex; gap:1.5mm; align-items:center; font-size:9px; font-weight:900; }
        .warn-icon { font-weight:900; }

        .idcard { min-height: 86mm; border-color:#334155; }
        .idcard .head { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #fff; padding: 3mm 4mm; font-size: 10px; font-weight: 900; display:flex; justify-content:space-between; align-items:center; }
        .head-year { font-size:9px; opacity:.9; }
        .id-body { padding:3.5mm; display:flex; flex-direction:column; align-items:center; text-align:center; gap:1.2mm; }
        .photo-wrap { width: 26mm; height: 34mm; border: 1px solid #cbd5e1; border-radius: 2mm; overflow: hidden; position:relative; background:#f8fafc; }
        .photo { width:100%; height:100%; object-fit:cover; }
        .photo-empty { width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:18px; color:#94a3b8; }
        .grade { position:absolute; left:0; right:0; bottom:0; color:#fff; font-size:7px; font-weight:900; padding:0.6mm 0; }
        .score-text { font-size:10px; font-weight:900; color:#1e293b; }
        .id-footer { margin-top:1mm; border:1px solid; border-radius:999px; padding:0.8mm 2mm; font-size:8px; font-weight:900; }

        @media print {
            html, body { background: #fff !important; }
        }
    </style>
</head>
<body>
    <main class="grid">${cardsHtml || '<p>인쇄할 데이터가 없습니다.</p>'}</main>
    <script>
        window.addEventListener('load', function () {
            setTimeout(function () {
                try { window.focus(); window.print(); } catch (e) {}
            }, 200);
        });
    </script>
</body>
</html>`;
                };

                const printViaHiddenIframe = (html: string) => {
                        try {
                                const frame = document.createElement('iframe');
                                frame.setAttribute('aria-hidden', 'true');
                                frame.style.position = 'fixed';
                                frame.style.right = '0';
                                frame.style.bottom = '0';
                                frame.style.width = '0';
                                frame.style.height = '0';
                                frame.style.border = '0';
                                document.body.appendChild(frame);

                                const doc = frame.contentWindow?.document;
                                if (!doc || !frame.contentWindow) {
                                        frame.remove();
                                        return false;
                                }

                                doc.open();
                                doc.write(html);
                                doc.close();

                                const cleanup = () => {
                                        try { frame.remove(); } catch {}
                                };

                                frame.contentWindow.focus();
                                setTimeout(() => {
                                        try { frame.contentWindow?.print(); } catch {}
                                        setTimeout(cleanup, 800);
                                }, 120);

                                return true;
                        } catch {
                                return false;
                        }
                };

                const executeDirectPrint = (title: string, targetWorkers: WorkerRecord[], targetType: 'sticker' | 'idcard'): 'iframe' | 'popup' | false => {
                        const html = buildDirectPrintHtml(title, targetWorkers, targetType);
                        const iframeOk = printViaHiddenIframe(html);
                        if (iframeOk) return 'iframe';
                        const popupOk = openDirectPopupPrint(title, targetWorkers, targetType, html);
                        if (popupOk) return 'popup';
                        return false;
                };

                function openDirectPopupPrint(title: string, targetWorkers: WorkerRecord[], targetType: 'sticker' | 'idcard', prebuiltHtml?: string) {
            const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1280,height=900');
            if (!printWindow) {
                setPrintRuntimeError('브라우저 팝업 차단으로 인쇄 창을 열지 못했습니다. 팝업 허용 후 다시 시도해 주세요.');
                return false;
            }
                        const html = prebuiltHtml || buildDirectPrintHtml(title, targetWorkers, targetType);

            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();
            return true;
        };

        const printUsingFallbackWindow = (title: string) => {
                const source = printAreaRef.current;
            const fallbackWorkers = workersToPrint.length > 0 ? workersToPrint : filteredRecords;
            if (!source) {
                return openDirectPopupPrint(title, fallbackWorkers, printType);
                }

            const sourceMarkup = source.innerHTML.trim();
            if (!sourceMarkup) {
                return openDirectPopupPrint(title, fallbackWorkers, printType);
            }

                const styleTags = Array.from(document.querySelectorAll('style')).map((node) => node.outerHTML).join('\n');
                const linkTags = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((node) => node.outerHTML).join('\n');
                const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1280,height=900');

                if (!printWindow) {
                        setPrintRuntimeError('브라우저 팝업 차단으로 인쇄 창을 열지 못했습니다. 팝업 허용 후 다시 시도해 주세요.');
                    return false;
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
    <div id="print-root">${sourceMarkup}</div>
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
                return true;
            }

        const performPrint = (title: string): 'popup' | 'failed' => {
                const fallbackOpened = printUsingFallbackWindow(title);
                if (fallbackOpened) {
                return 'popup';
                }

            setPrintRuntimeError('브라우저 팝업 차단으로 인쇄를 시작하지 못했습니다. 이 사이트의 팝업을 허용한 뒤 다시 시도해 주세요.');
            return 'failed';
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
        };

        flushSync(() => {
            setWorkersToPrint([currentWorker]);
            setRenderLimit(1);
            setViewType('grid');
            setCurrentFlipIndex(0);
        });

        const printResult = performPrint(`PSI-${printType}-current`);
        if (printResult === 'popup') {
            restore();
            setIsPrintMode(false);
            return;
        }

        setTimeout(restore, 120);
    };

    const handlePrintAll = () => {
        const printResult = performPrint(`PSI-${printType}-all`);
        if (printResult === 'popup') {
            setIsPrintMode(false);
        }
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

            {printUserNotice && (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700 no-print">
                    {printUserNotice}
                </div>
            )}
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
                            현장의 안전 수준과 본인 확인 신뢰를 함께 보여주는 <span className="text-indigo-300 font-bold">사진형 스마트 스티커</span>와 <span className="text-indigo-300 font-bold">사진형 ID 카드</span>를 발급합니다.<br/>
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
                                    <p className="text-indigo-400 text-xs font-bold mt-2">사진 확인 • QR 연동 • 등급 시각화</p>
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
                                    <p className="text-indigo-400 text-xs font-bold mt-2">증명사진 • 직무 표시 • 보안 패턴 적용</p>
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
                {isUnassignedFilterActive && (
                    <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <p className="text-sm font-black text-amber-800">⚠️ 식별 불가 데이터 필터링 중</p>
                        <button
                            type="button"
                            onClick={clearUnassignedFilter}
                            className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100"
                        >
                            Clear Filter
                        </button>
                    </div>
                )}
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

                <div className="w-full rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                            <p className="text-sm font-black text-indigo-900">사진 등록 최적 작업 모드</p>
                            <p className="mt-1 text-[11px] font-bold text-indigo-700">가장 효율적인 방식은 먼저 사진 미등록자만 좁혀서, 상세 보기에서 프로필 사진만 빠르게 연속 등록한 뒤 발급하는 순서다.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setPhotoFilter('missing-photo')}
                                className={`px-3 py-2 rounded-xl text-xs font-black border transition-colors ${photoFilter === 'missing-photo' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-100'}`}
                            >
                                사진 미등록자만 보기
                            </button>
                            <button
                                type="button"
                                onClick={() => setPhotoFilter('all')}
                                className={`px-3 py-2 rounded-xl text-xs font-black border transition-colors ${photoFilter === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                            >
                                전체 보기
                            </button>
                        </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div className="rounded-xl bg-white border border-indigo-100 px-3 py-3">
                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">STEP 1</p>
                            <p className="mt-1 text-xs font-black text-slate-900">사진 미등록자만 필터</p>
                            <p className="mt-1 text-[11px] font-bold text-slate-500">누락자만 남겨서 등록 대상을 한 번에 정리</p>
                        </div>
                        <div className="rounded-xl bg-white border border-indigo-100 px-3 py-3">
                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">STEP 2</p>
                            <p className="mt-1 text-xs font-black text-slate-900">근로자 카드 클릭 → 상세 보기</p>
                            <p className="mt-1 text-[11px] font-bold text-slate-500">상단 `증명사진(프로필) 등록` 영역에서 즉시 업로드</p>
                        </div>
                        <div className="rounded-xl bg-white border border-indigo-100 px-3 py-3">
                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">STEP 3</p>
                            <p className="mt-1 text-xs font-black text-slate-900">저장 후 스티커/사원증 발급</p>
                            <p className="mt-1 text-[11px] font-bold text-slate-500">얼굴 기반 본인 확인이 가능해져 현장 신뢰감이 크게 올라감</p>
                        </div>
                    </div>
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
                            value={formatPhoneForDisplay(manualWorkerForm.phone_number)}
                            onChange={(e) => setManualWorkerForm((prev) => ({ ...prev, phone_number: normalizePhone(e.target.value).slice(0, 11) }))}
                            inputMode="numeric"
                            maxLength={11}
                            placeholder="핸드폰번호 (선택)"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
                        />
                        <input
                            type="text"
                            value={formatBirthDateForDisplay(manualWorkerForm.birth_date)}
                            onChange={(e) => setManualWorkerForm((prev) => ({ ...prev, birth_date: normalizeBirthDate(e.target.value).slice(0, 8) }))}
                            inputMode="numeric"
                            maxLength={8}
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
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className="rounded-lg border border-white/70 bg-white px-2 py-2">
                                <p className="text-[10px] font-black text-slate-500">요청</p>
                                <p className="text-sm font-black text-slate-900">{bulkUploadSummary.requested}</p>
                            </div>
                            <div className="rounded-lg border border-white/70 bg-white px-2 py-2">
                                <p className="text-[10px] font-black text-slate-500">신규 등록</p>
                                <p className="text-sm font-black text-emerald-700">{bulkUploadSummary.inserted}</p>
                            </div>
                            <div className="rounded-lg border border-white/70 bg-white px-2 py-2">
                                <p className="text-[10px] font-black text-slate-500">보완 업데이트</p>
                                <p className="text-sm font-black text-indigo-700">{bulkUploadSummary.updated}</p>
                            </div>
                            <div className="rounded-lg border border-white/70 bg-white px-2 py-2">
                                <p className="text-[10px] font-black text-slate-500">변경없음</p>
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
                    <div className="min-w-0">
                        <select value={photoFilter} onChange={e => setPhotoFilter(e.target.value as 'all' | 'with-photo' | 'missing-photo')} className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-4 font-bold min-w-[150px]">
                            <option value="all">사진 상태: 전체</option>
                            <option value="with-photo">사진 등록자만</option>
                            <option value="missing-photo">사진 미등록자만</option>
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 w-full">
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
                    <div className="bg-amber-50 px-4 py-3 rounded-2xl text-amber-700 font-bold text-sm border border-amber-100 flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        <span className="truncate">사진등록: {filteredPhotoSummary.registeredCount}명 / 미등록 {filteredPhotoSummary.missingCount}명</span>
                    </div>
                    <div className="bg-sky-50 px-4 py-3 rounded-2xl text-sky-700 font-bold text-sm border border-sky-100 flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                        <span className="truncate">공통 프로필 연계: {filteredPhotoSummary.linkedCount}명 / 수동사진 {filteredPhotoSummary.manualCount}명</span>
                    </div>
                </div>
                {filteredRecords.length > 0 && filteredReliabilitySummary.trustedCount === 0 && (
                    <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                        <p className="text-sm font-black">현재 필터 결과에는 검증 통과 데이터가 없습니다.</p>
                        <p className="text-xs font-bold mt-1">지금 인쇄하면 예외 출력 모드로 진행됩니다. 가능하면 OCR 재분석 후 출력하세요.</p>
                    </div>
                )}
                {filteredPhotoSummary.missingCount > 0 && (
                    <div className="w-full rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-800">
                        <p className="text-sm font-black">가장 좋은 방식은 스티커와 사원증 모두 근로자 사진을 같이 넣는 것입니다.</p>
                        <p className="text-xs font-bold mt-1">현재 필터 기준으로 {filteredPhotoSummary.missingCount}명은 증명사진이 없어 기본 아이콘으로 출력됩니다. 카드 클릭 → 상세 보기 → 상단 `증명사진(프로필) 등록`에서 업로드 후 저장하면 가장 빠르게 정리됩니다.</p>
                    </div>
                )}
                {filteredPhotoSummary.linkedCount > 0 && (
                    <div className="w-full rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-800">
                        <p className="text-sm font-black">공통 프로필 연계 사진이 자동 유지되고 있습니다.</p>
                        <p className="text-xs font-bold mt-1">현재 필터 기준 {filteredPhotoSummary.linkedCount}명은 같은 근로자의 월별 기록끼리 사진과 식별자가 자동 연계되는 상태입니다. 이후 신규 월 기록도 같은 기준으로 이어집니다.</p>
                    </div>
                )}
                {missingPhotoQueue.length > 0 && (
                    <div className="w-full rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div>
                                <p className="text-sm font-black text-slate-900">사진 미등록자 빠른 등록 큐</p>
                                <p className="mt-1 text-[11px] font-bold text-slate-500">실제 등록자는 아래 순서대로 열어서 사진만 연속 업로드하면 된다. 현재 화면 기준 상위 {missingPhotoQueue.length}명만 우선 노출된다.</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPhotoFilter('missing-photo')}
                                    className="px-3 py-2 rounded-xl text-xs font-black bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                                >
                                    미등록자 작업 모드 유지
                                </button>
                                <button
                                    type="button"
                                    onClick={() => missingPhotoQueue[0] && openPhotoRegistration(missingPhotoQueue[0])}
                                    className="px-3 py-2 rounded-xl text-xs font-black bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
                                >
                                    첫 대상 바로 열기
                                </button>
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {missingPhotoQueue.map((worker, index) => (
                                <button
                                    key={worker.id}
                                    type="button"
                                    onClick={() => openPhotoRegistration(worker)}
                                    className="w-full text-left rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-slate-200 text-slate-500 flex items-center justify-center font-black shrink-0">
                                            {index + 1}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-sm font-black text-slate-900 truncate">{worker.name}</p>
                                                <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-black border border-amber-200">📷 사진 필요</span>
                                            </div>
                                            <p className="mt-1 text-[11px] font-bold text-slate-500 truncate">{worker.jobField} · {worker.teamLeader || '미지정'} · {worker.nationality || '국적 미상'}</p>
                                        </div>
                                        <div className="shrink-0 text-[11px] font-black text-indigo-600">상세 열기</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                        {filteredPhotoSummary.missingCount > missingPhotoQueue.length && (
                            <p className="mt-3 text-[11px] font-bold text-slate-500">나머지 {filteredPhotoSummary.missingCount - missingPhotoQueue.length}명도 아래 목록에서 같은 방식으로 계속 등록하면 된다.</p>
                        )}
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
                    const profileLinkState = getProfileLinkState(worker);
                    return (
                        <div key={worker.id} className="bg-white p-5 rounded-[24px] border border-slate-100 hover:border-indigo-300 hover:shadow-2xl transition-all cursor-pointer group relative overflow-hidden flex flex-col gap-3" onClick={() => onViewDetails(worker)}>
                            {/* Glassmorphism Overlay Menu on Hover */}
                            <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-6">
                                <p className="text-white font-black mb-1">{worker.name}</p>
                                <button
                                    onClick={(e) => { e.stopPropagation(); startProcessing('sticker', [worker]); }}
                                    title={canIssue ? '스티커 인쇄' : `검증필요 항목: ${reliability.reasons.join(', ')}`}
                                    className={`w-full py-3 font-black rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2 text-xs ${canIssue ? 'bg-white text-slate-900 hover:bg-slate-200' : 'bg-amber-200 text-slate-900 hover:bg-amber-300'}`}
                                >
                                    <span className="text-base">⛑</span> 스티커 인쇄
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); startProcessing('idcard', [worker]); }}
                                    title={canIssue ? '사원증 인쇄' : `검증필요 항목: ${reliability.reasons.join(', ')}`}
                                    className={`w-full py-3 font-black rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2 text-xs ${canIssue ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-amber-500 text-white hover:bg-amber-400'}`}
                                >
                                    <span className="text-base">💳</span> 사원증 인쇄
                                </button>
                                {!canIssue && (
                                    <>
                                        <p className="text-[10px] text-amber-200 font-bold text-center mt-1">검증 필요 데이터는 예외 출력 모드로 발급됩니다.</p>
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
                                <div className="flex flex-wrap items-center gap-2">
                                    {worker.approvalStatus === 'OVERRIDDEN' ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black bg-amber-100 text-amber-700 border border-amber-200" title={`${worker.approvedBy || '승인자 미기록'} / ${worker.approvedAt || '-'} / ${worker.approvalReason || '-'}`}>
                                            🔐 예외 승인 발급
                                        </span>
                                    ) : reliability.trusted ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black bg-emerald-100 text-emerald-700 border border-emerald-200">
                                            ✅ OCR 검증 통과
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black bg-rose-100 text-rose-700 border border-rose-200" title={reliability.reasons.join(', ')}>
                                            ⚠️ 검증 필요 (구백업 가능)
                                        </span>
                                    )}
                                    {hasProfilePhoto(worker) ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black bg-indigo-100 text-indigo-700 border border-indigo-200">
                                            👤 사진 등록 완료
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black bg-slate-100 text-slate-600 border border-slate-200">
                                            📷 사진 등록 권장
                                        </span>
                                    )}
                                    {profileLinkState === 'linked' && (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black bg-sky-100 text-sky-700 border border-sky-200">
                                            🔗 공통 프로필 연계
                                        </span>
                                    )}
                                    {profileLinkState === 'manual' && (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black bg-violet-100 text-violet-700 border border-violet-200">
                                            🖼 수동 등록 사진
                                        </span>
                                    )}
                                </div>
                                {!canIssue && (
                                    <div className="flex items-center justify-between gap-2 ml-auto">
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
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                        <h3 className="text-base sm:text-lg font-black text-slate-900">등록 근로자 관리자 센터</h3>
                        <p className="mt-1 text-[11px] font-bold text-slate-500">근로자 기본정보 수정과 문자 발송 이력을 같은 화면에서 저용량 호출 방식으로 확인합니다.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setRegisteredWorkerAdminTab('list')}
                            className={`px-3 py-2 rounded-xl border text-xs font-black transition-colors ${registeredWorkerAdminTab === 'list' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'}`}
                        >
                            등록 리스트
                        </button>
                        <button
                            type="button"
                            onClick={() => setRegisteredWorkerAdminTab('message-history')}
                            className={`px-3 py-2 rounded-xl border text-xs font-black transition-colors ${registeredWorkerAdminTab === 'message-history' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
                        >
                            문자 발송 이력
                        </button>
                        <button
                            type="button"
                            onClick={() => void fetchRegisteredWorkers()}
                            disabled={isRegisteredWorkersLoading}
                            className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-black hover:bg-indigo-100 disabled:opacity-60"
                        >
                            {isRegisteredWorkersLoading ? '불러오는 중...' : '새로고침'}
                        </button>
                    </div>
                </div>
                {registeredWorkerUpdateMessage && (
                    <p className={`mt-3 text-xs font-bold ${registeredWorkerUpdateMessage.startsWith('✅') ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {registeredWorkerUpdateMessage}
                    </p>
                )}
                {deletedWorkerUndo && (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                        <p className="text-xs font-bold text-amber-800">{deletedWorkerUndo.name || '근로자'} 삭제됨</p>
                        <button
                            type="button"
                            onClick={() => void handleUndoDeleteRegisteredWorker()}
                            className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] font-black text-amber-700 hover:bg-amber-100"
                        >
                            실행 취소
                        </button>
                    </div>
                )}

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <input
                        type="text"
                        value={registeredWorkerSearchTerm}
                        onChange={(event) => setRegisteredWorkerSearchTerm(event.target.value)}
                        placeholder="이름/전화/생년월일/여권번호 검색"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 focus:border-indigo-500 focus:bg-white"
                    />
                    <select
                        value={registeredWorkerJobFilter}
                        onChange={(event) => setRegisteredWorkerJobFilter(event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 focus:border-indigo-500 focus:bg-white"
                    >
                        {registeredWorkerJobOptions.map((option) => (
                            <option key={option} value={option}>{`공종: ${option}`}</option>
                        ))}
                    </select>
                    <select
                        value={registeredWorkerTeamFilter}
                        onChange={(event) => setRegisteredWorkerTeamFilter(event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 focus:border-indigo-500 focus:bg-white"
                    >
                        {registeredWorkerTeamOptions.map((option) => (
                            <option key={option} value={option}>{`팀명: ${option}`}</option>
                        ))}
                    </select>
                    <select
                        value={registeredWorkerMissingFilter}
                        onChange={(event) => setRegisteredWorkerMissingFilter(event.target.value as 'all' | 'missing-any' | 'missing-phone' | 'missing-birth' | 'missing-passport')}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 focus:border-indigo-500 focus:bg-white"
                    >
                        <option value="all">누락 필터: 전체</option>
                        <option value="missing-any">누락 필터: 하나라도 누락</option>
                        <option value="missing-phone">누락 필터: 전화번호 누락</option>
                        <option value="missing-birth">누락 필터: 생년월일 누락</option>
                        <option value="missing-passport">누락 필터: 여권번호 누락</option>
                    </select>
                </div>
                <p className="mt-2 text-[11px] font-bold text-slate-500">
                    등록 {registeredWorkers.length}명 · 필터 결과 {filteredRegisteredWorkers.length}명
                </p>

                {registeredWorkerAdminTab === 'message-history' && (
                    <div className="mt-4 rounded-[24px] border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-slate-50 p-4 sm:p-5">
                        {reportMessageDashboardError && (
                            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
                                운영 집계 요약 조회 오류: {reportMessageDashboardError}
                            </div>
                        )}
                        {isReportMessageDashboardLoading && !reportMessageDashboardSummary && (
                            <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-xs font-bold text-slate-500">
                                운영 집계 요약을 불러오는 중입니다.
                            </div>
                        )}
                        {reportMessageDashboardSummary?.schemaReady && (
                            <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                                <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                                    <div>
                                        <p className="text-xs font-black text-slate-800 uppercase tracking-[0.18em]">MESSAGE OPS DASHBOARD</p>
                                        <p className="mt-1 text-[11px] font-bold text-slate-500">DB 집계 뷰 기준 전체 문자 운영 현황입니다.</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void downloadDashboardSummaryExcel()}
                                            className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50"
                                        >
                                            대시보드 Excel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={downloadDashboardSummaryCsv}
                                            className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100"
                                        >
                                            대시보드 CSV
                                        </button>
                                        <button
                                            type="button"
                                            onClick={downloadDashboardSummaryJson}
                                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                                        >
                                            대시보드 JSON
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setReportMessageDashboardSummary(null)}
                                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100"
                                        >
                                            운영 집계 새로고침
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-[10px] font-black text-slate-500">월 기준 총 발송</p>
                                        <p className="mt-1 text-2xl font-black text-slate-900">{reportMessageDashboardSummary.overview.totalCount}</p>
                                    </div>
                                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                                        <p className="text-[10px] font-black text-emerald-600">월 성공</p>
                                        <p className="mt-1 text-2xl font-black text-emerald-900">{reportMessageDashboardSummary.overview.successCount}</p>
                                    </div>
                                    <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3">
                                        <p className="text-[10px] font-black text-rose-600">월 실패</p>
                                        <p className="mt-1 text-2xl font-black text-rose-900">{reportMessageDashboardSummary.overview.failedCount}</p>
                                    </div>
                                    <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                                        <p className="text-[10px] font-black text-amber-600">월 성공률</p>
                                        <p className="mt-1 text-2xl font-black text-amber-900">{reportMessageDashboardSummary.overview.successRate}%</p>
                                    </div>
                                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3">
                                        <p className="text-[10px] font-black text-indigo-600">최다 팀</p>
                                        <p className="mt-1 text-sm font-black text-indigo-900 truncate">{reportMessageDashboardSummary.overview.topTeam}</p>
                                    </div>
                                    <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
                                        <p className="text-[10px] font-black text-violet-600">주요 실패 원인</p>
                                        <p className="mt-1 text-sm font-black text-violet-900 truncate">{reportMessageDashboardSummary.overview.topFailureCategory}</p>
                                    </div>
                                </div>
                                <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                                    <p className="text-[10px] font-black text-amber-700">재시도 후보</p>
                                    <p className="mt-1 text-lg font-black text-amber-900">{reportMessageDashboardSummary.overview.retryCandidateCount}건</p>
                                </div>

                                <div className="mt-4 grid grid-cols-1 xl:grid-cols-4 gap-4">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                        <p className="text-xs font-black text-slate-800">월별 집계 뷰</p>
                                        <div className="mt-4 h-[220px]">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={reportMessageDashboardSummary.monthlyRows} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                                    <XAxis dataKey="month_label" tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
                                                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
                                                    <Tooltip />
                                                    <Bar dataKey="success_count" fill="#10B981" radius={[8, 8, 0, 0]} />
                                                    <Bar dataKey="failed_count" fill="#F43F5E" radius={[8, 8, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                        <p className="text-xs font-black text-slate-800">팀별 집계 뷰</p>
                                        <div className="mt-4 h-[220px]">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={reportMessageDashboardSummary.teamRows} layout="vertical" margin={{ top: 8, right: 18, left: 18, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
                                                    <YAxis type="category" dataKey="team_name" width={90} tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
                                                    <Tooltip formatter={(value: number) => [`${value}%`, '성공률']} />
                                                    <Bar dataKey="success_rate" fill="#6366F1" radius={[0, 8, 8, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                        <p className="text-xs font-black text-slate-800">실패 사유 집계 뷰</p>
                                        <div className="mt-4 h-[220px]">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={reportMessageDashboardSummary.failureRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                                    <XAxis dataKey="failure_category" tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} interval={0} angle={-10} textAnchor="end" height={56} />
                                                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
                                                    <Tooltip formatter={(value: number) => [value, '건수']} />
                                                    <Bar dataKey="failure_count" fill="#F97316" radius={[8, 8, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                        <p className="text-xs font-black text-slate-800">재시도 큐</p>
                                        <p className="mt-1 text-[11px] font-bold text-slate-500">현재 최신 상태가 실패인 대상만 우선 점수순으로 표시합니다.</p>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setRetryQueueFilter('all')}
                                                className={`rounded-lg border px-2.5 py-1 text-[10px] font-black ${retryQueueFilter === 'all' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                                            >
                                                전체
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setRetryQueueFilter('actionable')}
                                                className={`rounded-lg border px-2.5 py-1 text-[10px] font-black ${retryQueueFilter === 'actionable' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                                            >
                                                재시도 가능만
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setRetryQueueFilter('blocked')}
                                                className={`rounded-lg border px-2.5 py-1 text-[10px] font-black ${retryQueueFilter === 'blocked' ? 'border-rose-600 bg-rose-600 text-white' : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
                                            >
                                                차단 대상만
                                            </button>
                                        </div>
                                        <div className="mt-4 space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                            {reportMessageDashboardSummary.retryRows.filter((row) => {
                                                const actionable = isRetryQueueRowActionable(row);
                                                return retryQueueFilter === 'all' || (retryQueueFilter === 'actionable' && actionable) || (retryQueueFilter === 'blocked' && !actionable);
                                            }).length > 0 ? reportMessageDashboardSummary.retryRows.filter((row) => {
                                                const actionable = isRetryQueueRowActionable(row);
                                                return retryQueueFilter === 'all' || (retryQueueFilter === 'actionable' && actionable) || (retryQueueFilter === 'blocked' && !actionable);
                                            }).map((row) => {
                                                const matchedWorker = findRegisteredWorkerForRetryRow(row);
                                                const matchedRecord = findLatestRecordForRetryRow(row);
                                                const blockers = buildRetryQueueBlockers(row);

                                                return (
                                                <div key={row.retry_key} className="rounded-xl border border-amber-200 bg-white px-3 py-3">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-black text-slate-900 truncate">{row.worker_name || '근로자 미상'}</p>
                                                            <p className="mt-1 text-[11px] font-bold text-slate-500 truncate">{row.team_name || '미지정'} · {formatPhoneForDisplay(row.phone_number) || '전화 미등록'}</p>
                                                        </div>
                                                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">{row.priority_score}</span>
                                                    </div>
                                                    <p className="mt-2 text-[11px] font-black text-rose-700">{row.failure_category}</p>
                                                    <p className="mt-1 text-[11px] font-bold text-slate-500 break-words">{row.message || row.provider || '-'}</p>
                                                    <p className="mt-1 text-[10px] font-bold text-slate-400">{formatMessageLogDateTime(row.failed_at)}</p>
                                                    {blockers.length > 0 && (
                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                            {blockers.map((blocker) => (
                                                                <span key={`${row.retry_key}-${blocker}`} className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-black text-rose-700">
                                                                    {blocker}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleInspectRetryQueueRow(row)}
                                                            disabled={!matchedWorker}
                                                            className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-black text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                                                        >
                                                            이력 열기
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenRetryQueueReport(row)}
                                                            disabled={!matchedRecord}
                                                            className="inline-flex items-center rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700 hover:bg-sky-100 disabled:opacity-60"
                                                        >
                                                            리포트 열기
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleEditRetryQueueWorker(row)}
                                                            disabled={!matchedWorker}
                                                            className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                                                        >
                                                            근로자 수정
                                                        </button>
                                                    </div>
                                                </div>
                                                );
                                            }) : (
                                                <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-xs font-bold text-slate-500">
                                                    현재 필터 조건에 맞는 재시도 후보가 없습니다.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        {reportMessageDashboardSummary && !reportMessageDashboardSummary.schemaReady && (
                            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                                <p className="font-black">운영 집계 뷰가 아직 준비되지 않았습니다.</p>
                                <p className="mt-1 text-xs font-bold">최신 [supabase_report_message_logs_migration.sql](supabase_report_message_logs_migration.sql)를 실행하면 월별/팀별/실패사유 대시보드가 활성화됩니다.</p>
                            </div>
                        )}
                        <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-4">
                            <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
                                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3">
                                    <p className="text-xs font-black text-indigo-900">Vercel 무료버전 API 절약 모드</p>
                                    <p className="mt-1 text-[11px] font-bold text-indigo-700">이 탭은 선택한 근로자 1명만 조회하고, 조회 결과를 5분간 캐시하여 불필요한 서버 호출을 줄입니다.</p>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                                        <p className="text-[10px] font-black text-slate-500">세션 API 호출</p>
                                        <p className="mt-1 text-lg font-black text-slate-900">{messageLogSessionApiCount}</p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                                        <p className="text-[10px] font-black text-slate-500">캐시된 근로자</p>
                                        <p className="mt-1 text-lg font-black text-slate-900">{Object.keys(messageLogCache).length}</p>
                                    </div>
                                </div>
                                <p className="mt-2 text-[11px] font-bold text-slate-500">
                                    최근 실조회: {messageLogLastFetchedAt ? formatMessageLogDateTime(messageLogLastFetchedAt) : '아직 없음'}
                                </p>

                                <div className="mt-4 max-h-[560px] overflow-y-auto pr-1 space-y-2">
                                    {filteredRegisteredWorkers.length === 0 ? (
                                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs font-bold text-slate-500">
                                            현재 검색 조건에 맞는 근로자가 없습니다.
                                        </div>
                                    ) : filteredRegisteredWorkers.map((worker) => {
                                        const cachedEntry = messageLogCache[worker.id];
                                        const lastLog = cachedEntry?.rows?.[0];
                                        const isActive = worker.id === selectedMessageHistoryWorkerId;

                                        return (
                                            <button
                                                key={worker.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedMessageHistoryWorkerId(worker.id);
                                                    setMessageLogError('');
                                                }}
                                                className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${isActive ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'}`}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-black text-slate-900 truncate">{worker.name || '이름 미상'}</p>
                                                        <p className="mt-1 text-[11px] font-bold text-slate-500 truncate">{worker.job_field || '미분류'} · {worker.team_name || '미지정'}</p>
                                                    </div>
                                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black border ${cachedEntry ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                                                        {cachedEntry ? '캐시됨' : '미조회'}
                                                    </span>
                                                </div>
                                                <div className="mt-2 text-[11px] font-bold text-slate-500">
                                                    <p>전화: {formatPhoneForDisplay(worker.phone_number) || '미등록'}</p>
                                                    <p className="mt-1 truncate">최근 발송: {lastLog ? `${formatMessageLogDateTime(lastLog.created_at)} · ${lastLog.status}` : '기록 없음'}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <p className="text-xs font-black text-indigo-600 uppercase tracking-[0.2em]">MESSAGE HISTORY</p>
                                        <h4 className="mt-1 text-lg font-black text-slate-900">{selectedMessageHistoryWorker?.name || '근로자를 선택하세요'}</h4>
                                        <p className="mt-1 text-[11px] font-bold text-slate-500">
                                            {selectedMessageHistoryWorker ? `${selectedMessageHistoryWorker.job_field || '미분류'} · ${selectedMessageHistoryWorker.team_name || '미지정'} · ${formatPhoneForDisplay(selectedMessageHistoryWorker.phone_number) || '전화 미등록'}` : '좌측 목록에서 확인할 근로자를 선택하세요.'}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={openSelectedWorkerReport}
                                            disabled={!selectedMessageHistoryLatestRecord}
                                            className="inline-flex items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-700 hover:bg-sky-100 disabled:opacity-60"
                                        >
                                            최신 리포트 열기
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void downloadMessageHistoryExcel()}
                                            disabled={!selectedMessageHistoryWorker || filteredMessageHistoryRows.length === 0}
                                            className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                                        >
                                            Excel 다운로드
                                        </button>
                                        <button
                                            type="button"
                                            onClick={downloadMessageHistoryCsv}
                                            disabled={!selectedMessageHistoryWorker || filteredMessageHistoryRows.length === 0}
                                            className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                                        >
                                            CSV 다운로드
                                        </button>
                                        <button
                                            type="button"
                                            onClick={downloadMessageHistoryJson}
                                            disabled={!selectedMessageHistoryWorker || filteredMessageHistoryRows.length === 0}
                                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                        >
                                            JSON 다운로드
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => selectedMessageHistoryWorker && void fetchWorkerMessageHistory(selectedMessageHistoryWorker, { force: true })}
                                            disabled={!selectedMessageHistoryWorker || isMessageLogLoading}
                                            className="inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                                        >
                                            {isMessageLogLoading ? '조회 중...' : '선택 근로자 이력 새로고침'}
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <input
                                        type="text"
                                        value={messageHistorySearchTerm}
                                        onChange={(event) => setMessageHistorySearchTerm(event.target.value)}
                                        placeholder="메모/상태/전화번호 검색"
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 focus:border-indigo-500 focus:bg-white"
                                    />
                                    <select
                                        value={messageHistoryRangeFilter}
                                        onChange={(event) => setMessageHistoryRangeFilter(event.target.value as MessageHistoryRangeFilter)}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 focus:border-indigo-500 focus:bg-white"
                                    >
                                        <option value="7d">최근 7일</option>
                                        <option value="30d">최근 30일</option>
                                        <option value="90d">최근 90일</option>
                                        <option value="all">전체 기간</option>
                                    </select>
                                    <select
                                        value={messageHistoryStatusFilter}
                                        onChange={(event) => setMessageHistoryStatusFilter(event.target.value as MessageHistoryStatusFilter)}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 focus:border-indigo-500 focus:bg-white"
                                    >
                                        <option value="all">상태: 전체</option>
                                        <option value="success">상태: 성공만</option>
                                        <option value="fail">상태: 실패/보류만</option>
                                    </select>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                        <p className="text-[10px] font-black text-slate-500">표시 중</p>
                                        <p className="mt-1 text-sm font-black text-slate-900">{filteredMessageHistoryRows.length}건 / 원본 {selectedMessageHistoryRows.length}건</p>
                                    </div>
                                </div>

                                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.18em]">SUCCESS</p>
                                        <p className="mt-1 text-2xl font-black text-emerald-900">{selectedMessageHistorySummary.successCount}</p>
                                    </div>
                                    <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3">
                                        <p className="text-[10px] font-black text-rose-600 uppercase tracking-[0.18em]">FAIL / HOLD</p>
                                        <p className="mt-1 text-2xl font-black text-rose-900">{selectedMessageHistorySummary.failureCount}</p>
                                    </div>
                                    <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
                                        <p className="text-[10px] font-black text-sky-600 uppercase tracking-[0.18em]">SENT PAGES</p>
                                        <p className="mt-1 text-2xl font-black text-sky-900">{selectedMessageHistorySummary.sentPageCount}</p>
                                    </div>
                                    <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-[0.18em]">SUCCESS RATE</p>
                                        <p className="mt-1 text-2xl font-black text-amber-900">{selectedMessageHistorySummary.successRate}%</p>
                                    </div>
                                    <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
                                        <p className="text-[10px] font-black text-violet-600 uppercase tracking-[0.18em]">TOP PROVIDER</p>
                                        <p className="mt-1 text-base font-black text-violet-900 truncate">{selectedMessageHistorySummary.topProviderLabel}</p>
                                        <p className="mt-1 text-xs font-bold text-violet-700">{selectedMessageHistorySummary.topProviderCount}건</p>
                                    </div>
                                </div>
                                {messageHistoryMonthlyTrend.length > 0 && (
                                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-black text-slate-800">월별 발송 추이</p>
                                                <p className="mt-1 text-[11px] font-bold text-slate-500">현재 필터 기준 최근 최대 6개월의 성공/실패 건수를 표시합니다.</p>
                                            </div>
                                        </div>
                                        <div className="mt-4 h-[240px]">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={messageHistoryMonthlyTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                                    <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
                                                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
                                                    <Tooltip
                                                        formatter={(value: number, name: string) => [value, name === 'success' ? '성공' : '실패']}
                                                        labelFormatter={(label) => `${label} 발송 현황`}
                                                    />
                                                    <Legend formatter={(value) => value === 'success' ? '성공' : '실패'} />
                                                    <Bar dataKey="success" name="success" fill="#10B981" radius={[8, 8, 0, 0]} />
                                                    <Bar dataKey="fail" name="fail" fill="#F43F5E" radius={[8, 8, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}
                                {(cachedTeamSuccessTrend.length > 0 || failureReasonData.length > 0) && (
                                    <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                            <div>
                                                <p className="text-xs font-black text-slate-800">팀별 성공률 비교</p>
                                                <p className="mt-1 text-[11px] font-bold text-slate-500">현재 캐시에 적재된 팀 기준으로 최근 기간 성공률을 비교합니다.</p>
                                            </div>
                                            {cachedTeamSuccessTrend.length > 0 ? (
                                                <div className="mt-4 h-[240px]">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <BarChart data={cachedTeamSuccessTrend} layout="vertical" margin={{ top: 8, right: 18, left: 18, bottom: 0 }}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                                            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
                                                            <YAxis type="category" dataKey="team" width={90} tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
                                                            <Tooltip formatter={(value: number) => [`${value}%`, '성공률']} />
                                                            <Bar dataKey="successRate" fill="#6366F1" radius={[0, 8, 8, 0]} />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            ) : (
                                                <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-xs font-bold text-slate-500">
                                                    아직 팀 비교가 가능한 캐시 데이터가 부족합니다.
                                                </div>
                                            )}
                                        </div>

                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                            <div>
                                                <p className="text-xs font-black text-slate-800">실패 사유 분류</p>
                                                <p className="mt-1 text-[11px] font-bold text-slate-500">실패/보류 메시지 문구를 기준으로 주요 원인을 자동 분류합니다.</p>
                                            </div>
                                            {failureReasonData.length > 0 ? (
                                                <div className="mt-4 h-[240px]">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <BarChart data={failureReasonData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                                            <XAxis dataKey="reason" tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} interval={0} angle={-10} textAnchor="end" height={56} />
                                                            <YAxis allowDecimals={false} tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
                                                            <Tooltip formatter={(value: number) => [value, '건수']} />
                                                            <Bar dataKey="count" fill="#F97316" radius={[8, 8, 0, 0]} />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            ) : (
                                                <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-xs font-bold text-slate-500">
                                                    현재 필터에서는 실패/보류 로그가 없어 사유 분류가 비어 있습니다.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {failurePriorityActions.length > 0 && (
                                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                                        <div>
                                            <p className="text-xs font-black text-amber-900">재발송 우선순위 가이드</p>
                                            <p className="mt-1 text-[11px] font-bold text-amber-700">실패 빈도가 높은 원인부터 현장 대응 우선순위를 안내합니다.</p>
                                        </div>
                                        <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-3">
                                            {failurePriorityActions.map((item) => (
                                                <div key={item.reason} className="rounded-2xl border border-amber-200 bg-white px-4 py-4 shadow-sm">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">우선 {item.rank}</span>
                                                        <span className="text-[11px] font-black text-amber-700">{item.count}건</span>
                                                    </div>
                                                    <p className="mt-3 text-sm font-black text-slate-900">{item.reason}</p>
                                                    <p className="mt-2 text-[11px] font-bold text-slate-600 break-words">{item.action}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {selectedMessageHistoryLogEntry && (
                                    <p className="mt-3 text-[11px] font-bold text-slate-500">
                                        서버 원본 {selectedMessageHistoryLogEntry.total}건 중 현재 {selectedMessageHistoryRows.length}건 로드됨
                                    </p>
                                )}
                                {selectedMessageHistoryWorker && !selectedMessageHistoryLatestRecord && (
                                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                                        현재 근로자와 연결된 최신 리포트 원본을 찾지 못했습니다. 문자 이력은 확인 가능하지만 상세 리포트 바로 열기는 비활성화됩니다.
                                    </div>
                                )}

                                {messageLogError && (
                                    <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
                                        문자 발송 이력 조회 오류: {messageLogError}
                                    </div>
                                )}

                                {!selectedMessageHistoryWorker && (
                                    <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-500">
                                        좌측에서 근로자를 선택하면 개인별 문자 발송 이력이 표시됩니다.
                                    </div>
                                )}

                                {selectedMessageHistoryWorker && selectedMessageHistoryLogEntry && !selectedMessageHistoryLogEntry.schemaReady && (
                                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                                        <p className="font-black">문자 발송 로그 스키마가 아직 준비되지 않았습니다.</p>
                                        <p className="mt-1 text-xs font-bold">Supabase SQL Editor에서 `supabase_report_message_logs_migration.sql`을 먼저 실행하면 관리자 이력 탭이 즉시 활성화됩니다.</p>
                                    </div>
                                )}

                                {selectedMessageHistoryWorker && (!selectedMessageHistoryLogEntry || selectedMessageHistoryLogEntry.schemaReady) && (
                                    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                                        <table className="min-w-full text-sm">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-xs font-black text-slate-600">발송시각</th>
                                                    <th className="px-4 py-3 text-left text-xs font-black text-slate-600">상태</th>
                                                    <th className="px-4 py-3 text-left text-xs font-black text-slate-600">페이지수</th>
                                                    <th className="px-4 py-3 text-left text-xs font-black text-slate-600">전화번호</th>
                                                    <th className="px-4 py-3 text-left text-xs font-black text-slate-600">메모</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {isMessageLogLoading && !selectedMessageHistoryLogEntry && (
                                                    <tr>
                                                        <td colSpan={5} className="px-4 py-6 text-center text-xs font-bold text-slate-500">
                                                            문자 발송 이력을 불러오는 중입니다.
                                                        </td>
                                                    </tr>
                                                )}

                                                {!isMessageLogLoading && selectedMessageHistoryLogEntry && filteredMessageHistoryRows.length === 0 && (
                                                    <tr>
                                                        <td colSpan={5} className="px-4 py-6 text-center text-xs font-bold text-slate-500">
                                                            현재 필터 조건에 맞는 문자 발송 이력이 없습니다.
                                                        </td>
                                                    </tr>
                                                )}

                                                {filteredMessageHistoryRows.map((row) => (
                                                    <tr key={row.id} className={`border-t hover:bg-slate-50/70 ${isSuccessfulMessageStatus(row.status) ? 'border-slate-100' : 'border-rose-100 bg-rose-50/40'}`}>
                                                        <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">{formatMessageLogDateTime(row.created_at)}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                            <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-black border ${isSuccessfulMessageStatus(row.status) ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                                                                {row.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 font-bold text-slate-700 whitespace-nowrap">{row.sent_count || 0}p</td>
                                                        <td className="px-4 py-3 font-bold text-slate-700 whitespace-nowrap">{formatPhoneForDisplay(row.phone_number) || '-'}</td>
                                                        <td className="px-4 py-3 text-xs font-bold text-slate-500">
                                                            <div className="max-w-[360px] whitespace-pre-wrap break-words">{row.message || row.provider || '-'}</div>
                                                            {!isSuccessfulMessageStatus(row.status) && (
                                                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                                                    <p className="text-[10px] font-black text-rose-600">재확인 필요</p>
                                                                    {selectedMessageHistoryLatestRecord && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={openSelectedWorkerReport}
                                                                            className="inline-flex items-center rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700 hover:bg-sky-100"
                                                                        >
                                                                            리포트 보기
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                {selectedMessageHistoryWorker && selectedMessageHistoryLogEntry?.hasMore && (
                                    <div className="mt-3 flex justify-center">
                                        <button
                                            type="button"
                                            onClick={() => void fetchWorkerMessageHistory(selectedMessageHistoryWorker, { append: true, force: true })}
                                            disabled={isMessageLogLoadingMore}
                                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                        >
                                            {isMessageLogLoadingMore ? '추가 이력 불러오는 중...' : '이력 더 보기'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {registeredWorkerAdminTab === 'list' && (
                <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-black text-slate-600">이름</th>
                                <th className="px-4 py-3 text-left text-xs font-black text-slate-600">공종</th>
                                <th className="px-4 py-3 text-left text-xs font-black text-slate-600">팀명</th>
                                <th className="px-4 py-3 text-left text-xs font-black text-slate-600">
                                    <button
                                        type="button"
                                        onClick={() => toggleRegisteredWorkersSort('birth_date')}
                                        className="inline-flex items-center gap-1 hover:text-slate-900"
                                    >
                                        생년월일
                                        {registeredWorkersSort.key === 'birth_date' ? (registeredWorkersSort.order === 'asc' ? '▲' : '▼') : ''}
                                    </button>
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-black text-slate-600">
                                    <button
                                        type="button"
                                        onClick={() => toggleRegisteredWorkersSort('phone_number')}
                                        className="inline-flex items-center gap-1 hover:text-slate-900"
                                    >
                                        전화번호
                                        {registeredWorkersSort.key === 'phone_number' ? (registeredWorkersSort.order === 'asc' ? '▲' : '▼') : ''}
                                    </button>
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-black text-slate-600">관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isRegisteredWorkersLoading && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-6 text-center text-xs font-bold text-slate-500">
                                        등록 근로자 목록을 불러오는 중입니다.
                                    </td>
                                </tr>
                            )}

                            {!isRegisteredWorkersLoading && registeredWorkersError && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-6 text-center text-xs font-bold text-rose-600">
                                        목록 조회 오류: {registeredWorkersError}
                                    </td>
                                </tr>
                            )}

                            {!isRegisteredWorkersLoading && !registeredWorkersError && registeredWorkers.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-6 text-center text-xs font-bold text-slate-500">
                                        등록된 근로자 데이터가 없습니다.
                                    </td>
                                </tr>
                            )}

                            {!isRegisteredWorkersLoading && !registeredWorkersError && registeredWorkers.length > 0 && filteredRegisteredWorkers.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-6 text-center text-xs font-bold text-slate-500">
                                        검색/필터 조건에 맞는 근로자가 없습니다.
                                    </td>
                                </tr>
                            )}

                            {!isRegisteredWorkersLoading && !registeredWorkersError && filteredRegisteredWorkers.map((worker) => (
                                <tr key={worker.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                                    <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                                        {editingWorkerId === worker.id ? (
                                            <input
                                                type="text"
                                                value={editingWorkerDraft?.name || ''}
                                                onChange={(event) => setEditingWorkerDraft((prev) => prev ? ({ ...prev, name: event.target.value }) : prev)}
                                                className="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold"
                                            />
                                        ) : (worker.name || '-')}
                                    </td>
                                    <td className="px-4 py-3 font-bold text-slate-700 whitespace-nowrap">
                                        {editingWorkerId === worker.id ? (
                                            <select
                                                value={editingWorkerDraft?.job_field || ''}
                                                onChange={(event) => setEditingWorkerDraft((prev) => prev ? ({ ...prev, job_field: event.target.value }) : prev)}
                                                className="w-36 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold"
                                            >
                                                {ALLOWED_JOB_FIELDS.map((field) => (
                                                    <option key={field} value={field}>{field}</option>
                                                ))}
                                            </select>
                                        ) : (worker.job_field || '-')}
                                    </td>
                                    <td className="px-4 py-3 font-bold text-slate-700 whitespace-nowrap">
                                        {editingWorkerId === worker.id ? (
                                            <input
                                                type="text"
                                                value={editingWorkerDraft?.team_name || ''}
                                                onChange={(event) => setEditingWorkerDraft((prev) => prev ? ({ ...prev, team_name: event.target.value }) : prev)}
                                                className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold"
                                            />
                                        ) : (worker.team_name || '-')}
                                    </td>
                                    <td className="px-4 py-3 font-bold text-slate-700 whitespace-nowrap">
                                        {editingWorkerId === worker.id ? (
                                            <input
                                                type="text"
                                                value={formatBirthDateForDisplay(editingWorkerDraft?.birth_date || '')}
                                                onChange={(event) => setEditingWorkerDraft((prev) => prev ? ({ ...prev, birth_date: normalizeBirthDate(event.target.value).slice(0, 8) }) : prev)}
                                                inputMode="numeric"
                                                maxLength={8}
                                                className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold"
                                            />
                                        ) : (formatBirthDateForDisplay(worker.birth_date) || '-')}
                                    </td>
                                    <td className="px-4 py-3 font-bold text-slate-700 whitespace-nowrap">
                                        {editingWorkerId === worker.id ? (
                                            <input
                                                type="text"
                                                value={formatPhoneForDisplay(editingWorkerDraft?.phone_number || '')}
                                                onChange={(event) => setEditingWorkerDraft((prev) => prev ? ({ ...prev, phone_number: normalizePhone(event.target.value).slice(0, 11) }) : prev)}
                                                inputMode="numeric"
                                                maxLength={13}
                                                className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold"
                                            />
                                        ) : (formatPhoneForDisplay(worker.phone_number) || '-')}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {editingWorkerId === worker.id ? (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => void handleSaveRegisteredWorker()}
                                                    disabled={isSavingWorkerEdit}
                                                    className="rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-[11px] font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                                                >
                                                    {isSavingWorkerEdit ? '저장중' : '저장'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={cancelEditRegisteredWorker}
                                                    disabled={isSavingWorkerEdit}
                                                    className="rounded-lg bg-slate-100 border border-slate-200 px-2 py-1 text-[11px] font-black text-slate-700 hover:bg-slate-200 disabled:opacity-60"
                                                >
                                                    취소
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => startEditRegisteredWorker(worker)}
                                                    disabled={deletingWorkerId === worker.id}
                                                    className="rounded-lg bg-indigo-50 border border-indigo-200 px-2 py-1 text-[11px] font-black text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                                                >
                                                    수정
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenWorkerMessageHistory(worker)}
                                                    disabled={deletingWorkerId === worker.id}
                                                    className="rounded-lg bg-sky-50 border border-sky-200 px-2 py-1 text-[11px] font-black text-sky-700 hover:bg-sky-100 disabled:opacity-60"
                                                >
                                                    문자이력
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleDeleteRegisteredWorker(worker)}
                                                    disabled={deletingWorkerId === worker.id}
                                                    className="rounded-lg bg-rose-50 border border-rose-200 px-2 py-1 text-[11px] font-black text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                                                >
                                                    {deletingWorkerId === worker.id ? '삭제중' : '삭제'}
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                )}
            </div>
        </div>
    );
};
export default WorkerManagement;

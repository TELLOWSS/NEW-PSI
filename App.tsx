import React, { useState, useEffect, useRef, useCallback, Component, Suspense, lazy, type ReactNode, type ErrorInfo } from 'react';
import { Layout } from './components/Layout';
import { AdminLockScreen } from './components/AdminLockScreen';
import Dashboard from './pages/Dashboard';
import { Spinner } from './components/Spinner';
import type { WorkerRecord, SafetyCheckRecord, Page, ModalState, BriefingData, RiskForecastData } from './types';
import { WorkerHistoryModal } from './components/modals/WorkerHistoryModal';
import { RecordDetailModal } from './components/modals/RecordDetailModal';
import { restoreRecordFromUrl } from './utils/qrUtils';
import { extractMessage } from './utils/errorUtils';
import { appendAuditTrail, appendCorrectionHistory, attachEvidenceHash, deriveCompetencyProfile, deriveIntegrityScore, enforceSafetyLevel } from './utils/evidenceUtils';
import { applyIdentityPolicy } from './utils/identityUtils';
import { isAdminAuthenticated, setAdminAuthenticated, setAdminAuthToken, verifyAdminPassword } from './utils/adminGuard';
import { getSafetyLevelThresholds } from './utils/safetyLevelUtils';

const OcrAnalysis = lazy(() => import('./pages/OcrAnalysis'));
const WorkerManagement = lazy(() => import('./pages/WorkerManagement'));
const PredictiveAnalysis = lazy(() => import('./pages/PredictiveAnalysis'));
const SafetyChecks = lazy(() => import('./pages/SafetyChecks'));
const PerformanceAnalysis = lazy(() => import('./pages/PerformanceAnalysis'));
const SiteIssueManagement = lazy(() => import('./pages/SiteIssueManagement'));
const Reports = lazy(() => import('./pages/Reports'));
const Feedback = lazy(() => import('./pages/Feedback'));
const Introduction = lazy(() => import('./pages/Introduction'));
const IndividualReport = lazy(() => import('./pages/IndividualReport'));
const Settings = lazy(() => import('./pages/Settings'));
const AdminTraining = lazy(() => import('./pages/AdminTraining'));
const WorkerTraining = lazy(() => import('./pages/WorkerTraining'));
const SafetyBehaviorManagement = lazy(() => import('./pages/SafetyBehaviorManagement'));

const IDB_NAME = 'PSI_Enterprise_V4';
const IDB_VERSION = 1;
const WORKER_STORE = 'worker_records';
const SAFETY_LEVEL_MIGRATION_KEY = 'psi_migrated_safety_level_v20260325';
const SAFETY_LEVEL_MIGRATION_REPORT_KEY = 'psi_migrated_safety_level_report_v20260325';

interface ErrorBoundaryProps {
    children?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false, error: null, errorInfo: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error, errorInfo: null };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6 text-center animate-fade-in">
                    <div className="bg-white p-6 sm:p-8 rounded-2xl sm:rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
                            <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        </div>
                        <h2 className="text-xl sm:text-2xl font-black text-slate-900 mb-2">시스템 일시 중단됨</h2>
                        <p className="text-sm sm:text-base text-slate-500 mb-4 sm:mb-6 font-medium">
                            처리 중 예상치 못한 문제가 발생했습니다.<br/>
                            데이터는 안전하게 보존되어 있으니 안심하세요.
                        </p>
                        
                        <div className="bg-slate-100 p-3 sm:p-4 rounded-lg sm:rounded-xl text-left mb-4 sm:mb-6 overflow-auto max-h-32 sm:max-h-40 text-[10px] sm:text-xs font-mono text-slate-600 border border-slate-200">
                            <strong>Error:</strong> {this.state.error?.toString()}
                            <br/>
                            <span className="opacity-50">{this.state.errorInfo?.componentStack}</span>
                        </div>

                        <button 
                            onClick={this.handleReset}
                            className="w-full py-3 sm:py-4 bg-indigo-600 text-white rounded-lg sm:rounded-xl text-sm sm:text-base font-bold shadow-lg hover:bg-indigo-700 transition-all hover:-translate-y-1 flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            시스템 복구 및 새로고침
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

const initDB = () => new Promise<IDBDatabase>((resolve, reject) => {
    if (!window.indexedDB) {
        console.warn("IndexedDB not supported in this environment");
        reject(new Error("IndexedDB not supported"));
        return;
    }
    const r = indexedDB.open(IDB_NAME, IDB_VERSION);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve(r.result);
    r.onupgradeneeded = (e: Event) => {
        const req = e.target as IDBOpenDBRequest;
        const db = req.result as IDBDatabase;
        if (!db.objectStoreNames.contains(WORKER_STORE)) {
            db.createObjectStore(WORKER_STORE, { keyPath: 'id' });
        }
    };
});

const loadWorkerRecordsFromDB = async () => {
    try {
        const db = await initDB();
        return new Promise<WorkerRecord[]>((resolve) => {
            const tx = db.transaction([WORKER_STORE], 'readonly');
            const store = tx.objectStore(WORKER_STORE);
            const request = store.getAll();
            request.onsuccess = (e: Event) => resolve(((e.target as IDBRequest).result as WorkerRecord[]) || []);
            request.onerror = () => resolve([]);
        });
    } catch (e) { 
        const msg = extractMessage(e);
        console.warn("DB Load failed or not supported", msg);
        return []; 
    }
};

const saveRecordToDB = async (record: WorkerRecord) => {
    try {
        const db = await initDB();
        const tx = db.transaction([WORKER_STORE], 'readwrite');
        const store = tx.objectStore(WORKER_STORE);
        store.put(record);
        return new Promise(res => { tx.oncomplete = () => res(true); });
    } catch (e) { console.error("Save Error:", e); }
};

const deleteRecordFromDB = async (id: string) => {
    try {
        const db = await initDB();
        const tx = db.transaction([WORKER_STORE], 'readwrite');
        const store = tx.objectStore(WORKER_STORE);
        store.delete(id);
        return new Promise(res => { tx.oncomplete = () => res(true); });
    } catch (e) { console.error("Delete Error:", e); }
};

const clearDB = async () => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([WORKER_STORE], 'readwrite');
            const store = tx.objectStore(WORKER_STORE);
            const request = store.clear();
            
            tx.oncomplete = () => resolve(true);
            tx.onerror = (e) => reject(e);
            request.onerror = (e) => reject(e);
        });
    } catch (e) { 
        console.error("Clear DB Error:", e);
        throw e;
    }
};

const normalizeImage = (imgData: unknown): string | undefined => {
    if (!imgData) return undefined;

    let raw = "";
    if (typeof imgData === 'object' && imgData !== null) {
        const obj = imgData as Record<string, unknown>;
        // inlineData 또는 data 필드 추출 (우선순위 유지)
        if (typeof obj.inlineData === 'object' && obj.inlineData !== null) {
            const inlineObj = obj.inlineData as Record<string, unknown>;
            if ('data' in inlineObj && typeof inlineObj.data === 'string') {
                raw = inlineObj.data;
            }
        } else if ('data' in obj && typeof obj.data === 'string') {
            raw = obj.data;
        }
    } else if (typeof imgData === 'string') {
        raw = imgData;
    }

    if (!raw || raw.length < 50) return undefined;

    // 이미 data: URI 형식이면 그대로 반환
    const trimmed = raw.trim();
    if (trimmed.startsWith('data:image')) {
        return trimmed;
    }

    // Base64 헤더 제거 (대소문자 구분 없음)
    const cleanBase64 = raw.replace(/^data:image\/[a-z0-9]+;base64,/i, '').replace(/\s/g, '');
    
    // 최종 검증 (너무 짧은 데이터 제거)
    if (cleanBase64.length < 50) return undefined;
    
    return `data:image/jpeg;base64,${cleanBase64}`;
};

const normalizeNationality = (rawNationality: string): string => {
    if (!rawNationality) return '미상';

    const nation = rawNationality.trim().toLowerCase();
    if (nation.includes('한국') || nation.includes('korea') || nation.includes('rok') || nation.includes('south korea')) {
        return '대한민국';
    }

    if (nation.includes('베트남') || nation.includes('vietnam')) return '베트남';
    if (nation.includes('중국') || nation.includes('china')) return '중국';
    if (nation.includes('태국') || nation.includes('thailand')) return '태국';
    if (nation.includes('우즈벡') || nation.includes('uzbekistan')) return '우즈베키스탄';
    if (nation.includes('인도네시아') || nation.includes('indonesia')) return '인도네시아';
    if (nation.includes('캄보디아') || nation.includes('cambodia')) return '캄보디아';
    if (nation.includes('몽골') || nation.includes('mongolia')) return '몽골';
    if (nation.includes('필리핀') || nation.includes('philippines')) return '필리핀';
    if (nation.includes('카자흐') || nation.includes('kazakhstan')) return '카자흐스탄';
    if (nation.includes('러시아') || nation.includes('russia')) return '러시아';
    if (nation.includes('네팔') || nation.includes('nepal')) return '네팔';
    if (nation.includes('미얀마') || nation.includes('myanmar') || nation.includes('burma')) return '미얀마';

    return rawNationality;
};

const toStringSafe = (value: unknown, fallback = ''): string => {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : fallback;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return fallback;
};

const toOptionalStringSafe = (value: unknown): string | undefined => {
    const normalized = toStringSafe(value, '');
    return normalized.length > 0 ? normalized : undefined;
};

const toNumberSafe = (value: unknown, fallback = 0): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value.trim());
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
};

const toSafetyLevelSafe = (value: unknown): WorkerRecord['safetyLevel'] => {
    if (value === '고급' || value === '중급' || value === '초급') return value;
    return '초급';
};

const sanitizeRecords = (records: unknown[]): WorkerRecord[] => {
    return records
    .filter((rec): rec is Record<string, unknown> => typeof rec === 'object' && rec !== null)
    .map((r, index) => {
        const rawSource = r.originalImage || r.image || r.photo || r.base64 || r.documentImage || r.file;
        const profileSource = r.profileImage;

        // Ensure unique ID if missing
        const generatedId = `psi-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 6)}`;
        const uniqueId = toStringSafe(r.id, generatedId);

        const baseRecord: WorkerRecord = {
            ...r,
            id: uniqueId,
            name: toStringSafe(r.name, "식별 대기"),
            employeeId: toOptionalStringSafe(r.employeeId),
            qrId: toOptionalStringSafe(r.qrId),
            safetyScore: toNumberSafe(r.safetyScore, 0),
            safetyLevel: toSafetyLevelSafe(r.safetyLevel),
            ocrConfidence: typeof r.ocrConfidence === 'number' ? r.ocrConfidence : 1,
            signatureMatchScore: typeof r.signatureMatchScore === 'number' ? r.signatureMatchScore : undefined,
            matchMethod: (r.matchMethod as WorkerRecord['matchMethod']) || 'unmatched',
            integrityScore: typeof r.integrityScore === 'number' ? r.integrityScore : 100,
            originalImage: normalizeImage(rawSource),
            profileImage: normalizeImage(profileSource),
            date: toStringSafe(r.date, new Date().toISOString().split('T')[0]),
            nationality: normalizeNationality(toStringSafe(r.nationality, "미상")),
            jobField: toStringSafe(r.jobField, "미분류"),
            teamLeader: toStringSafe(r.teamLeader, "미지정"),
            role: r.role || 'worker', 
            filename: toOptionalStringSafe(r.filename),
            strengths: Array.isArray(r.strengths) ? r.strengths.map(item => toStringSafe(item)).filter(Boolean) : [],
            weakAreas: Array.isArray(r.weakAreas) ? r.weakAreas.map(item => toStringSafe(item)).filter(Boolean) : [],
            suggestions: Array.isArray(r.suggestions) ? r.suggestions.map(item => toStringSafe(item)).filter(Boolean) : [],
            strengths_native: Array.isArray(r.strengths_native) ? r.strengths_native.map(item => toStringSafe(item)).filter(Boolean) : [],
            weakAreas_native: Array.isArray(r.weakAreas_native) ? r.weakAreas_native.map(item => toStringSafe(item)).filter(Boolean) : [],
            suggestions_native: Array.isArray(r.suggestions_native) ? r.suggestions_native.map(item => toStringSafe(item)).filter(Boolean) : [],
            handwrittenAnswers: Array.isArray(r.handwrittenAnswers) ? r.handwrittenAnswers : [],
            aiInsights: toStringSafe(r.aiInsights, ""),
            aiInsights_native: toStringSafe(r.aiInsights_native, ""),
            improvement: toStringSafe(r.improvement, ""),
            improvement_native: toStringSafe(r.improvement_native, ""),
            scoreReasoning: Array.isArray(r.scoreReasoning) ? r.scoreReasoning.map(item => toStringSafe(item)).filter(Boolean) : [],
            score_reason: toStringSafe(r.score_reason, ""),
            score_reason_native: toStringSafe(r.score_reason_native, ""),
            actionable_coaching: toStringSafe(r.actionable_coaching, ""),
            actionable_coaching_native: toStringSafe(r.actionable_coaching_native, ""),
            scoreBreakdown: r.scoreBreakdown && typeof r.scoreBreakdown === 'object' ? {
                psychological: toNumberSafe((r.scoreBreakdown as Record<string, unknown>).psychological, 0),
                jobUnderstanding: toNumberSafe((r.scoreBreakdown as Record<string, unknown>).jobUnderstanding, 0),
                riskAssessmentUnderstanding: toNumberSafe((r.scoreBreakdown as Record<string, unknown>).riskAssessmentUnderstanding, 0),
                proficiency: toNumberSafe((r.scoreBreakdown as Record<string, unknown>).proficiency, 0),
                improvementExecution: toNumberSafe((r.scoreBreakdown as Record<string, unknown>).improvementExecution, 0),
                repeatViolationPenalty: toNumberSafe((r.scoreBreakdown as Record<string, unknown>).repeatViolationPenalty, 0),
            } : undefined,
            fullText: toStringSafe(r.fullText, ""),
            koreanTranslation: toStringSafe(r.koreanTranslation, ""),
            language: toStringSafe(r.language, "unknown"),
            correctionHistory: Array.isArray(r.correctionHistory) ? r.correctionHistory : [],
            actionHistory: Array.isArray(r.actionHistory) ? r.actionHistory : [],
            approvalHistory: Array.isArray(r.approvalHistory) ? r.approvalHistory : [],
            auditTrail: Array.isArray(r.auditTrail) ? r.auditTrail : [],
            evidenceHash: toOptionalStringSafe(r.evidenceHash),
            approvalStatus: r.approvalStatus === 'APPROVED' || r.approvalStatus === 'PENDING' || r.approvalStatus === 'OVERRIDDEN' ? r.approvalStatus : undefined,
            approvedBy: toOptionalStringSafe(r.approvedBy),
            approvedAt: toOptionalStringSafe(r.approvedAt),
            approvalReason: toOptionalStringSafe(r.approvalReason),
        };

        return applyIdentityPolicy(baseRecord);
    }).map((record) => {
        const withIntegrity = {
            ...record,
            integrityScore: typeof record.integrityScore === 'number' ? record.integrityScore : deriveIntegrityScore(record),
        };
        return enforceSafetyLevel(withIntegrity);
    });
};

const App: React.FC = () => {
    const [currentPage, setCurrentPage] = useState<Page>('dashboard');
    const [isWorkerKioskMode, setIsWorkerKioskMode] = useState(false);
    const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
    const [adminUnlockError, setAdminUnlockError] = useState('');
    const [isUnlockSubmitting, setIsUnlockSubmitting] = useState(false);
    const [isDataLoaded, setIsDataLoaded] = useState(false);
    const [workerRecords, setWorkerRecords] = useState<WorkerRecord[]>([]);
    const [safetyCheckRecords, setSafetyCheckRecords] = useState<SafetyCheckRecord[]>([]);
    const [briefingData, setBriefingData] = useState<BriefingData | null>(null);
    const [forecastData, setForecastData] = useState<RiskForecastData | null>(null);
    const [modalState, setModalState] = useState<ModalState>({ type: null });
    const [recordForReport, setRecordForReport] = useState<WorkerRecord | null>(null);
    const [isQrScanMode, setIsQrScanMode] = useState(false);
    const [isReanalyzing, setIsReanalyzing] = useState(false);
    const [trainingSessionId, setTrainingSessionId] = useState('');

    // [Ref] Maintain a ref to workerRecords for stable callbacks (prevent stale closures in async handlers)
    const workerRecordsRef = useRef<WorkerRecord[]>([]);
    useEffect(() => {
        workerRecordsRef.current = workerRecords;
    }, [workerRecords]);

    // [NEW] Undo Delete State
    const [deletedRecord, setDeletedRecord] = useState<WorkerRecord | null>(null);
    const [showUndoToast, setShowUndoToast] = useState(false);
    const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const sessionIdFromUrl = new URLSearchParams(window.location.search).get('sessionId') || '';
    const modeFromUrl = new URLSearchParams(window.location.search).get('mode') || '';
    const isWorkerKioskRequest = modeFromUrl === 'worker-kiosk' && Boolean(sessionIdFromUrl);

    useEffect(() => {
        setIsAdminUnlocked(isAdminAuthenticated());
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const qrData = params.get('d');
        const mode = params.get('mode');
        const sessionId = params.get('sessionId');

        if ((mode === 'worker-training' || mode === 'worker-kiosk') && sessionId) {
            setTrainingSessionId(sessionId);
            setIsWorkerKioskMode(mode === 'worker-kiosk');
            setCurrentPage('worker-training');
            return;
        }

        if (qrData) {
            const restored = restoreRecordFromUrl(qrData);
            if (restored) {
                setRecordForReport(applyIdentityPolicy(restored));
                setIsQrScanMode(true);
                setCurrentPage('individual-report');
            }
        }
    }, []);

    const handleAdminUnlock = useCallback((password: string) => {
        setIsUnlockSubmitting(true);
        setAdminUnlockError('');

        if (!verifyAdminPassword(password)) {
            setAdminUnlockError('비밀번호가 올바르지 않습니다.');
            setIsUnlockSubmitting(false);
            return;
        }

        setAdminAuthToken(password);
        setAdminAuthenticated(true);
        setIsAdminUnlocked(true);
        setIsUnlockSubmitting(false);
    }, []);

    useEffect(() => {
        loadWorkerRecordsFromDB().then(data => {
            const sortedData = sanitizeRecords(data).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setWorkerRecords(sortedData);
            setIsDataLoaded(true);

            const thresholds = getSafetyLevelThresholds();
            const expectedMigrationSignature = `criteria-${thresholds.advancedMin}-${thresholds.intermediateMin}`;
            const migrated = localStorage.getItem(SAFETY_LEVEL_MIGRATION_KEY) === expectedMigrationSignature;
            if (!migrated && sortedData.length > 0) {
                void (async () => {
                    try {
                        let changedCount = 0;
                        for (const record of sortedData) {
                            const original = data.find((item) => item?.id === record.id) as WorkerRecord | undefined;
                            if (original?.safetyLevel !== record.safetyLevel) changedCount += 1;
                            await saveRecordToDB(record);
                        }
                        localStorage.setItem(SAFETY_LEVEL_MIGRATION_KEY, expectedMigrationSignature);

                        const report = {
                            runAt: new Date().toISOString(),
                            totalRecords: sortedData.length,
                            changedCount,
                            criteria: `${thresholds.advancedMin}/${thresholds.intermediateMin}`,
                            signature: expectedMigrationSignature,
                        };
                        localStorage.setItem(SAFETY_LEVEL_MIGRATION_REPORT_KEY, JSON.stringify(report));
                        console.info('[PSI][SafetyLevelMigration]', report);
                    } catch (error) {
                        console.warn('Safety level migration skipped:', error);
                    }
                })();
            }
        });
        const savedChecks = localStorage.getItem('psi_safety_checks');
        if (savedChecks) {
            try {
                const parsed = JSON.parse(savedChecks);
                if (Array.isArray(parsed)) {
                    setSafetyCheckRecords(parsed as SafetyCheckRecord[]);
                } else {
                    console.warn('psi_safety_checks 형식이 배열이 아니어서 무시됩니다.');
                }
            } catch (e) {
                console.warn('psi_safety_checks 파싱 실패로 초기값으로 대체합니다.', e);
            }
        }
    }, []);

    // [Updated] Stable Handler using useCallback
    const handleUpdateRecord = useCallback(async (updatedRecord: WorkerRecord) => {
        const normalizedIdentityRecord = applyIdentityPolicy(updatedRecord, workerRecordsRef.current);
        const previous = workerRecordsRef.current.find(r => r.id === normalizedIdentityRecord.id);
        const withCorrection = appendCorrectionHistory(normalizedIdentityRecord, previous, 'manager');
        const baseWithAudit = appendAuditTrail(withCorrection, {
            stage: 'correction',
            timestamp: new Date().toISOString(),
            actor: 'manager',
            note: '기록 수정/검토 반영',
        });
        const identityChanged =
            (updatedRecord.employeeId || '') !== (normalizedIdentityRecord.employeeId || '') ||
            (updatedRecord.qrId || '') !== (normalizedIdentityRecord.qrId || '');

        const withAudit = identityChanged
            ? appendAuditTrail(baseWithAudit, {
                stage: 'validation',
                timestamp: new Date().toISOString(),
                actor: 'system',
                note: `사번/QR ID 표준화 반영 (${normalizedIdentityRecord.employeeId || '-'} / ${normalizedIdentityRecord.qrId || '-'})`,
            })
            : baseWithAudit;
        const nextCompetencyProfile = deriveCompetencyProfile(withAudit);
        const previousWeightVersion = previous?.competencyProfile?.weightVersion;
        const nextWeightVersion = nextCompetencyProfile.weightVersion;

        const withVersionAudit = previousWeightVersion && previousWeightVersion !== nextWeightVersion
            ? appendAuditTrail(withAudit, {
                stage: 'validation',
                timestamp: new Date().toISOString(),
                actor: 'system',
                note: `역량 가중치 버전 변경 반영 (${previousWeightVersion} -> ${nextWeightVersion})`,
            })
            : withAudit;

        const withIntegrity = {
            ...withVersionAudit,
            integrityScore: deriveIntegrityScore(withVersionAudit),
            competencyProfile: nextCompetencyProfile,
        };
        const enforced = enforceSafetyLevel(withIntegrity);
        const hashed = await attachEvidenceHash(enforced);

        setWorkerRecords(prev => prev.map(r => r.id === hashed.id ? hashed : r));
        await saveRecordToDB(hashed);
    }, []);

    // [Updated] Stable Handler with functional updates and Ref access
    const handleDeleteRecord = useCallback(async (id: string) => {
        if(!confirm("정말 이 기록을 삭제하시겠습니까?")) return;
        
        // Use ref to find record without adding dependency
        const targetRecord = workerRecordsRef.current.find(r => r.id === id);
        if (!targetRecord) return;

        // 2. Set for potential undo
        setDeletedRecord(targetRecord);
        setShowUndoToast(true);

        // 3. Clear previous timeout if any
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);

        // 4. Set auto-dismiss
        undoTimeoutRef.current = setTimeout(() => {
            setShowUndoToast(false);
            setDeletedRecord(null);
        }, 5000); // 5 seconds to undo

        // 5. Perform delete (Functional Update for robustness)
        setWorkerRecords(prev => prev.filter(r => r.id !== id));
        await deleteRecordFromDB(id);
    }, []);

    // [Updated] Undo Handler
    const handleUndoDelete = useCallback(async () => {
        if (!deletedRecord) return;

        // Restore to state
        setWorkerRecords(prev => {
            const restored = [...prev, deletedRecord];
            return restored.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        });

        // Restore to DB
        await saveRecordToDB(deletedRecord);

        // Reset Undo State
        setShowUndoToast(false);
        setDeletedRecord(null);
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    }, [deletedRecord]);

    // [Updated] Delete All Handler
    const handleDeleteAll = useCallback(async () => {
        if(!confirm("⚠️ 경고: 모든 데이터가 삭제됩니다.\n\n근로자 기록, 안전 점검 일지, 지적 사항 등 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.\n정말 진행하시겠습니까?")) return;
        
        try {
            await clearDB();
            localStorage.removeItem('psi_safety_checks');
            localStorage.removeItem('psi_site_issues');
            
            setWorkerRecords([]);
            setSafetyCheckRecords([]);
            setBriefingData(null);
            setForecastData(null);
            
            alert("시스템의 모든 데이터가 성공적으로 초기화되었습니다.");
        } catch (e) {
            console.error("Reset Failed:", e);
            alert("데이터 초기화 중 일부 오류가 발생했습니다. 페이지를 새로고침 해주세요.");
        }
    }, []);

    const handleImport = useCallback(async (records: WorkerRecord[]) => {
        const sanitized = sanitizeRecords(records);
        const identityContext = [...workerRecordsRef.current];
        for (const record of sanitized) {
            const normalizedIdentityRecord = applyIdentityPolicy(record, identityContext);
            identityContext.push(normalizedIdentityRecord);
            const withMetrics = {
                ...normalizedIdentityRecord,
                integrityScore: deriveIntegrityScore(normalizedIdentityRecord),
                competencyProfile: deriveCompetencyProfile(normalizedIdentityRecord),
            };
            const enforced = enforceSafetyLevel(withMetrics);
            const hashed = await attachEvidenceHash(enforced);
            await saveRecordToDB(hashed);
        }
        const allData = await loadWorkerRecordsFromDB();
        setWorkerRecords(sanitizeRecords(allData).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    }, []);

    const addWorkerRecords = useCallback(async (newRecords: WorkerRecord[]) => {
        const sanitized = sanitizeRecords(newRecords).map((record) => appendAuditTrail(record, {
            stage: 'ocr',
            timestamp: new Date().toISOString(),
            actor: 'ai-engine',
            note: '신규 OCR 분석 결과 저장',
        }));
        const finalRecords: WorkerRecord[] = [];
        const identityContext = [...workerRecordsRef.current];
        for (const record of sanitized) {
            const normalizedIdentityRecord = applyIdentityPolicy(record, identityContext);
            identityContext.push(normalizedIdentityRecord);
            const withIntegrity = {
                ...normalizedIdentityRecord,
                integrityScore: deriveIntegrityScore(normalizedIdentityRecord),
                competencyProfile: deriveCompetencyProfile(normalizedIdentityRecord),
            };
            const enforced = enforceSafetyLevel(withIntegrity);
            const hashed = await attachEvidenceHash(enforced);
            finalRecords.push(hashed);
            await saveRecordToDB(hashed);
        }
        setWorkerRecords(prev => {
            const combined = [...finalRecords, ...prev];
            const unique = combined.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
            return unique.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        });
    }, []);

    const handleReanalyzeRecord = useCallback(async (record: WorkerRecord): Promise<WorkerRecord | null> => {
        if (!record.originalImage) {
            alert('원본 이미지가 없어 재분석할 수 없습니다. 이미지를 먼저 등록해주세요.');
            return null;
        }
        
        setIsReanalyzing(true);
        try {
            const cleanBase64 = record.originalImage.includes('base64,') 
                ? record.originalImage.split('base64,')[1] 
                : record.originalImage;

            const { analyzeWorkerRiskAssessment } = await import('./services/geminiService');
            const results = await analyzeWorkerRiskAssessment(cleanBase64, 'image/jpeg', record.filename || record.name);
            
            if (results && results.length > 0) {
                const newResult = results[0];
                const updatedRecord: WorkerRecord = {
                    ...newResult,
                    id: record.id, 
                    originalImage: record.originalImage, 
                    profileImage: record.profileImage,
                    date: record.date || new Date().toISOString().split('T')[0],
                    filename: record.filename,
                    role: record.role || newResult.role 
                };
                
                await handleUpdateRecord(updatedRecord);
                setIsReanalyzing(false);
                return updatedRecord;
            }
        } catch (e) {
            console.error("Reanalyze failed", e);
            alert("재분석 중 오류가 발생했습니다.");
        }
        setIsReanalyzing(false);
        return null;
    }, [handleUpdateRecord]);
    
    const shouldBypassAdminGuard = isWorkerKioskRequest || (currentPage === 'worker-training' && isWorkerKioskMode);

    if (!shouldBypassAdminGuard && !isAdminUnlocked) {
        return (
            <ErrorBoundary>
                <AdminLockScreen
                    onUnlock={handleAdminUnlock}
                    errorMessage={adminUnlockError}
                    isSubmitting={isUnlockSubmitting}
                />
            </ErrorBoundary>
        );
    }

    return (
        <ErrorBoundary>
            {currentPage === 'worker-training' && isWorkerKioskMode ? (
                <div className="min-h-screen bg-slate-100 p-4 sm:p-6 lg:p-8">
                    <div className="mx-auto w-full max-w-5xl">
                        <Suspense fallback={<div className="min-h-[240px] flex items-center justify-center"><Spinner /></div>}>
                            <WorkerTraining sessionId={trainingSessionId || sessionIdFromUrl} isKioskMode />
                        </Suspense>
                    </div>
                </div>
            ) : (
                <Layout currentPage={currentPage} setCurrentPage={setCurrentPage}>
                    <Suspense fallback={<div className="min-h-[240px] flex items-center justify-center"><Spinner /></div>}>
                        {currentPage === 'dashboard' && <Dashboard workerRecords={workerRecords} safetyCheckRecords={safetyCheckRecords} setCurrentPage={setCurrentPage} />}
                        {currentPage === 'ocr-analysis' && (
                            <OcrAnalysis 
                                onAnalysisComplete={addWorkerRecords} 
                                existingRecords={workerRecords} 
                                onDeleteAll={handleDeleteAll} 
                                onImport={handleImport} 
                                onViewDetails={(r) => setModalState({type:'workerHistory', record:r, workerName:r.name})} 
                                onOpenReport={(r) => { setRecordForReport(applyIdentityPolicy(r)); setIsQrScanMode(false); setCurrentPage('individual-report'); }}
                                onDeleteRecord={handleDeleteRecord} 
                                onUpdateRecord={handleUpdateRecord} 
                            />
                        )}
                        {currentPage === 'worker-management' && <WorkerManagement workerRecords={workerRecords} onViewDetails={(r) => setModalState({type:'workerHistory', record:r, workerName:r.name})} onUpdateRecord={handleUpdateRecord} />}
                        {currentPage === 'individual-report' && recordForReport && (
                            <IndividualReport 
                                record={recordForReport} 
                                isQrScanMode={isQrScanMode}
                                history={workerRecords.filter(r => r.name === recordForReport.name && r.teamLeader === recordForReport.teamLeader)} 
                                onBack={() => { setRecordForReport(null); setIsQrScanMode(false); setCurrentPage('ocr-analysis'); }} 
                                onUpdateRecord={(updated) => {
                                    const normalized = applyIdentityPolicy(updated, workerRecordsRef.current);
                                    handleUpdateRecord(normalized);
                                    setRecordForReport(normalized);
                                }}
                            />
                        )}
                        {currentPage === 'predictive-analysis' && <PredictiveAnalysis workerRecords={workerRecords} />}
                        {currentPage === 'performance-analysis' && <PerformanceAnalysis workerRecords={workerRecords} />}
                        {currentPage === 'safety-checks' && <SafetyChecks workerRecords={workerRecords} checkRecords={safetyCheckRecords} onAddCheck={(r: unknown) => setSafetyCheckRecords(p => [{...(r as SafetyCheckRecord), id:Date.now().toString()}, ...p])} />}
                        {currentPage === 'site-issue-management' && <SiteIssueManagement />}
                        {currentPage === 'reports' && <Reports workerRecords={workerRecords} briefingData={briefingData} setBriefingData={setBriefingData} forecastData={forecastData} setForecastData={setForecastData} />}
                        {currentPage === 'admin-training' && <AdminTraining />}
                        {currentPage === 'worker-training' && <WorkerTraining sessionId={trainingSessionId} />}
                        {currentPage === 'safety-behavior-management' && <SafetyBehaviorManagement workerRecords={workerRecords} />}
                        {currentPage === 'feedback' && <Feedback />}
                        {currentPage === 'introduction' && <Introduction />}
                        {currentPage === 'settings' && <Settings />}
                    </Suspense>
                </Layout>
            )}
            {modalState.type === 'workerHistory' && modalState.record && <WorkerHistoryModal workerName={modalState.workerName!} allRecords={workerRecords} initialSelectedRecord={modalState.record} onClose={() => setModalState({type:null})} onViewDetails={(r) => setModalState({type:'recordDetail', record:r})} onUpdateRecord={handleUpdateRecord} onDeleteRecord={handleDeleteRecord} />}
            {modalState.type === 'recordDetail' && modalState.record && (() => {
                const latestRecord = workerRecords.find((item) => item.id === modalState.record!.id) || modalState.record!;
                return (
                <RecordDetailModal 
                    record={latestRecord} 
                    onClose={() => setModalState({type:null})} 
                    onBack={() => setModalState({type:'workerHistory', record:latestRecord, workerName:latestRecord.name})} 
                    onUpdateRecord={handleUpdateRecord} 
                    onOpenReport={(r) => { setRecordForReport(applyIdentityPolicy(r)); setIsQrScanMode(false); setCurrentPage('individual-report'); }} 
                    onReanalyze={handleReanalyzeRecord} 
                    isReanalyzing={isReanalyzing} 
                />
                );
            })()}

            {/* Undo Delete Toast */}
            {showUndoToast && (
                <div className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 left-4 sm:left-auto z-[9999] animate-fade-in-up">
                    <div className="bg-slate-900 text-white px-4 sm:px-6 py-3 sm:py-4 rounded-xl sm:rounded-2xl shadow-2xl flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 border border-slate-700">
                        <div className="flex items-center gap-2">
                            <div className="bg-slate-700 p-1.5 rounded-full shrink-0">
                                <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </div>
                            <span className="text-xs sm:text-sm font-bold">기록이 삭제되었습니다.</span>
                        </div>
                        <button 
                            onClick={handleUndoDelete}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg sm:rounded-xl text-xs font-black transition-colors flex items-center justify-center gap-1.5 w-full sm:w-auto"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                            실행 취소 (Undo)
                        </button>
                    </div>
                </div>
            )}
        </ErrorBoundary>
    );
};
export default App;
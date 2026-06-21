import React, { useState, useEffect, useRef, useCallback, Component, Suspense, lazy, type ReactNode, type ErrorInfo } from 'react';
import { Layout } from './components/Layout';
import { AdminLockScreen } from './components/AdminLockScreen';
import { Spinner } from './components/Spinner';
import type { WorkerRecord, SafetyCheckRecord, Page, ModalState, BriefingData, RiskForecastData, HarnessApprovalState, HarnessRiskDecision, HarnessWorkflowState } from './types';
import { WorkerHistoryModal } from './components/modals/WorkerHistoryModal';
import { RecordDetailModal } from './components/modals/RecordDetailModal';
import { restoreRecordFromUrl } from './utils/qrUtils';
import { extractMessage } from './utils/errorUtils';
import { appendAuditTrail, appendCorrectionHistory, attachEvidenceHash, deriveCompetencyProfile, deriveIntegrityScore, enforceSafetyLevel } from './utils/evidenceUtils';
import { applyIdentityPolicy } from './utils/identityUtils';
import {
    isAdminAuthenticated,
    loginAdmin,
    logoutAdmin,
    refreshAdminAuthentication,
    shouldBypassAdminGuardForWorkerTraining,
} from './utils/adminGuard';
import { postAdminJson } from './utils/adminApiClient';
import { getSafetyLevelThresholds } from './utils/safetyLevelUtils';
import { appendBestPracticeSyncFailureLog, setBestPracticeSyncState } from './utils/bestPracticeSyncStatus';
import { useOperationalMode } from './contexts/OperationalModeContext';
import { isPageVisibleByOperationalMode } from './utils/operationalModeUtils';
import { isRouteVisibleInMode } from './config/routeMeta';
import { useUiAudienceMode } from './hooks/useUiAudienceMode';
import {
    applyWorkerUuidPolicy,
    getWorkerMatchScore as getSharedWorkerMatchScore,
    getWorkerUuidValue as getSharedWorkerUuidValue,
    hasAmbiguousStableWorkerMatches,
    isSameWorkerTimeline as isSharedSameWorkerTimeline,
    mergeWorkerRegistrationRecords,
    normalizeWorkerIdentityText,
} from './utils/workerIdentity';
// Removed checklist imports

const DYNAMIC_IMPORT_RELOAD_KEY = 'psi_dynamic_import_reload_once';
const APP_RUNTIME_RECOVERY_RELOAD_KEY = 'psi_app_runtime_recovery_reload_once';

const isDynamicImportFetchError = (message: string): boolean => {
    const normalized = message.toLowerCase();
    return normalized.includes('failed to fetch dynamically imported module')
        || normalized.includes('importing a module script failed')
        || normalized.includes('dynamically imported module')
        || normalized.includes('chunkloaderror')
        || normalized.includes('loading chunk')
        || normalized.includes('fetch dynamically imported');
};

const isRuntimeInitializationError = (message: string): boolean => {
    const normalized = String(message || '').toLowerCase();
    return normalized.includes('cannot access')
        && normalized.includes('before initialization');
};

const triggerAppRuntimeRecoveryReload = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        const hasRetried = sessionStorage.getItem(APP_RUNTIME_RECOVERY_RELOAD_KEY) === '1';
        if (hasRetried) return false;
        sessionStorage.setItem(APP_RUNTIME_RECOVERY_RELOAD_KEY, '1');
        const url = new URL(window.location.href);
        url.searchParams.set('__recover', String(Date.now()));
        window.location.replace(url.toString());
        return true;
    } catch {
        return false;
    }
};

const lazyWithRecovery = <T extends { default: React.ComponentType<any> }>(
    moduleId: string,
    importer: () => Promise<T>,
) => lazy(async () => {
    try {
        const loaded = await importer();
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem(`${DYNAMIC_IMPORT_RELOAD_KEY}:${moduleId}`);
        }
        return loaded;
    } catch (error: unknown) {
        const message = extractMessage(error);
        if (typeof window !== 'undefined' && isDynamicImportFetchError(message)) {
            const retryKey = `${DYNAMIC_IMPORT_RELOAD_KEY}:${moduleId}`;
            const hasRetried = sessionStorage.getItem(retryKey) === '1';
            if (!hasRetried) {
                sessionStorage.setItem(retryKey, '1');
                window.location.reload();
            }
            throw new Error(`동적 모듈 로딩 실패(자동 복구 시도됨): ${message}`);
        }
        throw error instanceof Error ? error : new Error(message);
    }
});

const Dashboard = lazyWithRecovery('Dashboard', () => import('./pages/Dashboard'));
const OcrAnalysis = lazyWithRecovery('OcrAnalysis', () => import('./pages/OcrAnalysis'));
const MonthlyGuidanceReport = lazyWithRecovery('MonthlyGuidanceReport', () => import('./pages/MonthlyGuidanceReport'));
const A4EducationMaterial = lazyWithRecovery('A4EducationMaterial', () => import('./pages/A4EducationMaterial'));
const PptPdfOnePageSummary = lazyWithRecovery('PptPdfOnePageSummary', () => import('./pages/PptPdfOnePageSummary'));
const WorkerManagement = lazyWithRecovery('WorkerManagement', () => import('./pages/WorkerManagement'));
const PredictiveAnalysis = lazyWithRecovery('PredictiveAnalysis', () => import('./pages/PredictiveAnalysis'));
const SafetyChecks = lazyWithRecovery('SafetyChecks', () => import('./pages/SafetyChecks'));
const PerformanceAnalysis = lazyWithRecovery('PerformanceAnalysis', () => import('./pages/PerformanceAnalysis'));
const SiteIssueManagement = lazyWithRecovery('SiteIssueManagement', () => import('./pages/SiteIssueManagement'));
const Reports = lazyWithRecovery('Reports', () => import('./pages/Reports'));
const Feedback = lazyWithRecovery('Feedback', () => import('./pages/Feedback'));
const Introduction = lazyWithRecovery('Introduction', () => import('./pages/Introduction'));
const IndividualReport = lazyWithRecovery('IndividualReport', () => import('./pages/IndividualReport'));
const Settings = lazyWithRecovery('Settings', () => import('./pages/Settings'));
const AdminTraining = lazyWithRecovery('AdminTraining', () => import('./pages/AdminTraining'));
const WorkerTraining = lazyWithRecovery('WorkerTraining', () => import('./pages/WorkerTraining'));
const SafetyBehaviorManagement = lazyWithRecovery('SafetyBehaviorManagement', () => import('./pages/SafetyBehaviorManagement'));
const FieldSafetyComplianceHub = lazyWithRecovery('FieldSafetyComplianceHub', () => import('./pages/FieldSafetyComplianceHub'));
const SurveyIntelligence = lazyWithRecovery('SurveyIntelligence', () => import('./pages/SurveyIntelligence'));
// Mobile 12-screen components (Phase B-2)
const FieldContextInput = lazyWithRecovery('FieldContextInput', () => import('./pages/FieldContextInput'));
const InterventionCoaching = lazyWithRecovery('InterventionCoaching', () => import('./pages/InterventionCoaching'));
const JudgmentTaggingInput = lazyWithRecovery('JudgmentTaggingInput', () => import('./pages/JudgmentTaggingInput'));

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
    declare props: ErrorBoundaryProps;
    declare setState: Component<ErrorBoundaryProps, ErrorBoundaryState>['setState'];

    state: ErrorBoundaryState = { hasError: false, error: null, errorInfo: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error, errorInfo: null };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        const message = String(error?.message || error || '');
        if ((isDynamicImportFetchError(message) || isRuntimeInitializationError(message)) && triggerAppRuntimeRecoveryReload()) {
            return;
        }
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
                        {isDynamicImportFetchError(String(this.state.error?.message || '')) ? (
                            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs font-semibold text-amber-800">
                                배포 직후 파일 해시가 바뀌면서 이전 청크를 참조한 경우입니다. 캐시 새로고침 후 다시 시도해 주세요.
                            </div>
                        ) : null}
                        
                        <div className="bg-slate-100 p-3 sm:p-4 rounded-lg sm:rounded-xl text-left mb-4 sm:mb-6 overflow-auto max-h-32 sm:max-h-40 text-[10px] sm:text-xs font-mono text-slate-600 border border-slate-200">
                            <strong>오류 상세 정보:</strong> {this.state.error?.toString()}
                            <br/>
                            <span className="opacity-50">시스템 진단 정보: {this.state.errorInfo?.componentStack}</span>
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

const saveRecordsToDB = async (records: WorkerRecord[]): Promise<void> => {
    if (records.length === 0) return;
    const db = await initDB();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([WORKER_STORE], 'readwrite');
        const store = tx.objectStore(WORKER_STORE);
        records.forEach((record) => store.put(record));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('백업 일괄 저장 실패'));
        tx.onabort = () => reject(tx.error || new Error('백업 일괄 저장이 중단되었습니다.'));
    });
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

const normalizeIdentityText = (value: unknown): string => {
    return normalizeWorkerIdentityText(value);
};

const getWorkerUuidValue = (record: Partial<WorkerRecord>): string => {
    return getSharedWorkerUuidValue(record);
};

const hasUsableProfileImage = (record: Partial<WorkerRecord>): boolean => {
    return typeof record.profileImage === 'string' && record.profileImage.length > 50;
};

const getComparableDateValue = (date?: string): number => {
    const time = new Date(date || '').getTime();
    return Number.isFinite(time) ? time : 0;
};

const getWorkerMatchScore = (target: Partial<WorkerRecord>, candidate: Partial<WorkerRecord>): number => {
    return getSharedWorkerMatchScore(target, candidate);
};

const findBestWorkerSource = (record: WorkerRecord, existingRecords: WorkerRecord[]): WorkerRecord | null => {
    const candidates = existingRecords.filter((candidate) => candidate.id !== record.id);
    if (hasAmbiguousStableWorkerMatches(record, candidates)) return null;

    return candidates
        .map((candidate) => ({
            candidate,
            score: getWorkerMatchScore(record, candidate),
        }))
        .filter((item) => item.score >= 55)
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (Number(hasUsableProfileImage(b.candidate)) !== Number(hasUsableProfileImage(a.candidate))) {
                return Number(hasUsableProfileImage(b.candidate)) - Number(hasUsableProfileImage(a.candidate));
            }
            return getComparableDateValue(b.candidate.date) - getComparableDateValue(a.candidate.date);
        })[0]?.candidate || null;
};

const isSameWorkerTimeline = (base: Partial<WorkerRecord>, candidate: Partial<WorkerRecord>): boolean => {
    return isSharedSameWorkerTimeline(base, candidate);
};

const ensureWorkerUuid = (record: WorkerRecord, existingRecords: WorkerRecord[] = []): WorkerRecord => {
    const existingUuid = getWorkerUuidValue(record);

    if (existingUuid) {
        return applyWorkerUuidPolicy(record);
    }

    const source = findBestWorkerSource(record, existingRecords);
    const sourceUuid = source ? getWorkerUuidValue(source) : '';
    return applyWorkerUuidPolicy(record, sourceUuid);
};

const applyWorkerProfilePolicy = (record: WorkerRecord, existingRecords: WorkerRecord[]): WorkerRecord => {
    const source = findBestWorkerSource(record, existingRecords);
    if (!source) return ensureWorkerUuid(record, existingRecords);

    return ensureWorkerUuid({
        ...record,
        employeeId: record.employeeId || source.employeeId,
        qrId: record.qrId || source.qrId,
        profileImage: record.profileImage || source.profileImage,
    }, existingRecords);
};

const registerWorkersToServer = async (records: WorkerRecord[]) => {
    try {
        const registrationRecords = mergeWorkerRegistrationRecords(records);

        const ALLOWED_JOB_FIELDS_CLIENT = [
            '형틀', '철근', '갱폼', '알폼', '시스템', '관리', '바닥미장', '할석미장견출', '해체정리', '직영', '용역', '콘크리트비계'
        ];
        const JOB_FIELD_ALIASES_CLIENT: Record<string, string> = {
            '형틀': '형틀', '철근': '철근', '갱폼': '갱폼', '알폼': '알폼', '시스템': '시스템', '관리': '관리', '관리도': '관리',
            '바닥미장': '바닥미장', '바닥 미장': '바닥미장', '할석미장견출': '할석미장견출', '해체정리': '해체정리',
            '직영(용역포함)': '직영', '직영용역포함': '직영', '직영': '직영', '용역': '용역', '콘크리트비계': '콘크리트비계'
        };
        const clientNormalizeJobField = (raw: string): string => {
            const base = String(raw || '').trim();
            if (!base) return '직영';
            const compact = base.replace(/\s+/g, '');
            const resolved = JOB_FIELD_ALIASES_CLIENT[compact] || JOB_FIELD_ALIASES_CLIENT[base] || base;
            return ALLOWED_JOB_FIELDS_CLIENT.includes(resolved) ? resolved : '직영';
        };

        const workersToRegister = registrationRecords
            .filter((w) => String(w.name || '').trim() && String(w.jobField || w.job_field || '').trim())
            .map(w => {
                const phone = String(w.phone_number || w.phoneNumber || '').replace(/\D/g, '');
                const birth = String(w.birth_date || w.birthDate || '').replace(/\D/g, '');
                const passport = String(w.passport_number || w.passportNumber || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

                const finalBirth = (!phone && !birth && !passport) ? '000000' : birth;

                return {
                    name: w.name,
                    nationality: w.nationality || '미상',
                    job_field: clientNormalizeJobField(String(w.jobField || w.job_field || '')),
                    team_name: w.teamLeader || w.team_name || '미지정',
                    phone_number: phone || null,
                    birth_date: finalBirth || null,
                    passport_number: passport || null
                };
            });

        if (workersToRegister.length > 0) {
            await postAdminJson('/api/admin/safety-management', {
                action: 'bulk-upload-workers',
                payload: { workers: workersToRegister }
            }, {
                fallbackMessage: '근로자 서버 등록 실패'
            });
            console.log(`[Import] Registered ${workersToRegister.length} workers on server.`);
        }
    } catch (apiErr) {
        console.warn('[Import] Server worker registration failed:', apiErr);
    }
};

const reconcileWorkerProfiles = (records: WorkerRecord[]): { records: WorkerRecord[]; changedIds: string[] } => {
    const sorted = [...records].sort((a, b) => {
        const stableIdentityDelta = Number(Boolean(getWorkerUuidValue(b))) - Number(Boolean(getWorkerUuidValue(a)));
        return stableIdentityDelta || getComparableDateValue(b.date) - getComparableDateValue(a.date);
    });
    const resolved: WorkerRecord[] = [];
    const changedIds: string[] = [];

    for (const record of sorted) {
        const profileAware = applyWorkerProfilePolicy(record, resolved);
        const normalizedIdentity = applyIdentityPolicy(profileAware, resolved);
        const unified = ensureWorkerUuid(normalizedIdentity, resolved);
        const changed =
            unified.worker_uuid !== record.worker_uuid ||
            unified.workerUuid !== record.workerUuid ||
            unified.employeeId !== record.employeeId ||
            unified.qrId !== record.qrId ||
            unified.profileImage !== record.profileImage;

        resolved.push(changed
            ? {
                ...unified,
                auditTrail: [
                    ...(unified.auditTrail || []),
                    {
                        stage: 'validation' as const,
                        timestamp: new Date().toISOString(),
                        actor: 'system',
                        note: '동일 근로자 식별자/프로필 자동 정렬',
                    },
                ],
            }
            : unified);

        if (changed) {
            changedIds.push(record.id);
        }
    }

    return {
        records: resolved.sort((a, b) => getComparableDateValue(b.date) - getComparableDateValue(a.date)),
        changedIds,
    };
};

const normalizeNationality = (rawNationality: string): string => {
    if (!rawNationality) return '미상';

    const nation = rawNationality.trim().toLowerCase();
    if (nation.includes('한국') || nation.includes('korea') || nation.includes('rok') || nation.includes('south korea')) {
        return '대한민국';
    }

    if (nation.includes('베트남') || nation.includes('vietnam') || nation.includes('việt') || nation.includes('viet nam') || nation.includes('越南')) return '베트남';
    if (nation.includes('중국') || nation.includes('china') || nation.includes('中国') || nation.includes('중화')) return '중국';
    if (nation.includes('태국') || nation.includes('thailand')) return '태국';
    if (nation.includes('우즈벡') || nation.includes('uzbekistan')) return '우즈베키스탄';
    if (nation.includes('인도네시아') || nation.includes('indonesia') || nation.includes('indonesian')) return '인도네시아';
    if (nation.includes('캄보디아') || nation.includes('cambodia') || nation.includes('cambodian') || nation.includes('កម្ពុជា')) return '캄보디아';
    if (nation.includes('몽골') || nation.includes('mongolia') || nation.includes('монгол')) return '몽골';
    if (nation.includes('필리핀') || nation.includes('philippines')) return '필리핀';
    if (nation.includes('카자흐') || nation.includes('kazakhstan')) return '카자흐스탄';
    if (nation.includes('러시아') || nation.includes('russia') || nation.includes('росси') || nation.includes('русск') || nation.includes('рф')) return '러시아';
    if (nation.includes('네팔') || nation.includes('nepal')) return '네팔';
    if (nation.includes('미얀마') || nation.includes('myanmar') || nation.includes('burma') || nation.includes('မြန်မာ')) return '미얀마';

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

const toOcrStatusSafe = (value: unknown): WorkerRecord['ocrStatus'] | undefined => {
    switch (value) {
        case 'TEXT_READY':
        case 'OCR_REQUIRED':
        case 'TEXT_ONLY_REVIEW':
            return value;
        default:
            return undefined;
    }
};

const toWorkflowStateSafe = (value: unknown): HarnessWorkflowState | undefined => {
    switch (value) {
        case 'uploaded':
        case 'ocr_validating':
        case 'manual_review_required':
        case 'context_ready':
        case 'first_pass_analyzing':
        case 'evaluator_review':
        case 'awaiting_manager_approval':
        case 'manager_revised':
        case 'second_pass_analyzing':
        case 'completed':
            return value;
        default:
            return undefined;
    }
};

const toRiskDecisionSafe = (value: unknown): HarnessRiskDecision | undefined => {
    switch (value) {
        case 'SAFE_TO_PROCEED':
        case 'SUPPLEMENTARY_REVIEW':
        case 'IMMEDIATE_ATTENTION':
        case 'CRITICAL_STOP':
            return value;
        default:
            return undefined;
    }
};

const toApprovalStateSafe = (value: unknown): HarnessApprovalState | undefined => {
    switch (value) {
        case 'NOT_REQUIRED':
        case 'REQUIRED':
        case 'PENDING':
        case 'APPROVED':
        case 'REJECTED':
            return value;
        default:
            return undefined;
    }
};

const sanitizeRecords = (records: unknown[]): WorkerRecord[] => {
    return records
    .filter((rec): rec is Record<string, unknown> => typeof rec === 'object' && rec !== null)
    .map((r, index) => {
        const rawSource = r.originalImage || r.image || r.photo || r.base64 || r.documentImage || r.file;
        const profileSource = r.profileImage;
        const normalizedOriginalImage = normalizeImage(rawSource);
        const normalizedProfileImage = normalizeImage(profileSource);
        const hasOcrFailureSignal =
            String((r as { ocrErrorType?: unknown }).ocrErrorType || '').trim().length > 0 ||
            String((r as { ocrFailureCode?: unknown }).ocrFailureCode || '').trim().length > 0;
        const resolvedOcrStatus = toOcrStatusSafe(r.ocrStatus)
            || (hasOcrFailureSignal
                ? (normalizedOriginalImage ? 'OCR_REQUIRED' : 'TEXT_ONLY_REVIEW')
                : 'TEXT_READY');

        // Ensure unique ID if missing
        const generatedId = `psi-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 6)}`;
        const uniqueId = toStringSafe(r.id, generatedId);

        const baseRecord: WorkerRecord = {
            ...r,
            id: uniqueId,
            worker_uuid: toOptionalStringSafe(r.worker_uuid),
            workerUuid: toOptionalStringSafe(r.workerUuid),
            name: toStringSafe(r.name, "식별 대기"),
            employeeId: toOptionalStringSafe(r.employeeId),
            qrId: toOptionalStringSafe(r.qrId),
            safetyScore: toNumberSafe(r.safetyScore, 0),
            safetyLevel: toSafetyLevelSafe(r.safetyLevel),
            ocrConfidence: typeof r.ocrConfidence === 'number' ? r.ocrConfidence : (hasOcrFailureSignal ? 0 : 1),
            ocrStatus: resolvedOcrStatus,
            signatureMatchScore: typeof r.signatureMatchScore === 'number' ? r.signatureMatchScore : undefined,
            matchMethod: (r.matchMethod as WorkerRecord['matchMethod']) || 'unmatched',
            integrityScore: typeof r.integrityScore === 'number' ? r.integrityScore : 100,
            originalImage: normalizedOriginalImage,
            profileImage: normalizedProfileImage,
            date: toStringSafe(r.date, new Date().toISOString().split('T')[0]),
            nationality: normalizeNationality(toStringSafe(r.nationality, "미상")),
            jobField: toStringSafe(r.jobField, "미분류"),
            teamLeader: toStringSafe(r.teamLeader, "미지정"),
            role: (r.role === 'worker' || r.role === 'leader' || r.role === 'sub_leader') ? r.role : 'worker', 
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
            selfAssessedRiskLevel:
                r.selfAssessedRiskLevel === '상' || r.selfAssessedRiskLevel === '중' || r.selfAssessedRiskLevel === '하'
                    ? r.selfAssessedRiskLevel
                    : '중',
            correctionHistory: Array.isArray(r.correctionHistory) ? r.correctionHistory : [],
            actionHistory: Array.isArray(r.actionHistory) ? r.actionHistory : [],
            approvalHistory: Array.isArray(r.approvalHistory) ? r.approvalHistory : [],
            auditTrail: Array.isArray(r.auditTrail) ? r.auditTrail : [],
            evidenceHash: toOptionalStringSafe(r.evidenceHash),
            approvalStatus: r.approvalStatus === 'APPROVED' || r.approvalStatus === 'PENDING' || r.approvalStatus === 'OVERRIDDEN' ? r.approvalStatus : undefined,
            approvedBy: toOptionalStringSafe(r.approvedBy),
            approvedAt: toOptionalStringSafe(r.approvedAt),
            approvalReason: toOptionalStringSafe(r.approvalReason),
            reviewStatus: r.reviewStatus === 'APPROVED' || r.reviewStatus === 'REJECTED' || r.reviewStatus === 'PENDING' ? r.reviewStatus : undefined,
            adminComment: toOptionalStringSafe(r.adminComment),
            reviewReason: toOptionalStringSafe(r.reviewReason),
            secondPassStatus: r.secondPassStatus === 'NEEDED' || r.secondPassStatus === 'IN_PROGRESS' || r.secondPassStatus === 'DONE' ? r.secondPassStatus : undefined,
            workflowRunId: toOptionalStringSafe(r.workflowRunId),
            workflowState: toWorkflowStateSafe(r.workflowState),
            riskDecision: toRiskDecisionSafe(r.riskDecision),
            approvalState: toApprovalStateSafe(r.approvalState),
            harnessPersistenceWarning: toOptionalStringSafe(r.harnessPersistenceWarning),
        };

        const withIdentity = applyIdentityPolicy(baseRecord);
        return withIdentity;
    }).map((record) => {
        const withIntegrity = {
            ...record,
            integrityScore: typeof record.integrityScore === 'number' ? record.integrityScore : deriveIntegrityScore(record),
        };
        return enforceSafetyLevel(withIntegrity);
    });
};

const App: React.FC = () => {
    const { mode: operationalMode } = useOperationalMode();
    const uiAudienceMode = useUiAudienceMode();
    const [currentPage, setCurrentPage] = useState<Page>('dashboard');
    // Checklist gate is deactivated by default
    const [isWorkerKioskMode, setIsWorkerKioskMode] = useState(false);
    const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
    const [isAdminAuthChecking, setIsAdminAuthChecking] = useState(true);
    const [adminUnlockError, setAdminUnlockError] = useState('');
    const [isUnlockSubmitting, setIsUnlockSubmitting] = useState(false);
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
    const queuedEmbeddingKeysRef = useRef<Set<string>>(new Set());

    const queueBestPracticeEmbedding = useCallback((record: WorkerRecord) => {
        const isFinalized =
            record.reviewStatus === 'APPROVED' ||
            record.approvalStatus === 'APPROVED' ||
            record.approvalStatus === 'OVERRIDDEN';
        if (!isFinalized) return;
        if ((record.ocrErrorType || '').trim()) return;
        const score = typeof record.safetyScore === 'number' ? record.safetyScore : 0;
        if (score < 80) return;

        const koreanText = String(record.koreanTranslation || record.fullText || '').trim();
        if (koreanText.length < 20) return;

        const dedupeKey = `${record.id}:${record.evidenceHash || ''}:${Math.round(score)}`;
        if (queuedEmbeddingKeysRef.current.has(dedupeKey)) return;
        queuedEmbeddingKeysRef.current.add(dedupeKey);

        if (!isAdminAuthenticated()) return;

        const body = {
            sourceRecordId: record.id,
            safetyScore: score,
            koreanText,
            originalLanguage: String(record.language || '').trim() || 'ko',
            actionableCoaching: String(record.actionable_coaching || '').trim(),
            jobField: String(record.jobField || '').trim(),
            nationality: String(record.nationality || '').trim(),
            approvedAt: record.approvedAt || new Date().toISOString(),
        };

        const nowIso = new Date().toISOString();
        setBestPracticeSyncState({
            status: 'pending',
            lastAttemptAt: nowIso,
            message: `우수사례 임베딩 저장 시도 중 (${record.name})`,
        });

        void fetch('/api/gateway?action=ocr.upsert-best-practice', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            keepalive: true,
        })
            .then(async (response) => {
                if (!response.ok) {
                    const detail = await response.text().catch(() => '');
                    const failMessage = `동기화 실패(${response.status}): ${detail.slice(0, 120) || '응답 오류'}`;
                    setBestPracticeSyncState({
                        status: 'failed',
                        lastAttemptAt: nowIso,
                        message: failMessage,
                    });
                    appendBestPracticeSyncFailureLog(failMessage);
                    return;
                }

                setBestPracticeSyncState({
                    status: 'success',
                    lastAttemptAt: nowIso,
                    lastSuccessAt: new Date().toISOString(),
                    message: `우수사례 동기화 완료 (${record.name}, ${Math.round(score)}점)`,
                });
            })
            .catch((error) => {
                const msg = extractMessage(error);
                const failMessage = `동기화 실패: ${msg}`;
                setBestPracticeSyncState({
                    status: 'failed',
                    lastAttemptAt: nowIso,
                    message: failMessage,
                });
                appendBestPracticeSyncFailureLog(failMessage);
                console.warn('[best-practice] background upsert failed:', msg);
            });
    }, []);

    const sessionIdFromUrl = new URLSearchParams(window.location.search).get('sessionId') || '';
    const modeFromUrl = new URLSearchParams(window.location.search).get('mode') || '';
    const isWorkerKioskRequest = modeFromUrl === 'worker-kiosk' && Boolean(sessionIdFromUrl);

    useEffect(() => {
        let active = true;
        void refreshAdminAuthentication().then((authenticated) => {
            if (!active) return;
            setIsAdminUnlocked(authenticated);
            setIsAdminAuthChecking(false);
        });
        return () => {
            active = false;
        };
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

    useEffect(() => {
        if (!import.meta.env.DEV || typeof window === 'undefined') return;
        (window as any).__setCurrentPage = (page: Page) => {
            setCurrentPage(page);
        };
        return () => {
            delete (window as any).__setCurrentPage;
        };
    }, []);

    useEffect(() => {
        if (currentPage === 'ppt-pdf-one-page-summary') return;
        const isKioskTrainingFlow = currentPage === 'worker-training' && isWorkerKioskMode;
        if (isKioskTrainingFlow) return;
        // 운영 모드 기반 가드
        if (!isPageVisibleByOperationalMode(currentPage, operationalMode)) {
            setCurrentPage('dashboard');
            return;
        }
        // 역할(UiAudienceMode) 기반 가드 — 사이드바 표시 조건과 동일하게 맞춤
        if (!isRouteVisibleInMode(currentPage, uiAudienceMode)) {
            setCurrentPage('dashboard');
            return;
        }
    }, [currentPage, operationalMode, uiAudienceMode, isWorkerKioskMode]);

    const navigateToPage = useCallback((page: Page) => {
        // 운영 모드 기반 방어
        if (!isPageVisibleByOperationalMode(page, operationalMode)) {
            setCurrentPage('dashboard');
            return;
        }
        // 역할(UiAudienceMode) 기반 방어 — 사이드바 표시 조건과 동일하게 맞춤
        if (!isRouteVisibleInMode(page, uiAudienceMode)) {
            setCurrentPage('dashboard');
            return;
        }
        setCurrentPage(page);
    }, [operationalMode, uiAudienceMode]);

    const handleAdminUnlock = useCallback(async (password: string) => {
        setIsUnlockSubmitting(true);
        setAdminUnlockError('');
        try {
            await loginAdmin(password);
            setIsAdminUnlocked(true);
        } catch (error) {
            setAdminUnlockError(error instanceof Error ? error.message : '관리자 로그인에 실패했습니다.');
        } finally {
            setIsUnlockSubmitting(false);
        }
    }, []);

    const handleAdminLogout = useCallback(async () => {
        await logoutAdmin();
        setIsAdminUnlocked(false);
        setCurrentPage('dashboard');
    }, []);

    useEffect(() => {
        loadWorkerRecordsFromDB().then(async (data) => {
            const qaSeedMode = typeof window !== 'undefined'
                ? new URL(window.location.href).searchParams.get('qaSeed')
                : null;
            const isQaSeedAllowed = import.meta.env.DEV || import.meta.env.VITE_ENABLE_QA_SEED === 'true';
            const useQaSeed = isQaSeedAllowed && (qaSeedMode === 'multilang' || qaSeedMode === 'multilang-force');
            const forceQaSeed = qaSeedMode === 'multilang-force';
            let sourceData: unknown[] = data;

            if (useQaSeed && (forceQaSeed || data.length === 0)) {
                const mockDataModule = await import('./mockData');
                sourceData = mockDataModule.qaBilingualWorkerSeedRecords as unknown[];
            }

            const sanitizedData = sanitizeRecords(sourceData).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const reconciled = reconcileWorkerProfiles(sanitizedData);
            setWorkerRecords(reconciled.records);

            if (useQaSeed && (forceQaSeed || data.length === 0) && reconciled.records.length > 0) {
                void (async () => {
                    try {
                        for (const record of reconciled.records) {
                            await saveRecordToDB(record);
                        }
                        console.info('[PSI][QASeed] 다국어 QA 검증용 데이터가 DB에 주입되었습니다.', {
                            count: reconciled.records.length,
                            mode: qaSeedMode,
                        });
                    } catch (error) {
                        console.warn('[PSI][QASeed] 검증용 데이터 저장 실패:', error);
                    }
                })();
            }

            if (reconciled.changedIds.length > 0) {
                void (async () => {
                    try {
                        for (const record of reconciled.records.filter((item) => reconciled.changedIds.includes(item.id))) {
                            await saveRecordToDB(record);
                        }
                        console.info('[PSI][WorkerProfileReconcile]', {
                            changedCount: reconciled.changedIds.length,
                        });
                    } catch (error) {
                        console.warn('Worker profile reconcile save skipped:', error);
                    }
                })();
            }

            const thresholds = getSafetyLevelThresholds();
            const expectedMigrationSignature = `criteria-${thresholds.advancedMin}-${thresholds.intermediateMin}`;
            const migrated = localStorage.getItem(SAFETY_LEVEL_MIGRATION_KEY) === expectedMigrationSignature;
            if (!migrated && reconciled.records.length > 0) {
                void (async () => {
                    try {
                        let changedCount = 0;
                        for (const record of reconciled.records) {
                            const original = data.find((item) => item?.id === record.id) as WorkerRecord | undefined;
                            if (original?.safetyLevel !== record.safetyLevel) changedCount += 1;
                            await saveRecordToDB(record);
                        }
                        localStorage.setItem(SAFETY_LEVEL_MIGRATION_KEY, expectedMigrationSignature);

                        const report = {
                            runAt: new Date().toISOString(),
                            totalRecords: reconciled.records.length,
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
        const profileAwareRecord = applyWorkerProfilePolicy(updatedRecord, workerRecordsRef.current);
        const normalizedIdentityRecord = applyIdentityPolicy(profileAwareRecord, workerRecordsRef.current);
        const unifiedWorkerRecord = ensureWorkerUuid(normalizedIdentityRecord, workerRecordsRef.current);
        const previous = workerRecordsRef.current.find(r => r.id === unifiedWorkerRecord.id);
        const withCorrection = appendCorrectionHistory(unifiedWorkerRecord, previous, 'manager');
        const baseWithAudit = appendAuditTrail(withCorrection, {
            stage: 'correction',
            timestamp: new Date().toISOString(),
            actor: 'manager',
            note: '기록 수정/검토 반영',
        });
        const identityChanged =
            (updatedRecord.employeeId || '') !== (unifiedWorkerRecord.employeeId || '') ||
            (updatedRecord.qrId || '') !== (unifiedWorkerRecord.qrId || '');

        const withAudit = identityChanged
            ? appendAuditTrail(baseWithAudit, {
                stage: 'validation',
                timestamp: new Date().toISOString(),
                actor: 'system',
                note: `관리 식별/QR 표준화 반영 (${normalizedIdentityRecord.employeeId || '-'} / ${normalizedIdentityRecord.qrId || '-'})`,
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

        const relatedPhotoUpdates = hasUsableProfileImage(hashed)
            ? workerRecordsRef.current
                .filter((record) => record.id !== hashed.id)
                .filter((record) => getWorkerMatchScore(hashed, record) >= 55)
                .filter((record) => record.profileImage !== hashed.profileImage)
                .map((record) => ({
                    ...record,
                    worker_uuid: hashed.worker_uuid || record.worker_uuid,
                    workerUuid: hashed.workerUuid || record.workerUuid,
                    employeeId: record.employeeId || hashed.employeeId,
                    qrId: record.qrId || hashed.qrId,
                    profileImage: hashed.profileImage,
                    auditTrail: [
                        ...(record.auditTrail || []),
                        {
                            stage: 'correction' as const,
                            timestamp: new Date().toISOString(),
                            actor: 'system',
                            note: '동일 근로자 프로필 사진 자동 동기화',
                        },
                    ],
                }))
            : [];

        setWorkerRecords(prev => prev.map(r => {
            if (r.id === hashed.id) return hashed;
            const synced = relatedPhotoUpdates.find(item => item.id === r.id);
            return synced || r;
        }));
        await saveRecordToDB(hashed);
        for (const record of relatedPhotoUpdates) {
            await saveRecordToDB(record);
        }
        queueBestPracticeEmbedding(hashed);
    }, [queueBestPracticeEmbedding]);

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

    const handleImport = useCallback(async (records: WorkerRecord[]): Promise<WorkerRecord[]> => {
        const sanitized = sanitizeRecords(records);
        const identityContext = [
            ...workerRecordsRef.current,
            ...sanitized.filter((record) => getWorkerUuidValue(record)),
        ];
        const importedIds = new Set<string>();
        const importedRecords: WorkerRecord[] = [];
        for (const record of sanitized) {
            const profileAwareRecord = applyWorkerProfilePolicy(record, identityContext);
            const normalizedIdentityRecord = applyIdentityPolicy(profileAwareRecord, identityContext);
            const unifiedWorkerRecord = ensureWorkerUuid(normalizedIdentityRecord, identityContext);
            identityContext.push(unifiedWorkerRecord);
            const withMetrics = {
                ...unifiedWorkerRecord,
                integrityScore: deriveIntegrityScore(unifiedWorkerRecord),
                competencyProfile: deriveCompetencyProfile(unifiedWorkerRecord),
            };
            const enforced = enforceSafetyLevel(withMetrics);
            const hashed = await attachEvidenceHash(enforced);
            importedIds.add(hashed.id);
            importedRecords.push(hashed);
        }
        await saveRecordsToDB(importedRecords);
        const allData = await loadWorkerRecordsFromDB();
        const mergedImportedData = [...importedRecords, ...allData]
            .filter((record, index, array) => array.findIndex((item) => item.id === record.id) === index);
        const reconciled = reconcileWorkerProfiles(sanitizeRecords(mergedImportedData));
        setWorkerRecords(reconciled.records);
        await saveRecordsToDB(reconciled.records.filter((item) => reconciled.changedIds.includes(item.id)));
        await registerWorkersToServer(records);
        const reviewRecords = reconciled.records.filter((item) => importedIds.has(item.id));
        return reviewRecords.length > 0 ? reviewRecords : importedRecords;
    }, []);

    const addWorkerRecords = useCallback(async (newRecords: WorkerRecord[]) => {
        const sanitized = sanitizeRecords(newRecords).map((record) => appendAuditTrail(record, {
            stage: 'ocr',
            timestamp: new Date().toISOString(),
            actor: 'ai-engine',
            note: '신규 OCR 분석 결과 저장',
        }));
        const finalRecords: WorkerRecord[] = [];
        const identityContext = [
            ...workerRecordsRef.current,
            ...sanitized.filter((record) => getWorkerUuidValue(record)),
        ];
        for (const record of sanitized) {
            const profileAwareRecord = applyWorkerProfilePolicy(record, identityContext);
            const normalizedIdentityRecord = applyIdentityPolicy(profileAwareRecord, identityContext);
            const unifiedWorkerRecord = ensureWorkerUuid(normalizedIdentityRecord, identityContext);
            identityContext.push(unifiedWorkerRecord);
            const withIntegrity = {
                ...unifiedWorkerRecord,
                integrityScore: deriveIntegrityScore(unifiedWorkerRecord),
                competencyProfile: deriveCompetencyProfile(unifiedWorkerRecord),
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
        await registerWorkersToServer(newRecords);
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

            const geminiServiceModule = await import('./services/geminiService');
            const results = await geminiServiceModule.analyzeWorkerRiskAssessment(cleanBase64, 'image/jpeg', record.filename || record.name);
            
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
    
    const shouldBypassAdminGuard = shouldBypassAdminGuardForWorkerTraining({
        currentPage,
        isWorkerKioskMode,
        requestedMode: modeFromUrl,
        sessionId: sessionIdFromUrl,
    });

    if (!shouldBypassAdminGuard && isAdminAuthChecking) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
                <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm font-bold text-slate-600 shadow-lg">
                    관리자 로그인 상태를 확인하고 있습니다.
                </div>
            </div>
        );
    }

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
                <Layout currentPage={currentPage} setCurrentPage={navigateToPage} onAdminLogout={handleAdminLogout}>
                    <Suspense fallback={<div className="min-h-[240px] flex items-center justify-center"><Spinner /></div>}>
                        {currentPage === 'dashboard' && <Dashboard workerRecords={workerRecords} safetyCheckRecords={safetyCheckRecords} setCurrentPage={navigateToPage} />}
                        {currentPage === 'ocr-analysis' && (
                            <OcrAnalysis 
                                onAnalysisComplete={addWorkerRecords} 
                                existingRecords={workerRecords} 
                                onDeleteAll={handleDeleteAll} 
                                onImport={handleImport} 
                                onViewDetails={(r) => setModalState({type:'recordDetail', record:r, source:'ocr-analysis'})}
                                onOpenReport={(r) => { setRecordForReport(applyIdentityPolicy(r)); setIsQrScanMode(false); navigateToPage('individual-report'); }}
                                onDeleteRecord={handleDeleteRecord} 
                                onUpdateRecord={handleUpdateRecord}
                                onNavigateToPredictive={() => navigateToPage('predictive-analysis')}
                                isStartChecklistIncomplete={false}
                            />
                        )}
                        {currentPage === 'monthly-guidance-report' && <MonthlyGuidanceReport workerRecords={workerRecords} />}
                        {currentPage === 'a4-education-material' && <A4EducationMaterial workerRecords={workerRecords} onOpenTraining={() => navigateToPage('admin-training')} />}
                        {currentPage === 'ppt-pdf-one-page-summary' && <PptPdfOnePageSummary workerRecords={workerRecords} onOpenTraining={() => navigateToPage('admin-training')} />}
                        {currentPage === 'worker-management' && <WorkerManagement workerRecords={workerRecords} onViewDetails={(r) => setModalState({type:'workerHistory', record:r, workerName:r.name})} onOpenPhotoRegistration={(r, queueRecordIds) => setModalState({type:'recordDetail', record:r, source:'worker-management-photo-queue', queueRecordIds})} onUpdateRecord={handleUpdateRecord} />}
                        {currentPage === 'individual-report' && recordForReport && (
                            <IndividualReport 
                                record={recordForReport} 
                                isQrScanMode={isQrScanMode}
                                history={workerRecords.filter(r => isSameWorkerTimeline(recordForReport, r))}
                                onBack={() => { setRecordForReport(null); setIsQrScanMode(false); navigateToPage('ocr-analysis'); }} 
                                onUpdateRecord={(updated) => {
                                    const normalized = applyIdentityPolicy(updated, workerRecordsRef.current);
                                    handleUpdateRecord(normalized);
                                    setRecordForReport(normalized);
                                }}
                            />
                        )}
                        {currentPage === 'survey-intelligence' && <SurveyIntelligence workerRecords={workerRecords} />}
                        {currentPage === 'predictive-analysis' && <PredictiveAnalysis workerRecords={workerRecords} onNavigateToPage={navigateToPage} />}
                        {currentPage === 'performance-analysis' && <PerformanceAnalysis workerRecords={workerRecords} />}
                        {currentPage === 'safety-checks' && <SafetyChecks workerRecords={workerRecords} checkRecords={safetyCheckRecords} onAddCheck={(r: unknown) => setSafetyCheckRecords(p => [{...(r as SafetyCheckRecord), id:Date.now().toString()}, ...p])} />}
                        {currentPage === 'site-issue-management' && <SiteIssueManagement workerRecords={workerRecords} />}
                        {currentPage === 'reports' && <Reports workerRecords={workerRecords} briefingData={briefingData} setBriefingData={setBriefingData} forecastData={forecastData} setForecastData={setForecastData} onNavigateToPage={navigateToPage} />}
                        {currentPage === 'admin-training' && <AdminTraining />}
                        {currentPage === 'worker-training' && <WorkerTraining sessionId={trainingSessionId} />}
                        {currentPage === 'safety-behavior-management' && <SafetyBehaviorManagement workerRecords={workerRecords} />}
                        {currentPage === 'safety-compliance-hub' && <FieldSafetyComplianceHub workerRecords={workerRecords} />}
                        {currentPage === 'feedback' && <Feedback />}
                        {currentPage === 'introduction' && <Introduction workerRecords={workerRecords} onNavigateToPage={navigateToPage} />}
                        {currentPage === 'settings' && <Settings workerRecords={workerRecords} />}
                        {currentPage === 'field-context-input' && <FieldContextInput />}
                        {currentPage === 'intervention-coaching' && <InterventionCoaching workerRecords={workerRecords} onNavigateToPage={navigateToPage} />}
                        {currentPage === 'judgment-tagging-input' && <JudgmentTaggingInput />}
                    </Suspense>
                </Layout>
            )}
            {modalState.type === 'workerHistory' && modalState.record && <WorkerHistoryModal workerName={modalState.workerName!} allRecords={workerRecords} initialSelectedRecord={modalState.record} onClose={() => setModalState({type:null})} onViewDetails={(r) => setModalState({type:'recordDetail', record:r})} onUpdateRecord={handleUpdateRecord} onDeleteRecord={handleDeleteRecord} />}
            {modalState.type === 'recordDetail' && modalState.record && (() => {
                const latestRecord = workerRecords.find((item) => item.id === modalState.record!.id) || modalState.record!;
                const hasPhoto = (record: WorkerRecord) => Boolean(typeof record.profileImage === 'string' && record.profileImage.length > 50);
                const queueIds = Array.isArray(modalState.queueRecordIds) ? modalState.queueRecordIds : [];
                const currentQueueIndex = queueIds.findIndex((id) => id === latestRecord.id);
                const nextQueueRecord = currentQueueIndex >= 0
                    ? queueIds
                        .slice(currentQueueIndex + 1)
                        .map((id) => workerRecords.find((item) => item.id === id))
                        .find((item): item is WorkerRecord => Boolean(item) && !hasPhoto(item)) || null
                    : null;
                return (
                <RecordDetailModal 
                    record={latestRecord} 
                    onClose={() => setModalState({type:null})} 
                    onBack={() => (modalState.source === 'worker-management-photo-queue' || modalState.source === 'ocr-analysis') ? setModalState({type:null}) : setModalState({type:'workerHistory', record:latestRecord, workerName:latestRecord.name})}
                    onUpdateRecord={handleUpdateRecord} 
                    onOpenReport={(r) => { setRecordForReport(applyIdentityPolicy(r)); setIsQrScanMode(false); navigateToPage('individual-report'); }} 
                    onReanalyze={handleReanalyzeRecord} 
                    isReanalyzing={isReanalyzing} 
                    queueContext={modalState.source === 'worker-management-photo-queue' ? {
                        currentIndex: currentQueueIndex >= 0 ? currentQueueIndex + 1 : 1,
                        total: queueIds.length,
                        nextRecordName: nextQueueRecord?.name || null,
                    } : undefined}
                    onOpenNextRecord={nextQueueRecord ? (() => setModalState({
                        type:'recordDetail',
                        record: nextQueueRecord,
                        source:'worker-management-photo-queue',
                        queueRecordIds: queueIds,
                    })) : undefined}
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

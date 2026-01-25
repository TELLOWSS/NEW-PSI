import React, { useState, useEffect, useRef, useCallback, Component, type ReactNode, type ErrorInfo } from 'react';
import { Layout } from './components/Layout';
import Dashboard from './pages/Dashboard';
import OcrAnalysis from './pages/OcrAnalysis';
import WorkerManagement from './pages/WorkerManagement';
import PredictiveAnalysis from './pages/PredictiveAnalysis';
import SafetyChecks from './pages/SafetyChecks';
import PerformanceAnalysis from './pages/PerformanceAnalysis';
import SiteIssueManagement from './pages/SiteIssueManagement';
import Reports from './pages/Reports';
import Feedback from './pages/Feedback';
import Introduction from './pages/Introduction';
import IndividualReport from './pages/IndividualReport';
import type { WorkerRecord, SafetyCheckRecord, Page, ModalState, BriefingData, RiskForecastData } from './types';
import { WorkerHistoryModal } from './components/modals/WorkerHistoryModal';
import { RecordDetailModal } from './components/modals/RecordDetailModal';
import { analyzeWorkerRiskAssessment } from './services/geminiService';
import { restoreRecordFromUrl } from './utils/qrUtils';

const IDB_NAME = 'PSI_Enterprise_V4';
const IDB_VERSION = 1;
const WORKER_STORE = 'worker_records';

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
                <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
                    <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200">
                        <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 mb-2">시스템 일시 중단됨</h2>
                        <p className="text-slate-500 mb-6 font-medium">
                            처리 중 예상치 못한 문제가 발생했습니다.<br/>
                            데이터는 안전하게 보존되어 있으니 안심하세요.
                        </p>
                        
                        <div className="bg-slate-100 p-4 rounded-xl text-left mb-6 overflow-auto max-h-40 text-xs font-mono text-slate-600 border border-slate-200">
                            <strong>Error:</strong> {this.state.error?.toString()}
                            <br/>
                            <span className="opacity-50">{this.state.errorInfo?.componentStack}</span>
                        </div>

                        <button 
                            onClick={this.handleReset}
                            className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all hover:-translate-y-1 flex items-center justify-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
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
    r.onupgradeneeded = (e: any) => {
        const db = e.target.result;
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
            request.onsuccess = (e: any) => resolve(e.target.result || []);
            request.onerror = () => resolve([]);
        });
    } catch (e) { 
        console.warn("DB Load failed or not supported", e);
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

const normalizeImage = (imgData: any): string | undefined => {
    if (!imgData) return undefined;
    
    let raw = "";
    if (typeof imgData === 'object') {
        if (imgData.inlineData?.data) raw = imgData.inlineData.data;
        else if (imgData.data) raw = imgData.data;
    } else if (typeof imgData === 'string') {
        raw = imgData;
    }

    if (!raw || raw.length < 50) return undefined;

    if (raw.trim().startsWith('data:image')) {
        return raw.trim();
    }

    const cleanBase64 = raw.replace(/^data:image\/[a-z]+;base64,/, '').replace(/\s/g, '');
    return `data:image/jpeg;base64,${cleanBase64}`;
};

const sanitizeRecords = (records: any[]): WorkerRecord[] => {
    return records.map((r, index) => {
        const rawSource = r.originalImage || r.image || r.photo || r.base64 || r.documentImage || r.file;
        const profileSource = r.profileImage;

        // Ensure unique ID if missing
        const uniqueId = r.id || `psi-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 6)}`;

        return {
            ...r,
            id: uniqueId,
            name: r.name || "식별 대기",
            safetyScore: typeof r.safetyScore === 'number' ? r.safetyScore : 0,
            safetyLevel: r.safetyLevel || '초급',
            originalImage: normalizeImage(rawSource),
            profileImage: normalizeImage(profileSource),
            date: r.date || new Date().toISOString().split('T')[0],
            nationality: r.nationality || "미상",
            jobField: r.jobField || "미분류",
            teamLeader: r.teamLeader || "미지정",
            role: r.role || 'worker', 
            filename: r.filename || undefined,
            strengths: Array.isArray(r.strengths) ? r.strengths : [],
            weakAreas: Array.isArray(r.weakAreas) ? r.weakAreas : [],
            suggestions: Array.isArray(r.suggestions) ? r.suggestions : [],
            strengths_native: Array.isArray(r.strengths_native) ? r.strengths_native : [],
            weakAreas_native: Array.isArray(r.weakAreas_native) ? r.weakAreas_native : [],
            suggestions_native: Array.isArray(r.suggestions_native) ? r.suggestions_native : [],
            handwrittenAnswers: Array.isArray(r.handwrittenAnswers) ? r.handwrittenAnswers : [],
            aiInsights: r.aiInsights || "",
            aiInsights_native: r.aiInsights_native || "",
            improvement: r.improvement || "",
            improvement_native: r.improvement_native || "",
            fullText: r.fullText || "",
            koreanTranslation: r.koreanTranslation || "",
            language: r.language || "unknown"
        };
    });
};

const App: React.FC = () => {
    const [currentPage, setCurrentPage] = useState<Page>('dashboard');
    const [isDataLoaded, setIsDataLoaded] = useState(false);
    const [workerRecords, setWorkerRecords] = useState<WorkerRecord[]>([]);
    const [safetyCheckRecords, setSafetyCheckRecords] = useState<SafetyCheckRecord[]>([]);
    const [briefingData, setBriefingData] = useState<BriefingData | null>(null);
    const [forecastData, setForecastData] = useState<RiskForecastData | null>(null);
    const [modalState, setModalState] = useState<ModalState>({ type: null });
    const [recordForReport, setRecordForReport] = useState<WorkerRecord | null>(null);
    const [isReanalyzing, setIsReanalyzing] = useState(false);

    // [Ref] Maintain a ref to workerRecords for stable callbacks (prevent stale closures in async handlers)
    const workerRecordsRef = useRef<WorkerRecord[]>([]);
    useEffect(() => {
        workerRecordsRef.current = workerRecords;
    }, [workerRecords]);

    // [NEW] Undo Delete State
    const [deletedRecord, setDeletedRecord] = useState<WorkerRecord | null>(null);
    const [showUndoToast, setShowUndoToast] = useState(false);
    const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const qrData = params.get('d');
        if (qrData) {
            const restored = restoreRecordFromUrl(qrData);
            if (restored) {
                setRecordForReport(restored);
                setCurrentPage('individual-report');
            }
        }
    }, []);

    useEffect(() => {
        loadWorkerRecordsFromDB().then(data => {
            const sortedData = sanitizeRecords(data).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setWorkerRecords(sortedData);
            setIsDataLoaded(true);
        });
        const savedChecks = localStorage.getItem('psi_safety_checks');
        if(savedChecks) setSafetyCheckRecords(JSON.parse(savedChecks));
    }, []);

    // [Updated] Stable Handler using useCallback
    const handleUpdateRecord = useCallback(async (updatedRecord: WorkerRecord) => {
        setWorkerRecords(prev => prev.map(r => r.id === updatedRecord.id ? updatedRecord : r));
        await saveRecordToDB(updatedRecord);
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
        for (const record of sanitized) {
            await saveRecordToDB(record);
        }
        const allData = await loadWorkerRecordsFromDB();
        setWorkerRecords(sanitizeRecords(allData).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    }, []);

    const addWorkerRecords = useCallback(async (newRecords: WorkerRecord[]) => {
        const sanitized = sanitizeRecords(newRecords);
        for (const record of sanitized) {
            await saveRecordToDB(record);
        }
        setWorkerRecords(prev => {
            const combined = [...sanitized, ...prev];
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
    
    return (
        <ErrorBoundary>
            <Layout currentPage={currentPage} setCurrentPage={setCurrentPage}>
                {currentPage === 'dashboard' && <Dashboard workerRecords={workerRecords} safetyCheckRecords={safetyCheckRecords} setCurrentPage={setCurrentPage} />}
                {currentPage === 'ocr-analysis' && (
                    <OcrAnalysis 
                        onAnalysisComplete={addWorkerRecords} 
                        existingRecords={workerRecords} 
                        onDeleteAll={handleDeleteAll} 
                        onImport={handleImport} 
                        onViewDetails={(r) => setModalState({type:'workerHistory', record:r, workerName:r.name})} 
                        onDeleteRecord={handleDeleteRecord} 
                        onUpdateRecord={handleUpdateRecord} 
                    />
                )}
                {currentPage === 'worker-management' && <WorkerManagement workerRecords={workerRecords} onViewDetails={(r) => setModalState({type:'workerHistory', record:r, workerName:r.name})} />}
                {currentPage === 'individual-report' && recordForReport && (
                    <IndividualReport 
                        record={recordForReport} 
                        history={workerRecords.filter(r => r.name === recordForReport.name && r.teamLeader === recordForReport.teamLeader)} 
                        onBack={() => { setRecordForReport(null); setCurrentPage('ocr-analysis'); }} 
                        onUpdateRecord={(updated) => {
                            handleUpdateRecord(updated);
                            setRecordForReport(updated);
                        }}
                    />
                )}
                {currentPage === 'predictive-analysis' && <PredictiveAnalysis workerRecords={workerRecords} />}
                {currentPage === 'performance-analysis' && <PerformanceAnalysis workerRecords={workerRecords} />}
                {currentPage === 'safety-checks' && <SafetyChecks workerRecords={workerRecords} checkRecords={safetyCheckRecords} onAddCheck={(r: any) => setSafetyCheckRecords(p => [{...r, id:Date.now().toString()}, ...p])} />}
                {currentPage === 'site-issue-management' && <SiteIssueManagement />}
                {currentPage === 'reports' && <Reports workerRecords={workerRecords} briefingData={briefingData} setBriefingData={setBriefingData} forecastData={forecastData} setForecastData={setForecastData} />}
                {currentPage === 'feedback' && <Feedback />}
                {currentPage === 'introduction' && <Introduction />}
            </Layout>
            {modalState.type === 'workerHistory' && modalState.record && <WorkerHistoryModal workerName={modalState.workerName!} allRecords={workerRecords} initialSelectedRecord={modalState.record} onClose={() => setModalState({type:null})} onViewDetails={(r) => setModalState({type:'recordDetail', record:r})} onUpdateRecord={handleUpdateRecord} onDeleteRecord={handleDeleteRecord} />}
            {modalState.type === 'recordDetail' && modalState.record && (
                <RecordDetailModal 
                    record={modalState.record} 
                    onClose={() => setModalState({type:null})} 
                    onBack={() => setModalState({type:'workerHistory', record:modalState.record, workerName:modalState.record?.name})} 
                    onUpdateRecord={handleUpdateRecord} 
                    onOpenReport={(r) => { setRecordForReport(r); setCurrentPage('individual-report'); }} 
                    onReanalyze={handleReanalyzeRecord} 
                    isReanalyzing={isReanalyzing} 
                />
            )}

            {/* Undo Delete Toast */}
            {showUndoToast && (
                <div className="fixed bottom-6 right-6 z-[9999] animate-fade-in-up">
                    <div className="bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border border-slate-700">
                        <div className="flex items-center gap-2">
                            <div className="bg-slate-700 p-1.5 rounded-full">
                                <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </div>
                            <span className="text-sm font-bold">기록이 삭제되었습니다.</span>
                        </div>
                        <button 
                            onClick={handleUndoDelete}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5"
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
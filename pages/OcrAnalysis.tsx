
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { FileUpload } from '../components/FileUpload';
import { Spinner } from '../components/Spinner';
import { analyzeWorkerRiskAssessment, updateAnalysisBasedOnEdits } from '../services/geminiService';
import type { WorkerRecord } from '../types';
import { fileToBase64 } from '../utils/fileUtils';

const getSafetyLevelClass = (level: '초급' | '중급' | '고급') => {
    switch (level) {
        case '고급': return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
        case '중급': return 'bg-amber-100 text-amber-800 border border-amber-200';
        case '초급': return 'bg-rose-100 text-rose-800 border border-rose-200';
        default: return 'bg-slate-100 text-slate-800';
    }
};

const isManagementRole = (field: string) => 
    /관리|팀장|부장|과장|기사|공무|소장/.test(field);

// [강화된 실패 판단 로직]
const isFailedRecord = (r: WorkerRecord) => 
    r.safetyScore === 0 ||
    !r.aiInsights ||
    r.aiInsights.trim() === "" ||
    r.name.includes('할당량 초과') || 
    r.name.includes('분석 실패') || 
    r.name.includes('이미지 데이터') ||
    (r.aiInsights && (r.aiInsights.includes('API 요청량') || r.aiInsights.includes('오류 상세') || r.aiInsights.includes('이미지') || r.aiInsights.includes('Resource has been exhausted')));

const getFlag = (nationality: string) => {
    const n = (nationality || '').toLowerCase();
    if (n.includes('베트남') || n.includes('vietnam')) return '🇻🇳';
    if (n.includes('중국') || n.includes('china')) return '🇨🇳';
    if (n.includes('태국') || n.includes('thailand')) return '🇹🇭';
    if (n.includes('우즈벡') || n.includes('uzbekistan')) return '🇺🇿';
    if (n.includes('캄보디아') || n.includes('cambodia')) return '🇰🇭';
    if (n.includes('몽골') || n.includes('mongolia')) return '🇲🇳';
    if (n.includes('필리핀')) return '🇵🇭';
    if (n.includes('인도네시아')) return '🇮🇩';
    if (n.includes('카자흐스탄')) return '🇰🇿';
    if (n.includes('네팔')) return '🇳🇵';
    if (n.includes('미얀마')) return '🇲🇲';
    if (n.includes('한국') || n.includes('korea') || n.includes('대한민국')) return '🇰🇷';
    return ''; 
};

const getLeaderIcon = (record: WorkerRecord) => {
    const badges = [];
    if (record.role === 'leader' || (record.name === record.teamLeader)) {
        badges.push(<span key="leader" className="text-yellow-500 text-sm" title="팀장">👑</span>);
    } else if (record.role === 'sub_leader') {
        badges.push(<span key="sub" className="text-slate-400 text-sm font-bold" title="부팀장">🛡️</span>);
    }
    if (record.isTranslator) {
        const flag = getFlag(record.nationality);
        badges.push(<span key="trans" className="text-sm" title="통역 담당">{flag}🗣️</span>);
    }
    if (record.isSignalman) {
        badges.push(<span key="signal" className="text-sm" title="신호수 (장비 유도)">🚦</span>);
    }
    if (badges.length === 0) return null;
    return <span className="flex items-center gap-1">{badges}</span>;
};

interface OcrAnalysisProps {
    onAnalysisComplete: (records: WorkerRecord[]) => void;
    existingRecords: WorkerRecord[];
    onDeleteAll: () => void;
    onImport: (records: WorkerRecord[]) => void;
    onViewDetails: (record: WorkerRecord) => void;
    onDeleteRecord: (recordId: string) => void;
    onUpdateRecord: (record: WorkerRecord) => void;
}

const OcrAnalysis: React.FC<OcrAnalysisProps> = ({ 
    onAnalysisComplete, 
    existingRecords, 
    onDeleteAll, 
    onImport, 
    onViewDetails, 
    onDeleteRecord, 
    onUpdateRecord 
}) => {
    const [files, setFiles] = useState<File[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [progress, setProgress] = useState('');
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
    const [cooldownTime, setCooldownTime] = useState(0); // For UI countdown
    const [searchTerm, setSearchTerm] = useState('');
    const [filterLevel, setFilterLevel] = useState<string>('all');
    const [filterField, setFilterField] = useState<string>('all');
    const [filterLeader, setFilterLeader] = useState<string>('all'); 
    
    // Strict stop control
    const stopRef = useRef<boolean>(false);
    const importInputRef = useRef<HTMLInputElement>(null);

    // Prevent accidental close during analysis
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isAnalyzing) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isAnalyzing]);

    const teamLeaders = useMemo(() => {
        const leaders = new Set(existingRecords.map(r => r.teamLeader || '미지정'));
        return Array.from(leaders).sort();
    }, [existingRecords]);

    const filteredRecords = useMemo(() => {
        return existingRecords.filter(r => {
            const searchStr = `${r.name || ''} ${r.jobField || ''} ${r.nationality || ''}`.toLowerCase();
            const matchesSearch = searchStr.includes(searchTerm.toLowerCase());
            const matchesLevel = filterLevel === 'all' || r.safetyLevel === filterLevel;
            const matchesField = filterField === 'all' || r.jobField === filterField;
            const matchesLeader = filterLeader === 'all' || (r.teamLeader || '미지정') === filterLeader; 
            return matchesSearch && matchesLevel && matchesField && matchesLeader;
        });
    }, [existingRecords, searchTerm, filterLevel, filterField, filterLeader]);

    const recordsWithImages = useMemo(() => {
        return existingRecords.filter(r => r.originalImage && r.originalImage.length > 200);
    }, [existingRecords]);

    const failedRecords = useMemo(() => {
        return existingRecords.filter(r => isFailedRecord(r) && r.originalImage && r.originalImage.length > 200);
    }, [existingRecords]);

    const stopAnalysis = () => {
        stopRef.current = true;
        setProgress('중단 요청 중...');
    };

    // [SMART DELAY] UI countdown included
    const waitWithCountdown = async (seconds: number, messagePrefix: string) => {
        for (let i = seconds; i > 0; i--) {
            if (stopRef.current) throw new Error("STOPPED");
            setCooldownTime(i);
            setProgress(`${messagePrefix} (${i}초 대기 중...)`);
            await new Promise(r => setTimeout(r, 1000));
        }
        setCooldownTime(0);
    };

    const runBatchAnalysis = async (targetRecords: WorkerRecord[], title: string) => {
        const total = targetRecords.length;
        if (total === 0) return alert('재분석할 대상이 없습니다.');
        
        setIsAnalyzing(true);
        setBatchProgress({ current: 0, total });
        stopRef.current = false;
        
        let successCount = 0;
        let failCount = 0;
        let stopped = false;

        // Clone array to avoid index issues if array changes
        const processQueue = [...targetRecords];

        for (let i = 0; i < processQueue.length; i++) {
            if (stopRef.current) { stopped = true; break; }
            
            const record = processQueue[i];
            setBatchProgress(p => ({ ...p, current: i + 1 }));
            setProgress(`[${title}] ${record.name || '미상'} 처리 중...`);
            
            try {
                // 1. Data Integrity Check
                if (!record.originalImage || record.originalImage.length < 500) {
                    console.warn(`Skipping ${record.id}: Image loss.`);
                    const errorRecord: WorkerRecord = {
                        ...record,
                        aiInsights: "❌ 원본 이미지 데이터 소실 (분석 불가)",
                        safetyScore: 0,
                    };
                    onUpdateRecord(errorRecord);
                    failCount++;
                    continue; 
                }

                // 2. Call API with Retry Logic for Rate Limits
                let apiResult = null;
                let retryCount = 0;
                const MAX_RETRIES = 3; 

                while (retryCount < MAX_RETRIES) {
                    try {
                        const results = await analyzeWorkerRiskAssessment(record.originalImage, '', record.filename || record.name);
                        if (results && results.length > 0) {
                            apiResult = results[0];
                            // Check if result itself indicates failure
                            if (apiResult.safetyScore === 0 && apiResult.aiInsights.includes("오류")) {
                                throw new Error(apiResult.aiInsights);
                            }
                            break; // Success!
                        } else {
                            throw new Error("Empty result from AI");
                        }
                    } catch (err: any) {
                        const errMsg = err.message || JSON.stringify(err);
                        
                        // [CRITICAL] Detect Rate Limit (429 or Resource Exhausted)
                        if (errMsg.includes('429') || errMsg.includes('exhausted') || errMsg.includes('quota')) {
                            console.warn(`Rate limit hit for ${record.name}. Cooling down...`);
                            // Wait 60 seconds then retry loop
                            await waitWithCountdown(60, "⚠️ API 할당량 초과! 냉각 중");
                            retryCount++;
                        } else {
                            // Other errors (format, parsing) -> fail immediately
                            throw err; 
                        }
                    }
                }

                if (stopRef.current) { stopped = true; break; }

                if (apiResult) {
                    const updatedRecord: WorkerRecord = {
                        ...apiResult,
                        id: record.id, 
                        originalImage: record.originalImage, 
                        profileImage: record.profileImage, 
                        filename: record.filename,
                        role: record.role !== 'worker' ? record.role : apiResult.role,
                        isTranslator: record.isTranslator || apiResult.isTranslator,
                        isSignalman: record.isSignalman || apiResult.isSignalman
                    };
                    onUpdateRecord(updatedRecord);
                    
                    if (isFailedRecord(updatedRecord)) failCount++;
                    else successCount++;

                    // Standard Rate Limit Buffer (4s)
                    if (i < processQueue.length - 1) {
                        await waitWithCountdown(4, "다음 분석 대기");
                    }

                } else {
                    // Final Failure after retries
                    const errorRecord: WorkerRecord = {
                        ...record,
                        aiInsights: "⛔ 반복적인 API 오류로 분석 실패 (재시도 필요)",
                    };
                    onUpdateRecord(errorRecord);
                    failCount++;
                    // Safety cooldown even on fail
                    await waitWithCountdown(2, "오류 복구 중");
                }

            } catch (err: any) {
                if (err.message === "STOPPED") { stopped = true; break; }
                console.error("Batch Error:", err);
                const errorRecord: WorkerRecord = {
                    ...record,
                    aiInsights: `⛔ 시스템 오류: ${err.message}`,
                };
                onUpdateRecord(errorRecord);
                failCount++;
            }
        }

        setIsAnalyzing(false);
        setProgress('');
        setCooldownTime(0);
        setBatchProgress({ current: 0, total: 0 });
        
        if (stopped) {
            alert(`분석이 중단되었습니다.\n(성공: ${successCount}, 실패: ${failCount})`);
        } else {
            alert(`${title} 완료.\n성공: ${successCount}\n실패: ${failCount}\n\n* 실패 건은 '실패/대기 건 재분석' 버튼으로 다시 시도할 수 있습니다.`);
        }
    };

    const handleBatchTextAnalysis = async () => {
        const targets = filteredRecords;
        const total = targets.length;
        if (total === 0) return alert('대상 없음');
        if (!confirm(`${total}명에 대해 AI 분석을 갱신합니다.`)) return;

        setIsAnalyzing(true);
        setBatchProgress({ current: 0, total });
        stopRef.current = false;

        let successCount = 0;
        let failCount = 0;
        let stopped = false;

        for (let i = 0; i < total; i++) {
            if (stopRef.current) { stopped = true; break; }
            const record = targets[i];
            setBatchProgress(p => ({ ...p, current: i + 1 }));
            setProgress(`갱신 중: ${record.name}`);

            try {
                const updatedAnalysis = await updateAnalysisBasedOnEdits(record);
                if (stopRef.current) { stopped = true; break; }

                if (updatedAnalysis) {
                    onUpdateRecord({ ...record, ...updatedAnalysis });
                    successCount++;
                } else {
                    failCount++;
                }
                if (i < total - 1) await new Promise(r => setTimeout(r, 1500));
            } catch (e: any) {
                if (e.message === "STOPPED") { stopped = true; break; }
                failCount++;
            }
        }

        setIsAnalyzing(false);
        setProgress('');
        setBatchProgress({ current: 0, total: 0 });
        if (stopped) alert('중단됨');
        else alert(`완료: 성공 ${successCount}, 실패 ${failCount}`);
    };

    const handleBatchReanalyze = () => {
        if (confirm(`전체 ${recordsWithImages.length}건 재분석 하시겠습니까?\n\n[주의] 200건 기준 약 20~30분이 소요될 수 있습니다. 브라우저를 닫지 마세요.`)) {
            runBatchAnalysis(recordsWithImages, "전체 재분석");
        }
    };

    const handleRetryFailed = () => {
        if (confirm(`실패 또는 점수 미달인 ${failedRecords.length}건만 재시도 하시겠습니까?`)) {
            runBatchAnalysis(failedRecords, "실패 건 재분석");
        }
    };

    // File Upload Handler (Simple Version)
    const handleAnalyze = async () => {
        // Redirect to file processing which uses same logic if needed, 
        // but typically file upload relies on user adding files first.
        // For mass file upload, we should also implement throttling if > 10 files.
        if (files.length === 0) return;
        
        setIsAnalyzing(true);
        setBatchProgress({ current: 0, total: files.length });
        stopRef.current = false;
        
        const results: WorkerRecord[] = [];
        let stopped = false;
        
        for (let i = 0; i < files.length; i++) {
            if (stopRef.current) { stopped = true; break; }
            setBatchProgress(p => ({ ...p, current: i + 1 }));
            setProgress(`분석 중: ${files[i].name}`);
            
            try {
                const base64 = await fileToBase64(files[i]);
                const res = await analyzeWorkerRiskAssessment(base64, files[i].type, files[i].name);
                
                if (stopRef.current) { stopped = true; break; }

                if (res && res.length > 0) results.push(res[0]);
                
                // Safe buffer for file uploads too
                if (i < files.length - 1) await waitWithCountdown(4, "다음 파일 대기");
                
            } catch (e: any) {
                if (e.message === "STOPPED") { stopped = true; break; }
                console.error(e);
                // For files, we just alert or log, maybe retry logic later
                await waitWithCountdown(60, "API 한도 초과! 대기 중");
                i--; // Retry this file
            }
        }
        
        if (results.length > 0) onAnalysisComplete(results);
        setIsAnalyzing(false);
        setFiles([]);
        setProgress('');
        setCooldownTime(0);
        setBatchProgress({ current: 0, total: 0 });
        if(stopped) alert("중단됨");
    };

    const handleExport = () => {
        if(!confirm("경고: 이미지 데이터가 포함된 백업 파일은 용량이 매우 클 수 있습니다.\n계속하시겠습니까?")) return;
        const dataStr = JSON.stringify(existingRecords, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `PSI_Backup_${new Date().toISOString().slice(0,10)}.json`;
        link.click();
    };

    return (
        <div className="space-y-8 animate-fade-in-up">
            {/* Control Panel */}
            <div className="bg-slate-900 rounded-3xl p-8 shadow-2xl text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -mr-48 -mt-48"></div>
                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-center gap-8">
                    <div className="flex-1 text-center lg:text-left">
                        <h3 className="text-2xl font-black mb-2 flex items-center gap-3 justify-center lg:justify-start">
                            기록 데이터 마스터 관리
                            <span className="text-xs bg-indigo-600 px-2 py-1 rounded-md font-bold uppercase tracking-widest">PRO</span>
                        </h3>
                        <p className="text-slate-400 font-medium">
                            <span className="text-indigo-400 font-bold">스마트 스로틀링(Smart Throttling)</span> 기술이 적용되어, 
                            200명 이상의 대량 데이터도 API 할당량에 맞춰 자동으로 속도를 조절하며 전수 분석합니다.
                        </p>
                        <div className="flex justify-center lg:justify-start gap-8 mt-6">
                            <div className="text-center">
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">총 기록수</p>
                                <p className="text-2xl font-black text-indigo-400">{existingRecords.length}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">분석 실패/대기</p>
                                <p className={`text-2xl font-black ${failedRecords.length > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`}>{failedRecords.length}</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap justify-center gap-3 w-full lg:w-auto">
                        {/* Retry Button */}
                        {failedRecords.length > 0 && !isAnalyzing && (
                            <button 
                                onClick={handleRetryFailed}
                                className="px-6 py-3 bg-rose-600 hover:bg-rose-700 rounded-2xl font-black text-sm shadow-xl transition-all border border-rose-500 flex items-center gap-2 group animate-bounce"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                실패/대기 건 스마트 재분석 ({failedRecords.length})
                            </button>
                        )}
                        
                        {recordsWithImages.length > 0 && !isAnalyzing && (
                            <button 
                                onClick={handleBatchReanalyze}
                                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-2xl font-black text-sm shadow-xl transition-all border border-emerald-500 flex items-center gap-2 group"
                            >
                                <svg className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth={2.5}/></svg>
                                전체 일괄 재분석 (OCR)
                            </button>
                        )}
                        
                        <button onClick={() => importInputRef.current?.click()} className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl font-black text-sm transition-all">JSON 불러오기</button>
                        <input type="file" ref={importInputRef} className="hidden" accept=".json" onChange={(e) => {
                             const file = e.target.files?.[0];
                             if (file) {
                                 const reader = new FileReader();
                                 reader.onload = (re) => {
                                     try {
                                         const data = JSON.parse(re.target?.result as string);
                                         if (Array.isArray(data)) onImport(data);
                                     } catch (err) { alert('파일 형식이 잘못되었습니다.'); }
                                 };
                                 reader.readAsText(file);
                             }
                        }} />
                        <button onClick={handleExport} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-2xl font-black text-sm shadow-xl transition-all">백업 내보내기</button>
                        <button onClick={onDeleteAll} className="px-6 py-3 bg-rose-600 hover:bg-rose-700 rounded-2xl font-black text-sm shadow-xl transition-all">전체 삭제</button>
                    </div>
                </div>

                {/* Progress Bar with Cooldown Indicator */}
                {isAnalyzing && (
                    <div className="mt-8 pt-6 border-t border-white/10 animate-fade-in">
                        <div className="flex justify-between items-end mb-2">
                            <span className={`text-sm font-black uppercase tracking-widest flex items-center gap-2 ${cooldownTime > 0 ? 'text-yellow-400' : 'text-indigo-400'}`}>
                                <span className={`w-2 h-2 rounded-full animate-pulse ${cooldownTime > 0 ? 'bg-yellow-400' : 'bg-indigo-400'}`}></span>
                                {progress}
                            </span>
                            <span className="text-sm font-black">{batchProgress.total > 0 ? Math.round((batchProgress.current / batchProgress.total) * 100) : 0}%</span>
                        </div>
                        <div className="w-full bg-white/10 h-4 rounded-full overflow-hidden mb-4 relative">
                            <div 
                                className={`h-full transition-all duration-300 ease-out ${cooldownTime > 0 ? 'bg-yellow-500' : 'bg-gradient-to-r from-indigo-500 to-emerald-400'}`}
                                style={{ width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%` }}
                            ></div>
                            {cooldownTime > 0 && (
                                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-black/50 uppercase tracking-widest">
                                    API Cooling Down... {cooldownTime}s
                                </div>
                            )}
                        </div>
                        <div className="flex justify-center">
                            <button 
                                onClick={stopAnalysis} 
                                className="px-8 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-sm shadow-xl transition-all flex items-center gap-2 animate-pulse"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                분석 즉시 중단 (STOP)
                            </button>
                        </div>
                        <p className="text-center text-xs text-slate-400 mt-2 font-medium">대량 분석 중입니다. 창을 닫지 마세요.</p>
                    </div>
                )}
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 flex flex-col gap-4 no-print">
                <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="relative flex-1 w-full">
                        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth={2}/></svg>
                        <input type="text" placeholder="근로자 명, 공종 등으로 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold" />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <label className="text-xs font-bold text-slate-500">팀장 필터:</label>
                        <select value={filterLeader} onChange={(e) => setFilterLeader(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold min-w-[120px]">
                            <option value="all">전체</option>
                            {teamLeaders.map(leader => (
                                <option key={leader} value={leader}>{leader}</option>
                            ))}
                        </select>
                    </div>
                    <button 
                        onClick={handleBatchTextAnalysis} 
                        disabled={isAnalyzing}
                        className="px-5 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black text-sm shadow-md transition-all flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        일괄 AI 분석 갱신 (수정반영)
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                <th className="px-8 py-4">근로자 정보</th>
                                <th className="px-8 py-4">공종/직군</th>
                                <th className="px-8 py-4">팀장 (Leader)</th>
                                <th className="px-8 py-4 text-center">안전 점수</th>
                                <th className="px-8 py-4 text-center">이미지 상태</th>
                                <th className="px-8 py-4 text-right">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 font-medium">
                            {filteredRecords.map((r: WorkerRecord) => {
                                const isManager = isManagementRole(r.jobField);
                                const hasImage = r.originalImage && r.originalImage.length > 200;
                                const failed = isFailedRecord(r);
                                
                                return (
                                    <tr key={r.id} className={`hover:bg-indigo-50/30 transition-colors group ${isManager ? 'bg-slate-50/50 opacity-80' : ''} ${failed ? 'bg-rose-50/50' : ''}`}>
                                        <td className="px-8 py-5 font-black text-slate-800">
                                            <div className="flex flex-col">
                                                <span className={`flex items-center gap-1 ${failed ? 'text-rose-600' : ''}`}>
                                                    {r.name}
                                                    {getLeaderIcon(r)}
                                                </span>
                                                <span className="text-[10px] text-slate-400 font-bold tracking-wider">{r.nationality} | {r.date}</span>
                                                {failed && <span className="text-[9px] text-rose-500 font-bold">⚠️ 분석 필요/실패</span>}
                                            </div>
                                        </td>
                                        <td className="px-8 py-5 text-slate-500 font-bold">{r.jobField}</td>
                                        <td className="px-8 py-5 text-slate-600 font-bold text-sm">
                                            {r.teamLeader && r.teamLeader !== '미지정' ? (
                                                <span className={`bg-slate-100 px-2 py-1 rounded border border-slate-200 ${getLeaderIcon(r) ? 'text-indigo-600 font-black border-indigo-200 bg-indigo-50' : 'text-slate-600'}`}>
                                                    {r.teamLeader}
                                                </span>
                                            ) : (
                                                <span className="text-slate-300 text-xs">미지정</span>
                                            )}
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            <span className={`px-3 py-1 rounded-full text-xs font-black shadow-sm ${getSafetyLevelClass(r.safetyLevel)}`}>{r.safetyScore}</span>
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            {hasImage ? (
                                                <span className="text-emerald-500 font-black text-[9px] uppercase">OK</span>
                                            ) : (
                                                <span className="text-rose-400 font-black text-[9px] uppercase bg-rose-100 px-2 py-1 rounded">IMG LOSS</span>
                                            )}
                                        </td>
                                        <td className="px-8 py-5 text-right">
                                            <div className="flex justify-end gap-2">
                                                {failed && !isAnalyzing && hasImage && (
                                                    <button onClick={() => runBatchAnalysis([r], '개별 재분석')} className="px-3 py-2 bg-rose-100 text-rose-600 font-bold text-xs rounded-xl hover:bg-rose-200 transition-all">
                                                        재시도
                                                    </button>
                                                )}
                                                <button onClick={() => onViewDetails(r)} className="px-4 py-2 bg-white border border-slate-200 text-indigo-600 font-black text-xs rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm">상세보기</button>
                                                <button onClick={() => onDeleteRecord(r.id)} className="p-2 bg-slate-100 text-slate-400 hover:bg-rose-500 hover:text-white rounded-xl transition-all" title="삭제">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white p-10 rounded-3xl shadow-xl border border-slate-100 overflow-hidden relative">
                <h3 className="text-2xl font-black text-slate-900 mb-2">신규 기록 분석</h3>
                <FileUpload onFilesChange={setFiles} onAnalyze={() => {}} isAnalyzing={isAnalyzing} fileCount={files.length} />
                {files.length > 0 && !isAnalyzing && (
                    <div className="mt-8 flex justify-center">
                        <button onClick={handleAnalyze} className="w-full max-w-md py-5 bg-indigo-600 text-white text-2xl font-black rounded-2xl shadow-2xl hover:bg-indigo-700 transition-all animate-pulse-gold">신규 분석 시작</button>
                    </div>
                )}
            </div>
        </div>
    );
};
export default OcrAnalysis;

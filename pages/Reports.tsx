
import React, { useState, useRef, useMemo, useEffect } from 'react';
import type { WorkerRecord, BriefingData, RiskForecastData, SafetyCheckRecord } from '../types';
import { ReportTemplate } from '../components/ReportTemplate';

type ReportType = 'worker-report' | 'team-report';
type GenMode = 'combined-pdf' | 'individual-pdf' | 'individual-img';
type ViewMode = 'list' | 'preview';

interface ReportsProps {
    workerRecords?: WorkerRecord[];
    safetyCheckRecords?: SafetyCheckRecord[];
    briefingData: BriefingData | null;
    setBriefingData: (data: BriefingData | null) => void;
    forecastData: RiskForecastData | null;
    setForecastData: (data: RiskForecastData | null) => void;
}

const Reports: React.FC<ReportsProps> = ({ workerRecords = [], safetyCheckRecords = [], briefingData, setBriefingData, forecastData, setForecastData }) => {
    const [activeTab, setActiveTab] = useState<ReportType>('team-report');
    const [isGenerating, setIsGenerating] = useState(false);
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
    
    // 생성 옵션
    const [selectedTeam, setSelectedTeam] = useState('전체');
    const [filterLevel, setFilterLevel] = useState('전체');
    const [genMode, setGenMode] = useState<GenMode>('individual-pdf'); 
    
    // 뷰 모드 및 미리보기 상태
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [previewIndex, setPreviewIndex] = useState(0);
    const previewRef = useRef<HTMLDivElement>(null); // For single capture in preview

    // Bulk Generation State
    const [generatingRecord, setGeneratingRecord] = useState<WorkerRecord | null>(null);
    const [generatingHistory, setGeneratingHistory] = useState<WorkerRecord[]>([]);
    const bulkReportRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<boolean>(false);

    // 공종 목록 추출
    const teams = useMemo(() => ['전체', ...Array.from(new Set(workerRecords.map(r => r.jobField))).sort()], [workerRecords]);

    // 필터링 로직
    const filteredRecords = useMemo(() => {
        let result = workerRecords;
        if (activeTab === 'team-report' && selectedTeam !== '전체') {
            result = result.filter(r => r.jobField === selectedTeam);
        }
        if (filterLevel !== '전체') {
            result = result.filter(r => r.safetyLevel === filterLevel);
        }
        // 최신 데이터 기준 정렬 (이름순)
        return result.sort((a,b) => a.name.localeCompare(b.name));
    }, [workerRecords, activeTab, selectedTeam, filterLevel]);

    // 필터 변경 시 미리보기 인덱스 초기화
    useEffect(() => {
        setPreviewIndex(0);
    }, [selectedTeam, filterLevel, activeTab]);

    // 현재 미리보기 대상 데이터
    const currentPreviewRecord = filteredRecords[previewIndex];
    const currentPreviewHistory = useMemo(() => {
        if (!currentPreviewRecord) return [];
        return workerRecords.filter(r => 
            r.name === currentPreviewRecord.name && 
            (r.teamLeader || '미지정') === (currentPreviewRecord.teamLeader || '미지정')
        );
    }, [currentPreviewRecord, workerRecords]);

    // 렌더링 안정화 대기 함수
    const waitForRender = async (ms: number = 1500) => {
        await new Promise(resolve => setTimeout(resolve, ms)); 
    };

    // [New] 미리보기 네비게이션
    const handlePrev = () => setPreviewIndex(prev => Math.max(0, prev - 1));
    const handleNext = () => setPreviewIndex(prev => Math.min(filteredRecords.length - 1, prev + 1));

    // [Helper] jsPDF Constructor 가져오기
    const getJsPDF = () => {
        const w = window as any;
        if (w.jspdf && w.jspdf.jsPDF) return w.jspdf.jsPDF;
        if (w.jspdf) return w.jspdf;
        return null;
    };

    // [New] 현재 미리보기 보고서 단건 내보내기
    const handleDownloadCurrent = async () => {
        if (!currentPreviewRecord) return alert('내보낼 데이터가 없습니다.');
        if (!previewRef.current) return alert('미리보기 화면이 로드되지 않았습니다.');
        
        const w = window as any;
        if (!w.html2canvas) return alert('html2canvas 라이브러리가 로드되지 않았습니다.');
        
        const JsPDF = getJsPDF();
        if (!JsPDF) return alert('jsPDF 라이브러리가 로드되지 않았습니다.');

        if (!confirm(`'${currentPreviewRecord.name}' 근로자의 보고서를 PDF로 내보내시겠습니까?`)) return;

        try {
            const canvas = await w.html2canvas(previewRef.current, { 
                scale: 2, 
                useCORS: true, 
                logging: false, 
                backgroundColor: '#ffffff',
                windowWidth: 794, 
                windowHeight: 1123
            });
            const imgData = canvas.toDataURL('image/jpeg', 0.9);
            const pdf = new JsPDF('p', 'mm', 'a4');
            pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
            pdf.save(`PSI_Report_${currentPreviewRecord.name}_${currentPreviewRecord.jobField}.pdf`);
        } catch (e) {
            console.error(e);
            alert('PDF 생성 중 오류가 발생했습니다.');
        }
    };

    const handleGenerate = async () => {
        if (filteredRecords.length === 0) return alert('출력할 대상이 없습니다.');

        // 라이브러리 체크
        const w = window as any;
        const missingLibs = [];
        if (!w.html2canvas) missingLibs.push('html2canvas');
        const JsPDF = getJsPDF();
        if (!JsPDF) missingLibs.push('jspdf');
        if (!w.JSZip) missingLibs.push('JSZip');
        if (!w.saveAs) missingLibs.push('FileSaver');

        if (missingLibs.length > 0) {
            return alert(`필수 라이브러리가 로드되지 않았습니다.\n(누락: ${missingLibs.join(', ')})\n\n인터넷 연결을 확인하거나 페이지를 새로고침(F5) 해주세요.`);
        }
        
        const modeLabels: Record<GenMode, string> = {
            'combined-pdf': '통합 PDF 파일 (1개)',
            'individual-pdf': '개별 PDF 파일 (ZIP 압축)',
            'individual-img': '개별 이미지 파일 (ZIP 압축)'
        };

        if (!confirm(`${selectedTeam === '전체' ? '전체 팀' : selectedTeam + ' 팀'}의 근로자 ${filteredRecords.length}명에 대해\n[${modeLabels[genMode]}] 생성을 시작하시겠습니까?\n\n* 주의: 생성 중에는 화면을 닫지 말고 기다려주세요.`)) return;

        // 초기화
        setIsGenerating(true);
        abortRef.current = false;
        setBulkProgress({ current: 0, total: filteredRecords.length });

        const JSZip = w.JSZip;
        const saveAs = w.saveAs;
        const html2canvas = w.html2canvas;

        const zip = new JSZip();
        const timestamp = new Date().toISOString().slice(0,10).replace(/-/g, '');
        const folderName = `PSI_${selectedTeam}_${timestamp}`;
        const folder = zip.folder(folderName);
        
        // Combined PDF용 마스터 인스턴스
        let masterPdf: any = null;
        if (genMode === 'combined-pdf') {
            masterPdf = new JsPDF('p', 'mm', 'a4');
        }

        try {
            for (let i = 0; i < filteredRecords.length; i++) {
                if (abortRef.current) break;

                const record = filteredRecords[i];
                const workerHistory = workerRecords.filter(r => 
                    r.name === record.name && 
                    (r.teamLeader || '미지정') === (record.teamLeader || '미지정')
                );

                // 상태 업데이트 -> 렌더링 트리거
                setGeneratingRecord(record);
                setGeneratingHistory(workerHistory);
                setBulkProgress({ current: i + 1, total: filteredRecords.length });

                // DOM 렌더링 대기 (차트 애니메이션 등 고려)
                await waitForRender(1200);

                if (bulkReportRef.current && !abortRef.current) {
                    try {
                        const canvas = await html2canvas(bulkReportRef.current, { 
                            scale: 2, 
                            useCORS: true, 
                            logging: false, 
                            backgroundColor: '#ffffff',
                            allowTaint: true,
                            windowWidth: 794,
                            windowHeight: 1123
                        });

                        const fileNameBase = `${record.name}_${record.jobField}`;

                        // --- 모드별 분기 처리 ---
                        if (genMode === 'combined-pdf') {
                            const imgData = canvas.toDataURL('image/jpeg', 0.85);
                            if (i > 0) masterPdf.addPage();
                            masterPdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
                        } 
                        else if (genMode === 'individual-pdf') {
                            const imgData = canvas.toDataURL('image/jpeg', 0.85);
                            const tempPdf = new JsPDF('p', 'mm', 'a4');
                            tempPdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
                            // PDF Blob 생성
                            const pdfBlob = tempPdf.output('blob');
                            folder.file(`${fileNameBase}.pdf`, pdfBlob);
                        } 
                        else if (genMode === 'individual-img') {
                            // Canvas Blob 생성
                            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
                            if (blob) folder.file(`${fileNameBase}.jpg`, blob);
                        }
                    } catch (err) {
                        console.error(`[Error] ${record.name} 처리 중 오류:`, err);
                    }
                }
                
                // 메모리 해제를 위한 짧은 딜레이
                await new Promise(r => setTimeout(r, 100));
            }

            if (!abortRef.current) {
                if (genMode === 'combined-pdf') {
                    masterPdf.save(`${folderName}.pdf`);
                } else {
                    const content = await zip.generateAsync({ type: "blob" });
                    saveAs(content,(`${folderName}.zip`));
                }
                alert('생성이 완료되었습니다. 다운로드 폴더를 확인해주세요.');
            } else {
                alert('작업이 중단되었습니다.');
            }

        } catch (e: any) {
            console.error("Critical Error:", e);
            alert(`오류가 발생했습니다: ${e.message}\n브라우저 메모리가 부족할 수 있습니다. 페이지를 새로고침 후 다시 시도해주세요.`);
        } finally {
            setIsGenerating(false);
            setGeneratingRecord(null);
            setGeneratingHistory([]);
        }
    };

    const cancelGeneration = () => {
        if(confirm("작업을 중단하시겠습니까?")) {
            abortRef.current = true;
        }
    };

    return (
        <div className="space-y-6 pb-10 h-full flex flex-col font-sans">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 no-print">
                <h2 className="text-2xl font-black text-slate-900">PSI 정밀 보고서 센터</h2>
                <div className="flex items-center space-x-3 bg-white rounded-lg p-1 shadow-sm border border-slate-200">
                    <span className="text-xs font-bold text-slate-500 pl-3 pr-1">STATUS:</span>
                    <span className="text-xs font-black px-3 uppercase text-indigo-600">
                        System Ready
                    </span>
                </div>
            </div>

            <div className="overflow-x-auto pb-2 -mb-2 shrink-0 no-print">
                <div className="flex space-x-6 border-b border-slate-200 min-w-max">
                    <button onClick={() => setActiveTab('team-report')} className={`pb-4 text-sm font-bold transition-colors relative ${activeTab === 'team-report' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}>
                        팀별 통합 리포트
                        {activeTab === 'team-report' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600"></div>}
                    </button>
                    <button onClick={() => setActiveTab('worker-report')} className={`pb-4 text-sm font-bold transition-colors relative ${activeTab === 'worker-report' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}>
                        전체 근로자 목록
                        {activeTab === 'worker-report' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600"></div>}
                    </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap gap-4 items-end no-print">
                {/* Filters */}
                {activeTab === 'team-report' && (
                    <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">대상 공종 (팀)</label>
                        <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold min-w-[140px]">
                            {teams.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                )}
                <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">등급 필터</label>
                    <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold min-w-[120px]">
                        <option value="전체">전체 등급</option>
                        <option value="초급">초급 (고위험)</option>
                        <option value="중급">중급 (주의)</option>
                        <option value="고급">고급 (우수)</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">일괄 출력 형태</label>
                    <select value={genMode} onChange={e => setGenMode(e.target.value as GenMode)} className="bg-indigo-50 border border-indigo-200 text-indigo-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-black min-w-[200px]">
                        <option value="individual-pdf">📁 개별 PDF (ZIP 압축)</option>
                        <option value="individual-img">🖼️ 개별 이미지 (ZIP 압축)</option>
                        <option value="combined-pdf">📑 통합 PDF (단일 파일)</option>
                    </select>
                </div>
                
                {/* View Mode Toggle */}
                <div className="flex bg-slate-100 p-1 rounded-xl self-end">
                    <button 
                        onClick={() => setViewMode('list')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${viewMode === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                        목록 보기
                    </button>
                    <button 
                        onClick={() => setViewMode('preview')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${viewMode === 'preview' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        상세 미리보기
                    </button>
                </div>

                <div className="flex-1"></div>

                {/* Actions */}
                <div className="flex gap-3 items-center">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 h-[42px]">
                        <span>대상: {filteredRecords.length}명</span>
                    </div>
                    
                    {isGenerating ? (
                        <div className="flex items-center gap-2 animate-fade-in">
                            <div className="text-xs font-black text-indigo-600 animate-pulse bg-indigo-50 px-4 py-2.5 rounded-xl border border-indigo-100 shadow-sm h-[42px] flex items-center">
                                {isGenerating && <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                                진행 중... ({bulkProgress.current}/{bulkProgress.total})
                            </div>
                            <button onClick={cancelGeneration} className="px-4 py-2.5 bg-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-300 h-[42px]">
                                중단
                            </button>
                        </div>
                    ) : (
                        <button 
                            onClick={handleGenerate} 
                            disabled={filteredRecords.length === 0}
                            className={`px-6 py-2.5 text-white font-black rounded-xl shadow-lg transition-all flex items-center gap-2 text-sm h-[42px]
                                ${filteredRecords.length === 0 ? 'bg-slate-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 hover:-translate-y-0.5 cursor-pointer'}`}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> 
                            일괄 생성 시작
                        </button>
                    )}
                </div>
            </div>

            {/* Hidden Rendering Area for Bulk Generation */}
            <div style={{ position: 'fixed', top: 0, left: 0, zIndex: -50, width: '210mm', minHeight: '297mm', pointerEvents: 'none', visibility: isGenerating ? 'visible' : 'hidden' }}>
                {isGenerating && generatingRecord && (
                    <ReportTemplate record={generatingRecord} history={generatingHistory} ref={bulkReportRef} />
                )}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative">
                {filteredRecords.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                        <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <p className="font-bold">선택된 조건의 근로자가 없습니다.</p>
                    </div>
                ) : viewMode === 'list' ? (
                    /* VIEW MODE: LIST */
                    <>
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                                생성 대상 목록 ({filteredRecords.length}명)
                            </h3>
                        </div>
                        <div className="overflow-y-auto flex-1 p-0 custom-scrollbar">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="px-6 py-3">이름</th>
                                        <th className="px-6 py-3">직종 (Team)</th>
                                        <th className="px-6 py-3">안전점수</th>
                                        <th className="px-6 py-3">등급</th>
                                        <th className="px-6 py-3">주요 취약점</th>
                                        <th className="px-6 py-3 text-right">작업</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredRecords.map((r, idx) => (
                                        <tr key={r.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => { setViewMode('preview'); setPreviewIndex(idx); }}>
                                            <td className="px-6 py-3 font-bold text-slate-800">{r.name}</td>
                                            <td className="px-6 py-3 text-slate-600">{r.jobField}</td>
                                            <td className="px-6 py-3 font-black text-indigo-600">{r.safetyScore}</td>
                                            <td className="px-6 py-3">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                    r.safetyLevel === '고급' ? 'bg-green-100 text-green-700' :
                                                    r.safetyLevel === '중급' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                                                }`}>
                                                    {r.safetyLevel}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-slate-500 truncate max-w-xs">{r.weakAreas.join(', ')}</td>
                                            <td className="px-6 py-3 text-right">
                                                <button onClick={(e) => { e.stopPropagation(); setViewMode('preview'); setPreviewIndex(idx); }} className="text-xs font-bold text-indigo-600 hover:underline">
                                                    미리보기
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    /* VIEW MODE: PREVIEW */
                    <div className="flex flex-col h-full bg-slate-100">
                        {/* Preview Toolbar */}
                        <div className="p-4 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm z-20">
                            <div className="flex items-center gap-4">
                                <button 
                                    onClick={handlePrev} 
                                    disabled={previewIndex === 0}
                                    className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                </button>
                                <div className="text-center">
                                    <p className="text-sm font-black text-slate-800">{previewIndex + 1} / {filteredRecords.length}</p>
                                    <p className="text-xs text-slate-500 font-bold">{currentPreviewRecord?.name}</p>
                                </div>
                                <button 
                                    onClick={handleNext} 
                                    disabled={previewIndex === filteredRecords.length - 1}
                                    className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </button>
                            </div>
                            
                            <div className="flex gap-2">
                                <button 
                                    onClick={handleDownloadCurrent}
                                    className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-900 flex items-center gap-2 shadow-lg"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    현재 보고서 내보내기
                                </button>
                            </div>
                        </div>

                        {/* Preview Content Area */}
                        <div className="flex-1 overflow-auto bg-slate-200 p-8 flex justify-center items-start custom-scrollbar">
                            {currentPreviewRecord && (
                                <div className="shadow-2xl scale-[0.6] origin-top md:scale-[0.8] xl:scale-[0.9] transition-transform duration-300 bg-white">
                                    <ReportTemplate 
                                        ref={previewRef}
                                        record={currentPreviewRecord} 
                                        history={currentPreviewHistory} 
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Reports;

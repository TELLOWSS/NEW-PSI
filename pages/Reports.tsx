
import React, { useState, useRef, useMemo, useEffect } from 'react';
import type { WorkerRecord, BriefingData, RiskForecastData, SafetyCheckRecord } from '../types';
import { ReportTemplate } from '../components/ReportTemplate';

type ReportType = 'worker-report' | 'team-report';
type GenMode = 'combined-pdf' | 'individual-pdf' | 'individual-img';

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
    const [genMode, setGenMode] = useState<GenMode>('individual-pdf'); // Default: 개별 PDF(ZIP)

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

    // 렌더링 안정화 대기 함수 (시간을 늘려 안정성 확보)
    const waitForRender = async (ms: number = 1500) => {
        await new Promise(resolve => setTimeout(resolve, ms)); 
    };

    const handleGenerate = async () => {
        if (filteredRecords.length === 0) return alert('출력할 대상이 없습니다.');

        // 1. 라이브러리 체크 (클릭 시점에 확인)
        const w = window as any;
        const missingLibs = [];
        if (!w.html2canvas) missingLibs.push('html2canvas');
        if (!w.jspdf) missingLibs.push('jspdf');
        if (!w.JSZip) missingLibs.push('JSZip');
        if (!w.saveAs) missingLibs.push('FileSaver');
        if (!w.Chart) missingLibs.push('Chart.js');

        if (missingLibs.length > 0) {
            return alert(`필수 라이브러리가 로드되지 않았습니다.\n(누락: ${missingLibs.join(', ')})\n\n인터넷 연결을 확인하거나 페이지를 새로고침(F5) 해주세요.`);
        }
        
        const modeLabels: Record<GenMode, string> = {
            'combined-pdf': '통합 PDF 파일 (1개)',
            'individual-pdf': '개별 PDF 파일 (ZIP 압축)',
            'individual-img': '개별 이미지 파일 (ZIP 압축)'
        };

        if (!confirm(`${selectedTeam === '전체' ? '전체 팀' : selectedTeam + ' 팀'}의 근로자 ${filteredRecords.length}명에 대해\n[${modeLabels[genMode]}] 생성을 시작하시겠습니까?\n\n* 주의: 생성 중에는 화면을 닫지 말고 기다려주세요.`)) return;

        // 2. 초기화
        setIsGenerating(true);
        abortRef.current = false;
        setBulkProgress({ current: 0, total: filteredRecords.length });

        // 라이브러리 인스턴스 준비
        const JSZip = w.JSZip;
        const saveAs = w.saveAs;
        const html2canvas = w.html2canvas;
        const jspdf = w.jspdf;

        // ZIP 및 PDF 초기화
        const zip = new JSZip();
        const timestamp = new Date().toISOString().slice(0,10).replace(/-/g, '');
        const folderName = `PSI_${selectedTeam}_${timestamp}`;
        const folder = zip.folder(folderName);
        
        let masterPdf: any = null;
        if (genMode === 'combined-pdf') {
            const jsPDF = jspdf.jsPDF ? jspdf.jsPDF : jspdf;
            masterPdf = new jsPDF('p', 'mm', 'a4');
        }

        try {
            // 3. 순차 생성 루프
            for (let i = 0; i < filteredRecords.length; i++) {
                if (abortRef.current) break;

                const record = filteredRecords[i];
                const workerHistory = workerRecords.filter(r => 
                    r.name === record.name && 
                    (r.teamLeader || '미지정') === (record.teamLeader || '미지정')
                );

                // UI 업데이트 (렌더링 트리거)
                setGeneratingRecord(record);
                setGeneratingHistory(workerHistory);
                setBulkProgress({ current: i + 1, total: filteredRecords.length });

                // DOM 렌더링 완료 대기 (중요: 차트 애니메이션 및 이미지 로딩 시간 확보)
                await waitForRender(1200);

                if (bulkReportRef.current && !abortRef.current) {
                    try {
                        // 캡처 실행
                        const canvas = await html2canvas(bulkReportRef.current, { 
                            scale: 2, // 해상도 2배
                            useCORS: true, 
                            logging: false, 
                            backgroundColor: '#ffffff',
                            allowTaint: true,
                            scrollY: 0, 
                            scrollX: 0,
                            windowWidth: 794, // A4 pixel width (approx) at 96 DPI
                            windowHeight: 1123
                        });

                        const fileNameBase = `${record.name}_${record.jobField}`;

                        // 모드별 저장 로직
                        if (genMode === 'combined-pdf') {
                            const imgData = canvas.toDataURL('image/jpeg', 0.85);
                            if (i > 0) masterPdf.addPage();
                            masterPdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
                        } 
                        else if (genMode === 'individual-pdf') {
                            const imgData = canvas.toDataURL('image/jpeg', 0.85);
                            const jsPDF = jspdf.jsPDF ? jspdf.jsPDF : jspdf;
                            const tempPdf = new jsPDF('p', 'mm', 'a4');
                            tempPdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
                            const pdfBlob = tempPdf.output('blob');
                            folder.file(`${fileNameBase}.pdf`, pdfBlob);
                        } 
                        else if (genMode === 'individual-img') {
                            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
                            if (blob) folder.file(`${fileNameBase}.jpg`, blob);
                        }
                    } catch (err) {
                        console.error(`[Error] ${record.name} 처리 중 오류:`, err);
                    }
                }
                
                // 브라우저 응답 없음 방지를 위한 미세 딜레이
                await new Promise(r => setTimeout(r, 100));
            }

            // 4. 최종 저장
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
                    <label className="text-xs font-bold text-slate-500 mb-1 block">출력 형태</label>
                    <select value={genMode} onChange={e => setGenMode(e.target.value as GenMode)} className="bg-indigo-50 border border-indigo-200 text-indigo-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-black min-w-[200px]">
                        <option value="individual-pdf">📁 개별 PDF (ZIP 압축)</option>
                        <option value="individual-img">🖼️ 개별 이미지 (ZIP 압축)</option>
                        <option value="combined-pdf">📑 통합 PDF (단일 파일)</option>
                    </select>
                </div>
                
                <div className="flex-1"></div>

                {/* Bulk Actions */}
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

            {/* 
               [CRITICAL FIX] Hidden Rendering Area 
               - zIndex: -50 ensures it is BEHIND the main content.
               - position: fixed, top: 0, left: 0 ensures valid viewport coordinates for html2canvas.
               - Explicit width/height (A4 size approx in px) prevents zero-size element capture issues.
               - opacity 1 required for html2canvas to capture (it ignores opacity: 0). We rely on z-index to hide it.
            */}
            <div style={{ position: 'fixed', top: 0, left: 0, zIndex: -50, width: '210mm', minHeight: '297mm', pointerEvents: 'none' }}>
                {isGenerating && generatingRecord && (
                    <ReportTemplate record={generatingRecord} history={generatingHistory} ref={bulkReportRef} />
                )}
            </div>

            {/* List View for Preview */}
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                        <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                        생성 대상 미리보기
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
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredRecords.map((r) => (
                                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
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
                                </tr>
                            ))}
                            {filteredRecords.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-bold">
                                        선택된 조건의 근로자가 없습니다.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Reports;

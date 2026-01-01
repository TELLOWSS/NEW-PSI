
import React, { useState, useRef, useMemo } from 'react';
import type { WorkerRecord, BriefingData, RiskForecastData, SafetyCheckRecord } from '../types';
import { ReportTemplate } from '../components/ReportTemplate';

type ReportType = 'worker-report' | 'team-report';

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
    
    // 팀 리포트용 상태
    const [selectedTeam, setSelectedTeam] = useState('전체');
    const [filterLevel, setFilterLevel] = useState('전체');

    // Bulk Generation State
    const [generatingRecord, setGeneratingRecord] = useState<WorkerRecord | null>(null);
    const bulkReportRef = useRef<HTMLDivElement>(null);

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
        return result.sort((a,b) => a.safetyScore - b.safetyScore);
    }, [workerRecords, activeTab, selectedTeam, filterLevel]);

    const handleBulkDownloadPDF = async () => {
        if (filteredRecords.length === 0) return alert('출력할 대상이 없습니다.');
        
        const html2canvas = (window as any).html2canvas;
        const jspdf = (window as any).jspdf;
        if (!html2canvas || !jspdf) return alert('PDF 라이브러리 로드 중입니다. 잠시 후 시도해주세요.');

        if (!confirm(`${selectedTeam === '전체' ? '전체 팀' : selectedTeam + ' 팀'}의 근로자 ${filteredRecords.length}명에 대한\n정밀 리포트를 일괄 생성하시겠습니까?\n(시간이 소요될 수 있습니다)`)) return;

        setIsGenerating(true);
        setBulkProgress({ current: 0, total: filteredRecords.length });

        const jsPDF = jspdf.jsPDF ? jspdf.jsPDF : jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');

        try {
            for (let i = 0; i < filteredRecords.length; i++) {
                const record = filteredRecords[i];
                setGeneratingRecord(record);
                setBulkProgress({ current: i + 1, total: filteredRecords.length });

                // React Render & Chart Animation Wait
                await new Promise(resolve => setTimeout(resolve, 800));

                if (bulkReportRef.current) {
                    const canvas = await html2canvas(bulkReportRef.current, { 
                        scale: 2, 
                        useCORS: true, 
                        logging: false, 
                        backgroundColor: '#ffffff' 
                    });
                    const imgData = canvas.toDataURL('image/png', 0.9);
                    
                    if (i > 0) pdf.addPage();
                    pdf.addImage(imgData, 'PNG', 0, 0, 210, 297);
                }
            }
            pdf.save(`PSI_BulkReport_${selectedTeam}_${new Date().toISOString().slice(0,10)}.pdf`);
        } catch (e) {
            console.error(e);
            alert('일괄 생성 중 오류가 발생했습니다.');
        } finally {
            setIsGenerating(false);
            setGeneratingRecord(null);
        }
    };

    return (
        <div className="space-y-6 pb-10 h-full flex flex-col font-sans">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 no-print">
                <h2 className="text-2xl font-black text-slate-900">PSI 정밀 보고서 센터</h2>
                <div className="flex items-center space-x-3 bg-white rounded-lg p-1 shadow-sm border border-slate-200">
                    <span className="text-xs font-bold text-slate-500 pl-3 pr-1">REPORT MODE:</span>
                    <span className="text-xs font-black text-indigo-600 pr-3 uppercase">Bulk Generation Ready</span>
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

            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap gap-4 items-center no-print">
                {activeTab === 'team-report' && (
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-500">대상 공종:</label>
                        <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold">
                            {teams.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-500">등급 필터:</label>
                    <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold">
                        <option value="전체">전체 등급</option>
                        <option value="초급">초급 (고위험)</option>
                        <option value="중급">중급 (주의)</option>
                        <option value="고급">고급 (우수)</option>
                    </select>
                </div>
                <div className="ml-auto flex gap-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg">
                        <span>대상 인원: {filteredRecords.length}명</span>
                    </div>
                    <button 
                        onClick={handleBulkDownloadPDF} 
                        disabled={isGenerating} 
                        className={`px-5 py-2.5 text-white font-black rounded-xl shadow-lg transition-all flex items-center gap-2 ${isGenerating ? 'bg-slate-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700 hover:-translate-y-0.5'}`}
                    >
                        {isGenerating ? (
                            <span className="flex items-center">
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                생성 중... ({bulkProgress.current}/{bulkProgress.total})
                            </span>
                        ) : (
                            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg> 팀별 일괄 PDF 생성</>
                        )}
                    </button>
                </div>
            </div>

            {/* Hidden Rendering Area for Bulk Generation */}
            <div className="fixed top-0 left-[-9999px] overflow-hidden" aria-hidden="true">
                {isGenerating && generatingRecord && (
                    <ReportTemplate record={generatingRecord} history={[generatingRecord]} ref={bulkReportRef} />
                )}
            </div>

            {/* List View for Preview */}
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 text-sm">생성 대상 미리보기</h3>
                </div>
                <div className="overflow-y-auto flex-1 p-0">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-3">이름</th>
                                <th className="px-6 py-3">직종</th>
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

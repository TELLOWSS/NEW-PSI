
import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { WorkerRecord, BriefingData, RiskForecastData, SafetyCheckRecord } from '../types';
import { generateSafetyBriefing, generateFutureRiskForecast, generateSpeechFromText } from '../services/geminiService';

type ReportType = 'monthly-briefing' | 'risk-forecast' | 'worker-report' | 'team-report';

interface ReportsProps {
    workerRecords?: WorkerRecord[];
    safetyCheckRecords?: SafetyCheckRecord[];
    briefingData: BriefingData | null;
    setBriefingData: (data: BriefingData | null) => void;
    forecastData: RiskForecastData | null;
    setForecastData: (data: RiskForecastData | null) => void;
}

const Reports: React.FC<ReportsProps> = ({ workerRecords = [], safetyCheckRecords = [], briefingData, setBriefingData, forecastData, setForecastData }) => {
    const [activeTab, setActiveTab] = useState<ReportType>('worker-report');
    const [isGenerating, setIsGenerating] = useState(false);
    
    // 팀 리포트용 상태
    const [selectedTeam, setSelectedTeam] = useState('전체');
    const [filterLevel, setFilterLevel] = useState('전체');

    const reportRef = useRef<HTMLDivElement>(null);

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

    // 팀 심층 분석 (데이터 존재 시에만 계산)
    const teamAnalytics = useMemo(() => {
        if (filteredRecords.length === 0) return null;
        
        const avgScore = filteredRecords.reduce((acc, r) => acc + r.safetyScore, 0) / filteredRecords.length;
        const highRiskCount = filteredRecords.filter(r => r.safetyLevel === '초급').length;
        
        const weaknessCounts: Record<string, number> = {};
        filteredRecords.forEach(r => {
            if (Array.isArray(r.weakAreas)) {
                r.weakAreas.forEach(w => {
                    weaknessCounts[w] = (weaknessCounts[w] || 0) + 1;
                });
            }
        });
        const topWeaknesses = Object.entries(weaknessCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([text, count]) => ({ text, count }));

        return { avgScore, highRiskCount, topWeaknesses };
    }, [filteredRecords]);


    const handleDownloadPDF = async () => {
        if (!reportRef.current) return;
        
        // 라이브러리 안전 확인
        const html2canvas = (window as any).html2canvas;
        const jspdf = (window as any).jspdf;
        
        if (!html2canvas || !jspdf) {
            alert('PDF 생성 라이브러리가 로드되지 않았습니다. 잠시 후 다시 시도해주세요.');
            return;
        }

        setIsGenerating(true);
        try {
            const element = reportRef.current;
            const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
            const imgData = canvas.toDataURL('image/png');
            
            // jsPDF 인스턴스 생성 (안전 접근)
            const jsPDF = jspdf.jsPDF ? jspdf.jsPDF : jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            
            const imgWidth = 210;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            let heightLeft = imgHeight;
            let position = 0;
            const pageHeight = 297;

            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft >= 0) {
              position = heightLeft - imgHeight;
              pdf.addPage();
              pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
              heightLeft -= pageHeight;
            }

            pdf.save(`PSI_Report_${activeTab}_${selectedTeam}.pdf`);
        } catch (error) {
            console.error("PDF Gen Error:", error);
            alert('PDF 생성 중 오류가 발생했습니다.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="space-y-6 pb-10 h-full flex flex-col font-sans">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 no-print">
                <h2 className="text-2xl font-black text-slate-900">PSI 정밀 보고서 센터</h2>
                <div className="flex items-center space-x-3 bg-white rounded-lg p-1 shadow-sm border border-slate-200">
                    <span className="text-xs font-bold text-slate-500 pl-3 pr-1">REPORT MODE:</span>
                    <span className="text-xs font-black text-indigo-600 pr-3 uppercase">A4 Standard Format</span>
                </div>
            </div>

            <div className="overflow-x-auto pb-2 -mb-2 shrink-0 no-print">
                <div className="flex space-x-6 border-b border-slate-200 min-w-max">
                    <button onClick={() => setActiveTab('worker-report')} className={`pb-4 text-sm font-bold transition-colors relative ${activeTab === 'worker-report' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}>
                        전체 근로자 통합 명부
                        {activeTab === 'worker-report' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600"></div>}
                    </button>
                    <button onClick={() => setActiveTab('team-report')} className={`pb-4 text-sm font-bold transition-colors relative ${activeTab === 'team-report' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}>
                        공종별 팀 분석 리포트
                        {activeTab === 'team-report' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600"></div>}
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
                <div className="ml-auto">
                    <button onClick={handleDownloadPDF} disabled={isGenerating} className="px-5 py-2.5 bg-slate-900 text-white font-black rounded-xl shadow-lg hover:bg-black transition-all flex items-center gap-2">
                        {isGenerating ? (
                            <span className="flex items-center"><svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>생성 중...</span>
                        ) : (
                            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg> PDF 다운로드</>
                        )}
                    </button>
                </div>
            </div>

            <div className="flex-1 bg-slate-100 flex justify-center p-8 overflow-y-auto rounded-3xl border border-slate-200">
                <div ref={reportRef} className="bg-white w-[210mm] min-h-[297mm] shadow-2xl p-[15mm] relative text-slate-900 print:shadow-none print:w-full">
                    <header className="border-b-2 border-slate-900 pb-4 mb-8 flex justify-between items-end">
                        <div>
                            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">
                                {activeTab === 'worker-report' ? '전체 근로자 안전 통합 명부' : `${selectedTeam} 팀 정밀 안전 진단서`}
                            </h1>
                            <p className="text-sm font-bold text-slate-500 mt-1">PSI Safety Intelligence Report • 2026. 01. 01</p>
                        </div>
                        <div className="text-right">
                             <div className="text-2xl font-black text-indigo-600">PSI</div>
                             <div className="text-[10px] font-bold text-slate-400 uppercase">Proactive Safety Intelligence</div>
                        </div>
                    </header>

                    {activeTab === 'team-report' && teamAnalytics && (
                        <section className="mb-8 bg-slate-50 rounded-xl p-6 border border-slate-200">
                            <h3 className="text-sm font-black text-indigo-600 uppercase tracking-widest mb-4 border-b border-indigo-100 pb-2">Team Deep Analysis</h3>
                            <div className="grid grid-cols-3 gap-8">
                                <div className="text-center border-r border-slate-200 last:border-0">
                                    <p className="text-xs font-bold text-slate-500 uppercase mb-1">팀 평균 안전 점수</p>
                                    <p className="text-4xl font-black text-slate-800">{teamAnalytics.avgScore.toFixed(1)}</p>
                                    <p className="text-[10px] font-medium text-slate-400 mt-1">
                                        (현장 평균 대비 {teamAnalytics.avgScore > 80 ? '▲ 우수' : '▼ 주의'})
                                    </p>
                                </div>
                                <div className="text-center border-r border-slate-200 last:border-0">
                                    <p className="text-xs font-bold text-slate-500 uppercase mb-1">집중 관리 대상</p>
                                    <p className={`text-4xl font-black ${teamAnalytics.highRiskCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {teamAnalytics.highRiskCount}명
                                    </p>
                                    <p className="text-[10px] font-medium text-slate-400 mt-1">초급 등급 인원</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-slate-500 uppercase mb-2">팀 주요 취약점 Top 3</p>
                                    <ul className="text-xs space-y-1 text-left pl-4">
                                        {teamAnalytics.topWeaknesses.map((w, i) => (
                                            <li key={i} className="font-bold text-slate-700 flex justify-between">
                                                <span>• {w.text}</span>
                                                <span className="text-slate-400">{w.count}건</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </section>
                    )}

                    <div className="mb-8">
                         <table className="w-full text-left border-collapse">
                             <thead>
                                 <tr className="border-b-2 border-slate-800 text-xs font-black text-slate-900 uppercase">
                                     <th className="py-2 w-16">No</th>
                                     <th className="py-2 w-24">성명</th>
                                     <th className="py-2 w-24">직종</th>
                                     <th className="py-2 w-20 text-center">안전점수</th>
                                     <th className="py-2 w-20 text-center">등급</th>
                                     <th className="py-2">주요 취약점 및 개선 권고</th>
                                 </tr>
                             </thead>
                             <tbody className="text-xs">
                                 {filteredRecords.map((r, i) => (
                                     <tr key={r.id} className="border-b border-slate-200">
                                         <td className="py-3 font-medium text-slate-500">{i + 1}</td>
                                         <td className="py-3 font-bold text-slate-900">{r.name}</td>
                                         <td className="py-3 font-medium text-slate-600">{r.jobField}</td>
                                         <td className="py-3 text-center font-bold text-slate-800">{r.safetyScore}</td>
                                         <td className="py-3 text-center">
                                             <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${
                                                 r.safetyLevel === '고급' ? 'bg-emerald-500' :
                                                 r.safetyLevel === '중급' ? 'bg-amber-500' : 'bg-rose-500'
                                             }`}>
                                                 {r.safetyLevel}
                                             </span>
                                         </td>
                                         <td className="py-3 text-slate-600 font-medium">
                                             {r.weakAreas.length > 0 ? (
                                                 <span className="text-rose-600 font-bold mr-1">⚠ {r.weakAreas[0]}</span>
                                             ) : <span className="text-emerald-600 font-bold">특이사항 없음</span>}
                                             <span className="text-slate-400 ml-1 truncate block max-w-xs">{r.aiInsights.substring(0, 50)}...</span>
                                         </td>
                                     </tr>
                                 ))}
                                 {filteredRecords.length === 0 && (
                                     <tr>
                                         <td colSpan={6} className="py-8 text-center text-slate-400 font-bold">
                                             해당 조건의 근로자 데이터가 없습니다.
                                         </td>
                                     </tr>
                                 )}
                             </tbody>
                         </table>
                    </div>

                    <div className="mt-auto pt-8 border-t-2 border-slate-900 flex justify-between items-end">
                        <div className="text-[10px] font-medium text-slate-500">
                            본 보고서는 PSI AI 엔진에 의해 실시간 데이터로 생성되었습니다.<br/>
                            (주)휘강건설 안전관리팀 | 용인 푸르지오 원클러스터 현장
                        </div>
                        <div className="flex gap-12 text-center">
                             <div>
                                 <p className="text-[10px] font-bold text-slate-400 uppercase mb-4">Safety Manager</p>
                                 <p className="font-serif font-bold text-slate-900">박 성 훈 (인)</p>
                             </div>
                             <div>
                                 <p className="text-[10px] font-bold text-slate-400 uppercase mb-4">Site Manager</p>
                                 <p className="font-serif font-bold text-slate-900">정 용 현 (인)</p>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Reports;

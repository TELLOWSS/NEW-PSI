
import React, { useMemo } from 'react';
import type { WorkerRecord, SafetyCheckRecord, Page } from '../types';
import { StatCard } from '../components/StatCard';
import { NationalityChart } from '../components/charts/NationalityChart';
import { TopWeaknessesChart } from '../components/charts/TopWeaknessesChart';
import { SafetyCheckDonutChart } from '../components/charts/SafetyCheckDonutChart';
import { SafetyActionCenter } from '../components/SafetyActionCenter';
import { Tooltip } from '../components/shared/Tooltip';

interface DashboardProps {
    workerRecords: WorkerRecord[];
    safetyCheckRecords: SafetyCheckRecord[];
    setCurrentPage: (page: Page) => void;
}

// 관리 직군 여부 확인 함수
const isManagementRole = (field: string) => 
    /관리|팀장|부장|과장|기사|공무|소장/.test(field);

const Dashboard: React.FC<DashboardProps> = ({ workerRecords, safetyCheckRecords, setCurrentPage }) => {
    // 순수 근로자 데이터만 필터링 (관리 직군 제외)
    const workerOnlyRecords = useMemo(() => 
        workerRecords.filter(r => !isManagementRole(r.jobField))
    , [workerRecords]);

    const stats = useMemo(() => {
        const uniqueWorkers = new Set(workerOnlyRecords.map(r => r.name));
        const totalWorkers = uniqueWorkers.size;
        
        const latestRecords = Array.from(uniqueWorkers).map(name => {
            return workerOnlyRecords
                .filter(r => r.name === name)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        });

        const averageScore = latestRecords.length > 0
            ? latestRecords.reduce((acc, r) => acc + r.safetyScore, 0) / latestRecords.length
            : 0;
            
        const highRiskWorkers = latestRecords.filter(r => r.safetyLevel === '초급').length;
        const totalChecks = safetyCheckRecords.length;
        
        return { totalWorkers, averageScore, highRiskWorkers, totalChecks };
    }, [workerOnlyRecords, safetyCheckRecords]);
    
    // [SIMULATION DATE] 2026-02-17
    const today = "2026년 2월 17일 화요일";

    return (
        <div className="space-y-4 sm:space-y-6 lg:space-y-8 animate-fade-in-up">
            {/* AI-Powered Safety Command Center */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 text-white shadow-2xl relative overflow-hidden border border-white/10">
                {/* Animated background elements */}
                <div className="absolute top-0 right-0 w-64 h-64 sm:w-96 sm:h-96 bg-indigo-500 opacity-10 rounded-full blur-3xl -mr-32 -mt-32 animate-pulse"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 sm:w-80 sm:h-80 bg-blue-500 opacity-10 rounded-full blur-3xl -ml-24 -mb-24 animate-pulse" style={{ animationDelay: '1s' }}></div>
                
                <div className="relative z-10">
                    {/* System Status Header */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                        <div className="flex items-center gap-2 sm:gap-3">
                            <div className="p-2 sm:p-2.5 bg-indigo-500/20 backdrop-blur-sm rounded-lg sm:rounded-xl border border-indigo-400/30">
                                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                            </div>
                            <div>
                                <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                                    <h2 className="text-lg sm:text-2xl md:text-3xl font-black tracking-tight">PSI Safety Intelligence</h2>
                                    <span className="px-1.5 sm:px-2 py-0.5 bg-emerald-500/90 text-white text-[8px] sm:text-[10px] font-black rounded-md uppercase tracking-wide">v2.0</span>
                                </div>
                                <p className="text-indigo-300 text-[10px] sm:text-xs font-bold flex items-center gap-1.5 sm:gap-2">
                                    <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                    <span className="hidden sm:inline">실시간 안전 모니터링 활성화 · {today}</span>
                                    <span className="sm:hidden">실시간 모니터링</span>
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-white/5 backdrop-blur-md border border-white/10 rounded-lg sm:rounded-xl">
                            <svg className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-[10px] sm:text-xs font-bold text-emerald-300">AI 분석 엔진 정상</span>
                        </div>
                    </div>

                    {/* Main Content Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 mb-4 sm:mb-6">
                        {/* Real-time Safety Score */}
                        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-5">
                            <div className="flex items-center justify-between mb-2 sm:mb-3">
                                <span className="text-indigo-300 text-[10px] sm:text-xs font-bold uppercase tracking-wide">현장 안전 지수</span>
                                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                            </div>
                            <div className="flex items-baseline gap-1.5 sm:gap-2">
                                <span className="text-3xl sm:text-4xl font-black text-white">{stats.averageScore.toFixed(1)}</span>
                                <span className="text-base sm:text-lg font-bold text-indigo-300">/ 100</span>
                            </div>
                            <p className="text-[10px] sm:text-xs text-indigo-200 mt-1.5 sm:mt-2 font-medium">실무 근로자 평균 점수</p>
                        </div>

                        {/* Active Workers */}
                        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-5">
                            <div className="flex items-center justify-between mb-2 sm:mb-3">
                                <span className="text-indigo-300 text-[10px] sm:text-xs font-bold uppercase tracking-wide">활동 중인 근로자</span>
                                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                            </div>
                            <div className="flex items-baseline gap-1.5 sm:gap-2">
                                <span className="text-3xl sm:text-4xl font-black text-white">{stats.totalWorkers}</span>
                                <span className="text-base sm:text-lg font-bold text-indigo-300">명</span>
                            </div>
                            <p className="text-[10px] sm:text-xs text-indigo-200 mt-1.5 sm:mt-2 font-medium">관리 직군 제외</p>
                        </div>

                        {/* Risk Alert */}
                        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-5 sm:col-span-2 lg:col-span-1">
                            <div className="flex items-center justify-between mb-2 sm:mb-3">
                                <span className="text-indigo-300 text-[10px] sm:text-xs font-bold uppercase tracking-wide">위험도 모니터링</span>
                                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div className="flex items-baseline gap-1.5 sm:gap-2">
                                <span className="text-3xl sm:text-4xl font-black text-white">{stats.highRiskWorkers}</span>
                                <span className="text-base sm:text-lg font-bold text-amber-300">명</span>
                            </div>
                            <p className="text-[10px] sm:text-xs text-amber-200 mt-1.5 sm:mt-2 font-medium">고위험 근로자 감지</p>
                        </div>
                    </div>

                    {/* AI Insights & Quick Actions */}
                    <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 items-stretch">
                        <div className="flex-1 bg-indigo-500/10 backdrop-blur-sm border border-indigo-400/20 rounded-lg sm:rounded-xl p-3 sm:p-4">
                            <div className="flex items-start gap-2 sm:gap-3">
                                <div className="p-1.5 sm:p-2 bg-indigo-400/20 rounded-lg shrink-0">
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                    </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] sm:text-xs font-bold text-indigo-200 mb-1 uppercase tracking-wide">AI 인사이트</p>
                                    <p className="text-xs sm:text-sm text-white font-medium leading-relaxed">
                                        {stats.highRiskWorkers > 0 
                                            ? `현재 ${stats.highRiskWorkers}명의 고위험 근로자가 감지되었습니다. 즉시 교육 및 점검이 필요합니다.`
                                            : '모든 근로자가 안전 기준을 충족하고 있습니다. 현재 상태를 유지하세요.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full lg:w-auto">
                            <button onClick={() => setCurrentPage('ocr-analysis')} className="px-4 sm:px-5 py-2.5 sm:py-3 bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 hover:scale-105 active:scale-95">
                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                신규 분석
                            </button>
                            <button onClick={() => setCurrentPage('reports')} className="px-4 sm:px-5 py-2.5 sm:py-3 bg-white text-slate-900 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm shadow-lg hover:bg-slate-50 transition-all flex items-center justify-center gap-2 hover:scale-105 active:scale-95">
                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                리포트 생성
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-indigo-50 border-l-4 border-indigo-400 p-3 sm:p-4 rounded-r-lg flex items-start sm:items-center justify-between gap-2 sm:gap-4">
                <div className="flex items-start sm:items-center gap-2">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500 shrink-0 mt-0.5 sm:mt-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-xs sm:text-sm text-indigo-700 font-bold">
                        [데이터 안내] 2026년 기준 실무 근로자 중심 분석 모드 활성
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
                <StatCard 
                    title="현장 실무 근로자" 
                    value={`${stats.totalWorkers}명`} 
                    iconType="users" 
                    onClick={() => setCurrentPage('worker-management')}
                />
                <StatCard 
                    title="실무 평균 안전 점수" 
                    value={`${stats.averageScore.toFixed(1)}점`} 
                    iconType="chart" 
                    onClick={() => setCurrentPage('performance-analysis')}
                />
                 <StatCard 
                    title="고위험 근로자" 
                    value={`${stats.highRiskWorkers}명`} 
                    iconType="warning"
                    onClick={() => setCurrentPage('predictive-analysis')}
                />
                <StatCard 
                    title="안전 이행 점검" 
                    value={`${stats.totalChecks}건`} 
                    iconType="check"
                    onClick={() => setCurrentPage('safety-checks')}
                />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
                <div className="lg:col-span-2">
                    <div className="h-full rounded-xl sm:rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300">
                        <SafetyActionCenter workerRecords={workerOnlyRecords} />
                    </div>
                </div>
                <div className="bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 border border-slate-100 flex flex-col">
                    <h3 className="text-base sm:text-lg font-bold mb-4 sm:mb-6 text-slate-800">국적별 근로자 현황</h3>
                    <div className="flex-1 min-h-[200px]">
                       <NationalityChart records={workerOnlyRecords} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
                <div className="bg-white p-4 sm:p-6 lg:p-8 rounded-xl sm:rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 border border-slate-100">
                    <div className="flex items-center justify-between mb-4 sm:mb-6">
                        <h3 className="text-base sm:text-lg font-bold text-slate-800">근로자 주요 취약 분야</h3>
                         <Tooltip text="관리 직군을 제외한 실무 근로자 데이터에서 추출된 주요 취약점입니다.">
                            <div className="flex items-center text-xs sm:text-sm text-slate-400 cursor-pointer hover:text-slate-600 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 sm:h-4 sm:w-4 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                                <span className="hidden sm:inline">데이터 안내</span>
                            </div>
                        </Tooltip>
                    </div>
                    <div className="h-auto min-h-[15rem]">
                       <TopWeaknessesChart records={workerOnlyRecords} />
                    </div>
                </div>
                 <div className="bg-white p-4 sm:p-6 lg:p-8 rounded-xl sm:rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 border border-slate-100">
                    <h3 className="text-base sm:text-lg font-bold mb-4 sm:mb-6 text-slate-800">최근 2주간 안전 점검 동향</h3>
                    <div className="h-64">
                        <SafetyCheckDonutChart records={safetyCheckRecords} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;


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
    
    // [SIMULATION DATE] 2026-01-01
    const today = "2026년 1월 1일 목요일";

    return (
        <div className="space-y-8 animate-fade-in-up">
            {/* Welcome Banner */}
            <div className="bg-gradient-to-r from-indigo-900 to-indigo-700 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -mr-16 -mt-16"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div>
                        <p className="text-indigo-200 font-bold text-sm mb-1">{today}</p>
                        <h2 className="text-3xl font-black mb-2">새해 복 많이 받으세요, 안전관리자님! ☀️</h2>
                        <p className="text-indigo-100 max-w-xl text-sm leading-relaxed opacity-90">
                            2026년 새해가 밝았습니다. 현재 현장의 실무 근로자 평균 안전 점수는 <span className="font-bold text-white text-lg">{stats.averageScore.toFixed(1)}점</span>으로 시작합니다. 
                            무재해 원년의 목표를 향해 오늘도 안전한 현장을 만들어주세요.
                        </p>
                    </div>
                    <div className="flex gap-4">
                        <button onClick={() => setCurrentPage('ocr-analysis')} className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md rounded-2xl font-bold text-sm transition-all flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            신규 분석
                        </button>
                        <button onClick={() => setCurrentPage('reports')} className="px-6 py-3 bg-white text-indigo-900 rounded-2xl font-bold text-sm shadow-lg hover:bg-indigo-50 transition-all flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            리포트 생성
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-indigo-50 border-l-4 border-indigo-400 p-4 rounded-r-lg flex items-center justify-between">
                <div className="flex items-center">
                    <svg className="w-5 h-5 text-indigo-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-sm text-indigo-700 font-bold">
                        [데이터 안내] 2026년 기준 실무 근로자 중심 분석 모드 활성
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <div className="h-full rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300">
                        <SafetyActionCenter workerRecords={workerOnlyRecords} />
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 border border-slate-100 flex flex-col">
                    <h3 className="text-lg font-bold mb-6 text-slate-800">국적별 근로자 현황</h3>
                    <div className="flex-1 min-h-[200px]">
                       <NationalityChart records={workerOnlyRecords} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 border border-slate-100">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-slate-800">근로자 주요 취약 분야</h3>
                         <Tooltip text="관리 직군을 제외한 실무 근로자 데이터에서 추출된 주요 취약점입니다.">
                            <div className="flex items-center text-sm text-slate-400 cursor-pointer hover:text-slate-600 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                                <span>데이터 안내</span>
                            </div>
                        </Tooltip>
                    </div>
                    <div className="h-auto min-h-[15rem]">
                       <TopWeaknessesChart records={workerOnlyRecords} />
                    </div>
                </div>
                 <div className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 border border-slate-100">
                    <h3 className="text-lg font-bold mb-6 text-slate-800">최근 2주간 안전 점검 동향</h3>
                    <div className="h-64">
                        <SafetyCheckDonutChart records={safetyCheckRecords} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;

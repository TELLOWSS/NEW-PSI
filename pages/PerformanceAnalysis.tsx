
import React, { useMemo, useState } from 'react';
import type { WorkerRecord } from '../types';
import { MonthlyTrendChart } from '../components/charts/MonthlyTrendChart';
import { FieldRadarChart } from '../components/charts/FieldRadarChart';
import { SafetyGradeTrendChart } from '../components/charts/SafetyGradeTrendChart';

interface PerformanceAnalysisProps {
    workerRecords: WorkerRecord[];
}

// 관리 직군 필터링 함수 (실무 공종인 '시스템', '할석' 등은 제외되지 않도록 유지)
const isManagementRole = (field: string) => 
    /관리|팀장|부장|과장|기사|공무|소장/.test(field);

const calculateStandardDeviation = (scores: number[]) => {
    if (scores.length < 2) return 0;
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
    return Math.sqrt(variance);
};

const PerformanceAnalysis: React.FC<PerformanceAnalysisProps> = ({ workerRecords }) => {
    const [timeRange, setTimeRange] = useState('최근 6개월');

    // 1. 순수 근로자 데이터만 추출
    const filteredBaseRecords = useMemo(() => 
        workerRecords.filter(r => !isManagementRole(r.jobField))
    , [workerRecords]);

    const kpiData = useMemo(() => {
        if (filteredBaseRecords.length === 0) return null;
        
        const sorted = [...filteredBaseRecords].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        const monthlyAvgs = Object.entries(sorted.reduce((acc, r) => {
            const m = r.date.substring(0, 7);
            if (!acc[m]) acc[m] = [];
            acc[m].push(r.safetyScore);
            return acc;
        }, {} as Record<string, number[]>)).map(([m, scores]: [string, number[]]) => ({
            month: m,
            avg: scores.reduce((a, b) => a + b, 0) / scores.length
        })).sort((a, b) => a.month.localeCompare(b.month));

        const currentAvg = monthlyAvgs[monthlyAvgs.length - 1]?.avg || 0;
        const prevAvg = monthlyAvgs[monthlyAvgs.length - 2]?.avg || 0;
        const trend = currentAvg - prevAvg;

        const allScores = sorted.map(r => r.safetyScore);
        const volatility = calculateStandardDeviation(allScores);

        const fieldScores = filteredBaseRecords.reduce((acc, r) => {
            const field = r.jobField || '미분류';
            if (!acc[field]) acc[field] = [];
            acc[field].push(r.safetyScore);
            return acc;
        }, {} as Record<string, number[]>);
        
        const topField = Object.entries(fieldScores)
            .map(([f, s]: [string, number[]]) => ({ field: f, avg: s.reduce((a,b)=>a+b,0)/s.length }))
            .sort((a, b) => b.avg - a.avg)[0];

        return { currentAvg, trend, volatility, topField };
    }, [filteredBaseRecords]);

    const matrixData = useMemo(() => {
        const fields = Array.from(new Set(filteredBaseRecords.map(r => r.jobField || '미분류'))).sort();
        const uniqueMonths = Array.from(new Set(filteredBaseRecords.map(r => r.date.substring(0, 7)))).sort().slice(-6);
        
        return {
            fields,
            months: uniqueMonths,
            data: fields.map(field => {
                return {
                    field,
                    scores: uniqueMonths.map(month => {
                        const records = filteredBaseRecords.filter(r => (r.jobField || '미분류') === field && r.date.startsWith(month));
                        return records.length > 0 
                            ? records.reduce((a, b) => a + b.safetyScore, 0) / records.length 
                            : null;
                    })
                };
            })
        };
    }, [filteredBaseRecords]);

    const safetyHabitRanking = useMemo(() => {
        const workers = Array.from(new Set(filteredBaseRecords.map(r => r.name)));
        return workers.map(name => {
            const records = filteredBaseRecords.filter(r => r.name === name);
            const scores = records.map(r => r.safetyScore);
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            const stdDev = calculateStandardDeviation(scores);
            const safetyHabitIndex = avg / (1 + stdDev);
            return { name, jobField: records[0].jobField, avg, stdDev, count: records.length, safetyHabitIndex };
        })
        .filter(w => w.count >= 2)
        .sort((a, b) => b.safetyHabitIndex - a.safetyHabitIndex)
        .slice(0, 5);
    }, [filteredBaseRecords]);

    const riskKeywords = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredBaseRecords.flatMap(r => r.weakAreas).forEach(w => {
            const keyword = w.split(' ')[0]; // 첫 단어만 추출 (예: 추락, 감전)
            if(keyword.length > 1) counts[keyword] = (counts[keyword] || 0) + 1;
        });
        return Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 15);
    }, [filteredBaseRecords]);

    const getScoreColorClass = (score: number | null) => {
        if (score === null) return 'bg-slate-100 text-slate-300';
        if (score >= 90) return 'bg-indigo-600 text-white shadow-indigo-300/50';
        if (score >= 80) return 'bg-blue-500 text-white shadow-blue-300/50';
        if (score >= 70) return 'bg-teal-400 text-white shadow-teal-300/50';
        if (score >= 60) return 'bg-amber-400 text-white shadow-amber-300/50';
        return 'bg-rose-500 text-white shadow-rose-300/50';
    };

    return (
        <div className="space-y-8 pb-10">
            <div className="relative bg-white p-8 rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
                <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full opacity-10 blur-2xl"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="text-indigo-600 font-bold tracking-wider text-xs uppercase block">Advanced Safety Analytics</span>
                            <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded border border-slate-200 font-bold uppercase tracking-tighter">* 관리 직군 제외됨</span>
                        </div>
                        <h2 className="text-3xl font-extrabold text-slate-900">근로자 안전 성과 심층 분석</h2>
                        <p className="text-slate-500 mt-2 max-w-xl leading-relaxed">
                            관리 직군을 제외한 실무 근로자 데이터를 바탕으로 변동성과 역량을 분석합니다. <br/>
                            <span className="font-bold text-indigo-600">시스템, 할석미장견출, 콘비팀</span> 등 모든 실무 공종의 데이터를 누락 없이 추적합니다.
                        </p>
                    </div>
                    <div className="flex items-center bg-slate-50 rounded-lg p-1 border border-slate-200">
                        {['최근 3개월', '최근 6개월', '최근 1년'].map(range => (
                            <button 
                                key={range}
                                onClick={() => setTimeRange(range)}
                                className={`px-4 py-2 text-xs font-bold rounded-md transition-all duration-200 ${timeRange === range ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                {range}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100 flex flex-col justify-between group hover:-translate-y-1 transition-transform duration-300">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        </div>
                        {kpiData && (
                            <span className={`px-2 py-1 text-xs font-bold rounded-full ${kpiData.trend >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {kpiData.trend >= 0 ? '+' : ''}{kpiData.trend.toFixed(1)} vs 지난달
                            </span>
                        )}
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">종합 근로자 안전 점수</p>
                        <h3 className="text-3xl font-black text-slate-800 mt-1">{kpiData?.currentAvg.toFixed(1) || '-'}</h3>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100 flex flex-col justify-between group hover:-translate-y-1 transition-transform duration-300">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-xl group-hover:bg-purple-600 group-hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Consistency</p>
                        </div>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">안전 일관성 (표준편차)</p>
                        <div className="flex items-baseline gap-2 mt-1">
                            <h3 className="text-3xl font-black text-slate-800">{kpiData?.volatility.toFixed(1) || '-'}</h3>
                            <span className="text-xs text-slate-400">낮을수록 안정적</span>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100 flex flex-col justify-between group hover:-translate-y-1 transition-transform duration-300 text-teal-600 border-t-4 border-t-teal-500">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-teal-50 text-teal-600 rounded-xl group-hover:bg-teal-600 group-hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                        </div>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">최우수 성과 공종</p>
                        <h3 className="text-2xl font-black text-slate-800 mt-1 truncate">{kpiData?.topField.field || '-'}</h3>
                        <p className="text-sm text-teal-600 font-bold mt-1">Avg. {kpiData?.topField.avg.toFixed(1)}점</p>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-2xl shadow-lg flex flex-col justify-between group hover:-translate-y-1 transition-transform duration-300 text-white">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-white/10 text-white rounded-xl backdrop-blur-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-400">분석 대상 기록 수</p>
                        <h3 className="text-3xl font-black mt-1">{filteredBaseRecords.length.toLocaleString()} <span className="text-lg font-normal text-slate-400">건</span></h3>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-xl font-bold text-slate-900">현장 안전 성과 추이</h3>
                            <p className="text-sm text-slate-500 mt-1">전체 근로자의 안전 수준 변화를 시계열로 추적합니다.</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-bold bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
                            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                            <span className="text-slate-600">근로자 평균</span>
                        </div>
                    </div>
                    <div className="h-80 w-full">
                        <MonthlyTrendChart records={filteredBaseRecords} />
                    </div>
                </div>
                <div className="lg:col-span-1 bg-white p-8 rounded-3xl shadow-xl border border-slate-100 flex flex-col">
                    <div className="mb-6">
                        <h3 className="text-xl font-bold text-slate-900">공종별 역량 비교</h3>
                        <p className="text-sm text-slate-500 mt-1">실무 10대 주요 공종 간 다각도 역량 분석</p>
                    </div>
                    <div className="flex-1 flex items-center justify-center relative">
                        <div className="w-full h-64">
                            <FieldRadarChart records={filteredBaseRecords} />
                        </div>
                    </div>
                    <div className="mt-6 pt-4 border-t border-slate-100">
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">분석 가이드</h4>
                        <ul className="space-y-2 text-xs text-slate-500">
                            <li className="flex items-start"><strong className="w-20 shrink-0 text-indigo-600">평균 점수:</strong> 작업 실무자들의 안전 역량이 우수한 정도를 나타냅니다.</li>
                            <li className="flex items-start"><strong className="w-20 shrink-0 text-teal-600">일관성:</strong> 현장의 안전 관리가 루틴하게 잘 이루어지고 있음을 의미합니다.</li>
                        </ul>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                <div className="xl:col-span-2 bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                    <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                        공종별 성과 히트맵 (실무 공종 전체)
                    </h3>
                    <div className="overflow-x-auto">
                        <div className="min-w-[600px]">
                            <div className="grid grid-flow-col auto-cols-fr gap-2 mb-2">
                                <div className="w-32 font-bold text-xs text-slate-400 uppercase tracking-wider text-left py-2">공종 \ 월</div>
                                {matrixData.months.map(m => (
                                    <div key={m} className="font-bold text-sm text-slate-600 text-center py-2 bg-slate-50 rounded-lg">{m.substring(5)}월</div>
                                ))}
                            </div>
                            <div className="space-y-2">
                                {matrixData.data.map(row => (
                                    <div key={row.field} className="grid grid-flow-col auto-cols-fr gap-2 items-center group">
                                        <div className="w-32 font-bold text-slate-700 text-sm truncate pr-2" title={row.field}>{row.field}</div>
                                        {row.scores.map((score, idx) => (
                                            <div key={idx} className="relative h-12 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-105 cursor-default group/cell">
                                                <div className={`absolute inset-0 rounded-lg opacity-90 ${getScoreColorClass(score)}`}></div>
                                                <span className={`relative z-10 font-bold text-sm ${score === null ? 'text-slate-300' : 'text-white'}`}>
                                                    {score !== null ? score.toFixed(0) : '-'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="xl:col-span-1 bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                    <h3 className="text-xl font-bold text-slate-900 mb-6">최우수 안전 실무자</h3>
                    <p className="text-xs text-slate-500 mb-4">
                        기복 없는 안전 실천 능력을 보여준 상위 근로자입니다. (관리 직군 제외)
                    </p>
                    <div className="space-y-4">
                        {safetyHabitRanking.length > 0 ? safetyHabitRanking.map((worker, idx) => (
                            <div key={worker.name} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-indigo-200 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${idx === 0 ? 'bg-yellow-400 shadow-md' : 'bg-slate-300'}`}>
                                        {idx + 1}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-slate-800 truncate">{worker.name}</p>
                                        <p className="text-[10px] text-slate-500 truncate">{worker.jobField} | 평균 {worker.avg.toFixed(0)}점</p>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-xs font-bold text-indigo-600">{worker.safetyHabitIndex.toFixed(2)}</p>
                                    <p className="text-[10px] text-slate-400">습관 지수</p>
                                </div>
                            </div>
                        )) : (
                            <div className="text-center text-slate-400 py-10 text-sm">분석 데이터가 부족합니다.</div>
                        )}
                    </div>
                </div>
            </div>

            {/* NEW SECTION: Bottom Infographics to utilize whitespace */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                    <div className="mb-6 flex justify-between items-center">
                        <div>
                            <h3 className="text-xl font-bold text-slate-900">현장 안전 등급 분포 변화 (6개월)</h3>
                            <p className="text-sm text-slate-500 mt-1">월별 근로자 안전 등급 구성 비율의 변화를 추적합니다. 초급자 비율 감소가 목표입니다.</p>
                        </div>
                        <div className="flex gap-3 text-xs font-bold">
                            <span className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-500 rounded-sm"></div>고급</span>
                            <span className="flex items-center gap-1"><div className="w-3 h-3 bg-amber-500 rounded-sm"></div>중급</span>
                            <span className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded-sm"></div>초급</span>
                        </div>
                    </div>
                    <div className="h-64 w-full">
                        <SafetyGradeTrendChart records={filteredBaseRecords} />
                    </div>
                </div>
                <div className="lg:col-span-1 bg-white p-8 rounded-3xl shadow-xl border border-slate-100 flex flex-col">
                    <h3 className="text-xl font-bold text-slate-900 mb-6">주요 위험 키워드 클라우드</h3>
                    <p className="text-xs text-slate-500 mb-4">최근 분석된 기록에서 가장 빈번하게 등장한 위험 요인입니다.</p>
                    <div className="flex-1 flex flex-wrap content-start gap-2">
                        {riskKeywords.map(([word, count], i) => (
                            <span 
                                key={word} 
                                className={`px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm transition-all hover:scale-105 cursor-default
                                    ${i < 3 ? 'bg-rose-100 text-rose-700 text-lg border border-rose-200' : 
                                      i < 7 ? 'bg-orange-50 text-orange-600 border border-orange-100' : 
                                      'bg-slate-50 text-slate-500 border border-slate-100 text-xs'}`}
                            >
                                {word} <span className="opacity-50 text-[0.8em] ml-1">{count}</span>
                            </span>
                        ))}
                        {riskKeywords.length === 0 && (
                            <div className="w-full text-center text-slate-400 text-sm py-10">데이터가 없습니다.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PerformanceAnalysis;


import React, { useMemo, useState } from 'react';
import type { WorkerRecord } from '../types';

// 관리 직군 필터링 함수
const isManagementRole = (field: string) => 
    /관리|팀장|부장|과장|기사|공무|소장/.test(field);

const getSafetyLevelClass = (level: '초급' | '중급' | '고급') => {
    switch (level) {
        case '고급': return { text: 'text-green-800', bg: 'bg-green-100' };
        case '중급': return { text: 'text-yellow-800', bg: 'bg-yellow-100' };
        case '초급': return { text: 'text-red-800', bg: 'bg-red-100' };
        default: return { text: 'text-slate-800', bg: 'bg-slate-100' };
    }
};

const PredictiveAnalysis: React.FC<{ workerRecords: WorkerRecord[] }> = ({ workerRecords }) => {
    // 분석 대상 원천 데이터에서 관리 직군 완전 제거
    const sourceRecords = useMemo(() => 
        workerRecords.filter(r => !isManagementRole(r.jobField))
    , [workerRecords]);

    const [hiddenJobFields, setHiddenJobFields] = useState<Set<string>>(new Set());

    const allJobFields = useMemo(() => {
        return Array.from(new Set(sourceRecords.map(r => r.jobField))).sort();
    }, [sourceRecords]);

    const toggleJobFieldVisibility = (field: string) => {
        const newHidden = new Set(hiddenJobFields);
        if (newHidden.has(field)) {
            newHidden.delete(field);
        } else {
            newHidden.add(field);
        }
        setHiddenJobFields(newHidden);
    };

    const showAllJobFields = () => setHiddenJobFields(new Set());
    const hideAllJobFields = () => setHiddenJobFields(new Set(allJobFields));

    const filteredRecords = useMemo(() => {
        return sourceRecords.filter(r => !hiddenJobFields.has(r.jobField));
    }, [sourceRecords, hiddenJobFields]);

    const highRiskWorkers = useMemo(() => {
        return filteredRecords
            .filter(w => w.safetyLevel === '초급')
            .sort((a, b) => a.safetyScore - b.safetyScore)
            .slice(0, 5);
    }, [filteredRecords]);

    const riskByJobField = useMemo(() => {
        const visibleJobFields = allJobFields.filter(field => !hiddenJobFields.has(field));
        const jobFieldStats: { [key: string]: { totalScore: number; count: number; workers: number } } = {};
        
        visibleJobFields.forEach(field => {
             jobFieldStats[field] = { totalScore: 0, count: 0, workers: 0 };
        });

        filteredRecords.forEach(w => {
            if (jobFieldStats[w.jobField]) {
                jobFieldStats[w.jobField].totalScore += w.safetyScore;
                jobFieldStats[w.jobField].count++;
            }
        });
        
        const workersPerField = filteredRecords.reduce((acc, w) => {
            if (!acc[w.jobField]) acc[w.jobField] = new Set();
            acc[w.jobField].add(w.name);
            return acc;
        }, {} as Record<string, Set<string>>);

        for(const field in workersPerField){
            if(jobFieldStats[field]) jobFieldStats[field].workers = workersPerField[field].size;
        }

        return Object.entries(jobFieldStats)
            .filter(([_, stats]) => stats.count > 0)
            .map(([jobField, stats]) => ({
                jobField,
                avgScore: stats.totalScore / stats.count,
                workerCount: stats.workers
            }))
            .sort((a, b) => a.avgScore - b.avgScore);
    }, [filteredRecords, allJobFields, hiddenJobFields]);

    const topWorkersByJobField = useMemo(() => {
         const jobFieldStats: { [key: string]: { topWorker: string; topScore: number } } = {};
         filteredRecords.forEach(w => {
            if (!jobFieldStats[w.jobField] || w.safetyScore > jobFieldStats[w.jobField].topScore) {
                jobFieldStats[w.jobField] = { topWorker: w.name, topScore: w.safetyScore };
            }
         });
         return Object.entries(jobFieldStats).map(([jobField, data]) => ({jobField, ...data}))
            .sort((a, b) => b.topScore - a.topScore);
    }, [filteredRecords]);


    return (
        <div className="space-y-6">
             <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg flex justify-between items-center">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 3.01-1.742 3.01H4.42c-1.53 0-2.493-1.676-1.743-3.01l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="ml-3">
                        <p className="text-sm text-yellow-700">
                            <strong>[필터링 안내]</strong> 현재 분석은 현장 '근로자'를 대상으로 하며, <span className="font-bold">관리 직군(관리, 기사 등)은 데이터에서 자동 제외</span>되었습니다.
                        </p>
                    </div>
                </div>
            </div>

            {/* Job Field Visibility Filter */}
            {allJobFields.length > 0 && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="text-sm font-bold text-slate-700 flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            공종별 분석 필터 (실무 공종 중심)
                        </h4>
                        <div className="space-x-2">
                            <button onClick={showAllJobFields} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline">모두 보기</button>
                            <span className="text-slate-300">|</span>
                            <button onClick={hideAllJobFields} className="text-xs font-medium text-slate-500 hover:text-slate-700 hover:underline">모두 숨기기</button>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {allJobFields.map(field => {
                            const isHidden = hiddenJobFields.has(field);
                            return (
                                <button
                                    key={field}
                                    onClick={() => toggleJobFieldVisibility(field)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 border ${
                                        isHidden 
                                            ? 'bg-slate-50 text-slate-400 border-slate-200 line-through' 
                                            : 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100 hover:border-indigo-300 shadow-sm'
                                    }`}
                                >
                                    {field}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* High Risk Workers */}
                <div className="bg-white p-6 rounded-lg shadow-sm">
                    <h3 className="text-lg font-semibold mb-4 text-red-600 flex items-center">
                        집중 관리 대상 근로자
                        <span className="ml-2 text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{highRiskWorkers.length}명</span>
                    </h3>
                    {highRiskWorkers.length > 0 ? (
                        <div className="space-y-3">
                            {highRiskWorkers.map((worker, index) => (
                                <div key={worker.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-md">
                                    <div className="flex items-center">
                                        <span className="text-sm font-bold text-slate-600 w-6">{index + 1}.</span>
                                        <div>
                                            <p className="font-semibold text-slate-800">{worker.name} <span className="text-xs text-slate-500">({worker.jobField})</span></p>
                                            <div className="text-xs text-slate-500">{worker.weakAreas.slice(0, 1).join(', ')}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-bold text-red-500">{worker.safetyScore}점</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-slate-400 text-center py-8">해당 조건의 고위험 근로자가 없습니다.</p>
                    )}
                </div>

                {/* Risk by Job Field */}
                <div className="bg-white p-6 rounded-lg shadow-sm">
                    <h3 className="text-lg font-semibold mb-4 text-slate-800">위험 예측 공종 순위</h3>
                     {riskByJobField.length > 0 ? (
                        <div className="space-y-3">
                            {riskByJobField.map((item, index) => (
                                <div key={item.jobField} className="flex items-center justify-between p-3 bg-slate-50 rounded-md">
                                <div className="flex items-center">
                                        <span className="text-sm font-bold text-slate-600 w-6">{index + 1}.</span>
                                        <div>
                                            <p className="font-semibold text-slate-800">{item.jobField}</p>
                                            <p className="text-xs text-slate-500">{item.workerCount}명 참여</p>
                                        </div>
                                    </div>
                                    <div className="text-lg font-bold text-orange-500">{item.avgScore.toFixed(1)}점</div>
                                </div>
                            ))}
                        </div>
                     ) : (
                        <p className="text-sm text-slate-400 text-center py-8">데이터가 없습니다.</p>
                     )}
                </div>

                {/* Top Workers */}
                <div className="bg-white p-6 rounded-lg shadow-sm">
                    <h3 className="text-lg font-semibold mb-4 text-green-600">공종별 최우수 근로자</h3>
                     {topWorkersByJobField.length > 0 ? (
                        <div className="space-y-3">
                            {topWorkersByJobField.map((item) => (
                                <div key={item.jobField} className="flex items-center justify-between p-3 bg-slate-50 rounded-md">
                                    <div>
                                        <p className="font-semibold text-slate-800">{item.jobField}</p>
                                        <p className="text-xs text-slate-500">{item.topWorker}</p>
                                    </div>
                                    <div className="text-lg font-bold text-green-500">{item.topScore}점</div>
                                </div>
                            ))}
                        </div>
                     ) : (
                        <p className="text-sm text-slate-400 text-center py-8">데이터가 없습니다.</p>
                     )}
                </div>
            </div>
        </div>
    );
};

export default PredictiveAnalysis;

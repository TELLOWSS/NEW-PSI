
import React, { useState, useMemo, useEffect } from 'react';
import type { WorkerRecord } from '../../types';

interface WorkerHistoryModalProps {
    workerName: string;
    allRecords: WorkerRecord[];
    initialSelectedRecord: WorkerRecord;
    onClose: () => void;
    onViewDetails: (record: WorkerRecord) => void;
    onUpdateRecord: (record: WorkerRecord) => void;
    onDeleteRecord: (recordId: string) => void;
}

const getSafetyLevelClass = (level: '초급' | '중급' | '고급') => {
    switch (level) {
        case '고급': return { text: 'text-green-800', border: 'border-green-500' };
        case '중급': return { text: 'text-yellow-800', border: 'border-yellow-500' };
        case '초급': return { text: 'text-red-800', border: 'border-red-500' };
        default: return { text: 'text-slate-800', border: 'border-slate-500' };
    }
};

export const WorkerHistoryModal: React.FC<WorkerHistoryModalProps> = ({ workerName, allRecords, initialSelectedRecord, onClose, onViewDetails, onUpdateRecord, onDeleteRecord }) => {
    const [selectedRecord, setSelectedRecord] = useState<WorkerRecord>(initialSelectedRecord);
    const [editableRecord, setEditableRecord] = useState<WorkerRecord>(initialSelectedRecord);

    useEffect(() => {
        setSelectedRecord(initialSelectedRecord);
        setEditableRecord(initialSelectedRecord);
    }, [initialSelectedRecord]);

    const workerHistory = useMemo(() => {
        return allRecords
            .filter(r => {
                const nameMatch = r.name === workerName;
                const teamLeaderMatch = (r.teamLeader || '미지정') === (initialSelectedRecord.teamLeader || '미지정');
                const jobMatch = r.jobField === initialSelectedRecord.jobField;
                return nameMatch && teamLeaderMatch && jobMatch;
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [allRecords, workerName, initialSelectedRecord]);

    const { scoreDifference, previousScore } = useMemo(() => {
        const currentIndex = workerHistory.findIndex(r => r.id === selectedRecord.id);
        if (currentIndex > -1 && currentIndex < workerHistory.length - 1) {
            const previousRecord = workerHistory[currentIndex + 1];
            return {
                scoreDifference: selectedRecord.safetyScore - previousRecord.safetyScore,
                previousScore: previousRecord.safetyScore
            };
        }
        return { scoreDifference: null, previousScore: null };
    }, [selectedRecord, workerHistory]);

    const handleRecordSelect = (record: WorkerRecord) => {
        setSelectedRecord(record);
        setEditableRecord(record);
    };

    const handleFieldChange = <K extends keyof WorkerRecord>(field: K, value: WorkerRecord[K]) => {
        setEditableRecord(prev => ({ ...prev, [field]: value } as WorkerRecord));
    }

    const handleSave = () => {
        onUpdateRecord(editableRecord);
        alert("수정되었습니다.");
    }
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-40 flex justify-center items-end sm:items-center p-2 sm:p-4" onClick={onClose}>
            <div className="bg-slate-50 rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-4xl h-[94vh] sm:h-full sm:max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <header className="flex items-start sm:items-center justify-between p-3 sm:p-4 border-b border-slate-200 shrink-0 gap-2">
                    <h2 className="text-base sm:text-lg font-bold text-slate-800 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 min-w-0">
                        <span className="text-blue-600 truncate">{workerName}</span>
                        <span className="text-xs sm:text-sm font-normal text-slate-500 truncate">
                            ({initialSelectedRecord.teamLeader !== '미지정' ? `${initialSelectedRecord.teamLeader} 팀` : initialSelectedRecord.jobField})
                        </span>
                        <span className="text-sm sm:text-base">히스토리</span>
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-200">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </header>

                <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                    {/* Left Panel: History List */}
                    <aside className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-slate-200 overflow-y-auto p-2 space-y-2 max-h-[34vh] md:max-h-none">
                        {workerHistory.length === 0 && <p className="text-center text-slate-400 p-4">이전 기록이 없습니다.</p>}
                        {workerHistory.map(record => (
                            <button 
                                key={record.id} 
                                onClick={() => handleRecordSelect(record)}
                                className={`w-full text-left p-3 rounded-lg flex items-center justify-between transition-colors ${record.id === selectedRecord.id ? 'bg-blue-100 shadow' : 'hover:bg-slate-100'}`}
                            >
                                <div className="flex items-center space-x-3">
                                    <div className="flex-shrink-0 h-10 w-10 rounded-md bg-slate-200 flex items-center justify-center">
                                        {record.originalImage ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                                            </svg>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8v10a2 2 0 002 2h12a2 2 0 002-2V8m-6 4l-3-3m0 0l-3 3m3-3v11" />
                                            </svg>
                                        )}
                                    </div>
                                    <div>
                                        <p className={`font-semibold ${record.id === selectedRecord.id ? 'text-blue-700' : 'text-slate-700'}`}>{record.date}</p>
                                        <p className="text-xs text-slate-500">{record.jobField}</p>
                                    </div>
                                </div>
                                <div className={`text-lg font-bold ${getSafetyLevelClass(record.safetyLevel).text}`}>{record.safetyScore}점</div>
                            </button>
                        ))}
                    </aside>

                    {/* Right Panel: Record Details */}
                    <main className="w-full md:w-2/3 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                             <div>
                                <p className="text-sm text-slate-500">기록 ID: {selectedRecord.id.substring(0,10)}...</p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-800 mt-1">{selectedRecord.date}</h3>
                            </div>
                            <div className="text-left sm:text-right">
                                <p className={`text-3xl sm:text-4xl font-bold ${getSafetyLevelClass(selectedRecord.safetyLevel).text}`}>{selectedRecord.safetyScore}점</p>
                                {scoreDifference !== null && (
                                     <p className={`text-sm font-semibold ${scoreDifference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {scoreDifference >= 0 ? '▲' : '▼'} {Math.abs(scoreDifference).toFixed(1)} (이전 {previousScore}점)
                                    </p>
                                )}
                            </div>
                        </div>

                        <button onClick={() => onViewDetails(selectedRecord)} className="w-full text-center py-2 px-4 bg-white border border-slate-300 rounded-md text-sm font-semibold text-blue-600 hover:bg-slate-50">
                            상세 보기
                        </button>
                        
                        {/* Editable sections */}
                        <div className="space-y-4">
                            <div>
                                <h4 className="font-semibold text-slate-700 mb-2">기본 정보 (수정 가능)</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 text-sm bg-white p-4 rounded-lg border border-slate-200">
                                    <div className="sm:col-span-4">
                                        <span className="block font-medium text-slate-500 text-xs mb-1">이름</span>
                                        <input type="text" value={editableRecord.name} onChange={e => handleFieldChange('name', e.target.value)} className="w-full border-b border-slate-300 focus:outline-none focus:border-blue-500 bg-transparent text-slate-800 font-semibold py-1" />
                                    </div>
                                    <div className="sm:col-span-4">
                                        <span className="block font-medium text-slate-500 text-xs mb-1">공종</span>
                                        <input type="text" value={editableRecord.jobField} onChange={e => handleFieldChange('jobField', e.target.value)} className="w-full border-b border-slate-300 focus:outline-none focus:border-blue-500 bg-transparent text-slate-800 font-semibold py-1" />
                                    </div>
                                    <div className="sm:col-span-4">
                                        <span className="block font-medium text-slate-500 text-xs mb-1">국적</span>
                                        <input type="text" value={editableRecord.nationality} onChange={e => handleFieldChange('nationality', e.target.value)} className="w-full border-b border-slate-300 focus:outline-none focus:border-blue-500 bg-transparent text-slate-800 font-semibold py-1" />
                                    </div>
                                    <div className="sm:col-span-6">
                                        <span className="block font-medium text-slate-500 text-xs mb-1">팀장</span>
                                        <input type="text" value={editableRecord.teamLeader || ""} onChange={e => handleFieldChange('teamLeader', e.target.value)} className="w-full border-b border-slate-300 focus:outline-none focus:border-blue-500 bg-transparent text-slate-800 font-semibold py-1" placeholder="미지정" />
                                    </div>
                                    <div className="sm:col-span-6">
                                        <span className="block font-medium text-slate-500 text-xs mb-1">직급 (Hierarchy)</span>
                                        <select 
                                            value={editableRecord.role || 'worker'} 
                                            onChange={e => handleFieldChange('role', e.target.value)} 
                                            className={`w-full border-b border-slate-300 focus:outline-none focus:border-blue-500 bg-transparent font-semibold py-1 ${
                                                editableRecord.role === 'leader' ? 'text-yellow-700' :
                                                editableRecord.role === 'sub_leader' ? 'text-slate-600' :
                                                'text-slate-800'
                                            }`}
                                        >
                                            <option value="worker">일반 팀원</option>
                                            <option value="sub_leader">부팀장/반장</option>
                                            <option value="leader">팀장/소장</option>
                                        </select>
                                    </div>
                                    <div className="sm:col-span-12 pt-2 border-t border-slate-100">
                                        <span className="block font-medium text-slate-500 text-xs mb-2">특수 임무 (겸직 가능)</span>
                                        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={!!editableRecord.isTranslator} onChange={(e) => handleFieldChange('isTranslator', e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500" />
                                                <span className="text-sm text-slate-700">🗣️ 통역</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={!!editableRecord.isSignalman} onChange={(e) => handleFieldChange('isSignalman', e.target.checked)} className="rounded text-green-600 focus:ring-green-500" />
                                                <span className="text-sm text-slate-700">🚦 신호수</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                             <div>
                                <h4 className="font-semibold text-slate-700 mb-2">AI 분석 결과 (수정 가능)</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-white p-4 rounded-lg border border-slate-200">
                                    <div>
                                        <label className="font-medium text-slate-500">안전 점수</label>
                                        <input type="number" value={editableRecord.safetyScore} onChange={e => handleFieldChange('safetyScore', parseInt(e.target.value))} className="mt-1 w-full border-slate-300 rounded-md shadow-sm text-sm" />
                                    </div>
                                    <div>
                                         <label className="font-medium text-slate-500">안전 수준</label>
                                         <select value={editableRecord.safetyLevel} onChange={e => handleFieldChange('safetyLevel', e.target.value)} className="mt-1 w-full border-slate-300 rounded-md shadow-sm text-sm">
                                            <option>초급</option>
                                            <option>중급</option>
                                            <option>고급</option>
                                         </select>
                                    </div>
                                </div>
                            </div>
                             <div>
                                <h4 className="font-semibold text-slate-700 mb-2">종합 인사이트</h4>
                                 <div className="text-sm text-slate-600 bg-white p-4 rounded-lg border border-slate-200">
                                    <p className="mb-2">{editableRecord.aiInsights}</p>
                                    <hr className="border-slate-100 my-2"/>
                                    <p className="text-slate-500">{editableRecord.aiInsights_native}</p>
                                 </div>
                            </div>
                        </div>
                    </main>
                </div>
                <footer className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end p-4 border-t border-slate-200 bg-slate-100 shrink-0 gap-2 sm:gap-3">
                    <button onClick={handleSave} className="w-full sm:w-auto px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700">저장</button>
                    <button onClick={() => { onClose(); onDeleteRecord(selectedRecord.id); }} className="w-full sm:w-auto px-5 py-2 text-sm font-semibold text-red-700 bg-red-100 rounded-lg hover:bg-red-200">이 기록 삭제</button>
                </footer>
            </div>
        </div>
    );
};

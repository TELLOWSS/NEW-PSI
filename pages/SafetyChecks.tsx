
import React, { useState } from 'react';
import type { WorkerRecord, SafetyCheckRecord } from '../types';

interface SafetyChecksProps {
    workerRecords: WorkerRecord[];
    checkRecords: SafetyCheckRecord[];
    onAddCheck: (newRecord: Omit<SafetyCheckRecord, 'id'>) => void;
}

const SafetyChecks: React.FC<SafetyChecksProps> = ({ workerRecords, checkRecords, onAddCheck }) => {
    const [workerName, setWorkerName] = useState<string>('');
    // [SIMULATION] Default date set to 2026-01-01
    const [date, setDate] = useState<string>('2026-01-01');
    const [type, setType] = useState<'unsafe_action' | 'unsafe_condition'>('unsafe_action');
    const [riskType, setRiskType] = useState<string>('');
    const [details, setDetails] = useState<string>('');
    
    const uniqueWorkerNames = [...new Set(workerRecords.map(r => r.name))];

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(!workerName || !riskType) {
            alert('근로자와 점검 유형을 입력해주세요.');
            return;
        }
        onAddCheck({ workerName, date, type, reason: riskType, details });
        // Reset form
        setWorkerName('');
        setRiskType('');
        setDetails('');
    };

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-sm">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    새 점검 기록 추가
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4 mt-4 p-4 border border-slate-200 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                            <label htmlFor="workerName" className="block text-sm font-medium text-slate-700">근로자</label>
                            <select id="workerName" value={workerName} onChange={e => setWorkerName(e.target.value)} className="mt-1 block w-full border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500">
                                <option value="">근로자 선택</option>
                                {uniqueWorkerNames.map(name => <option key={name} value={name}>{name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="date" className="block text-sm font-medium text-slate-700">점검일</label>
                            <input type="date" id="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 block w-full border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">점검 유형</label>
                        <div className="flex space-x-2">
                             <button type="button" onClick={() => setType('unsafe_action')} className={`px-4 py-2 rounded-md text-sm font-medium ${type === 'unsafe_action' ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-700'}`}>불안전한 행동</button>
                             <button type="button" onClick={() => setType('unsafe_condition')} className={`px-4 py-2 rounded-md text-sm font-medium ${type === 'unsafe_condition' ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'}`}>불안전한 상태</button>
                        </div>
                    </div>
                     <div>
                        <label htmlFor="riskType" className="block text-sm font-medium text-slate-700">위험 요인</label>
                        <input type="text" id="riskType" value={riskType} onChange={e => setRiskType(e.target.value)} placeholder="예: 고소작업" className="mt-1 block w-full border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div>
                        <label htmlFor="details" className="block text-sm font-medium text-slate-700">상세 내용</label>
                        <textarea id="details" value={details} onChange={e => setDetails(e.target.value)} placeholder="예: 안전고리 미체결" rows={3} className="mt-1 block w-full border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div>
                        <button type="submit" className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                            기록 추가
                        </button>
                    </div>
                </form>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm">
                <h3 className="text-lg font-semibold mb-4">전체 점검 기록</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-500">
                         <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                            <tr>
                                <th scope="col" className="px-6 py-3">점검일</th>
                                <th scope="col" className="px-6 py-3">근로자</th>
                                <th scope="col" className="px-6 py-3">점검 유형</th>
                                <th scope="col" className="px-6 py-3">위험 요인</th>
                                <th scope="col" className="px-6 py-3">상세 내용</th>
                            </tr>
                        </thead>
                        <tbody>
                           {checkRecords.map(record => (
                               <tr key={record.id} className="bg-white border-b hover:bg-slate-50">
                                   <td className="px-6 py-4">{record.date}</td>
                                   <td className="px-6 py-4 font-medium text-slate-900">{record.workerName}</td>
                                   <td className="px-6 py-4">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${record.type === 'unsafe_action' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}`}>
                                            {record.type === 'unsafe_action' ? '불안전한 행동' : '불안전한 상태'}
                                        </span>
                                   </td>
                                   <td className="px-6 py-4">{record.reason}</td>
                                   <td className="px-6 py-4">{record.details}</td>
                               </tr>
                           ))}
                             {checkRecords.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center py-12 text-slate-500">
                                        <p className="font-semibold">점검 기록이 없습니다.</p>
                                        <p className="text-sm mt-1">새 점검 기록을 추가해주세요.</p>
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

export default SafetyChecks;

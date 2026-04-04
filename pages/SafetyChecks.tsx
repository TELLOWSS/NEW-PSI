
import React, { useMemo, useRef, useState } from 'react';
import type { WorkerRecord, SafetyCheckRecord } from '../types';
import { compressImage } from '../utils/imageCompression';
import { postAdminJson } from '../utils/adminApiClient';
import { extractMessage } from '../utils/errorUtils';

interface SafetyChecksProps {
    workerRecords: WorkerRecord[];
    checkRecords: SafetyCheckRecord[];
    onAddCheck: (newRecord: Omit<SafetyCheckRecord, 'id'>) => void;
}

const SafetyChecks: React.FC<SafetyChecksProps> = ({ workerRecords, checkRecords, onAddCheck }) => {
    const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
    // [SIMULATION] Default date set to 2026-01-01
    const [date, setDate] = useState<string>('2026-01-01');
    const [type, setType] = useState<'unsafe_action' | 'unsafe_condition'>('unsafe_action');
    const [riskType, setRiskType] = useState<string>('');
    const [details, setDetails] = useState<string>('');
    const [attachedImage, setAttachedImage] = useState<string>('');
    const [isCompressingImage, setIsCompressingImage] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<{ ok: boolean; message: string } | null>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    
    const workerOptions = useMemo(() => {
        const sorted = [...workerRecords].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const seen = new Set<string>();
        const options: Array<{ id: string; name: string; label: string }> = [];

        for (const record of sorted) {
            if (seen.has(record.id)) continue;
            seen.add(record.id);

            const team = String(record.teamLeader || '').trim();
            const field = String(record.jobField || '').trim();
            const nationality = String(record.nationality || '').trim();
            const employeeId = String(record.employeeId || '').trim();
            const qrId = String(record.qrId || '').trim();
            const identityTag = employeeId
                ? `사번:${employeeId}`
                : (qrId ? `QR:${qrId.slice(-6)}` : '식별자없음');
            const profileTag = field || team
                ? `${field || '미분류'}${team ? `/${team}` : ''}`
                : (nationality || '미상');

            options.push({
                id: record.id,
                name: record.name,
                label: `${record.name} (${profileTag} · ${identityTag})`,
            });
        }

        return options;
    }, [workerRecords]);

    const selectedWorker = useMemo(
        () => workerOptions.find((option) => option.id === selectedWorkerId) || null,
        [workerOptions, selectedWorkerId]
    );

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setIsCompressingImage(true);
            const compressedBase64 = await compressImage(file);
            setAttachedImage(compressedBase64);
        } catch (error) {
            console.error('Safety check image compression failed:', error);
            alert('사진 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
        } finally {
            setIsCompressingImage(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!selectedWorkerId || !riskType) {
            alert('근로자와 점검 유형을 입력해주세요.');
            return;
        }
        if (!selectedWorker) {
            alert('선택한 근로자의 식별 ID를 찾지 못했습니다. 근로자 관리에서 데이터 상태를 확인해주세요.');
            return;
        }

        setIsSubmitting(true);
        setSubmitStatus(null);
        try {
            const nowIso = new Date().toISOString();
            await postAdminJson('/api/admin/safety-management', {
                action: 'record-safety-closure-loop',
                payload: {
                    records: [
                        {
                            worker_id: selectedWorkerId,
                            assessment_month: String(date || '').slice(0, 7),
                            observed_at: nowIso,
                            observer_name: 'SafetyChecks',
                            unsafe_behavior_flag: true,
                            unsafe_behavior_type: riskType,
                            severity_level: type === 'unsafe_action' ? '보통' : '낮음',
                            evidence_note: details || undefined,
                            action_type: null,
                        },
                    ],
                },
            }, { fallbackMessage: '점검 통합 등록 실패' });

            onAddCheck({ workerName: selectedWorker.name, date, type, reason: riskType, details, image: attachedImage || undefined });
            setSubmitStatus({ ok: true, message: '통합 액션으로 점검 기록이 등록되었습니다.' });

            // Reset form
            setSelectedWorkerId('');
            setRiskType('');
            setDetails('');
            setAttachedImage('');
            if (imageInputRef.current) {
                imageInputRef.current.value = '';
            }
        } catch (error) {
            const message = extractMessage(error);
            setSubmitStatus({ ok: false, message: message || '점검 등록 실패' });
        } finally {
            setIsSubmitting(false);
        }
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
                            <label htmlFor="workerId" className="block text-sm font-medium text-slate-700">근로자</label>
                            <select id="workerId" value={selectedWorkerId} onChange={e => setSelectedWorkerId(e.target.value)} className="mt-1 block w-full border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500">
                                <option value="">근로자 선택</option>
                                {workerOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
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
                        <label className="block text-sm font-medium text-slate-700 mb-2">사진 첨부</label>
                        <input
                            ref={imageInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleImageChange}
                            className="hidden"
                        />
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => imageInputRef.current?.click()}
                                className="px-3 py-2 bg-slate-100 border border-slate-300 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-200"
                            >
                                📷 사진 첨부(카메라/갤러리)
                            </button>
                            {isCompressingImage && <span className="text-xs text-slate-500">이미지 최적화 중...</span>}
                        </div>
                        {attachedImage && (
                            <div className="mt-3 flex items-center gap-3">
                                <img src={`data:image/jpeg;base64,${attachedImage}`} alt="점검 첨부" className="w-20 h-20 object-cover rounded-md border border-slate-200" />
                                <button
                                    type="button"
                                    onClick={() => {
                                        setAttachedImage('');
                                        if (imageInputRef.current) imageInputRef.current.value = '';
                                    }}
                                    className="text-xs text-red-600 hover:text-red-700 font-medium"
                                >
                                    첨부 삭제
                                </button>
                            </div>
                        )}
                    </div>
                    <div>
                        <button type="submit" disabled={isSubmitting} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                            {isSubmitting ? '등록 중...' : '기록 추가'}
                        </button>
                    </div>
                    {submitStatus && (
                        <div className={`rounded-md px-3 py-2 text-xs font-semibold ${submitStatus.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {submitStatus.ok ? '✅ ' : '❌ '}{submitStatus.message}
                        </div>
                    )}
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
                                <th scope="col" className="px-6 py-3">사진</th>
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
                                   <td className="px-6 py-4">
                                        {record.image ? (
                                            <img src={`data:image/jpeg;base64,${record.image}`} alt="점검" className="w-14 h-14 object-cover rounded-md border border-slate-200" />
                                        ) : (
                                            <span className="text-xs text-slate-400">없음</span>
                                        )}
                                   </td>
                               </tr>
                           ))}
                             {checkRecords.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-12 text-slate-500">
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

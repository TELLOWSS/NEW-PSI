
import React, { useState, useMemo, useEffect } from 'react';
import type { WorkerRecord } from '../../types';
import { ActionButton } from '../shared/ActionButton';
import { EmptyStatePanel } from '../shared/EmptyStatePanel';
import { OperationalPreviewCard } from '../shared/OperationalPreviewCard';
import { SectionPanelCard } from '../shared/SectionPanelCard';
import { StatusBadge, type StatusBadgeVariant } from '../shared/StatusBadge';
import { SummaryMetricGrid } from '../shared/SummaryMetricGrid';
import { BRAND_TONE } from '../../utils/brandToneTokens';

const normalizeIdentityText = (value: unknown): string => typeof value === 'string' ? value.trim().toUpperCase() : '';

const getWorkerUuidValue = (record: Partial<WorkerRecord>): string => normalizeIdentityText(record.worker_uuid || record.workerUuid);

const isSameWorkerHistory = (base: WorkerRecord, candidate: WorkerRecord): boolean => {
    const baseUuid = getWorkerUuidValue(base);
    const candidateUuid = getWorkerUuidValue(candidate);
    if (baseUuid && candidateUuid) return baseUuid === candidateUuid;

    const baseEmployeeId = normalizeIdentityText(base.employeeId);
    const candidateEmployeeId = normalizeIdentityText(candidate.employeeId);
    if (baseEmployeeId && candidateEmployeeId) return baseEmployeeId === candidateEmployeeId;

    const baseQrId = normalizeIdentityText(base.qrId);
    const candidateQrId = normalizeIdentityText(candidate.qrId);
    if (baseQrId && candidateQrId) return baseQrId === candidateQrId;

    return normalizeIdentityText(base.name) === normalizeIdentityText(candidate.name)
        && normalizeIdentityText(base.nationality) === normalizeIdentityText(candidate.nationality)
        && normalizeIdentityText(base.teamLeader || '미지정') === normalizeIdentityText(candidate.teamLeader || '미지정')
        && normalizeIdentityText(base.jobField) === normalizeIdentityText(candidate.jobField);
};

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
        case '고급': return { text: 'text-green-800', border: 'border-green-500', badgeVariant: 'emeraldSoft' as StatusBadgeVariant };
        case '중급': return { text: 'text-yellow-800', border: 'border-yellow-500', badgeVariant: 'amberSoft' as StatusBadgeVariant };
        case '초급': return { text: 'text-red-800', border: 'border-red-500', badgeVariant: 'roseSoft' as StatusBadgeVariant };
        default: return { text: 'text-slate-800', border: 'border-slate-500', badgeVariant: 'slateSoft' as StatusBadgeVariant };
    }
};

const getRoleBadgeVariant = (role?: WorkerRecord['role']): StatusBadgeVariant => {
    switch (role) {
        case 'leader':
            return 'amberSoft';
        case 'sub_leader':
            return 'violetSoft';
        default:
            return 'slateSoft';
    }
};

const getRoleLabel = (role?: WorkerRecord['role']): string => {
    switch (role) {
        case 'leader':
            return '팀장/소장';
        case 'sub_leader':
            return '부팀장/반장';
        default:
            return '일반 팀원';
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
            .filter(r => isSameWorkerHistory(initialSelectedRecord, r))
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

    const selectedSafetyTone = getSafetyLevelClass(selectedRecord.safetyLevel);
    
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
                        {workerHistory.length === 0 && (
                            <EmptyStatePanel
                                title="이전 기록이 없습니다."
                                description="선택한 근로자의 누적 이력이 아직 연결되지 않았습니다."
                                className="px-4 py-6"
                            />
                        )}
                        {workerHistory.map(record => (
                            <button 
                                key={record.id} 
                                onClick={() => handleRecordSelect(record)}
                                className="w-full text-left"
                            >
                                <OperationalPreviewCard
                                    variant="interactiveSlate"
                                    leading={
                                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-200">
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
                                    }
                                    title={record.date}
                                    subtitle={record.jobField}
                                    badge={<StatusBadge variant={getSafetyLevelClass(record.safetyLevel).badgeVariant}>{record.safetyLevel}</StatusBadge>}
                                    body={<div className={`text-lg font-bold ${getSafetyLevelClass(record.safetyLevel).text}`}>{record.safetyScore}점</div>}
                                    className={record.id === selectedRecord.id ? 'border-blue-300 bg-blue-50' : ''}
                                    titleClassName={`text-sm font-semibold ${record.id === selectedRecord.id ? 'text-blue-700' : 'text-slate-700'}`}
                                    subtitleClassName="mt-1 text-xs font-medium text-slate-500"
                                    bodyClassName="mt-2"
                                />
                            </button>
                        ))}
                    </aside>

                    {/* Right Panel: Record Details */}
                    <main className="w-full md:w-2/3 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
                        <SectionPanelCard
                            variant="whiteSoft"
                            eyebrow="선택 기록 요약"
                            title={selectedRecord.date}
                            description={`기록 ID: ${selectedRecord.id.substring(0, 10)}...`}
                            className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm"
                            headerClassName="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                            titleClassName="mt-1 text-xl sm:text-2xl font-bold text-slate-800"
                            descriptionClassName="text-sm text-slate-500"
                            headerAction={
                                <div className="text-left sm:text-right">
                                    <p className={`text-3xl sm:text-4xl font-bold ${selectedSafetyTone.text}`}>{selectedRecord.safetyScore}점</p>
                                    {scoreDifference !== null && (
                                        <div className="mt-2">
                                            <StatusBadge variant={scoreDifference >= 0 ? 'emeraldSoft' : 'roseSoft'} className="text-[11px]">
                                                {scoreDifference >= 0 ? '▲' : '▼'} {Math.abs(scoreDifference).toFixed(1)} · 이전 {previousScore}점
                                            </StatusBadge>
                                        </div>
                                    )}
                                </div>
                            }
                            bodyClassName="mt-4"
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge variant={selectedSafetyTone.badgeVariant}>{selectedRecord.safetyLevel}</StatusBadge>
                                <StatusBadge variant={getRoleBadgeVariant(editableRecord.role)}>{getRoleLabel(editableRecord.role)}</StatusBadge>
                                {editableRecord.isTranslator && <StatusBadge variant="sky">통역</StatusBadge>}
                                {editableRecord.isSignalman && <StatusBadge variant="emeraldSoft">신호수</StatusBadge>}
                            </div>
                            <SummaryMetricGrid
                                className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
                                cardClassName="rounded-2xl border px-4 py-3"
                                items={[
                                    {
                                        key: 'safety',
                                        label: '현재 수준',
                                        value: selectedRecord.safetyLevel,
                                        helper: `${selectedRecord.safetyScore}점`,
                                        tone: BRAND_TONE.slate,
                                        valueClassName: `mt-1 text-lg font-black ${selectedSafetyTone.text}`,
                                    },
                                    {
                                        key: 'role',
                                        label: '역할',
                                        value: getRoleLabel(editableRecord.role),
                                        helper: editableRecord.teamLeader || '팀장 미지정',
                                        tone: BRAND_TONE.indigo,
                                        valueClassName: 'mt-1 text-lg font-black text-indigo-700',
                                        helperClassName: 'mt-1 text-xs font-bold text-indigo-500',
                                    },
                                    {
                                        key: 'job',
                                        label: '공종/국적',
                                        value: editableRecord.jobField,
                                        helper: editableRecord.nationality,
                                        tone: BRAND_TONE.emerald,
                                        valueClassName: 'mt-1 text-lg font-black text-emerald-700',
                                        helperClassName: 'mt-1 text-xs font-bold text-emerald-600',
                                    },
                                ]}
                            />
                        </SectionPanelCard>

                        <ActionButton onClick={() => onViewDetails(selectedRecord)} variant="indigo" fullWidth className="justify-center rounded-md px-4 py-2 text-sm font-semibold">
                            상세 보기
                        </ActionButton>
                        
                        {/* Editable sections */}
                        <div className="space-y-4">
                            <SectionPanelCard
                                variant="whiteSoft"
                                eyebrow="기본 정보"
                                title="기본 정보 (수정 가능)"
                                description="이름, 공종, 국적, 팀장, 역할과 특수 임무를 함께 조정합니다."
                                className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
                                titleClassName="mt-1 text-sm font-semibold text-slate-700"
                                descriptionClassName="mt-1 text-[11px] font-medium text-slate-500"
                                bodyClassName="mt-4"
                            >
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 text-sm">
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
                            </SectionPanelCard>
                            <SectionPanelCard
                                variant="whiteSoft"
                                eyebrow="AI 분석 결과"
                                title="AI 분석 결과 (수정 가능)"
                                description="안전 점수와 안전 수준을 조정합니다."
                                className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
                                titleClassName="mt-1 text-sm font-semibold text-slate-700"
                                descriptionClassName="mt-1 text-[11px] font-medium text-slate-500"
                                bodyClassName="mt-4"
                            >
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
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
                            </SectionPanelCard>
                            <SectionPanelCard
                                variant="whiteSoft"
                                eyebrow="종합 인사이트"
                                title="종합 인사이트"
                                description="한국어 해석과 모국어 해석을 함께 확인합니다."
                                className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
                                titleClassName="mt-1 text-sm font-semibold text-slate-700"
                                descriptionClassName="mt-1 text-[11px] font-medium text-slate-500"
                                bodyClassName="mt-4"
                            >
                                 <div className="text-sm text-slate-600">
                                    <p className="mb-2">{editableRecord.aiInsights}</p>
                                    <hr className="border-slate-100 my-2"/>
                                    <p className="text-slate-500">{editableRecord.aiInsights_native}</p>
                                 </div>
                            </SectionPanelCard>
                        </div>
                    </main>
                </div>
                <footer className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end p-4 border-t border-slate-200 bg-slate-100 shrink-0 gap-2 sm:gap-3">
                    <ActionButton onClick={handleSave} variant="indigoSolid" fullWidth className="sm:w-auto px-5 py-2 text-sm font-semibold">
                        저장
                    </ActionButton>
                    <ActionButton onClick={() => { onClose(); onDeleteRecord(selectedRecord.id); }} variant="roseSoft" fullWidth className="sm:w-auto px-5 py-2 text-sm font-semibold">
                        이 기록 삭제
                    </ActionButton>
                </footer>
            </div>
        </div>
    );
};

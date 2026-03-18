import React, { useMemo, useState } from 'react';
import type { MasterTemplate } from './MasterTemplateList';

export type MasterGroup = {
    id: string;
    name: string;
};

export type MasterAssignmentItem = {
    id: string;
    groupId: string;
    templateId: string;
    status: 'active' | 'inactive';
    effectiveDate: string;
};

type MasterAssignmentProps = {
    groups: MasterGroup[];
    templates: MasterTemplate[];
    assignments: MasterAssignmentItem[];
    onAddGroup: (groupName: string) => void;
    onDeleteGroup: (groupId: string) => void;
    onCreateAssignment: (payload: { groupId: string; templateId: string; effectiveDate: string }) => void;
    onDeleteAssignment: (assignmentId: string) => void;
    onSetAssignmentStatus: (assignmentId: string, status: 'active' | 'inactive') => void;
};

export const MasterAssignment: React.FC<MasterAssignmentProps> = ({
    groups,
    templates,
    assignments,
    onAddGroup,
    onDeleteGroup,
    onCreateAssignment,
    onDeleteAssignment,
    onSetAssignmentStatus,
}) => {
    const [newGroupName, setNewGroupName] = useState('');
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));

    const assignmentRows = useMemo(() => {
        return assignments.map((item) => {
            const group = groups.find((g) => g.id === item.groupId);
            const template = templates.find((t) => t.id === item.templateId);
            return {
                ...item,
                groupName: group?.name || '알 수 없는 그룹',
                templateName: template?.name || '알 수 없는 템플릿',
                templateVersion: template?.version || '-',
            };
        });
    }, [assignments, groups, templates]);

    const handleAddGroup = () => {
        if (!newGroupName.trim()) return;
        onAddGroup(newGroupName.trim());
        setNewGroupName('');
    };

    const handleCreateAssignment = () => {
        if (!selectedGroupId || !selectedTemplateId) {
            alert('공종/팀 그룹과 템플릿을 모두 선택해 주세요.');
            return;
        }
        onCreateAssignment({ groupId: selectedGroupId, templateId: selectedTemplateId, effectiveDate });
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
            <div>
                <h4 className="text-lg font-black text-slate-900">공종·팀별 기록 양식 배정</h4>
                <p className="text-xs font-bold text-slate-500 mt-1">각 공종/팀 그룹에 사용할 기록 양식을 연결합니다.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="space-y-2 lg:col-span-1">
                    <p className="text-xs font-black text-slate-500">공종/팀 그룹 관리</p>
                    <div className="flex gap-2">
                        <input
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            placeholder="공종/팀 그룹명 추가 (예: 철근 1팀)"
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold"
                        />
                        <button
                            type="button"
                            onClick={handleAddGroup}
                            className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-black"
                        >
                            추가
                        </button>
                    </div>
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2 space-y-1">
                        {groups.length === 0 ? (
                            <p className="text-xs font-bold text-slate-400">등록된 그룹 없음</p>
                        ) : groups.map((group) => (
                            <div key={group.id} className="flex items-center justify-between rounded-lg bg-white border border-slate-200 px-2 py-1.5">
                                <span className="text-xs font-bold text-slate-700">{group.name}</span>
                                <button
                                    type="button"
                                    onClick={() => onDeleteGroup(group.id)}
                                    className="text-[11px] font-black text-rose-600"
                                >
                                    삭제
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="space-y-2 lg:col-span-2">
                    <p className="text-xs font-black text-slate-500">배정 등록</p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <select
                            value={selectedGroupId}
                            onChange={(e) => setSelectedGroupId(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold"
                        >
                            <option value="">공종/팀 그룹 선택</option>
                            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                        </select>
                        <select
                            value={selectedTemplateId}
                            onChange={(e) => setSelectedTemplateId(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold"
                        >
                            <option value="">템플릿 선택</option>
                            {templates.map((template) => <option key={template.id} value={template.id}>{template.name} ({template.version})</option>)}
                        </select>
                        <input
                            type="date"
                            value={effectiveDate}
                            onChange={(e) => setEffectiveDate(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold"
                        />
                        <button
                            type="button"
                            onClick={handleCreateAssignment}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-3 py-2 text-sm font-black"
                        >
                            배정 저장
                        </button>
                    </div>

                    <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2 space-y-2">
                        {assignmentRows.length === 0 ? (
                            <p className="text-xs font-bold text-slate-400">배정된 기록 양식이 없습니다.</p>
                        ) : assignmentRows.map((row) => (
                            <div key={row.id} className="rounded-xl bg-white border border-slate-200 px-3 py-2.5 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-black text-slate-900">{row.groupName}</p>
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded ${row.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                        {row.status === 'active' ? 'ACTIVE' : 'INACTIVE'}
                                    </span>
                                </div>
                                <p className="text-xs font-bold text-slate-600">템플릿: {row.templateName} ({row.templateVersion})</p>
                                <p className="text-[11px] font-bold text-slate-500">적용일: {row.effectiveDate}</p>
                                <div className="flex items-center gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => onSetAssignmentStatus(row.id, row.status === 'active' ? 'inactive' : 'active')}
                                        className="text-[11px] font-black px-2 py-1 rounded bg-indigo-50 text-indigo-700"
                                    >
                                        상태 전환
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onDeleteAssignment(row.id)}
                                        className="text-[11px] font-black px-2 py-1 rounded bg-rose-50 text-rose-700"
                                    >
                                        배정 삭제
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

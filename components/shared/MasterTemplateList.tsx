import React, { useState } from 'react';

export type MasterTemplate = {
    id: string;
    name: string;
    version: string;
    fieldSchema: string;
    updatedAt: string;
};

type MasterTemplateListProps = {
    templates: MasterTemplate[];
    selectedTemplateId: string;
    onSelectTemplate: (templateId: string) => void;
    onCreateTemplate: (payload: { name: string; version: string; fieldSchema: string }) => void;
    onDeleteTemplate: (templateId: string) => void;
};

export const MasterTemplateList: React.FC<MasterTemplateListProps> = ({
    templates,
    selectedTemplateId,
    onSelectTemplate,
    onCreateTemplate,
    onDeleteTemplate,
}) => {
    const [templateName, setTemplateName] = useState('');
    const [templateVersion, setTemplateVersion] = useState('v1.0.0');
    const [templateFieldSchema, setTemplateFieldSchema] = useState('이름, 근로자ID(worker_id), 국적, 공종, 위험요인, 통제조치, 확인서명');

    const handleCreateTemplate = () => {
        if (!templateName.trim()) {
            alert('템플릿 이름을 입력해 주세요.');
            return;
        }
        onCreateTemplate({
            name: templateName.trim(),
            version: templateVersion.trim() || 'v1.0.0',
            fieldSchema: templateFieldSchema.trim(),
        });
        setTemplateName('');
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div>
                <h4 className="text-lg font-black text-slate-900">기록 데이터 마스터 템플릿 관리</h4>
                <p className="text-xs font-bold text-slate-500 mt-1">양식 정의 / 서식 버전 관리의 중심 영역</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="템플릿 이름 (예: 위험성평가 전파교육 기본형)"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold"
                />
                <input
                    value={templateVersion}
                    onChange={(e) => setTemplateVersion(e.target.value)}
                    placeholder="버전 (예: v1.0.0)"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold"
                />
                <button
                    type="button"
                    onClick={handleCreateTemplate}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2.5 text-sm font-black"
                >
                    템플릿 추가
                </button>
            </div>

            <textarea
                value={templateFieldSchema}
                onChange={(e) => setTemplateFieldSchema(e.target.value)}
                placeholder="필드 스키마(쉼표 구분)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold min-h-[72px]"
            />

            <div className="space-y-2">
                {templates.length === 0 ? (
                    <p className="text-sm font-bold text-slate-400">등록된 마스터 템플릿이 없습니다.</p>
                ) : templates.map((template) => {
                    const selected = template.id === selectedTemplateId;
                    return (
                        <div
                            key={template.id}
                            className={`rounded-xl border px-3 py-3 flex items-start justify-between gap-3 ${selected ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}
                        >
                            <button
                                type="button"
                                onClick={() => onSelectTemplate(template.id)}
                                className="text-left flex-1"
                            >
                                <p className="text-sm font-black text-slate-900">{template.name}</p>
                                <p className="text-xs font-bold text-slate-500 mt-1">버전: {template.version} · 업데이트: {template.updatedAt}</p>
                                <p className="text-xs font-bold text-slate-600 mt-2 line-clamp-2">{template.fieldSchema}</p>
                            </button>
                            <button
                                type="button"
                                onClick={() => onDeleteTemplate(template.id)}
                                className="text-xs font-black text-rose-600 hover:text-rose-700"
                            >
                                삭제
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

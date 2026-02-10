
import React, { useState, useEffect, useRef } from 'react';
import type { WorkerRecord } from '../../types';
import { CircularProgress } from '../shared/CircularProgress';
import { updateAnalysisBasedOnEdits } from '../../services/geminiService';

interface RecordDetailModalProps {
    record: WorkerRecord;
    onClose: () => void;
    onBack: () => void;
    onUpdateRecord: (record: WorkerRecord) => void;
    onOpenReport: (record: WorkerRecord) => void;
    onReanalyze: (record: WorkerRecord) => Promise<WorkerRecord | null>;
    isReanalyzing: boolean;
}

export const RecordDetailModal: React.FC<RecordDetailModalProps> = ({ record: initialRecord, onClose, onBack, onUpdateRecord, onOpenReport, onReanalyze, isReanalyzing }) => {
    const [record, setRecord] = useState<WorkerRecord>(initialRecord);
    const [activeTab, setActiveTab] = useState<'info' | 'analysis' | 'qna'>('info');
    const [hasChanges, setHasChanges] = useState(false);
    const [isUpdatingAnalysis, setIsUpdatingAnalysis] = useState(false);
    
    const docInputRef = useRef<HTMLInputElement>(null); // For Document Image
    const profileInputRef = useRef<HTMLInputElement>(null); // For Profile Photo

    useEffect(() => { 
        setRecord(initialRecord); 
        setHasChanges(false); 
    }, [initialRecord]);

    const handleChange = <K extends keyof WorkerRecord>(field: K, value: WorkerRecord[K]) => {
        setRecord(prev => ({ ...prev, [field]: value } as WorkerRecord));
        setHasChanges(true);
    };

    const handleSave = () => {
        onUpdateRecord(record);
        setHasChanges(false);
        alert('저장되었습니다.');
    };

    const handleReanalyzeClick = async () => {
        if(confirm("이미지를 다시 OCR로 분석하시겠습니까? (현재 수정사항은 사라질 수 있습니다)")) {
            const updatedRecord = await onReanalyze(record);
            if (updatedRecord) {
                setRecord(updatedRecord);
                alert('이미지 재분석이 완료되었습니다.');
            }
        }
    };

    const handleReflectChanges = async () => {
        if (!hasChanges) {
            alert("변경 사항이 없습니다. 먼저 정보를 수정해주세요.");
            return;
        }
        
        const confirmMsg = `현재 수정된 정보(국적: ${record.nationality}, 점수: ${record.safetyScore}점, 팀장: ${record.teamLeader}, 직책: ${record.role}, 임무 등)를 바탕으로\nAI 분석 및 모국어 번역을 새로 생성하시겠습니까?`;
        
        if (confirm(confirmMsg)) {
            setIsUpdatingAnalysis(true);
            try {
                const updatedAnalysis = await updateAnalysisBasedOnEdits(record);
                if (updatedAnalysis) {
                    setRecord(prev => ({
                        ...prev,
                        ...updatedAnalysis
                    }));
                    setHasChanges(true); 
                    alert("수정된 정보에 맞춰 AI 분석 및 번역이 갱신되었습니다. '변경사항 저장'을 눌러 완료하세요.");
                } else {
                    alert("분석 갱신에 실패했습니다.");
                }
            } catch (e) {
                console.error(e);
                alert("오류가 발생했습니다.");
            } finally {
                setIsUpdatingAnalysis(false);
            }
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'original' | 'profile') => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = event.target?.result as string;
                if (result) {
                    if (type === 'original') {
                        setRecord(prev => ({ ...prev, originalImage: result, filename: file.name }));
                    } else {
                        setRecord(prev => ({ ...prev, profileImage: result }));
                    }
                    setHasChanges(true);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const hasOriginalImage = !!record.originalImage && record.originalImage.length > 50;
    const hasProfileImage = !!record.profileImage && record.profileImage.length > 50;
    
    // Icon Display
    const isLeader = (record.role === 'leader') || (record.name === record.teamLeader);
    const isSubLeader = record.role === 'sub_leader';

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex justify-center items-center p-2 sm:p-4 backdrop-blur-md" onClick={onClose}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-7xl h-[95vh] flex flex-col overflow-hidden animate-fade-in-up" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white z-20 shrink-0">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                        <div>
                            <h2 className="text-xl font-black text-slate-800">기록 상세 검증</h2>
                            <p className="text-[10px] text-indigo-500 font-bold tracking-widest uppercase">OCR Verification Mode</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {hasChanges && (
                            <button onClick={handleSave} className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-black shadow-lg shadow-indigo-200 animate-pulse">변경사항 저장</button>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                </header>

                <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
                    {/* LEFT: DOCUMENT IMAGE AREA */}
                    <div className="w-full lg:w-[50%] bg-slate-900 overflow-y-auto custom-scrollbar relative border-r border-slate-800 p-8 flex flex-col items-center">
                        <div className="sticky top-0 left-0 z-10 mb-6 w-full flex justify-between items-center gap-4">
                            <div className="flex flex-col items-start min-w-0 flex-1">
                                <span className="bg-black/60 text-white text-[10px] font-black px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-md uppercase tracking-widest mb-1">위험성 평가표 원본</span>
                                {record.filename && (
                                    <span className="text-xs text-slate-400 font-bold bg-slate-800/80 px-3 py-1.5 rounded border border-slate-700 max-w-full truncate" title={record.filename}>
                                        📄 {record.filename}
                                    </span>
                                )}
                            </div>
                            <button 
                                onClick={() => docInputRef.current?.click()}
                                className="bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold px-3 py-1.5 rounded-full backdrop-blur-md border border-white/20 transition-all flex items-center gap-2 shrink-0"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                {hasOriginalImage ? '문서 교체' : '문서 등록'}
                            </button>
                            <input type="file" ref={docInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'original')} />
                        </div>
                        
                        {hasOriginalImage ? (
                            <div className="w-full max-w-2xl bg-white shadow-2xl p-1 animate-fade-in group relative">
                                <img 
                                    src={record.originalImage} 
                                    className="w-full h-auto block" 
                                    alt="Scanned Document"
                                />
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                                <svg className="w-20 h-20 mb-4 opacity-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                <p className="font-black text-lg opacity-30 tracking-tight">원본 이미지가 없습니다.</p>
                                <button 
                                    onClick={() => docInputRef.current?.click()}
                                    className="mt-6 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-2"
                                >
                                    문서 이미지 업로드
                                </button>
                            </div>
                        )}
                    </div>

                    {/* RIGHT: PROFILE & INFO EDIT AREA */}
                    <div className="w-full lg:w-[50%] flex flex-col bg-slate-50 overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                            
                            {/* 1. Profile Photo Section (NEW) */}
                            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex items-center gap-6">
                                <div className="relative group shrink-0">
                                    <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-100 border-2 border-slate-200 shadow-inner flex items-center justify-center relative">
                                        {hasProfileImage ? (
                                            <img src={record.profileImage} className="w-full h-full object-cover" alt="Profile" />
                                        ) : (
                                            <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                        )}
                                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        </div>
                                        <input type="file" ref={profileInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'profile')} />
                                        <button onClick={() => profileInputRef.current?.click()} className="absolute inset-0 w-full h-full cursor-pointer"></button>
                                    </div>
                                    <div className="absolute -bottom-2 -right-2 bg-indigo-600 text-white p-1.5 rounded-full shadow border-2 border-white pointer-events-none">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-black text-slate-900 mb-1">증명사진(프로필) 등록</h3>
                                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                                        이곳에 등록된 사진은 <strong>사원증(ID Card)</strong> 및 <strong>개인 리포트</strong>의 프로필 영역에 사용됩니다. 
                                        문서 이미지와 별도로 관리됩니다.
                                    </p>
                                    {!hasProfileImage && (
                                        <button onClick={() => profileInputRef.current?.click()} className="mt-3 text-xs font-bold text-indigo-600 hover:underline">
                                            + 사진 업로드하기
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xs font-black text-indigo-600 flex items-center gap-3 uppercase tracking-widest">
                                        <span className="p-1.5 bg-indigo-50 rounded-lg">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                        </span>
                                        근로자 기본 정보 수정
                                    </h3>
                                    <button 
                                        onClick={handleReflectChanges} 
                                        disabled={isUpdatingAnalysis}
                                        className="text-[10px] font-bold bg-violet-100 text-violet-700 px-3 py-1.5 rounded-lg hover:bg-violet-200 transition-colors flex items-center gap-1"
                                    >
                                        {isUpdatingAnalysis ? (
                                            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        ) : (
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                        )}
                                        AI 분석 갱신 (수정사항 반영)
                                    </button>
                                </div>

                                <div className="space-y-6">
                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px]">
                                                근로자 성명 
                                                {isLeader && <span className="text-yellow-500 ml-1">👑</span>}
                                                {isSubLeader && <span className="text-slate-400 ml-1">🛡️</span>}
                                                {record.isTranslator && <span className="text-blue-500 ml-1">🗣️</span>}
                                                {record.isSignalman && <span className="text-green-500 ml-1">🚦</span>}
                                            </label>
                                            <input 
                                                type="text" 
                                                value={record.name} 
                                                onChange={(e) => handleChange('name', e.target.value)}
                                                className="w-full text-2xl font-black p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-600 h-[72px]"
                                                placeholder="성명 확인/수정"
                                            />
                                        </div>
                                        <div className="w-40 shrink-0">
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px] text-center">직급 (Hierarchy)</label>
                                            <div className="relative h-[72px]">
                                                <select 
                                                    value={record.role || 'worker'} 
                                                    onChange={(e) => handleChange('role', e.target.value)}
                                                    className={`w-full h-full px-4 rounded-2xl font-black text-xs appearance-none cursor-pointer border-2 transition-all shadow-sm focus:outline-none focus:ring-4 focus:ring-opacity-20
                                                        ${record.role === 'leader' 
                                                            ? 'bg-yellow-50 text-yellow-800 border-yellow-300 focus:ring-yellow-400' 
                                                            : record.role === 'sub_leader' 
                                                                ? 'bg-slate-100 text-slate-700 border-slate-300 focus:ring-slate-400' 
                                                                : 'bg-white text-slate-600 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500'}`}
                                                >
                                                    <option value="worker">일반 팀원</option>
                                                    <option value="sub_leader">부팀장/반장</option>
                                                    <option value="leader">팀장/소장</option>
                                                </select>
                                                <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                                                    <svg className={`w-5 h-5 ${
                                                        record.role === 'leader' ? 'text-yellow-600' :
                                                        'text-slate-400'
                                                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Duties Selection */}
                                    <div className="p-4 bg-slate-100 rounded-xl border border-slate-200">
                                        <label className="block text-[10px] font-black text-slate-500 uppercase mb-3 tracking-[2px]">특수 임무 부여 (겸직 가능)</label>
                                        <div className="flex gap-4">
                                            <label className={`flex-1 flex items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all ${record.isTranslator ? 'bg-blue-50 border-blue-400 text-blue-700 shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                                                <input type="checkbox" checked={!!record.isTranslator} onChange={(e) => handleChange('isTranslator', e.target.checked)} className="hidden" />
                                                <span className="text-xl mr-2">🗣️</span>
                                                <span className="font-bold text-sm">통역 담당</span>
                                            </label>
                                            <label className={`flex-1 flex items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all ${record.isSignalman ? 'bg-green-50 border-green-400 text-green-700 shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                                                <input type="checkbox" checked={!!record.isSignalman} onChange={(e) => handleChange('isSignalman', e.target.checked)} className="hidden" />
                                                <span className="text-xl mr-2">🚦</span>
                                                <span className="font-bold text-sm">신호수/유도원</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px]">공종</label>
                                            <input type="text" value={record.jobField} onChange={(e) => handleChange('jobField', e.target.value)} className="w-full font-bold p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-600" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px]">팀장 (Team Leader)</label>
                                            <input 
                                                type="text" 
                                                value={record.teamLeader || ""} 
                                                onChange={(e) => handleChange('teamLeader', e.target.value)} 
                                                placeholder="예: 홍길동 팀장"
                                                className="w-full font-bold p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-600" 
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px]">국적 (AI 번역 기준)</label>
                                            <select 
                                                value={record.nationality} 
                                                onChange={(e) => handleChange('nationality', e.target.value)} 
                                                className="w-full font-bold p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-600 appearance-none"
                                            >
                                                <option value="한국">한국 (Korea)</option>
                                                <option value="중국">중국 (China)</option>
                                                <option value="베트남">베트남 (Vietnam)</option>
                                                <option value="태국">태국 (Thailand)</option>
                                                <option value="캄보디아">캄보디아 (Cambodia)</option>
                                                <option value="인도네시아">인도네시아 (Indonesia)</option>
                                                <option value="우즈베키스탄">우즈베키스탄 (Uzbekistan)</option>
                                                <option value="몽골">몽골 (Mongolia)</option>
                                                <option value="카자흐스탄">카자흐스탄 (Kazakhstan)</option>
                                                <option value="필리핀">필리핀 (Philippines)</option>
                                                <option value="네팔">네팔 (Nepal)</option>
                                                <option value="미얀마">미얀마 (Myanmar)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px]">작성일 (Date)</label>
                                            <input 
                                                type="date" 
                                                value={record.date} 
                                                onChange={(e) => handleChange('date', e.target.value)}
                                                className="w-full font-bold p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-600"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2 p-1.5 bg-slate-200 rounded-2xl shrink-0">
                                {['info', 'analysis', 'qna'].map(t => (
                                    <button key={t} onClick={() => setActiveTab(t as 'info' | 'analysis' | 'qna')} className={`flex-1 py-3 text-xs font-black rounded-xl transition-all ${activeTab === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                        {t === 'info' ? '성과지표' : t === 'analysis' ? 'AI 인사이트' : '수기 답변'}
                                    </button>
                                ))}
                            </div>

                            <div className="min-h-[300px]">
                                {activeTab === 'info' && (
                                    <div className="bg-white p-10 rounded-3xl shadow-sm border border-slate-200 flex items-center justify-between group h-full">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 mb-2 uppercase tracking-[3px]">SAFETY SCORE</p>
                                            <input 
                                                type="number" 
                                                value={record.safetyScore} 
                                                onChange={(e) => handleChange('safetyScore', parseInt(e.target.value) || 0)}
                                                className="text-8xl font-black text-slate-900 w-48 focus:outline-none bg-transparent"
                                            />
                                        </div>
                                        <CircularProgress score={record.safetyScore} level={record.safetyLevel} />
                                    </div>
                                )}

                                {activeTab === 'analysis' && (
                                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm h-full min-h-[300px]">
                                        <div className="mb-4">
                                            <p className="text-xs text-slate-400 font-bold mb-1">KOREAN</p>
                                            <textarea 
                                                value={record.aiInsights} 
                                                onChange={(e) => handleChange('aiInsights', e.target.value)}
                                                className="w-full min-h-[120px] text-base text-slate-700 leading-relaxed border-none focus:ring-0 resize-none bg-slate-50 rounded-xl p-4 font-medium"
                                                placeholder="AI 분석 인사이트를 확인하거나 수정하세요."
                                            />
                                        </div>
                                        <div>
                                            <p className="text-xs text-indigo-400 font-bold mb-1 flex items-center gap-1">
                                                NATIVE ({record.nationality})
                                                <span className="text-[10px] text-slate-400 font-normal">* 국적 변경 후 'AI 분석 갱신' 클릭 시 자동 번역됨</span>
                                            </p>
                                            <textarea 
                                                value={record.aiInsights_native} 
                                                onChange={(e) => handleChange('aiInsights_native', e.target.value)}
                                                className="w-full min-h-[120px] text-base text-slate-600 leading-relaxed border-none focus:ring-0 resize-none bg-indigo-50/50 rounded-xl p-4 font-medium"
                                                placeholder="모국어 번역 내용입니다."
                                            />
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'qna' && (
                                    <div className="space-y-4 pb-4">
                                        {record.handwrittenAnswers.map((ans, idx) => (
                                            <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                                <div className="flex items-center gap-2 mb-4">
                                                    <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-widest">Question {ans.questionNumber}</span>
                                                </div>
                                                <div className="space-y-4">
                                                    <div className="bg-slate-50 p-4 rounded-xl">
                                                        <p className="text-xs text-slate-400 font-bold uppercase mb-1">OCR Original</p>
                                                        <p className="text-sm text-slate-500 italic">"{ans.answerText}"</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-indigo-400 font-bold uppercase mb-1">Translation</p>
                                                        <p className="text-base font-bold text-slate-800">{ans.koreanTranslation}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer Buttons */}
                        <div className="p-6 bg-white border-t border-slate-200 flex justify-between items-center shadow-inner z-10 shrink-0">
                            <button 
                                onClick={handleReanalyzeClick} 
                                disabled={isReanalyzing} 
                                className={`text-xs font-black flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${isReanalyzing ? 'bg-slate-100 text-slate-400' : 'text-slate-500 hover:bg-slate-100'}`}
                            >
                                <svg className={`w-4 h-4 ${isReanalyzing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth={2.5}/></svg>
                                이미지 전체 재분석 (OCR)
                            </button>
                            <button onClick={() => onOpenReport(record)} className="px-10 py-4 bg-slate-900 text-white rounded-2xl text-sm font-black shadow-2xl hover:bg-black transition-all transform hover:-translate-y-1">안전 리포트 보기</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

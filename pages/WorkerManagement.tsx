
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { WorkerRecord } from '../types';
import { generateReportUrl } from '../utils/qrUtils';

// [시스템] QR 코드 생성 상태 관리 및 동기화 컴포넌트
interface QRCodeProps {
    record: WorkerRecord;
    onLoad?: (success: boolean) => void;
}

const QRCodeComponent: React.FC<QRCodeProps> = ({ record, onLoad }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const generate = () => {
            const element = containerRef.current;
            if (!element) return;

            const QRCodeLib = (window as any).QRCode;
            if (!QRCodeLib) {
                console.error("QRCode library missing.");
                if (onLoad) onLoad(false); 
                return;
            }

            try {
                element.innerHTML = ''; // 초기화
                const qrUrl = generateReportUrl(record);
                
                if (!qrUrl) throw new Error("URL Gen Failed");

                new QRCodeLib(element, {
                    text: qrUrl,
                    width: 128, 
                    height: 128,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCodeLib.CorrectLevel ? QRCodeLib.CorrectLevel.L : 1 
                });
                
                // DOM 렌더링 완료 간주
                if (onLoad) onLoad(true);

            } catch (e) {
                console.error("QR Error:", e);
                element.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;"><span style="font-size:8px;font-weight:bold;color:red;">QR ERROR</span><span style="font-size:6px;">${record.id.slice(-4)}</span></div>`;
                if (onLoad) onLoad(true); 
            }
        };

        // UI 블로킹 방지를 위한 미세 지연
        const timer = setTimeout(generate, Math.random() * 100);
        return () => clearTimeout(timer);
    }, [record, onLoad]);

    return (
        <div ref={containerRef} className="w-full h-full flex items-center justify-center overflow-hidden bg-white"></div>
    );
};

// [디자인] 등급별 스타일 상수 (Industrial High-Contrast)
const getGradeStyle = (level: string) => {
    switch (level) {
        case '고급': return { 
            bg: 'bg-emerald-600', 
            lightBg: 'bg-emerald-50', 
            text: 'text-emerald-800', 
            border: 'border-emerald-600',
            badge: 'bg-emerald-600 text-white'
        };
        case '중급': return { 
            bg: 'bg-amber-500', 
            lightBg: 'bg-amber-50', 
            text: 'text-amber-800', 
            border: 'border-amber-500',
            badge: 'bg-amber-500 text-white'
        };
        case '초급': return { 
            bg: 'bg-rose-600', 
            lightBg: 'bg-rose-50', 
            text: 'text-rose-800', 
            border: 'border-rose-600',
            badge: 'bg-rose-600 text-white'
        };
        default: return { 
            bg: 'bg-slate-600', 
            lightBg: 'bg-slate-50', 
            text: 'text-slate-800', 
            border: 'border-slate-600',
            badge: 'bg-slate-600 text-white'
        };
    }
};

const getRoleBadge = (record: WorkerRecord) => {
    const badges = [];
    if (record.role === 'leader' || (record.name === record.teamLeader)) badges.push('👑 팀장');
    else if (record.role === 'sub_leader') badges.push('🛡️ 반장');
    
    if (record.isTranslator) badges.push('🗣️ 통역');
    if (record.isSignalman) badges.push('🚦 신호수');
    
    return badges;
};

// [컴포넌트] 안전모 스티커 (A4 최적화: 90mm x 60mm)
const PremiumSticker: React.FC<{ worker: WorkerRecord }> = ({ worker }) => {
    const s = getGradeStyle(worker.safetyLevel);
    const roles = getRoleBadge(worker);
    const mainRole = roles.length > 0 ? roles[0] : worker.jobField;

    return (
        <div className={`w-[90mm] h-[60mm] bg-white rounded-xl border-[3px] flex overflow-hidden relative break-inside-avoid box-border shadow-sm print:shadow-none ${s.border}`}>
            {/* 좌측: 등급 섹션 */}
            <div className={`w-[22mm] h-full ${s.bg} flex flex-col items-center justify-center text-white shrink-0 print-color-exact gap-2`}>
                <div className="text-center">
                    <span className="block text-[8px] font-bold opacity-80 mb-0.5">LEVEL</span>
                    <span className="block text-2xl font-black leading-none">{worker.safetyLevel === '초급' ? 'C' : worker.safetyLevel === '중급' ? 'B' : 'A'}</span>
                </div>
                <div className="w-8 h-px bg-white/30"></div>
                <div className="text-center">
                    <span className="block text-lg font-black">{worker.safetyScore}</span>
                    <span className="block text-[7px] font-bold opacity-80">SCORE</span>
                </div>
            </div>

            {/* 우측: 정보 섹션 */}
            <div className="flex-1 p-3 flex flex-col justify-between">
                <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">{worker.nationality}</span>
                            {worker.role === 'leader' && <span className="text-[10px] font-black bg-yellow-400 text-slate-900 px-1.5 py-0.5 rounded">팀장</span>}
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 leading-none truncate tracking-tight">{worker.name}</h2>
                        <p className="text-xs font-bold text-slate-500 mt-1 truncate">{mainRole} | {worker.jobField}</p>
                    </div>
                    <div className="w-[19mm] h-[19mm] bg-white border border-slate-200 rounded p-0.5 shrink-0">
                        <QRCodeComponent record={worker} />
                    </div>
                </div>

                <div className="mt-2">
                    <div className="bg-slate-50 rounded-lg p-2 border border-slate-100 flex items-center gap-2">
                        <div className="text-rose-500 font-bold text-xs shrink-0">⚠ 주의</div>
                        <div className="text-[10px] font-bold text-slate-600 truncate flex-1">
                            {worker.weakAreas[0] || '안전 수칙 준수 요망'}
                        </div>
                    </div>
                    <div className="flex justify-between items-end mt-1.5">
                        <span className="text-[8px] font-bold text-indigo-600">PSI SAFETY PASS</span>
                        <span className="text-[8px] font-mono text-slate-400 tracking-tighter">ID: {worker.id.slice(-6).toUpperCase()}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// [컴포넌트] 스마트 사원증 (A4 최적화: 54mm x 86mm)
const PremiumIDCard: React.FC<{ worker: WorkerRecord }> = ({ worker }) => {
    const s = getGradeStyle(worker.safetyLevel);
    const roles = getRoleBadge(worker);

    return (
        <div className="w-[54mm] h-[86mm] bg-white rounded-[4mm] border border-slate-300 overflow-hidden flex flex-col relative break-inside-avoid box-border shadow-sm print:shadow-none">
            {/* Header */}
            <div className="h-[16mm] bg-slate-900 flex items-center justify-between px-3 print-color-exact">
                <span className="text-white font-black text-xs tracking-widest">PSI</span>
                <div className="flex flex-col items-end">
                    <span className="text-[6px] text-slate-400 font-bold uppercase">Safety License</span>
                    <span className="text-[8px] text-white font-bold">2026</span>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 flex flex-col items-center pt-4 px-3 relative bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                
                {/* Photo Frame */}
                <div className="w-[28mm] h-[36mm] bg-slate-100 rounded border border-slate-200 mb-3 overflow-hidden relative shadow-inner">
                    {worker.profileImage ? (
                        <img src={worker.profileImage.startsWith('data:') ? worker.profileImage : `data:image/jpeg;base64,${worker.profileImage}`} className="w-full h-full object-cover" alt="Profile" />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        </div>
                    )}
                    <div className={`absolute bottom-0 w-full py-0.5 text-center text-[7px] font-black text-white ${s.bg} print-color-exact`}>
                        {worker.safetyLevel} GRADE
                    </div>
                </div>

                {/* Info */}
                <div className="text-center w-full">
                    <h2 className="text-lg font-black text-slate-900 leading-none truncate mb-1">{worker.name}</h2>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2 mb-2">
                        {worker.jobField} | {worker.nationality}
                    </p>
                    
                    {/* Tags */}
                    <div className="flex justify-center flex-wrap gap-1 mb-3">
                        {roles.slice(0, 3).map((role, i) => (
                            <span key={i} className="px-1.5 py-0.5 rounded-[3px] text-[7px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                {role}
                            </span>
                        ))}
                        {roles.length === 0 && <span className="text-[8px] text-slate-400">일반 근로자</span>}
                    </div>
                </div>

                {/* Footer QR */}
                <div className="mt-auto w-full mb-3 flex items-end justify-between">
                    <div className="text-left">
                        <p className="text-[6px] text-slate-400 font-bold uppercase">Issued</p>
                        <p className="text-[8px] font-bold text-slate-800">2026.01.01</p>
                    </div>
                    <div className="w-[14mm] h-[14mm] bg-white p-0.5 border border-slate-200 rounded">
                        <QRCodeComponent record={worker} />
                    </div>
                </div>
            </div>
        </div>
    );
};

const WorkerManagement: React.FC<{ workerRecords: WorkerRecord[]; onViewDetails: any }> = ({ workerRecords, onViewDetails }) => {
    const [isPrintMode, setIsPrintMode] = useState(false);
    const [printType, setPrintType] = useState<'sticker' | 'idcard'>('sticker');
    const [workersToPrint, setWorkersToPrint] = useState<WorkerRecord[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    
    const latestRecords = useMemo(() => {
        const map = new Map<string, WorkerRecord>();
        workerRecords.forEach(r => {
            const key = `${r.name}-${r.teamLeader || '미지정'}-${r.jobField}`;
            if (!map.has(key) || new Date(r.date) > new Date(map.get(key)!.date)) map.set(key, r);
        });
        return Array.from(map.values()).sort((a,b) => a.name.localeCompare(b.name));
    }, [workerRecords]);

    const filteredRecords = useMemo(() => {
        return latestRecords.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [latestRecords, searchTerm]);

    const startProcessing = (type: 'sticker' | 'idcard', targetWorkers: WorkerRecord[]) => {
        if (targetWorkers.length === 0) return alert('발급할 근로자 데이터가 없습니다.');
        setWorkersToPrint(targetWorkers);
        setPrintType(type);
        setIsPrintMode(true);
    };

    if (isPrintMode) {
        return (
            <div className="fixed inset-0 bg-slate-100 z-[3000] overflow-y-auto font-sans">
                {/* Print Control Header */}
                <div className="sticky top-0 bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center z-[3001] no-print shadow-sm">
                    <div className="flex items-center gap-6">
                        <div className={`p-3 rounded-2xl ${printType === 'sticker' ? 'bg-orange-50 text-orange-600' : 'bg-indigo-50 text-indigo-600'}`}>
                            {printType === 'sticker' 
                                ? <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                                : <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0c0 .884-.5 2-2 2h4c-1.5 0-2-1.116-2-2z" /></svg>
                            }
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-900">
                                {printType === 'sticker' ? '안전모 스티커' : '스마트 사원증'} 인쇄 미리보기
                            </h2>
                            <p className="text-slate-500 text-sm font-bold">
                                화면에 QR코드와 사진이 모두 보이면 [인쇄 시작]을 누르세요.
                            </p>
                        </div>
                    </div>
                    
                    <div className="hidden lg:flex flex-col items-end text-right mr-6">
                        <p className="text-xs font-bold text-rose-500 animate-pulse">⚠️ 인쇄 설정에서 '배경 그래픽'을 꼭 켜주세요!</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">용지 크기: A4 / 여백: 없음(권장)</p>
                    </div>

                    <div className="flex gap-3">
                        <button onClick={() => setIsPrintMode(false)} className="px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm">
                            닫기
                        </button>
                        <button 
                            onClick={() => window.print()} 
                            className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black shadow-lg hover:bg-indigo-700 hover:-translate-y-0.5 active:scale-95 cursor-pointer shadow-indigo-200 flex items-center gap-2 text-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                            인쇄 시작 (Print)
                        </button>
                    </div>
                </div>

                {/* Print Preview Area */}
                <div className="p-8 flex flex-col items-center min-h-screen bg-slate-100 print:bg-white print:p-0">
                    <div className="bg-white p-0 w-[210mm] min-h-[297mm] shadow-2xl print:shadow-none print:w-full print:h-auto overflow-hidden relative">
                        {/* A4 Grid Layout */}
                        <div className={`relative z-10 w-full h-full p-[10mm] grid content-start ${printType === 'sticker' ? "grid-cols-2 gap-x-[10mm] gap-y-[10mm]" : "grid-cols-3 gap-x-[5mm] gap-y-[10mm]"}`}>
                            {workersToPrint.map(w => (
                                <div key={w.id} className="flex justify-center items-start break-inside-avoid page-break-inside-avoid">
                                    {printType === 'sticker' 
                                        ? <PremiumSticker worker={w} /> 
                                        : <PremiumIDCard worker={w} />
                                    }
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <style>{`
                    @media print { 
                        @page { size: A4; margin: 0; }
                        .no-print { display: none !important; } 
                        body { background: white !important; margin: 0; padding: 0; } 
                        .fixed.inset-0 { position: relative !important; overflow: visible !important; background: white !important; display: block !important; height: auto !important; }
                        .print-color-exact { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                        .break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div className="space-y-10 animate-fade-in-up">
            {/* Header Section */}
            <div className="bg-slate-900 p-12 rounded-[40px] shadow-2xl text-white relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[100px] -mr-32 -mt-32 pointer-events-none"></div>
                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-center gap-12">
                    <div className="flex-1 text-center lg:text-left">
                        <div className="flex items-center justify-center lg:justify-start gap-3 mb-4">
                            <span className="bg-indigo-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-900/50">PSI Issuance System</span>
                        </div>
                        <h3 className="text-4xl lg:text-5xl font-black mb-4 tracking-tight leading-tight">근로자 보안 패스<br/>통합 발급 센터</h3>
                        <p className="text-slate-400 font-medium text-lg leading-relaxed max-w-xl">
                            현장의 안전 수준을 시각화하는 <span className="text-indigo-300 font-bold">스마트 스티커</span>와 <span className="text-indigo-300 font-bold">ID 카드</span>를 발급합니다.<br/>
                            대량 인쇄 시에는 '인쇄 미리보기' 화면에서 QR코드 생성을 확인 후 출력하세요.
                        </p>
                    </div>
                    <div className="flex gap-5 shrink-0">
                        <button onClick={() => startProcessing('sticker', filteredRecords)} className="group relative w-40 h-48 bg-white/5 border border-white/10 rounded-[30px] hover:bg-white/10 transition-all flex flex-col items-center justify-center gap-4 hover:-translate-y-2 duration-300">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                <span className="text-3xl">⛑</span>
                            </div>
                            <div className="text-center">
                                <span className="block text-lg font-black">안전모<br/>스티커</span>
                                <span className="text-[10px] text-slate-400 mt-1 block font-bold group-hover:text-white transition-colors">A4 라벨지 최적화</span>
                            </div>
                        </button>
                        <button onClick={() => startProcessing('idcard', filteredRecords)} className="group relative w-40 h-48 bg-indigo-600 rounded-[30px] shadow-2xl shadow-indigo-900/50 hover:bg-indigo-500 transition-all flex flex-col items-center justify-center gap-4 hover:-translate-y-2 duration-300 border border-indigo-400/30">
                            <div className="w-16 h-16 rounded-2xl bg-white text-indigo-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                <span className="text-3xl">💳</span>
                            </div>
                             <div className="text-center">
                                <span className="block text-lg font-black">스마트<br/>사원증</span>
                                <span className="text-[10px] text-indigo-200 mt-1 block font-bold group-hover:text-white transition-colors">NFC 스타일 디자인</span>
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="bg-white p-6 rounded-[30px] shadow-xl border border-slate-100 flex flex-wrap gap-4 items-center no-print">
                <div className="flex-1 relative min-w-[200px]">
                    <svg className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth={3}/></svg>
                    <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="근로자 이름으로 검색..." className="w-full bg-slate-50 border-transparent focus:bg-white focus:border-indigo-500 rounded-2xl pl-14 pr-6 py-4 font-bold text-base transition-all shadow-inner" />
                </div>
                <div className="bg-indigo-50 px-6 py-4 rounded-2xl text-indigo-700 font-bold text-sm border border-indigo-100 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    발급 대기: {filteredRecords.length}명
                </div>
            </div>

            {/* List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {filteredRecords.map(worker => {
                    const s = getGradeStyle(worker.safetyLevel);
                    return (
                        <div key={worker.id} className="bg-white p-5 rounded-[24px] border border-slate-100 hover:border-indigo-300 hover:shadow-2xl transition-all cursor-pointer group relative overflow-hidden flex flex-col gap-3" onClick={() => onViewDetails(worker)}>
                            {/* Glassmorphism Overlay Menu on Hover */}
                            <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-6">
                                <p className="text-white font-black mb-1">{worker.name}</p>
                                <button onClick={(e) => { e.stopPropagation(); startProcessing('sticker', [worker]); }} className="w-full py-3 bg-white text-slate-900 font-black rounded-xl hover:bg-slate-200 transition-colors shadow-lg flex items-center justify-center gap-2 text-xs">
                                    <span className="text-base">⛑</span> 스티커 인쇄
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); startProcessing('idcard', [worker]); }} className="w-full py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-500 transition-colors shadow-lg flex items-center justify-center gap-2 text-xs">
                                    <span className="text-base">💳</span> 사원증 인쇄
                                </button>
                            </div>

                            <div className="flex items-center gap-4 relative z-10">
                                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 shadow-inner relative">
                                    {worker.profileImage ? <img src={worker.profileImage.startsWith('data:') ? worker.profileImage : `data:image/jpeg;base64,${worker.profileImage}`} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl opacity-20">👷</div>}
                                    <div className={`absolute bottom-0 w-full h-1.5 ${s.bg}`}></div>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h4 className="text-lg font-black text-slate-800 truncate flex items-center gap-1">
                                        {worker.name}
                                    </h4>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase">{worker.jobField}</span>
                                        {getRoleBadge(worker).length > 0 && <span className="text-[9px] font-bold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded uppercase">{getRoleBadge(worker)[0]}</span>}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="pt-3 border-t border-slate-50 flex justify-between items-center relative z-10">
                                <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black ${s.lightBg} ${s.text} border ${s.border} border-opacity-20`}>{worker.safetyLevel} GRADE</span>
                                <span className="text-xl font-black text-slate-900 tracking-tighter">{worker.safetyScore}<span className="text-[9px] text-slate-300 ml-0.5 font-bold">PTS</span></span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
export default WorkerManagement;


import React, { useState, useEffect } from 'react';
import type { AppSettings } from '../types';

// [Guide Component] CSS-based Infographics for Beginners
const SettingsGuide: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    return (
        <div className="bg-white rounded-[30px] p-8 md:p-10 shadow-2xl border border-indigo-100 mb-10 relative animate-fade-in-up overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400"></div>
            <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            <div className="text-center mb-10">
                <span className="bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest mb-3 inline-block">Beginner's Guide</span>
                <h3 className="text-3xl font-black text-slate-900">3단계로 끝내는 시스템 설정</h3>
                <p className="text-slate-500 mt-2 font-medium">복잡해 보이지만 아주 간단합니다. 아래 그림을 따라 순서대로 진행해보세요.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
                {/* Connecting Line (Desktop) */}
                <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-1 bg-slate-100 -z-10"></div>

                {/* Step 1: API Key */}
                <div className="bg-white p-6 rounded-3xl border-2 border-slate-100 shadow-lg hover:border-indigo-200 transition-all group text-center relative">
                    <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center text-xl font-black mx-auto mb-4 shadow-lg shadow-indigo-200 group-hover:scale-110 transition-transform">1</div>
                    <h4 className="text-lg font-bold text-slate-800 mb-2">AI 두뇌 연결하기</h4>
                    <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                        Google의 AI(Gemini)를 사용하려면<br/>
                        <span className="text-indigo-600 font-bold">'전용 열쇠(API Key)'</span>가 필요합니다.
                    </p>
                    
                    {/* Visual: Key -> Cloud */}
                    <div className="h-24 bg-slate-50 rounded-2xl flex items-center justify-center gap-4 border border-slate-100 mb-4 px-4">
                        <div className="flex flex-col items-center">
                            <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center text-white shadow-sm">🔑</div>
                            <span className="text-[9px] font-bold text-slate-400 mt-1">Key 발급</span>
                        </div>
                        <div className="flex-1 h-1 bg-slate-200 rounded-full relative overflow-hidden">
                            <div className="absolute top-0 left-0 h-full w-1/2 bg-indigo-400 animate-[shimmer_1s_infinite]"></div>
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="w-10 h-10 bg-white border-2 border-indigo-100 rounded-full flex items-center justify-center text-xl shadow-sm">🧠</div>
                            <span className="text-[9px] font-bold text-slate-400 mt-1">PSI 시스템</span>
                        </div>
                    </div>
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="block w-full py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors">
                        Google에서 키 발급받기 →
                    </a>
                </div>

                {/* Step 2: Site Info */}
                <div className="bg-white p-6 rounded-3xl border-2 border-slate-100 shadow-lg hover:border-indigo-200 transition-all group text-center">
                    <div className="w-12 h-12 bg-white border-2 border-slate-200 text-slate-400 rounded-2xl flex items-center justify-center text-xl font-black mx-auto mb-4 group-hover:border-indigo-400 group-hover:text-indigo-500 transition-colors">2</div>
                    <h4 className="text-lg font-bold text-slate-800 mb-2">현장 명찰 만들기</h4>
                    <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                        입력하신 현장명과 관리자 이름은<br/>
                        <span className="text-indigo-600 font-bold">모든 리포트의 헤더와 인증서</span>에 인쇄됩니다.
                    </p>

                    {/* Visual: Input -> Report Header */}
                    <div className="h-24 bg-slate-50 rounded-2xl flex flex-col items-center justify-center border border-slate-100 mb-4 p-3 relative overflow-hidden">
                        <div className="w-full bg-white border border-slate-200 p-2 rounded-lg shadow-sm mb-2 scale-90 origin-bottom">
                            <div className="h-2 w-1/3 bg-slate-200 rounded mb-1"></div>
                            <div className="h-1 w-1/2 bg-slate-100 rounded"></div>
                        </div>
                        <div className="text-indigo-500">▼</div>
                        <div className="w-full bg-white border border-slate-200 p-2 rounded-lg shadow-md scale-100 z-10 flex justify-between items-center">
                            <div className="text-[8px] font-bold text-slate-800">OO건설 리포트</div>
                            <div className="text-[6px] text-slate-400">Manager: 홍길동</div>
                        </div>
                    </div>
                </div>

                {/* Step 3: Job Fields */}
                <div className="bg-white p-6 rounded-3xl border-2 border-slate-100 shadow-lg hover:border-indigo-200 transition-all group text-center">
                    <div className="w-12 h-12 bg-white border-2 border-slate-200 text-slate-400 rounded-2xl flex items-center justify-center text-xl font-black mx-auto mb-4 group-hover:border-indigo-400 group-hover:text-indigo-500 transition-colors">3</div>
                    <h4 className="text-lg font-bold text-slate-800 mb-2">우리 팀 등록하기</h4>
                    <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                        현장에 존재하는 공종들을 쉼표(,)로 구분해 적으면<br/>
                        <span className="text-indigo-600 font-bold">선택 메뉴(Dropdown)</span>가 자동으로 생성됩니다.
                    </p>

                    {/* Visual: Text -> Dropdown */}
                    <div className="h-24 bg-slate-50 rounded-2xl flex items-center justify-center gap-2 border border-slate-100 mb-4 px-2">
                        <div className="bg-white px-2 py-1 rounded border border-slate-200 text-[8px] text-slate-400">철근, 타설, 전기</div>
                        <div className="text-indigo-400">→</div>
                        <div className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg shadow-md text-[10px] font-bold flex items-center gap-1">
                            철근
                            <svg className="w-2 h-2 text-indigo-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const Settings: React.FC = () => {
    const [settings, setSettings] = useState<AppSettings>({
        siteName: '용인 푸르지오 원클러스터 2,3단지',
        siteManager: '정 용 현',
        safetyManager: '박 성 훈',
        jobFields: ['시스템', '용역', '철근', '분석', '배체정리', '형틀', '타설', '미장', '견출', '설비', '전기'],
        apiKey: ''
    });
    
    const [jobFieldInput, setJobFieldInput] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [showGuide, setShowGuide] = useState(false); // Default hidden

    useEffect(() => {
        const savedSettings = localStorage.getItem('psi_app_settings');
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                setSettings(prev => ({ ...prev, ...parsed }));
                setJobFieldInput(parsed.jobFields.join(', '));
            } catch (e) {
                console.error("Failed to load settings", e);
            }
        } else {
            setJobFieldInput(settings.jobFields.join(', '));
            // If no settings exist (first time), show guide automatically
            setShowGuide(true);
        }
    }, []);

    const handleSave = () => {
        const fields = jobFieldInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
        const newSettings = { ...settings, jobFields: fields };
        
        localStorage.setItem('psi_app_settings', JSON.stringify(newSettings));
        setSettings(newSettings);
        
        alert("설정이 저장되었습니다. 시스템에 즉시 반영됩니다.");
        window.location.reload(); 
    };

    const handleResetData = () => {
        if (confirm("⚠️ 경고: 모든 데이터가 삭제됩니다 (근로자 기록, 점검 일지 등).\n설정 정보(API 키 등)는 유지됩니다.\n\n정말 초기화 하시겠습니까?")) {
            localStorage.removeItem('psi_safety_checks');
            localStorage.removeItem('psi_site_issues');
            alert("로컬 저장소 데이터가 정리되었습니다. 완벽한 초기화를 위해 브라우저의 '사이트 데이터 삭제'를 권장합니다.\n페이지를 새로고침합니다.");
            window.location.reload();
        }
    };

    return (
        <div className="space-y-8 animate-fade-in-up pb-12">
            <div className="bg-slate-900 rounded-[30px] p-10 text-white shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl -mr-32 -mt-32"></div>
                <div className="relative z-10">
                    <h2 className="text-3xl font-black mb-2">시스템 설정 (System Configuration)</h2>
                    <p className="text-slate-400 max-w-xl text-lg">
                        현장 맞춤형 환경을 구성하고 API 키를 관리하세요.<br/>
                        모든 설정은 브라우저에 안전하게 저장됩니다.
                    </p>
                </div>
                <div className="relative z-10 shrink-0">
                    <button 
                        onClick={() => setShowGuide(!showGuide)} 
                        className={`px-6 py-3 rounded-2xl font-bold text-sm transition-all flex items-center gap-2 shadow-lg
                            ${showGuide ? 'bg-white text-indigo-900' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
                    >
                        {showGuide ? (
                            <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                가이드 닫기
                            </>
                        ) : (
                            <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                                초보자 가이드 보기
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Beginner Guide Section */}
            {showGuide && <SettingsGuide onClose={() => setShowGuide(false)} />}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 1. API Key Settings */}
                <div className="bg-white p-8 rounded-3xl shadow-xl border border-indigo-100 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-bl-[60px] -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2 relative z-10">
                        <span className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                        </span>
                        1단계: Google Gemini API 연결
                    </h3>
                    <div className="space-y-4 relative z-10">
                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-2 flex justify-between">
                                API Key 입력
                                <span className="text-xs text-indigo-500 font-normal cursor-pointer hover:underline" onClick={() => window.open("https://aistudio.google.com/app/apikey")}>키가 없으신가요?</span>
                            </label>
                            <div className="relative">
                                <input 
                                    type={showKey ? "text" : "password"} 
                                    value={settings.apiKey} 
                                    onChange={(e) => setSettings({...settings, apiKey: e.target.value})}
                                    placeholder="AI Studio에서 발급받은 키를 여기에 붙여넣으세요 (AIza...)"
                                    className="w-full p-4 pr-12 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 font-mono text-sm transition-all"
                                />
                                <button 
                                    onClick={() => setShowKey(!showKey)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 p-1"
                                >
                                    {showKey ? (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                    )}
                                </button>
                            </div>
                            <div className="mt-3 bg-blue-50 p-3 rounded-xl flex items-start gap-3">
                                <svg className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <p className="text-xs text-blue-700 leading-relaxed">
                                    개인 API 키를 사용하면 속도 제한(Rate Limit)을 피하고 독립적인 운영이 가능합니다. 
                                    입력된 키는 이 컴퓨터(브라우저)에만 저장됩니다.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Site Info Settings */}
                <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-bl-[60px] -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2 relative z-10">
                        <span className="p-2 bg-slate-100 text-slate-600 rounded-lg">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                        </span>
                        2단계: 현장 정보 설정
                    </h3>
                    <div className="space-y-4 relative z-10">
                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-2">현장명 (Project Name)</label>
                            <input 
                                type="text" 
                                value={settings.siteName} 
                                onChange={(e) => setSettings({...settings, siteName: e.target.value})}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 font-bold text-slate-800 transition-all focus:bg-white"
                                placeholder="예: OO아파트 신축공사"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">현장소장</label>
                                <input 
                                    type="text" 
                                    value={settings.siteManager} 
                                    onChange={(e) => setSettings({...settings, siteManager: e.target.value})}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 font-bold text-slate-800 transition-all focus:bg-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">안전관리자</label>
                                <input 
                                    type="text" 
                                    value={settings.safetyManager} 
                                    onChange={(e) => setSettings({...settings, safetyManager: e.target.value})}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 font-bold text-slate-800 transition-all focus:bg-white"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Job Field Config */}
                <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 lg:col-span-2 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-[60px] -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2 relative z-10">
                        <span className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                        </span>
                        3단계: 공종 및 팀 구성 (Job Fields)
                    </h3>
                    <div className="space-y-2 relative z-10">
                        <label className="block text-sm font-bold text-slate-600">공종 리스트 (쉼표로 구분)</label>
                        <textarea 
                            value={jobFieldInput}
                            onChange={(e) => setJobFieldInput(e.target.value)}
                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 font-medium text-slate-700 h-32 transition-all focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                            placeholder="시스템, 철근, 형틀, 전기, 설비..."
                        />
                        <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
                            <span>* 입력된 공종은 근로자 등록 시 선택 가능한 옵션(Dropdown)으로 자동 변환됩니다.</span>
                            <span className="font-bold text-emerald-600">{jobFieldInput.split(',').filter(s=>s.trim()).length}개 공종 감지됨</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-4 mt-8 pt-8 border-t border-slate-200">
                <button 
                    onClick={handleResetData}
                    className="px-6 py-3 text-red-600 font-bold bg-red-50 hover:bg-red-100 rounded-xl transition-colors flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    데이터 초기화 (Factory Reset)
                </button>
                <button 
                    onClick={handleSave}
                    className="px-10 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:bg-indigo-700 hover:shadow-2xl transition-all transform hover:-translate-y-1 flex items-center gap-2"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    설정 저장 및 적용
                </button>
            </div>
        </div>
    );
};

export default Settings;

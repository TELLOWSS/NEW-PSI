
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
        apiKey: '',
        competencyWeights: {
            psychological: 0.20,
            jobUnderstanding: 0.22,
            riskAssessmentUnderstanding: 0.22,
            proficiency: 0.18,
            improvementExecution: 0.18,
            repeatViolationPenalty: 1,
            version: 'v1.0.0',
        },
        approvalPolicy: {
            strictRoleGate: false,
        },
    });

    const [jobFieldInput, setJobFieldInput] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [weightHistory, setWeightHistory] = useState<Array<{
        timestamp: string;
        previousVersion: string | null;
        nextVersion: string;
        weights: AppSettings['competencyWeights'];
    }>>([]);

    const weightSum =
        (settings.competencyWeights?.psychological || 0) +
        (settings.competencyWeights?.jobUnderstanding || 0) +
        (settings.competencyWeights?.riskAssessmentUnderstanding || 0) +
        (settings.competencyWeights?.proficiency || 0) +
        (settings.competencyWeights?.improvementExecution || 0);

    const updateWeights = (patch: Partial<NonNullable<AppSettings['competencyWeights']>>) => {
        setSettings((prev) => ({
            ...prev,
            competencyWeights: {
                psychological: prev.competencyWeights?.psychological ?? 0.2,
                jobUnderstanding: prev.competencyWeights?.jobUnderstanding ?? 0.22,
                riskAssessmentUnderstanding: prev.competencyWeights?.riskAssessmentUnderstanding ?? 0.22,
                proficiency: prev.competencyWeights?.proficiency ?? 0.18,
                improvementExecution: prev.competencyWeights?.improvementExecution ?? 0.18,
                repeatViolationPenalty: prev.competencyWeights?.repeatViolationPenalty ?? 1,
                version: prev.competencyWeights?.version ?? 'v1.0.0',
                ...patch,
            },
        }));
    };

    useEffect(() => {
        const savedSettings = localStorage.getItem('psi_app_settings');
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings) as AppSettings;
                setSettings((prev) => ({
                    ...prev,
                    ...parsed,
                    competencyWeights: {
                        ...prev.competencyWeights,
                        ...(parsed.competencyWeights || {}),
                    },
                    approvalPolicy: {
                        ...prev.approvalPolicy,
                        ...(parsed.approvalPolicy || {}),
                    },
                }));
                setJobFieldInput((parsed.jobFields || []).join(', '));
            } catch (e) {
                console.error('Failed to load settings', e);
            }
        } else {
            setJobFieldInput(settings.jobFields.join(', '));
            setShowGuide(true);
        }
    }, []);

    useEffect(() => {
        const historyRaw = localStorage.getItem('psi_competency_weight_history');
        if (!historyRaw) return;
        try {
            const parsed = JSON.parse(historyRaw);
            if (Array.isArray(parsed)) {
                setWeightHistory(parsed as Array<{
                    timestamp: string;
                    previousVersion: string | null;
                    nextVersion: string;
                    weights: AppSettings['competencyWeights'];
                }>);
            }
        } catch (e) {
            console.error('Failed to load weight history', e);
        }
    }, []);

    const handleSave = () => {
        const fields = jobFieldInput.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
        const prevRaw = localStorage.getItem('psi_app_settings');
        const prevSettings = prevRaw ? (JSON.parse(prevRaw) as AppSettings) : null;
        const previousVersion = prevSettings?.competencyWeights?.version || '';
        const nextVersion = settings.competencyWeights?.version || 'v1.0.0';

        if (weightSum < 0.95 || weightSum > 1.05) {
            const proceed = confirm(`가중치 합계(w1~w5)가 ${weightSum.toFixed(2)} 입니다.\n권장 범위는 1.00±0.05 입니다.\n\n이 상태로 저장하시겠습니까?`);
            if (!proceed) return;
        }

        const newSettings = { ...settings, jobFields: fields };

        if (previousVersion !== nextVersion) {
            const historyRaw = localStorage.getItem('psi_competency_weight_history');
            const history = historyRaw ? (JSON.parse(historyRaw) as Array<Record<string, unknown>>) : [];
            history.unshift({
                timestamp: new Date().toISOString(),
                previousVersion: previousVersion || null,
                nextVersion,
                weights: newSettings.competencyWeights,
            });
            const nextHistory = history.slice(0, 50);
            localStorage.setItem('psi_competency_weight_history', JSON.stringify(nextHistory));
            setWeightHistory(nextHistory as Array<{
                timestamp: string;
                previousVersion: string | null;
                nextVersion: string;
                weights: AppSettings['competencyWeights'];
            }>);
        }

        localStorage.setItem('psi_app_settings', JSON.stringify(newSettings));
        setSettings(newSettings);

        alert('설정이 저장되었습니다. 시스템에 즉시 반영됩니다.');
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

    const handleClearWeightHistory = () => {
        if (!confirm('가중치 버전 변경 이력을 모두 삭제하시겠습니까?')) return;
        localStorage.removeItem('psi_competency_weight_history');
        setWeightHistory([]);
        alert('가중치 이력이 초기화되었습니다.');
    };

    const handleApplyWeightHistory = (entry: {
        timestamp: string;
        previousVersion: string | null;
        nextVersion: string;
        weights: AppSettings['competencyWeights'];
    }) => {
        if (!entry.weights) return;
        const proceed = confirm(`${entry.nextVersion} 버전 가중치를 현재 설정에 복원하시겠습니까?\n(복원 후 반드시 '설정 저장 및 적용'을 눌러야 반영됩니다)`);
        if (!proceed) return;

        setSettings((prev) => ({
            ...prev,
            competencyWeights: {
                psychological: entry.weights?.psychological ?? 0.2,
                jobUnderstanding: entry.weights?.jobUnderstanding ?? 0.22,
                riskAssessmentUnderstanding: entry.weights?.riskAssessmentUnderstanding ?? 0.22,
                proficiency: entry.weights?.proficiency ?? 0.18,
                improvementExecution: entry.weights?.improvementExecution ?? 0.18,
                repeatViolationPenalty: entry.weights?.repeatViolationPenalty ?? 1,
                version: entry.weights?.version || entry.nextVersion || 'v1.0.0',
            },
        }));
    };

    return (
        <div className="space-y-6 sm:space-y-8 animate-fade-in-up pb-10 sm:pb-12">
            <div className="bg-slate-900 rounded-3xl sm:rounded-[30px] p-5 sm:p-8 md:p-10 text-white shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl -mr-32 -mt-32"></div>
                <div className="relative z-10">
                    <h2 className="text-2xl sm:text-3xl font-black mb-1.5 sm:mb-2">시스템 설정 (System Configuration)</h2>
                    <p className="text-slate-400 max-w-xl text-sm sm:text-base md:text-lg">현장 맞춤형 환경을 구성하고 API 키를 관리하세요.</p>
                </div>
                <button
                    onClick={() => setShowGuide(!showGuide)}
                    className={`relative z-10 w-full md:w-auto px-5 sm:px-6 py-3 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg ${showGuide ? 'bg-white text-indigo-900' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
                >
                    {showGuide ? '가이드 닫기' : '초보자 가이드 보기'}
                </button>
            </div>

            {showGuide && <SettingsGuide onClose={() => setShowGuide(false)} />}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-8">
                <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl border border-indigo-100">
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-5 sm:mb-6">1단계: Google Gemini API 연결</h3>
                    <label className="block text-sm font-bold text-slate-600 mb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        API Key 입력
                        <span className="text-xs text-indigo-500 font-normal cursor-pointer hover:underline" onClick={() => window.open('https://aistudio.google.com/app/apikey')}>키가 없으신가요?</span>
                    </label>
                    <div className="relative">
                        <input
                            type={showKey ? 'text' : 'password'}
                            value={settings.apiKey}
                            onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                            placeholder="AI Studio에서 발급받은 키를 붙여넣으세요"
                            className="w-full p-4 pr-12 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 font-mono text-sm transition-all"
                        />
                        <button onClick={() => setShowKey(!showKey)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600">{showKey ? '숨김' : '보기'}</button>
                    </div>
                </div>

                <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl border border-slate-200">
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-5 sm:mb-6">2단계: 현장 정보 설정</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-2">현장명</label>
                            <input type="text" value={settings.siteName} onChange={(e) => setSettings({ ...settings, siteName: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">현장소장</label>
                                <input type="text" value={settings.siteManager} onChange={(e) => setSettings({ ...settings, siteManager: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">안전관리자</label>
                                <input type="text" value={settings.safetyManager} onChange={(e) => setSettings({ ...settings, safetyManager: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl border border-slate-200 lg:col-span-2">
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-5 sm:mb-6">3단계: 공종 및 팀 구성</h3>
                    <textarea value={jobFieldInput} onChange={(e) => setJobFieldInput(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl h-32" placeholder="시스템, 철근, 형틀, 전기..." />
                    <div className="text-xs text-slate-400 mt-2">감지된 공종: <span className="font-bold text-emerald-600">{jobFieldInput.split(',').filter((s) => s.trim()).length}개</span></div>
                </div>

                <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl border border-violet-200 lg:col-span-2">
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-5 sm:mb-6">개인 안전역량 가중치 설정</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">심리 지표(w1)</label><input type="number" step="0.01" value={settings.competencyWeights?.psychological ?? 0.2} onChange={(e) => updateWeights({ psychological: Number(e.target.value) })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm" /></div>
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">업무 이해도(w2)</label><input type="number" step="0.01" value={settings.competencyWeights?.jobUnderstanding ?? 0.22} onChange={(e) => updateWeights({ jobUnderstanding: Number(e.target.value) })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm" /></div>
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">위험성평가 이해도(w3)</label><input type="number" step="0.01" value={settings.competencyWeights?.riskAssessmentUnderstanding ?? 0.22} onChange={(e) => updateWeights({ riskAssessmentUnderstanding: Number(e.target.value) })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm" /></div>
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">숙련도(w4)</label><input type="number" step="0.01" value={settings.competencyWeights?.proficiency ?? 0.18} onChange={(e) => updateWeights({ proficiency: Number(e.target.value) })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm" /></div>
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">개선이행도(w5)</label><input type="number" step="0.01" value={settings.competencyWeights?.improvementExecution ?? 0.18} onChange={(e) => updateWeights({ improvementExecution: Number(e.target.value) })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm" /></div>
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">반복위반 패널티(w6)</label><input type="number" step="0.1" value={settings.competencyWeights?.repeatViolationPenalty ?? 1} onChange={(e) => updateWeights({ repeatViolationPenalty: Number(e.target.value) })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm" /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">가중치 버전</label>
                            <input type="text" value={settings.competencyWeights?.version ?? 'v1.0.0'} onChange={(e) => updateWeights({ version: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm" />
                        </div>
                        <div className={`text-xs font-bold rounded-lg p-3 border ${weightSum >= 0.95 && weightSum <= 1.05 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                            현재 w1~w5 합계: {weightSum.toFixed(2)} {weightSum >= 0.95 && weightSum <= 1.05 ? '(권장 범위)' : '(권장 범위 이탈)'}
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl border border-amber-200 lg:col-span-2">
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-4">승인 정책</h3>
                    <label className="inline-flex items-center gap-3 cursor-pointer select-none">
                        <input type="checkbox" checked={!!settings.approvalPolicy?.strictRoleGate} onChange={(e) => setSettings({ ...settings, approvalPolicy: { ...(settings.approvalPolicy || { strictRoleGate: false }), strictRoleGate: e.target.checked } })} className="w-5 h-5 rounded border-slate-300 text-amber-600" />
                        <span className="text-sm font-bold text-slate-700">항상 안전관리자 엄격 기준으로 승인 차단 규칙 적용</span>
                    </label>
                </div>

                <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl border border-slate-200 lg:col-span-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                        <h3 className="text-lg sm:text-xl font-bold text-slate-900">가중치 버전 변경 이력</h3>
                        <button onClick={handleClearWeightHistory} className="px-3 py-2 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700">이력 초기화</button>
                    </div>
                    {weightHistory.length === 0 ? (
                        <p className="text-sm text-slate-400">저장된 가중치 버전 변경 이력이 없습니다.</p>
                    ) : (
                        <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                            {weightHistory.slice(0, 10).map((entry, idx) => (
                                <div key={`${entry.timestamp}-${idx}`} className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                        <div className="font-black text-slate-700">{entry.previousVersion || 'N/A'} → {entry.nextVersion}</div>
                                        <button onClick={() => handleApplyWeightHistory(entry)} className="w-full sm:w-auto px-2.5 py-1.5 text-[11px] font-black rounded-md bg-indigo-600 text-white hover:bg-indigo-700">이 버전 복원</button>
                                    </div>
                                    <div className="text-slate-500 mt-1">{new Date(entry.timestamp).toLocaleString()}</div>
                                    <div className="text-slate-600 mt-2">w1:{entry.weights?.psychological ?? '-'} / w2:{entry.weights?.jobUnderstanding ?? '-'} / w3:{entry.weights?.riskAssessmentUnderstanding ?? '-'} / w4:{entry.weights?.proficiency ?? '-'} / w5:{entry.weights?.improvementExecution ?? '-'} / w6:{entry.weights?.repeatViolationPenalty ?? '-'}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center gap-3 sm:gap-4 mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-slate-200">
                <button onClick={handleResetData} className="w-full sm:w-auto px-6 py-3 text-red-600 font-bold bg-red-50 hover:bg-red-100 rounded-xl transition-colors">데이터 초기화 (Factory Reset)</button>
                <button onClick={handleSave} className="w-full sm:w-auto px-10 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:bg-indigo-700 transition-all">설정 저장 및 적용</button>
            </div>
        </div>
    );
};

export default Settings;

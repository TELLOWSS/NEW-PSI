
import React, { useState, useEffect } from 'react';

const Introduction: React.FC = () => {
    const [isGravityOff, setIsGravityOff] = useState(false);

    useEffect(() => {
        if (isGravityOff) {
            document.body.classList.add('zero-gravity-active');
        } else {
            document.body.classList.remove('zero-gravity-active');
        }
        return () => {
            document.body.classList.remove('zero-gravity-active');
        };
    }, [isGravityOff]);

    const toggleGravity = () => {
        setIsGravityOff(!isGravityOff);
    };

    return (
        <div className="space-y-12 pb-12">
            {/* Hero Section */}
            <div className="relative bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 rounded-3xl shadow-2xl overflow-hidden text-white p-12 sm:p-20 text-center card-gravity-target">
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 opacity-20">
                    <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-500 rounded-full blur-3xl mix-blend-multiply animate-blob"></div>
                    <div className="absolute top-0 -right-4 w-72 h-72 bg-indigo-500 rounded-full blur-3xl mix-blend-multiply animate-blob animation-delay-2000"></div>
                    <div className="absolute -bottom-8 left-20 w-72 h-72 bg-purple-500 rounded-full blur-3xl mix-blend-multiply animate-blob animation-delay-4000"></div>
                </div>
                
                <div className="relative z-10 flex flex-col items-center">
                    <div className="w-28 h-28 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mb-8 shadow-inner border border-white/20 transform hover:scale-105 transition-transform duration-500">
                         {/* Updated Hero Logo: The Dynamic Shield */}
                         <svg className="h-20 w-20 text-white filter drop-shadow-lg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                            <defs>
                                <linearGradient id="heroLogoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#6366f1" /> {/* Indigo-500 */}
                                    <stop offset="100%" stopColor="#4338ca" /> {/* Indigo-700 */}
                                </linearGradient>
                            </defs>
                            {/* Dynamic Slope Shield: Asymmetric & Upward */}
                            <path d="M8 14 L40 6 V22 C40 34 33 42 24 44 C15 42 8 34 8 22 Z" fill="url(#heroLogoGradient)"/>
                            <circle cx="24" cy="25" r="7" stroke="white" strokeWidth="2.5" fill="none"/>
                            <circle cx="24" cy="25" r="3" fill="white"/>
                            <path d="M24 6 V16" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
                        </svg>
                    </div>
                    <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-6">
                        PSI: Proactive Safety Intelligence
                    </h1>
                    <p className="max-w-3xl text-lg sm:text-xl text-indigo-100 leading-relaxed mb-8 break-keep">
                        2026년, 데이터는 이제 정답을 제시합니다. PSI는 흩어져 있던 기록 속에서 사고의 패턴을 읽어내고 미래의 위험을 예측하여 <span className="font-bold text-white border-b-2 border-indigo-400 pb-0.5">오늘의 행동을 이끌어내는 자율 안전 AI 시스템</span>입니다.
                    </p>

                    <button 
                        onClick={toggleGravity}
                        className={`px-8 py-3 rounded-full font-bold text-lg transition-all duration-300 transform hover:scale-105 shadow-xl flex items-center gap-2
                        ${isGravityOff 
                            ? 'bg-red-500 hover:bg-red-600 text-white ring-4 ring-red-500/30' 
                            : 'bg-white hover:bg-indigo-50 text-indigo-900 ring-4 ring-white/30'
                        }`}
                    >
                        {isGravityOff ? (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                                현실 복귀 (중력 활성화)
                            </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                                무재해 Zero Gravity 모드 실행
                            </>
                        )}
                    </button>
                    <p className="mt-2 text-xs text-indigo-200 opacity-70">
                        * "Google Anti-Gravity" 컨셉을 재해석한 안전 기원 시각화 모드입니다.
                    </p>
                </div>
            </div>

            {/* Timeline Section - History */}
            <div className="max-w-5xl mx-auto px-4 card-gravity-target">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold text-slate-900 mb-3">PSI 탄생 배경</h2>
                    <p className="text-slate-500">PSI는 하루아침에 만들어지지 않았습니다. 현장의 필요와 고민 속에서, 더 나은 안전을 향한 열망이 기술과 만나 단계적으로 진화해 온 결과물입니다.</p>
                </div>

                <div className="relative border-l-4 border-indigo-100 ml-4 md:ml-1/2 space-y-12">
                    {/* 2026 (NEW) */}
                    <div className="relative md:flex items-center justify-between md:flex-row-reverse group card-gravity-target">
                        <div className="absolute -left-[22px] md:left-auto md:right-1/2 md:-mr-[11px] top-0 w-10 h-10 bg-white border-4 border-indigo-600 rounded-full z-10 shadow-lg shadow-indigo-200 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                             <div className="w-4 h-4 bg-indigo-600 rounded-full"></div>
                        </div>
                        <div className="ml-10 md:ml-0 md:w-[45%] p-6 bg-gradient-to-br from-indigo-50 to-white rounded-2xl shadow-xl border border-indigo-100 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 ring-1 ring-indigo-100">
                            <span className="text-indigo-700 font-bold text-sm mb-2 block">2026년 (현재)</span>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">자율 안전 AI의 원년</h3>
                            <p className="text-slate-700 text-sm leading-relaxed">
                                PSI 2.0 런칭. 단순 관리 도구를 넘어, 현장의 위험을 스스로 학습하고 예측하는 '인공지능 안전 파트너'로서 건설 현장의 새로운 표준을 제시하고 있습니다.
                            </p>
                        </div>
                        <div className="hidden md:block md:w-[45%]"></div>
                    </div>

                    {/* 2025 */}
                    <div className="relative md:flex items-center justify-between group card-gravity-target">
                        <div className="absolute -left-[22px] md:left-1/2 md:-ml-[11px] top-0 w-10 h-10 bg-white border-4 border-indigo-400 rounded-full z-10 shadow-md flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                             <div className="w-3 h-3 bg-indigo-400 rounded-full"></div>
                        </div>
                        <div className="ml-10 md:ml-0 md:w-[45%] p-6 bg-white rounded-2xl shadow-lg border border-slate-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                            <span className="text-indigo-600 font-bold text-sm mb-2 block">2025년</span>
                            <h3 className="text-xl font-bold text-slate-800 mb-3">통합 시스템 PSI의 탄생</h3>
                            <p className="text-slate-600 text-sm leading-relaxed">
                                단순한 데이터 변환을 넘어, 분석, 예측, 관리, 보고까지 이어지는 통합 플랫폼의 필요성을 절감했습니다. 그렇게 현장의 모든 데이터를 연결하고 예측하는 안전의 두뇌, PSI 1.0이 구축되었습니다.
                            </p>
                        </div>
                        <div className="hidden md:block md:w-[45%]"></div>
                    </div>

                    {/* 2024 */}
                    <div className="relative md:flex items-center justify-between md:flex-row-reverse group card-gravity-target">
                        <div className="absolute -left-[22px] md:left-auto md:right-1/2 md:-mr-[11px] top-0 w-10 h-10 bg-white border-4 border-slate-300 rounded-full z-10 shadow-md flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                            <div className="w-3 h-3 bg-slate-400 rounded-full"></div>
                        </div>
                        <div className="ml-10 md:ml-0 md:w-[45%] p-6 bg-white rounded-2xl shadow-lg border border-slate-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                            <span className="text-slate-500 font-bold text-sm mb-2 block">2024년</span>
                            <h3 className="text-xl font-bold text-slate-800 mb-3">데이터화의 필요성과 OCR 기술 도입</h3>
                            <p className="text-slate-600 text-sm leading-relaxed">
                                쌓여가는 종이 기록지 속에서 의미 있는 패턴을 찾기 어려웠습니다. 데이터의 정량화와 빅데이터화를 위해, 수기 문서를 디지털로 변환하는 AI OCR 기술을 도입하여 분석의 초석을 다졌습니다.
                            </p>
                        </div>
                        <div className="hidden md:block md:w-[45%]"></div>
                    </div>

                    {/* 2023 */}
                    <div className="relative md:flex items-center justify-between group card-gravity-target">
                        <div className="absolute -left-[22px] md:left-1/2 md:-ml-[11px] top-0 w-10 h-10 bg-white border-4 border-slate-300 rounded-full z-10 shadow-md flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                            <div className="w-3 h-3 bg-slate-400 rounded-full"></div>
                        </div>
                        <div className="ml-10 md:ml-0 md:w-[45%] p-6 bg-white rounded-2xl shadow-lg border border-slate-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                            <span className="text-slate-500 font-bold text-sm mb-2 block">2023년</span>
                            <h3 className="text-xl font-bold text-slate-800 mb-3">수기 위험성 평가 기록지 개발</h3>
                            <p className="text-slate-600 text-sm leading-relaxed">
                                현장의 목소리를 담기 위해 시작된 첫 걸음. 외국인 근로자와의 소통 장벽을 넘기 위해 직관적인 그림과 모국어 번역을 병기한 기록지를 개발하고 현장에 적용했습니다.
                            </p>
                        </div>
                        <div className="hidden md:block md:w-[45%]"></div>
                    </div>
                </div>
            </div>

            {/* Philosophy & Values */}
            <div className="bg-slate-50 rounded-3xl p-12 card-gravity-target">
                <div className="text-center mb-10">
                    <h2 className="text-3xl font-bold text-slate-900">PSI 브랜드 철학: 예측의 방패</h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                    <div className="flex justify-center">
                        {/* Visual Representation of Logo - LARGE VERSION */}
                        <div className="w-64 h-64 relative animate-float">
                             <svg className="w-full h-full drop-shadow-2xl" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                                <defs>
                                    <linearGradient id="largeLogoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#4f46e5" /> {/* Indigo-600 */}
                                        <stop offset="100%" stopColor="#4338ca" /> {/* Indigo-700 */}
                                    </linearGradient>
                                </defs>
                                {/* Dynamic Slope Shield (Asymmetric) */}
                                <path d="M8 14 L40 6 V22 C40 34 33 42 24 44 C15 42 8 34 8 22 Z" fill="url(#largeLogoGradient)"/>
                                <circle cx="24" cy="25" r="7" stroke="white" strokeWidth="2.5" className="animate-pulse-slow" fill="none"/>
                                <circle cx="24" cy="25" r="3" fill="white"/>
                                <path d="M24 6 V16" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
                            </svg>
                            <div className="absolute -bottom-10 left-1/2 transform -translate-x-1/2 text-4xl font-black text-slate-800 tracking-widest">PSI</div>
                        </div>
                    </div>
                    
                    <div className="space-y-8">
                        <p className="text-slate-600 leading-relaxed">
                            PSI 로고는 단순한 상징을 넘어, 우리가 추구하는 '선제적 안전'의 철학을 담고 있습니다. 각 요소는 시스템의 핵심 가치를 시각적으로 표현합니다.
                        </p>
                        
                        <div className="flex items-start space-x-4">
                            <div className="p-3 bg-blue-100 rounded-xl text-blue-600 shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">견고한 방패 (The Shield)</h3>
                                <p className="text-slate-500 text-sm mt-1">기본 형태인 방패는 현장과 근로자를 모든 위험으로부터 보호하겠다는 굳건한 약속을 상징합니다.</p>
                            </div>
                        </div>

                        <div className="flex items-start space-x-4">
                            <div className="p-3 bg-indigo-100 rounded-xl text-indigo-600 shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">비대칭적 형태 (The Asymmetry)</h3>
                                <p className="text-slate-500 text-sm mt-1">정적인 대칭을 벗어난 형태는 위험을 기다리는 '수동적 방어'가 아닌, <span className="font-bold text-indigo-600">우상향하며 미래를 향해 나아가는 '능동적 보호'</span>와 혁신을 의미합니다.</p>
                            </div>
                        </div>

                        <div className="flex items-start space-x-4">
                            <div className="p-3 bg-violet-100 rounded-xl text-violet-600 shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">AI의 눈 (The AI Eye)</h3>
                                <p className="text-slate-500 text-sm mt-1">중심부의 데이터 회로 눈동자는 AI의 지능으로 보이지 않는 패턴을 읽어내고 미래의 위험을 예측하는 시스템의 핵심 능력을 나타냅니다.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Developer Message */}
            <div className="mt-20 bg-white rounded-3xl p-12 text-center shadow-xl border border-slate-100 relative overflow-hidden card-gravity-target">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
                <h2 className="text-2xl font-bold text-slate-900 mb-8">개발자 메시지</h2>
                <div className="max-w-3xl mx-auto">
                    <div className="flex items-start">
                        <div className="hidden sm:block mr-6">
                            <div className="w-1 bg-indigo-200 h-full rounded-full"></div>
                        </div>
                        <div className="text-left">
                            <p className="text-slate-700 text-lg leading-8 italic font-medium">
                                "PSI는 단순한 도구가 아닙니다. 이는 '모든 근로자가 안전하게 집으로 돌아가야 한다'는 저희의 믿음이자, 현장을 향한 굳은 약속입니다. 저희는 데이터와 코드 한 줄 한 줄에 진심을 담았습니다. 이 진심이 2026년에도 모든 현장의 안전을 밝히는 등대가 되기를 소망합니다."
                            </p>
                            <div className="mt-6 flex items-center justify-end gap-3">
                                <div className="text-right">
                                    <p className="text-slate-900 font-black text-lg">박성훈 부장</p>
                                    <p className="text-indigo-600 text-sm font-bold">(주)휘강건설</p>
                                    <p className="text-slate-400 text-xs mt-0.5">PSI Project Lead Developer</p>
                                </div>
                                <div className="relative group shrink-0">
                                    {/* Golden Glow Effect */}
                                    <div className="absolute -inset-1 bg-gradient-to-tr from-amber-200 to-yellow-500 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
                                    <div className="relative w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center border border-slate-800 shadow-xl overflow-hidden">
                                        {/* Metallic Texture Overlay */}
                                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                                        
                                        {/* Stylized 'P' Logo */}
                                        <svg className="w-7 h-7 z-10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <defs>
                                                <linearGradient id="gold-leaf-intro" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                                                    <stop offset="0%" stopColor="#FDE68A" /> {/* Amber 200 */}
                                                    <stop offset="40%" stopColor="#D97706" /> {/* Amber 600 */}
                                                    <stop offset="70%" stopColor="#F59E0B" /> {/* Amber 500 */}
                                                    <stop offset="100%" stopColor="#FFFBEB" /> {/* Amber 50 */}
                                                </linearGradient>
                                            </defs>
                                            <path d="M7 4V20" stroke="url(#gold-leaf-intro)" strokeWidth="2.5" strokeLinecap="round"/>
                                            <path d="M7 6H12C15.5 6 18 8.5 18 12C18 15.5 15.5 18 12 18H7" stroke="url(#gold-leaf-intro)" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.9"/>
                                            <circle cx="13" cy="12" r="1.5" fill="url(#gold-leaf-intro)" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Introduction;

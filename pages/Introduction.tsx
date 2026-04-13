
import React, { useState, useEffect, useMemo } from 'react';
import { BrandPhilosophyLogo } from '../components/shared/BrandPhilosophyLogo';
import { PSI_APP_VERSION, PSI_CURRENT_RELEASE, PSI_SYSTEM_NAME } from '../lib/appInfo';
import { InterpretationCardGrid, type InterpretationCardItem } from '../components/shared/InterpretationCardGrid';
import { BRAND_TONE } from '../utils/brandToneTokens';

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

    const latestUpgradeColumns = [
        PSI_CURRENT_RELEASE.highlights.slice(0, 3),
        PSI_CURRENT_RELEASE.highlights.slice(3),
    ];

    const introSummaryCards: InterpretationCardItem[] = useMemo(() => [
        {
            key: 'intro-status',
            eyebrow: '지금 상태',
            title: `PSI ${PSI_APP_VERSION}의 현재 정체성과 신뢰 기반을 소개하는 화면입니다.`,
            description: '이 화면은 단순 소개서가 아니라 PSI가 왜 보호 중심 안전 파트너인지 사용자에게 처음 설명하는 진입점 역할을 합니다.',
            tone: BRAND_TONE.indigoSoft70,
        },
        {
            key: 'intro-evidence',
            eyebrow: '판단 근거',
            title: '브랜드 원칙, 권리화 현황, 연혁, 철학, 최신 업그레이드가 함께 배치됩니다.',
            description: '제품의 기능보다 먼저 어떤 태도로 현장을 읽고 보호하는지 보여줘야 PSI의 차별성이 더 분명하게 전달됩니다.',
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'intro-action',
            eyebrow: '다음 행동',
            title: isGravityOff ? '브랜드 경험 모드를 유지한 채 핵심 메시지를 읽어보세요.' : '소개 화면에서 PSI의 보호 원칙을 먼저 이해하세요.',
            description: '사용자는 여기서 PSI가 사람을 평가하는 도구가 아니라 위험 신호를 보호 언어로 바꾸는 파트너라는 인상을 받아야 합니다.',
            tone: isGravityOff ? 'border-amber-200 bg-amber-50/80' : 'border-emerald-200 bg-emerald-50/80',
        },
    ], [isGravityOff]);

    const philosophyCards: InterpretationCardItem[] = useMemo(() => [
        {
            key: 'philosophy-status',
            eyebrow: '지금 상태',
            title: '브랜드 철학이 시각 요소와 함께 설명되고 있습니다.',
            description: '방패, 비대칭 구조, AI의 눈은 각각 보호, 능동 개입, 따뜻한 관찰이라는 PSI의 태도를 시각화합니다.',
            tone: BRAND_TONE.slate,
        },
        {
            key: 'philosophy-evidence',
            eyebrow: '판단 근거',
            title: '브랜드 원칙 3가지가 실제 UX 문장 구조의 기준입니다.',
            description: '평가보다 해석, 지적보다 보완, 감시보다 보호라는 원칙은 이후 대시보드와 운영 화면의 정보 구조로 이어집니다.',
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'philosophy-action',
            eyebrow: '다음 행동',
            title: '소개 문구와 실제 제품 경험이 같은 톤으로 이어져야 합니다.',
            description: '브랜드 페이지에서 약속한 메시지가 운영 화면에서도 그대로 느껴질 때 PSI의 신뢰가 더 강해집니다.',
            tone: BRAND_TONE.indigoSoft70,
        },
    ], []);

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
                        <BrandPhilosophyLogo className="h-20 w-20 filter drop-shadow-lg" />
                    </div>
                    <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-6">
                        PSI: Proactive Safety Intelligence
                    </h1>
                    <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-white/10 px-4 py-2 text-xs font-black tracking-[0.18em] text-emerald-100 backdrop-blur-md">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        CURRENT RELEASE {PSI_APP_VERSION}
                    </div>
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold text-white/90 backdrop-blur-md">
                        <span className="text-emerald-300">●</span>
                        깐깐하지만 내 편인 현장 안전 코치
                    </div>
                    <p className="max-w-3xl text-lg sm:text-xl text-indigo-100 leading-relaxed mb-8 break-keep">
                        PSI는 사람을 평가하기 위해 만들어진 시스템이 아닙니다. 거칠고 짧은 현장 기록 속에서도 위험의 신호를 놓치지 않고, 그 신호를 <span className="font-bold text-white border-b-2 border-indigo-400 pb-0.5">보호와 실행의 언어로 번역하는 현장 안전 파트너</span>입니다. 300명 이상의 대규모 현장에서도 안정적으로 작동하며, 근로자·관리자·경영진 각각에게 맞는 안전 판단 흐름을 제공합니다.
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

            <div className="max-w-5xl mx-auto px-4 card-gravity-target">
                <InterpretationCardGrid
                    items={introSummaryCards}
                    cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
                />
            </div>

            {/* System Trust & Patent Status */}
            <div className="max-w-5xl mx-auto px-4 card-gravity-target">
                <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-6 sm:p-8">
                    <div className="flex flex-wrap items-center gap-3 mb-5">
                        <div
                            className="relative group/patent rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                            title="특허출원 제10-2026-0039151호 (발명자: 박성훈)"
                            aria-label="특허출원 상태"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                    (e.currentTarget as HTMLDivElement).blur();
                                }
                            }}
                        >
                            <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 border border-sky-200 px-3 py-1 text-xs font-black text-sky-700">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l7 4v5c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V7l7-4z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                                </svg>
                                Pat. Pending
                            </div>
                            <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 max-w-[min(260px,calc(100vw-2rem))] rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-medium text-white opacity-0 shadow-lg transition-all duration-200 group-hover/patent:translate-y-0 group-hover/patent:opacity-100 group-focus-within/patent:translate-y-0 group-focus-within/patent:opacity-100 translate-y-1 sm:left-1/2 sm:w-max sm:max-w-none sm:-translate-x-1/2">
                                특허출원 제10-2026-0039151호 (발명자: 박성훈)
                            </div>
                        </div>
                        <h2 className="text-xl sm:text-2xl font-black text-slate-900">시스템 공신력 및 권리화 현황</h2>
                    </div>
                    <dl className="grid grid-cols-1 sm:grid-cols-[170px_1fr] gap-x-4 gap-y-2 text-sm">
                        <dt className="font-bold text-slate-600">시스템명</dt>
                        <dd className="text-slate-800">{PSI_SYSTEM_NAME}</dd>

                        <dt className="font-bold text-slate-600">출원번호</dt>
                        <dd className="text-slate-800">10-2026-0039151</dd>

                        <dt className="font-bold text-slate-600">출원일자</dt>
                        <dd className="text-slate-800">2026.03.04</dd>

                        <dt className="font-bold text-slate-600">발명자</dt>
                        <dd className="text-slate-800">박성훈</dd>

                        <dt className="font-bold text-slate-600">법적 상태</dt>
                        <dd className="text-slate-800">대한민국 특허청 심사 대기 및 우선권 주장(선출원) 완료</dd>
                    </dl>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 card-gravity-target">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-6 shadow-sm">
                        <p className="text-xs font-black tracking-[0.18em] text-emerald-700 mb-3">BRAND PRINCIPLE 01</p>
                        <h3 className="text-lg font-black text-slate-900 mb-2">평가보다 해석</h3>
                        <p className="text-sm leading-relaxed text-slate-700">PSI는 점수만 보여주지 않고 왜 그런 판단이 나왔는지 설명해 현장의 신뢰를 높입니다.</p>
                    </div>
                    <div className="rounded-3xl border border-indigo-100 bg-indigo-50 p-6 shadow-sm">
                        <p className="text-xs font-black tracking-[0.18em] text-indigo-700 mb-3">BRAND PRINCIPLE 02</p>
                        <h3 className="text-lg font-black text-slate-900 mb-2">지적보다 보완</h3>
                        <p className="text-sm leading-relaxed text-slate-700">근로자에게는 불합격 대신 보완 권고를, 관리자에게는 재검토 근거를 제시하는 코칭형 구조를 따릅니다.</p>
                    </div>
                    <div className="rounded-3xl border border-sky-100 bg-sky-50 p-6 shadow-sm">
                        <p className="text-xs font-black tracking-[0.18em] text-sky-700 mb-3">BRAND PRINCIPLE 03</p>
                        <h3 className="text-lg font-black text-slate-900 mb-2">감시보다 보호</h3>
                        <p className="text-sm leading-relaxed text-slate-700">동일한 분석 결과도 역할별 안전 언어로 바꿔 현장을 압박하지 않고 보호 중심의 행동으로 연결합니다.</p>
                    </div>
                </div>
            </div>

            {/* Timeline Section - History */}
            <div className="max-w-5xl mx-auto px-4 card-gravity-target">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold text-slate-900 mb-3">PSI 탄생 배경</h2>
                    <p className="text-slate-500">PSI는 단순한 AI 기능에서 출발하지 않았습니다. 현장의 심리와 위험 신호를 더 정확하게 이해하고, 그것을 사람을 살리는 언어로 바꾸기 위한 고민에서 시작되었습니다.</p>
                </div>

                <div className="relative border-l-4 border-indigo-100 ml-4 md:ml-1/2 space-y-12">
                    {/* 2026 Apr - v2.2 (NEW) */}
                    <div className="relative md:flex items-center justify-between md:flex-row-reverse group card-gravity-target">
                        <div className="absolute -left-[22px] md:left-auto md:right-1/2 md:-mr-[11px] top-0 w-10 h-10 bg-white border-4 border-emerald-600 rounded-full z-10 shadow-lg shadow-emerald-200 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                             <div className="w-4 h-4 bg-emerald-600 rounded-full animate-pulse"></div>
                        </div>
                        <div className="ml-10 md:ml-0 md:w-[45%] p-6 bg-gradient-to-br from-emerald-50 to-white rounded-2xl shadow-xl border border-emerald-100 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 ring-1 ring-emerald-100">
                            <span className="text-emerald-700 font-bold text-sm mb-2 block">{PSI_CURRENT_RELEASE.periodLabel}</span>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">PSI {PSI_APP_VERSION} - {PSI_CURRENT_RELEASE.title}</h3>
                            <p className="text-slate-700 text-sm leading-relaxed">
                                {PSI_CURRENT_RELEASE.summary}
                            </p>
                            <ul className="mt-4 space-y-1.5 text-[13px] font-semibold text-slate-700">
                                {PSI_CURRENT_RELEASE.highlights.slice(0, 3).map((item) => (
                                    <li key={item} className="flex items-start gap-2">
                                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="hidden md:block md:w-[45%]"></div>
                    </div>

                    {/* 2026 Feb - v2.1 */}
                    <div className="relative md:flex items-center justify-between group card-gravity-target">
                        <div className="absolute -left-[22px] md:left-1/2 md:-ml-[11px] top-0 w-10 h-10 bg-white border-4 border-indigo-600 rounded-full z-10 shadow-lg shadow-indigo-200 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                             <div className="w-4 h-4 bg-indigo-600 rounded-full"></div>
                        </div>
                        <div className="ml-10 md:ml-0 md:w-[45%] p-6 bg-gradient-to-br from-indigo-50 to-white rounded-2xl shadow-xl border border-indigo-100 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 ring-1 ring-indigo-100">
                            <span className="text-indigo-700 font-bold text-sm mb-2 block">2026년 02월</span>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">PSI 2.1 - Enterprise Grade</h3>
                            <p className="text-slate-700 text-sm leading-relaxed">
                                대규모 현장을 위한 안정성 강화. 300명 이상의 근로자 데이터를 안정적으로 처리하고, 무한 재시도 방지, 메모리 최적화 등 기업 환경에 필수적인 안정성과 확장성을 확보했습니다.
                            </p>
                        </div>
                        <div className="hidden md:block md:w-[45%]"></div>
                    </div>

                    {/* 2026 (EXISTING) */}
                    <div className="relative md:flex items-center justify-between group card-gravity-target">
                        <div className="absolute -left-[22px] md:left-1/2 md:-ml-[11px] top-0 w-10 h-10 bg-white border-4 border-indigo-600 rounded-full z-10 shadow-lg shadow-indigo-200 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                             <div className="w-4 h-4 bg-indigo-600 rounded-full"></div>
                        </div>
                        <div className="ml-10 md:ml-0 md:w-[45%] p-6 bg-gradient-to-br from-indigo-50 to-white rounded-2xl shadow-xl border border-indigo-100 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 ring-1 ring-indigo-100">
                            <span className="text-indigo-700 font-bold text-sm mb-2 block">2026년 01월</span>
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
                    <h2 className="text-3xl font-bold text-slate-900">PSI 브랜드 철학: 현장의 신호를 보호의 언어로 번역하다</h2>
                </div>

                <InterpretationCardGrid
                    items={philosophyCards}
                    cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
                />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                    <div className="flex justify-center">
                        {/* Visual Representation of Logo - LARGE VERSION */}
                        <div className="w-64 h-64 relative animate-float">
                            <BrandPhilosophyLogo className="w-full h-full drop-shadow-2xl" />
                            <div className="absolute -bottom-10 left-1/2 transform -translate-x-1/2 text-4xl font-black text-slate-800 tracking-widest">PSI</div>
                        </div>
                    </div>
                    
                    <div className="space-y-8">
                        <p className="text-slate-600 leading-relaxed">
                            PSI 로고는 단순한 상징이 아닙니다. 현장의 신호를 읽고, 그것을 보호와 실행의 언어로 바꾸는 브랜드 철학을 담고 있습니다. 각 요소는 정확함, 신뢰, 보호라는 핵심 가치를 시각적으로 표현합니다.
                        </p>
                        
                        <div className="flex items-start space-x-4">
                            <div className="p-3 bg-blue-100 rounded-xl text-blue-600 shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">견고한 방패 (The Shield)</h3>
                                <p className="text-slate-500 text-sm mt-1">기본 형태인 방패는 현장과 근로자를 위험으로부터 지키겠다는 굳건한 약속, 그리고 PSI가 끝까지 사용자 편에 서겠다는 브랜드 태도를 상징합니다.</p>
                            </div>
                        </div>

                        <div className="flex items-start space-x-4">
                            <div className="p-3 bg-indigo-100 rounded-xl text-indigo-600 shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">비대칭적 형태 (The Asymmetry)</h3>
                                <p className="text-slate-500 text-sm mt-1">정적인 대칭을 벗어난 형태는 위험을 기다리는 수동적 방어가 아니라, <span className="font-bold text-indigo-600">먼저 읽고 먼저 개입하는 능동적 보호</span>와 실행 중심의 안전 문화를 의미합니다.</p>
                            </div>
                        </div>

                        <div className="flex items-start space-x-4">
                            <div className="p-3 bg-violet-100 rounded-xl text-violet-600 shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">AI의 눈 (The AI Eye)</h3>
                                <p className="text-slate-500 text-sm mt-1">중심부의 눈동자는 보이지 않는 패턴을 읽어내는 AI의 예리함을 나타내지만, 그 목적은 감시가 아니라 현장의 작은 신호까지 놓치지 않는 따뜻한 관찰입니다.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Latest Upgrade Snapshot */}
            <div className="max-w-5xl mx-auto px-4 card-gravity-target">
                <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-6 sm:p-8">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 3v2.25m4.5-2.25v2.25M4.5 9h15m-15 0v8.25A2.25 2.25 0 006.75 19.5h10.5a2.25 2.25 0 002.25-2.25V9m-15 0A2.25 2.25 0 016.75 6.75h10.5A2.25 2.25 0 0119.5 9M9 14.25h6" /></svg>
                        </div>
                        <h2 className="text-xl sm:text-2xl font-black text-slate-900">최신 누적 업그레이드 스냅샷</h2>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed mb-5 break-keep">
                        PSI {PSI_APP_VERSION} 기준으로 최근 누적된 핵심 개선사항을 영역별로 정리했습니다. 보고서 전달 품질, 운영 추적성, 현장 실행성을 동시에 끌어올리는 방향으로 업데이트가 반영되었습니다.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                            <h3 className="font-black text-indigo-800 mb-2">리포트/전달 체계</h3>
                            <ul className="text-slate-700 font-semibold space-y-1 list-disc list-inside">
                                {latestUpgradeColumns[0].map((item) => <li key={item}>{item}</li>)}
                            </ul>
                        </div>
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                            <h3 className="font-black text-emerald-800 mb-2">운영/성능 안정화</h3>
                            <ul className="text-slate-700 font-semibold space-y-1 list-disc list-inside">
                                {latestUpgradeColumns[1].map((item) => <li key={item}>{item}</li>)}
                            </ul>
                        </div>
                        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                            <h3 className="font-black text-amber-800 mb-2">검증 상태</h3>
                            <ul className="text-slate-700 font-semibold space-y-1 list-disc list-inside">
                                {PSI_CURRENT_RELEASE.validations.map((item) => <li key={item}>{item}</li>)}
                            </ul>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <h3 className="font-black text-slate-800 mb-2">다음 협업 초점</h3>
                            <ul className="text-slate-700 font-semibold space-y-1 list-disc list-inside">
                                <li>피드백 탭 카테고리 기반 의사결정 기록 강화</li>
                                <li>문서 중심 변경 제안 → 코드 반영 → 검증 루프 유지</li>
                                <li>월 단위 로드맵 리뷰에서 리포트 품질·발송 효율 동시 점검</li>
                            </ul>
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
                                "PSI는 현장을 판단하려는 시스템이 아니라 현장을 이해하려는 시스템입니다. 우리는 수기 기록 속 짧고 투박한 문장에서도 위험의 신호를 놓치지 않고, 그 신호를 사람이 바로 행동할 수 있는 보호의 언어로 바꾸고자 했습니다. PSI가 2026년에도 현장에서 가장 믿을 수 있는 안전 파트너로 남기를 바랍니다."
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

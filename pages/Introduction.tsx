
import React, { useState, useEffect, useMemo } from 'react';
import type { Page, WorkerRecord } from '../types';
import { BrandPhilosophyLogo } from '../components/shared/BrandPhilosophyLogo';
import { PSI_APP_VERSION, PSI_CURRENT_RELEASE, PSI_SYSTEM_NAME } from '../lib/appInfo';
import { InterpretationCardGrid, type InterpretationCardItem } from '../components/shared/InterpretationCardGrid';
import { BRAND_TONE } from '../utils/brandToneTokens';

interface IntroductionProps {
    workerRecords: WorkerRecord[];
    onNavigateToPage: (page: Page) => void;
}

const Introduction: React.FC<IntroductionProps> = ({ workerRecords, onNavigateToPage }) => {
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
    const recentOpsUpgradeNotes = [
        '모바일 하단 뒤로가기 실수 방지 정책(더블백/작업중 확인창) 전면 적용',
        'OCR · 개인리포트 · 근로자관리 화면의 뒤로가기 보호 흐름 공통화',
        'UI 모드 실험 KPI 최근 이벤트를 3건 중심으로 축약해 핵심만 즉시 확인',
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
            tone: isGravityOff ? BRAND_TONE.amberSoft80 : BRAND_TONE.emeraldSoft80,
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

    const previewMetrics = useMemo(() => {
        const totalWorkers = workerRecords.length;
        const averageScore = totalWorkers > 0
            ? Math.round((workerRecords.reduce((sum, record) => sum + Number(record.safetyScore || 0), 0) / totalWorkers) * 10) / 10
            : 0;
        const highRiskWorkers = workerRecords.filter((record) => Number(record.safetyScore || 0) < 60).length;
        const alertSignals = workerRecords.filter((record) => Boolean(record.ocrErrorType) || record.secondPassStatus === 'NEEDED').length;
        const interventionTargets = workerRecords.filter((record) => {
            const score = Number(record.safetyScore || 0);
            return score < 70 || record.selfAssessedRiskLevel === '상';
        }).length;
        const taggingQueue = workerRecords.filter((record) => record.secondPassStatus === 'NEEDED' || record.secondPassStatus === 'IN_PROGRESS').length;
        const approvedRecords = workerRecords.filter((record) => record.approvalStatus === 'APPROVED' || record.reviewStatus === 'APPROVED').length;
        const qaValidationTargets = workerRecords.filter((record) => Boolean(record.ocrErrorType) || record.secondPassStatus !== 'DONE').length;

        const todayKey = new Date().toDateString();
        const todayRecords = workerRecords.filter((record) => {
            if (!record.date) return false;
            const parsed = new Date(record.date);
            return !Number.isNaN(parsed.getTime()) && parsed.toDateString() === todayKey;
        }).length;

        return {
            totalWorkers,
            averageScore,
            highRiskWorkers,
            alertSignals,
            interventionTargets,
            taggingQueue,
            approvedRecords,
            qaValidationTargets,
            todayRecords,
        };
    }, [workerRecords]);

    const topSignalPatterns = useMemo<Array<{ label: string; pct: number; color: string }>>(() => {
        const patternMap = new Map<string, number>();

        for (const record of workerRecords) {
            const weakAreas = Array.isArray(record.weakAreas) ? record.weakAreas : [];
            for (const weak of weakAreas) {
                const raw = String(weak || '').trim();
                if (!raw) continue;
                const normalized = raw.length > 8 ? raw.slice(0, 8) : raw;
                patternMap.set(normalized, (patternMap.get(normalized) || 0) + 1);
            }
        }

        const fallback = [
            { label: '반복 지각', pct: 88, color: 'bg-rose-400' },
            { label: '고강도 연속', pct: 71, color: 'bg-amber-400' },
            { label: '수면 부족', pct: 59, color: 'bg-orange-300' },
            { label: '언어 장벽', pct: 43, color: 'bg-sky-300' },
            { label: '혼잡 작업', pct: 29, color: 'bg-violet-300' },
        ];

        if (patternMap.size === 0) {
            return fallback;
        }

        const top = Array.from(patternMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const maxCount = Math.max(...top.map(([, count]) => count), 1);
        const palette = ['bg-rose-400', 'bg-amber-400', 'bg-orange-300', 'bg-sky-300', 'bg-violet-300'];

        return top.map(([label, count], index) => ({
            label,
            pct: Math.max(18, Math.round((count / maxCount) * 100)),
            color: palette[index] || 'bg-indigo-300',
        }));
    }, [workerRecords]);

    const mobileFlowCards = useMemo<Array<{ title: string; desc: string; page: Page }>>(() => ([
        { title: '1. 홈 대시보드', desc: `${previewMetrics.totalWorkers}명 분석`, page: 'dashboard' },
        { title: '2. 경보 알림', desc: `전조 신호 ${previewMetrics.alertSignals}건`, page: 'site-issue-management' },
        { title: '3. 개인인지 프로파일', desc: `고위험 ${previewMetrics.highRiskWorkers}명`, page: 'worker-management' },
        { title: '4. 위험인지 진단', desc: `오늘 입력 ${previewMetrics.todayRecords}건`, page: 'worker-training' },
        { title: '5. 현장 컨텍스트', desc: `오늘 입력 ${previewMetrics.todayRecords}건`, page: 'field-context-input' },
        { title: '6. 행동 패턴 분석', desc: `승인 완료 ${previewMetrics.approvedRecords}건`, page: 'safety-behavior-management' },
        { title: '7. 위험 예측', desc: `예측 대상 ${previewMetrics.interventionTargets}명`, page: 'predictive-analysis' },
        { title: '8. 개입 추천', desc: `개입 대상 ${previewMetrics.interventionTargets}명`, page: 'intervention-coaching' },
        { title: '9. 수기 데이터 입력', desc: `태깅 대기 ${previewMetrics.taggingQueue}건`, page: 'judgment-tagging-input' },
        { title: '10. 태깅 검증', desc: `QA 대상 ${previewMetrics.qaValidationTargets}건`, page: 'ocr-analysis' },
        { title: '11. 분석 리포트', desc: `리포트 대상 ${previewMetrics.totalWorkers}명`, page: 'reports' },
        { title: '12. 메뉴/설정', desc: `현재 릴리스 ${PSI_APP_VERSION}`, page: 'settings' },
    ]), [previewMetrics, PSI_APP_VERSION]);

    const heroMobileCards = useMemo(() => mobileFlowCards.slice(0, 8), [mobileFlowCards]);

    const heroPrinciples: Array<{ label: string; icon: React.ReactNode }> = [
        {
            label: '인간 중심',
            icon: (
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <circle cx="10" cy="7" r="3" />
                    <path d="M3 17c0-3.3 3.1-6 7-6s7 2.7 7 6" strokeLinecap="round" />
                </svg>
            ),
        },
        {
            label: '예측 · 개입',
            icon: (
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path d="M3 14l4-5 3 3 4-6" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="15" cy="5" r="2" />
                </svg>
            ),
        },
        {
            label: '안전 문화',
            icon: (
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path d="M10 2l6 3v5c0 4-2.7 6.5-6 8-3.3-1.5-6-4-6-8V5l6-3z" strokeLinejoin="round" />
                    <path d="M7 10l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            ),
        },
        {
            label: '데이터 기반',
            icon: (
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <rect x="2" y="12" width="3" height="6" rx="1" />
                    <rect x="8.5" y="8" width="3" height="10" rx="1" />
                    <rect x="15" y="4" width="3" height="14" rx="1" />
                </svg>
            ),
        },
    ];

    const getStepTone = (stepNoNum: number) => {
        if (stepNoNum === 2 || stepNoNum === 7 || stepNoNum === 8) {
            return {
                cardBorder: 'border-amber-200 hover:bg-amber-50',
                badgeBg: 'bg-amber-500',
                panelBg: 'bg-amber-50',
                bars: ['bg-amber-100', 'bg-amber-200', 'bg-amber-300'],
                descText: 'text-amber-700',
            };
        }

        if (stepNoNum === 10) {
            return {
                cardBorder: 'border-violet-200 hover:bg-violet-50',
                badgeBg: 'bg-violet-600',
                panelBg: 'bg-violet-50',
                bars: ['bg-violet-100', 'bg-violet-200', 'bg-violet-300'],
                descText: 'text-violet-700',
            };
        }

        if (stepNoNum === 5 || stepNoNum === 9 || stepNoNum === 11) {
            return {
                cardBorder: 'border-emerald-200 hover:bg-emerald-50',
                badgeBg: 'bg-emerald-600',
                panelBg: 'bg-emerald-50',
                bars: ['bg-emerald-100', 'bg-emerald-200', 'bg-emerald-300'],
                descText: 'text-emerald-700',
            };
        }

        return {
            cardBorder: 'border-indigo-100 hover:bg-indigo-50',
            badgeBg: 'bg-indigo-600',
            panelBg: 'bg-slate-50',
            bars: ['bg-indigo-100', 'bg-violet-100', 'bg-sky-100'],
            descText: 'text-indigo-700',
        };
    };

    return (
        <div className="space-y-12 pb-12">
            <div className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-slate-100 p-4 shadow-xl sm:p-5 lg:p-6 card-gravity-target">
                <div className="relative z-10 space-y-3.5 sm:space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 sm:px-4.5 sm:py-3.5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex items-start gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50">
                                    <BrandPhilosophyLogo className="h-8 w-8" />
                                </div>
                                <div>
                                    <h1 className="text-[24px] sm:text-[26px] leading-tight font-black tracking-tight text-indigo-700">Human Risk Intelligence</h1>
                                    <p className="mt-1 text-[11px] sm:text-[12px] font-semibold text-slate-600 break-keep">기록이 아닌 이해, 점검이 아닌 전달, 보고가 아닌 예측</p>
                                    <p className="text-[11px] sm:text-[12px] font-semibold text-slate-600 break-keep">현장 상황을 연결하여 사고 전 전조를 탐지하고 개입을 추천하는 시스템입니다.</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {heroPrinciples.map((item) => (
                                    <div key={item.label} className="rounded-xl border border-indigo-100 bg-indigo-50 px-2.5 py-2 text-center">
                                        <span className="flex justify-center text-indigo-500">{item.icon}</span>
                                        <p className="mt-1 text-[10px] font-black text-indigo-700">{item.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.14fr_1fr]">
                        <section className="rounded-3xl border border-indigo-200 bg-white p-3.5 shadow-sm">
                            <div className="mb-2 inline-flex items-center rounded-full bg-indigo-600 px-3 py-1 text-[10px] font-black tracking-[0.12em] text-white">PC DASHBOARD</div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                                <div className="grid grid-cols-[104px_1fr] gap-2.5">
                                    <div className="rounded-xl bg-indigo-950 px-2 py-3 text-indigo-100">
                                        <p className="text-sm font-black">psi</p>
                                        <ul className="mt-2 space-y-1 text-[10px] font-bold">
                                            <li className="rounded-md bg-white/10 px-2 py-1">대시보드</li>
                                            <li className="rounded-md px-2 py-1">위험예측</li>
                                            <li className="rounded-md px-2 py-1">리포트</li>
                                            <li className="rounded-md px-2 py-1">데이터관리</li>
                                        </ul>
                                    </div>
                                    <div className="space-y-2.5">
                                        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                                            {[
                                                ['위험성 평균', `${previewMetrics.averageScore}`],
                                                ['전조 신호', `${previewMetrics.alertSignals}`],
                                                ['위험 예측', `${previewMetrics.highRiskWorkers}`],
                                                ['개입 완료율', `${previewMetrics.totalWorkers > 0 ? Math.round((previewMetrics.approvedRecords / previewMetrics.totalWorkers) * 100) : 0}%`],
                                            ].map(([label, value]) => (
                                                <div key={label} className="rounded-xl border border-slate-200 bg-white px-2 py-2.5">
                                                    <p className="text-[10px] font-black text-slate-500">{label}</p>
                                                    <p className="mt-1 text-[17px] font-black leading-none text-slate-900">{value}</p>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                            {/* 유형 분포 - 도넛 차트 */}
                                            <div className="rounded-xl border border-slate-200 bg-white p-2">
                                                <p className="text-[10px] font-black text-slate-500">유형 분포</p>
                                                <div className="mt-1.5 flex items-center gap-2">
                                                    <svg viewBox="0 0 44 44" className="h-11 w-11 shrink-0 -rotate-90" aria-hidden="true">
                                                        <circle cx="22" cy="22" r="16" fill="none" stroke="#e0e7ff" strokeWidth="9" />
                                                        <circle cx="22" cy="22" r="16" fill="none" stroke="#6366f1" strokeWidth="9"
                                                            strokeDasharray={`${previewMetrics.totalWorkers > 0 ? Math.round((previewMetrics.highRiskWorkers / previewMetrics.totalWorkers) * 100) : 25} 100`}
                                                            strokeDashoffset="0" />
                                                        <circle cx="22" cy="22" r="16" fill="none" stroke="#f59e0b" strokeWidth="9"
                                                            strokeDasharray={`${previewMetrics.totalWorkers > 0 ? Math.round((previewMetrics.alertSignals / previewMetrics.totalWorkers) * 100) : 15} 100`}
                                                            strokeDashoffset={`-${previewMetrics.totalWorkers > 0 ? Math.round((previewMetrics.highRiskWorkers / previewMetrics.totalWorkers) * 100) : 25}`} />
                                                    </svg>
                                                    <div className="space-y-0.5 text-[9px] font-bold">
                                                        <div className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0"></span><span className="text-slate-600">고위험</span></div>
                                                        <div className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0"></span><span className="text-slate-600">전조경보</span></div>
                                                        <div className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-indigo-100 shrink-0"></span><span className="text-slate-600">정상</span></div>
                                                    </div>
                                                </div>
                                            </div>
                                            {/* 전조 패턴 Top5 */}
                                            <div className="rounded-xl border border-slate-200 bg-white p-2">
                                                <p className="text-[10px] font-black text-slate-500">전조 패턴 Top5</p>
                                                <div className="mt-1.5 space-y-1">
                                                    {topSignalPatterns.map(({ label, pct, color }) => (
                                                        <div key={label} className="flex items-center gap-1">
                                                            <p className="w-11 shrink-0 text-[8px] font-bold text-slate-500 truncate leading-tight">{label}</p>
                                                            <div className="flex-1 rounded bg-slate-100 h-1.5 overflow-hidden">
                                                                <div className={`h-1.5 rounded ${color}`} style={{ width: `${pct}%` }}></div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            {/* 위험 예측 지도 */}
                                            <div className="rounded-xl border border-slate-200 bg-white p-2">
                                                <p className="text-[10px] font-black text-slate-500">위험 예측 지도</p>
                                                <div className="relative mt-1.5 h-14 rounded-lg bg-slate-50 border border-slate-100 overflow-hidden">
                                                    <div className="absolute inset-0 grid grid-cols-5 grid-rows-3 gap-px p-1.5">
                                                        {Array.from({ length: 15 }).map((_, i) => (
                                                            <div key={i} className="rounded-sm bg-slate-200/50"></div>
                                                        ))}
                                                    </div>
                                                    <div className="absolute" style={{ top: '22%', left: '18%' }}>
                                                        <div className="h-4 w-4 rounded-full bg-rose-400/75 ring-2 ring-rose-200 animate-pulse"></div>
                                                    </div>
                                                    <div className="absolute" style={{ top: '50%', left: '55%' }}>
                                                        <div className="h-3 w-3 rounded-full bg-amber-400/75 ring-2 ring-amber-100"></div>
                                                    </div>
                                                    <div className="absolute" style={{ top: '60%', left: '72%' }}>
                                                        <div className="h-2 w-2 rounded-full bg-sky-400/60"></div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-2.5 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => onNavigateToPage('dashboard')}
                                    className="rounded-xl bg-indigo-600 px-3 py-2 text-[11px] font-black text-white transition duration-200 hover:bg-indigo-500"
                                >
                                    PC 대시보드 열기
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onNavigateToPage('reports')}
                                    className="rounded-xl border border-indigo-200 bg-white px-3 py-2 text-[11px] font-black text-indigo-700 transition duration-200 hover:bg-indigo-50"
                                >
                                    분석 리포트 열기
                                </button>
                            </div>
                        </section>

                        <section className="rounded-3xl border border-indigo-200 bg-indigo-50/70 p-3.5 shadow-sm">
                            <div className="mb-2 inline-flex items-center rounded-full bg-indigo-500 px-3 py-1 text-[10px] font-black tracking-[0.12em] text-white">MOBILE APP</div>
                            <div className="relative rounded-2xl border border-indigo-100 bg-white/90 p-3.5">
                                <div className="grid grid-cols-2 gap-1.5 sm:gap-2 sm:grid-cols-4">
                                    {heroMobileCards.map(({ title, desc, page }) => {
                                        const [stepNoRaw, ...restTitleParts] = String(title).split('. ');
                                        const stepNo = stepNoRaw || '-';
                                        const stepNoNum = Number(stepNoRaw);
                                        const stepTitle = restTitleParts.join('. ') || String(title);
                                        const tone = getStepTone(stepNoNum);

                                        return (
                                            <button
                                                key={`hero-mobile-${title}`}
                                                type="button"
                                                onClick={() => onNavigateToPage(page)}
                                                className={`rounded-2xl border bg-white p-2 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-sm min-h-[86px] sm:min-h-[84px] ${tone.cardBorder}`}
                                            >
                                                <p className="text-[10px] font-black text-slate-700 leading-tight">{stepNo}. {stepTitle}</p>
                                                <div className={`mt-1.5 rounded-xl border border-slate-100 ${tone.panelBg} p-2`}>
                                                    {stepNoNum === 1 && (
                                                        <div className="flex gap-1">
                                                            <div className="flex-1 rounded bg-indigo-100 px-1 py-1 text-center"><p className="text-[8px] font-black text-indigo-700">{previewMetrics.totalWorkers}</p><p className="text-[7px] text-slate-400">전체</p></div>
                                                            <div className="flex-1 rounded bg-rose-50 px-1 py-1 text-center"><p className="text-[8px] font-black text-rose-600">{previewMetrics.highRiskWorkers}</p><p className="text-[7px] text-slate-400">고위험</p></div>
                                                        </div>
                                                    )}
                                                    {stepNoNum === 2 && (
                                                        <div className="space-y-0.5">
                                                            <div className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-400"></span><p className="text-[8px] font-bold text-slate-600 truncate">긴급 경보 {previewMetrics.alertSignals}건</p></div>
                                                            <div className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-300"></span><p className="text-[8px] font-bold text-slate-500 truncate">전조 신호 감지</p></div>
                                                        </div>
                                                    )}
                                                    {stepNoNum === 3 && (
                                                        <div className="space-y-0.5">
                                                            <div className="flex items-center justify-between"><p className="text-[8px] font-bold text-slate-500">위험도</p><div className="flex gap-0.5">{[1,2,3,4,5].map(i => <div key={i} className={`h-1.5 w-2 rounded-sm ${i <= 3 ? 'bg-amber-400' : 'bg-slate-200'}`}></div>)}</div></div>
                                                            <div className="h-1 rounded bg-slate-200 overflow-hidden"><div className="h-1 rounded bg-indigo-400" style={{ width: '65%' }}></div></div>
                                                        </div>
                                                    )}
                                                    {stepNoNum === 4 && (
                                                        <div className="space-y-0.5">
                                                            <div className="flex items-center gap-1"><div className="h-1.5 w-1.5 rounded-sm bg-emerald-400"></div><p className="text-[8px] font-bold text-slate-600">인지 진단 완료</p></div>
                                                            <div className="flex items-center gap-1"><div className="h-1.5 w-1.5 rounded-sm bg-slate-200"></div><p className="text-[8px] font-bold text-slate-400">재진단 대기</p></div>
                                                        </div>
                                                    )}
                                                    {stepNoNum === 5 && (
                                                        <div className="space-y-0.5">
                                                            <div className="h-1.5 rounded bg-slate-200 w-full"></div>
                                                            <div className="h-1.5 rounded bg-emerald-100 w-3/4"></div>
                                                            <p className="text-[8px] font-black text-emerald-600">저장 대기</p>
                                                        </div>
                                                    )}
                                                    {stepNoNum === 6 && (
                                                        <div className="flex items-end gap-0.5 h-7">
                                                            {[60,80,50,90,70].map((h, i) => (
                                                                <div key={i} className="flex-1 rounded-sm bg-indigo-200" style={{ height: `${h}%` }}></div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {stepNoNum === 7 && (
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-base font-black text-amber-600">{previewMetrics.interventionTargets}</p>
                                                            <div className="flex-1">
                                                                <div className="h-1.5 rounded bg-amber-100 overflow-hidden"><div className="h-1.5 rounded bg-amber-400" style={{ width: `${previewMetrics.totalWorkers > 0 ? Math.round((previewMetrics.interventionTargets / previewMetrics.totalWorkers) * 100) : 30}%` }}></div></div>
                                                                <p className="text-[8px] text-slate-400 mt-0.5">예측 대상</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {stepNoNum === 8 && (
                                                        <div className="space-y-0.5">
                                                            <div className="rounded bg-amber-400 px-1 py-0.5 text-center"><p className="text-[8px] font-black text-white">개입 시작</p></div>
                                                            <p className={`text-[8px] font-black ${tone.descText}`}>{desc}</p>
                                                        </div>
                                                    )}
                                                    {(stepNoNum < 1 || stepNoNum > 8) && (
                                                        <div className="space-y-1">
                                                            <div className="h-1.5 rounded bg-slate-200"></div>
                                                            <p className={`text-[9px] font-black ${tone.descText}`}>{desc}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="pointer-events-none absolute -bottom-4 -right-1 hidden h-36 w-20 rounded-2xl border border-slate-200 bg-slate-900 text-white shadow-xl sm:flex sm:flex-col sm:items-center sm:justify-center">
                                    <BrandPhilosophyLogo className="h-7 w-7" />
                                    <p className="mt-1 text-lg font-black">psi</p>
                                    <p className="mt-1 text-[8px] font-bold text-slate-300">Human Risk Intelligence</p>
                                </div>
                            </div>
                        </section>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                            <p className="text-[10px] font-black tracking-[0.14em] text-indigo-600">BRAND STORY</p>
                            <p className="mt-2 text-[10px] sm:text-[11px] font-semibold leading-relaxed text-slate-600 break-keep">PSI는 사고를 줄이기 위해 사람의 위험인지 신호를 해석하고 보호로 연결하는 Human Risk Intelligence 플랫폼입니다.</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                            <p className="text-[10px] font-black tracking-[0.14em] text-indigo-600">BRANDING MARK</p>
                            <div className="mt-2 flex items-center gap-2">
                                <BrandPhilosophyLogo className="h-8 w-8" />
                                <p className="text-xl font-black text-indigo-600">psi</p>
                            </div>
                            <p className="mt-2 text-[9px] sm:text-[10px] font-semibold leading-relaxed text-slate-500">높아지는 위험 전조를 먼저 읽고 개입하는 보호 흐름</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                            <p className="text-[10px] font-black tracking-[0.14em] text-indigo-600">COLOR SYSTEM</p>
                            <div className="mt-2 space-y-1.5">
                                {[
                                    { bg: 'bg-indigo-500', hex: '#6366F1', name: 'Primary' },
                                    { bg: 'bg-emerald-500', hex: '#10B981', name: 'Safe' },
                                    { bg: 'bg-rose-500', hex: '#F43F5E', name: 'Risk' },
                                    { bg: 'bg-slate-900', hex: '#0F172A', name: 'Dark' },
                                    { bg: 'bg-slate-200', hex: '#E2E8F0', name: 'Base' },
                                ].map(({ bg, hex, name }) => (
                                    <div key={hex} className="flex items-center gap-2">
                                        <div className={`h-4 w-4 rounded-md shrink-0 ${bg}`}></div>
                                        <p className="text-[8px] font-black text-slate-500 w-10 shrink-0">{name}</p>
                                        <p className="text-[8px] font-mono text-slate-400">{hex}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                            <p className="text-[10px] font-black tracking-[0.14em] text-indigo-600">TYPOGRAPHY</p>
                            <p className="mt-1.5 text-xl font-black text-slate-800 leading-tight">Pretendard</p>
                            <p className="text-[10px] font-bold text-slate-500 mt-0.5">가나다 ABC 123</p>
                            <p className="text-[9px] font-semibold text-slate-400 leading-tight">안전·현장·보호 / Safety · Risk</p>
                            <p className="text-[9px] font-semibold text-slate-400 mt-0.5">运営 · 안전관리 · Sécurité</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                            <p className="text-[10px] font-black tracking-[0.14em] text-indigo-600">ICONOGRAPHY</p>
                            <div className="mt-2 grid grid-cols-3 gap-1">
                                {[
                                    { title: '사람', path: <><circle cx="10" cy="7" r="3" /><path d="M3 17c0-3.3 3.1-6 7-6s7 2.7 7 6" strokeLinecap="round" /></> },
                                    { title: '예측', path: <><path d="M3 14l4-5 3 3 4-6" strokeLinecap="round" strokeLinejoin="round" /><circle cx="15" cy="5" r="2" /></> },
                                    { title: '보호', path: <><path d="M10 2l6 3v5c0 4-2.7 6.5-6 8-3.3-1.5-6-4-6-8V5l6-3z" strokeLinejoin="round" /><path d="M7 10l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /></> },
                                    { title: '추이', path: <><path d="M2 15l5-5 3 3 5-7" strokeLinecap="round" strokeLinejoin="round" /></> },
                                    { title: '연결', path: <><circle cx="5" cy="10" r="2" /><circle cx="15" cy="5" r="2" /><circle cx="15" cy="15" r="2" /><path d="M7 10l6-4M7 10l6 4" strokeLinecap="round" /></> },
                                    { title: '데이터', path: <><rect x="2" y="12" width="3" height="6" rx="1" /><rect x="8.5" y="8" width="3" height="10" rx="1" /><rect x="15" y="4" width="3" height="14" rx="1" /></> },
                                ].map(({ title, path }) => (
                                    <span key={title} className="flex flex-col items-center rounded-lg border border-slate-200 bg-slate-50 px-1 py-1.5 gap-0.5">
                                        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-indigo-500" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">{path}</svg>
                                        <span className="text-[7px] font-bold text-slate-400">{title}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 card-gravity-target">
                <InterpretationCardGrid
                    items={introSummaryCards}
                    cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
                />
            </div>

            <div className="max-w-5xl mx-auto px-4 card-gravity-target">
                <div className="rounded-3xl border border-violet-100 bg-violet-50/80 p-6 shadow-sm">
                    <div className="flex items-center gap-3">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-violet-600 shadow-sm">🧩</span>
                        <div>
                            <h3 className="text-lg font-black text-slate-900">최근 운영 업그레이드 반영</h3>
                            <p className="text-sm font-semibold text-slate-600">현장 조작 실수 방지와 핵심 KPI 가독성 개선 항목을 소개 화면에 동기화했습니다.</p>
                        </div>
                    </div>
                    <ul className="mt-4 space-y-2 text-sm font-bold text-slate-700">
                        {recentOpsUpgradeNotes.map((item) => (
                            <li key={item} className="flex items-start gap-2">
                                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-violet-500"></span>
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </div>
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
                            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black text-sky-700 ${BRAND_TONE.sky}`}>
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
                    <div className={`rounded-3xl border p-6 shadow-sm ${BRAND_TONE.emeraldSoft}`}>
                        <p className="text-xs font-black tracking-[0.18em] text-emerald-700 mb-3">BRAND PRINCIPLE 01</p>
                        <h3 className="text-lg font-black text-slate-900 mb-2">평가보다 해석</h3>
                        <p className="text-sm leading-relaxed text-slate-700">PSI는 점수만 보여주지 않고 왜 그런 판단이 나왔는지 설명해 현장의 신뢰를 높입니다.</p>
                    </div>
                    <div className={`rounded-3xl border p-6 shadow-sm ${BRAND_TONE.indigoSoft}`}>
                        <p className="text-xs font-black tracking-[0.18em] text-indigo-700 mb-3">BRAND PRINCIPLE 02</p>
                        <h3 className="text-lg font-black text-slate-900 mb-2">지적보다 보완</h3>
                        <p className="text-sm leading-relaxed text-slate-700">근로자에게는 불합격 대신 보완 권고를, 관리자에게는 재검토 근거를 제시하는 코칭형 구조를 따릅니다.</p>
                    </div>
                    <div className={`rounded-3xl border p-6 shadow-sm ${BRAND_TONE.skySoft}`}>
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
                        <div className={`rounded-2xl border p-4 ${BRAND_TONE.indigoSoft}`}>
                            <h3 className="font-black text-indigo-800 mb-2">리포트/전달 체계</h3>
                            <ul className="text-slate-700 font-semibold space-y-1 list-disc list-inside">
                                {latestUpgradeColumns[0].map((item) => <li key={item}>{item}</li>)}
                            </ul>
                        </div>
                        <div className={`rounded-2xl border p-4 ${BRAND_TONE.emeraldSoft}`}>
                            <h3 className="font-black text-emerald-800 mb-2">운영/성능 안정화</h3>
                            <ul className="text-slate-700 font-semibold space-y-1 list-disc list-inside">
                                {latestUpgradeColumns[1].map((item) => <li key={item}>{item}</li>)}
                            </ul>
                        </div>
                        <div className={`rounded-2xl border p-4 ${BRAND_TONE.amberSoft}`}>
                            <h3 className="font-black text-amber-800 mb-2">검증 상태</h3>
                            <ul className="text-slate-700 font-semibold space-y-1 list-disc list-inside">
                                {PSI_CURRENT_RELEASE.validations.map((item) => <li key={item}>{item}</li>)}
                            </ul>
                        </div>
                        <div className={`rounded-2xl border p-4 ${BRAND_TONE.slate}`}>
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
                                    <div className={`relative w-12 h-12 rounded-xl flex items-center justify-center border shadow-xl overflow-hidden ${BRAND_TONE.slateDarkSoft}`}>
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

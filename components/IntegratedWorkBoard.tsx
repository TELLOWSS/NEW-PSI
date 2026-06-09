import React, { useMemo, useState } from 'react';
import type { Page, SafetyCheckRecord, WorkerRecord } from '../types';
import { BrandPhilosophyLogo } from './shared/BrandPhilosophyLogo';
import { getRouteLabel } from '../config/routeMeta';
import {
    getDefaultUiCompositionConfig,
    loadUiCompositionConfig,
    resetUiCompositionConfig,
    saveUiCompositionConfig,
    setSidebarPageVisible,
    type UiCompositionConfig,
} from '../utils/uiCompositionConfig';

interface IntegratedWorkBoardProps {
    workerRecords: WorkerRecord[];
    safetyCheckRecords: SafetyCheckRecord[];
    setCurrentPage: (page: Page) => void;
    onOpenAdvanced: () => void;
}

type BoardStep = {
    number: number;
    title: string;
    subtitle: string;
    page: Page;
    accent: 'blue' | 'orange' | 'green';
};

const BOARD_STEPS: BoardStep[] = [
    { number: 1, title: 'PSI 전체 대시보드', subtitle: '현장 핵심 현황과 이번 달 준비', page: 'dashboard', accent: 'blue' },
    { number: 2, title: '위험성평가 분석', subtitle: '수기 기록 업로드 · OCR · 6대 지표', page: 'ocr-analysis', accent: 'blue' },
    { number: 3, title: '월별 계도 리포트', subtitle: '지난달 작성사항 익명화 공유', page: 'monthly-guidance-report', accent: 'orange' },
    { number: 4, title: 'A4 교육자료 자동생성', subtitle: '다음 달 위험작업 교육 준비', page: 'a4-education-material', accent: 'orange' },
    { number: 5, title: 'PPT/PDF 한장요약', subtitle: '기존 교육자료 핵심 요약', page: 'ppt-pdf-one-page-summary', accent: 'blue' },
    { number: 6, title: '다국어 교육 / QR', subtitle: '언어 선택 · QR 배포 · 교육 확인', page: 'admin-training', accent: 'green' },
    { number: 7, title: '월별 결과 / 6대지표 추이', subtitle: '개선이행과 반복지적 변화 추적', page: 'performance-analysis', accent: 'green' },
    { number: 8, title: '설정 / 권한관리', subtitle: '현장 · 언어 · 기능 노출 설정', page: 'settings', accent: 'blue' },
];

const OPTIONAL_FEATURES: Page[] = [
    'site-issue-management',
    'worker-management',
    'safety-compliance-hub',
    'survey-intelligence',
    'predictive-analysis',
    'safety-behavior-management',
];

const CORE_MENU_PAGES = new Set<Page>([
    'dashboard',
    'ocr-analysis',
    'monthly-guidance-report',
    'a4-education-material',
    'ppt-pdf-one-page-summary',
    'admin-training',
    'reports',
    'performance-analysis',
    'settings',
]);

const accentClass = {
    blue: 'border-blue-100 bg-blue-50 text-blue-700',
    orange: 'border-orange-100 bg-orange-50 text-orange-700',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
};

const MiniTrend = ({ values, color = '#2563eb' }: { values: number[]; color?: string }) => {
    const points = values.map((value, index) => `${index * 24},${44 - value * 0.36}`).join(' ');
    return (
        <svg viewBox="0 0 120 48" className="h-12 w-full" role="img" aria-label="월별 변화 추이">
            <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
            {values.map((value, index) => <circle key={`${value}-${index}`} cx={index * 24} cy={44 - value * 0.36} r="2.5" fill={color} />)}
        </svg>
    );
};

const formatMonth = (date = new Date()) => `${date.getFullYear()}년 ${date.getMonth() + 1}월`;

export const IntegratedWorkBoard: React.FC<IntegratedWorkBoardProps> = ({
    workerRecords,
    safetyCheckRecords,
    setCurrentPage,
    onOpenAdvanced,
}) => {
    const [showFeatureLocker, setShowFeatureLocker] = useState(false);
    const [composition, setComposition] = useState<UiCompositionConfig>(() => loadUiCompositionConfig());

    const summary = useMemo(() => {
        const validScores = workerRecords.map((record) => record.safetyScore).filter((value) => Number.isFinite(value));
        const averageScore = validScores.length ? Math.round(validScores.reduce((sum, value) => sum + value, 0) / validScores.length) : 0;
        const highRisk = workerRecords.filter((record) => record.safetyLevel === '초급' || record.safetyScore < 60).length;
        const analyzed = workerRecords.filter((record) => record.scoreBreakdown).length;
        const improvementValues = workerRecords.map((record) => record.scoreBreakdown?.improvementExecution).filter((value): value is number => typeof value === 'number');
        const repeatValues = workerRecords.map((record) => record.scoreBreakdown?.repeatViolationPenalty).filter((value): value is number => typeof value === 'number');
        const improvement = improvementValues.length ? Math.round(improvementValues.reduce((sum, value) => sum + value, 0) / improvementValues.length / 20 * 100) : 0;
        const repeat = repeatValues.length ? Math.round(repeatValues.reduce((sum, value) => sum + Math.abs(value), 0) / repeatValues.length) : 0;
        const workTypes = new Set(workerRecords.map((record) => record.jobField).filter(Boolean)).size;
        return { averageScore, highRisk, analyzed, improvement, repeat, workTypes };
    }, [workerRecords]);

    const recentUploads = useMemo(() => workerRecords.slice(0, 4), [workerRecords]);
    const topRisks = useMemo(() => {
        const counts = new Map<string, number>();
        workerRecords.forEach((record) => (record.weakAreas || []).forEach((risk) => counts.set(risk, (counts.get(risk) || 0) + 1)));
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    }, [workerRecords]);

    const updateFeature = (page: Page, visible: boolean) => {
        const next = saveUiCompositionConfig(setSidebarPageVisible(composition, page, visible));
        setComposition(next);
    };

    const resetFeatures = () => {
        setComposition(resetUiCompositionConfig());
    };

    const showAllFeatures = () => {
        let next = getDefaultUiCompositionConfig();
        OPTIONAL_FEATURES.forEach((page) => { next = setSidebarPageVisible(next, page, true); });
        setComposition(saveUiCompositionConfig(next));
    };

    return (
        <div className="min-h-full space-y-4 bg-[#f7f9fc] pb-12 text-slate-900">
            <section className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex h-14 w-20 items-center justify-center border-r border-slate-200 pr-4">
                            <BrandPhilosophyLogo className="h-11 w-14" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black tracking-tight text-[#0c2348] sm:text-2xl">PSI 통합 업무 보드</h1>
                            <p className="mt-1 text-xs font-semibold text-slate-500">수기 위험성평가 작성 · 분석 · 교육 · 개선을 하나의 월간 흐름으로 연결합니다.</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">{formatMonth()} 운영</span>
                        <button type="button" onClick={() => setShowFeatureLocker((value) => !value)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:border-blue-300 hover:text-blue-700">
                            {showFeatureLocker ? '기능 보관함 닫기' : '기능 보관함 · 커스터마이징'}
                        </button>
                    </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    {[
                        ['지난달 작성 분석', '수기 위험성평가 분석'],
                        ['월별 계도 리포트 공유', '익명화된 집단 계도자료'],
                        ['다음 달 위험교육', 'AI 맞춤형 교육자료'],
                        ['수기 위험성평가 작성', '현장 근로자 기록'],
                        ['다음 달 분석', '지속적 개선 추적'],
                    ].map(([title, subtitle], index) => (
                        <button key={title} type="button" onClick={() => setCurrentPage((['ocr-analysis', 'monthly-guidance-report', 'a4-education-material', 'a4-education-material', 'performance-analysis'] as Page[])[index])} className="group flex min-h-20 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-white hover:shadow-md">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-white text-sm font-black text-blue-700">{index + 1}</span>
                            <span><span className="block text-xs font-black text-slate-800">{title}</span><span className="mt-1 block text-[10px] font-semibold text-slate-500">{subtitle}</span></span>
                        </button>
                    ))}
                </div>
            </section>

            {showFeatureLocker && (
                <section className="rounded-3xl border border-blue-200 bg-white p-5 shadow-lg shadow-blue-100/50">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">Feature Locker</p><h2 className="mt-1 text-lg font-black">필요한 기능만 체크해 메뉴에 꺼내기</h2><p className="mt-1 text-sm font-semibold text-slate-500">핵심 업무 메뉴는 고정하고, 보조 기능은 현장별로 선택합니다.</p></div>
                        <div className="flex gap-2"><button type="button" onClick={resetFeatures} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600">목업 기본값</button><button type="button" onClick={showAllFeatures} className="rounded-xl bg-[#0c377d] px-3 py-2 text-xs font-black text-white">모두 표시</button></div>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {composition.sidebarOrder.map((page) => {
                            const fixed = CORE_MENU_PAGES.has(page);
                            const visible = !composition.hiddenSidebarPages.includes(page);
                            return <label key={page} className={`flex items-center justify-between rounded-xl border px-3 py-3 ${fixed ? 'border-blue-100 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}><span className="text-sm font-bold text-slate-700">{getRouteLabel(page, 'practitioner')}</span><input type="checkbox" checked={visible} disabled={fixed} onChange={(event) => updateFeature(page, event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600 disabled:opacity-50" /></label>;
                        })}
                    </div>
                    <button type="button" onClick={onOpenAdvanced} className="mt-4 w-full rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-black text-slate-600 hover:border-blue-400 hover:text-blue-700">기존 고급 분석 대시보드 열기</button>
                </section>
            )}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                    ['작성물', `${workerRecords.length}건`, '전체 수기 기록'],
                    ['AI 분석 완료', `${summary.analyzed}건`, `평균 인식 ${summary.averageScore}점`],
                    ['고위험 집중', `${summary.highRisk}건`, '교육 우선 대상'],
                    ['개선이행', `${summary.improvement}%`, `반복지적 ${summary.repeat}점`],
                ].map(([label, value, helper]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-black text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-[#0c377d]">{value}</p><p className="mt-1 text-xs font-semibold text-slate-400">{helper}</p></div>)}
            </section>

            <section className="grid gap-4 xl:grid-cols-4">
                {BOARD_STEPS.map((step) => (
                    <button key={step.number} type="button" onClick={() => step.page !== 'dashboard' && setCurrentPage(step.page)} className="group min-h-[250px] rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl">
                        <div className="flex items-start justify-between"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#082d66] text-sm font-black text-white">{step.number}</span><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${accentClass[step.accent]}`}>바로가기</span></div>
                        <h3 className="mt-4 text-base font-black text-slate-900">{step.title}</h3><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{step.subtitle}</p>
                        {step.number === 1 && <><div className="mt-4 grid grid-cols-2 gap-2 text-center"><div className="rounded-xl bg-slate-50 p-2"><b className="text-lg text-blue-700">{summary.averageScore}</b><span className="block text-[10px] text-slate-400">평균 인식</span></div><div className="rounded-xl bg-slate-50 p-2"><b className="text-lg text-emerald-700">{summary.workTypes}</b><span className="block text-[10px] text-slate-400">분석 공종</span></div></div><MiniTrend values={[42, 55, 51, 63, 72, Math.max(76, summary.averageScore)]} /></>}
                        {step.number === 2 && <div className="mt-5 rounded-2xl border border-dashed border-blue-200 bg-blue-50 p-4 text-center"><p className="text-2xl text-blue-700">⇧</p><p className="mt-1 text-xs font-black text-blue-800">수기 기록 업로드</p><p className="mt-1 text-[10px] text-blue-500">JPG · PNG · PDF</p></div>}
                        {step.number === 3 && <div className="mt-4 space-y-2">{topRisks.length ? topRisks.map(([risk, count], index) => <div key={risk} className="flex items-center gap-2 text-xs"><b className="w-5 text-blue-700">{index + 1}</b><span className="flex-1 truncate font-bold">{risk}</span><span className="text-slate-400">{count}건</span></div>) : <p className="rounded-xl bg-slate-50 p-4 text-xs font-bold text-slate-400">분석 후 위험 TOP3가 표시됩니다.</p>}</div>}
                        {step.number === 4 && <div className="mt-4 grid grid-cols-2 gap-2"><div className="aspect-[3/4] rounded-xl border border-slate-200 bg-gradient-to-b from-blue-50 to-white p-2 text-[9px] font-bold text-blue-800">A4 교육자료<br/><span className="mt-4 block text-3xl text-center">A4</span></div><div className="aspect-[3/4] rounded-xl border border-orange-200 bg-gradient-to-b from-orange-50 to-white p-2 text-[9px] font-bold text-orange-800">위험 맞춤자료<br/><span className="mt-4 block text-3xl text-center">!</span></div></div>}
                        {step.number === 5 && <div className="mt-4 space-y-2">{recentUploads.length ? recentUploads.slice(0, 3).map((record) => <div key={record.id} className="truncate rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">{record.filename || `${record.date} 분석자료`}</div>) : <p className="rounded-xl bg-slate-50 p-4 text-xs font-bold text-slate-400">PPT/PDF 업로드 후 한장요약을 생성합니다.</p>}</div>}
                        {step.number === 6 && <div className="mt-4 flex items-center gap-4"><div className="grid h-24 w-24 grid-cols-5 gap-1 rounded-lg border-4 border-slate-900 bg-white p-2">{Array.from({ length: 25 }).map((_, i) => <span key={i} className={i % 3 === 0 || i % 7 === 0 ? 'bg-slate-900' : 'bg-white'} />)}</div><div className="space-y-2 text-xs font-bold text-slate-600"><p>한국어</p><p>베트남어</p><p>중국어</p><p>인도네시아어</p></div></div>}
                        {step.number === 7 && <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-slate-50 p-2"><b className="text-sm text-blue-700">위험이해</b><MiniTrend values={[44, 50, 57, 60, 68]} /></div><div className="rounded-xl bg-slate-50 p-2"><b className="text-sm text-emerald-700">개선이행</b><MiniTrend values={[38, 46, 55, 64, 77]} color="#059669" /></div></div>}
                        {step.number === 8 && <div className="mt-4 space-y-2">{['현장 설정', '언어 설정', '리포트 설정', '권한 관리'].map((label, index) => <div key={label} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold"><span>{label}</span><span className={`h-4 w-7 rounded-full ${index < 3 ? 'bg-blue-700' : 'bg-slate-300'}`} /></div>)}</div>}
                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] font-black text-blue-700"><span>{step.number === 1 ? `${safetyCheckRecords.length}건 현장점검` : '화면 열기'}</span><span className="transition group-hover:translate-x-1">→</span></div>
                    </button>
                ))}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black text-blue-700">모바일 핵심 동선</p><h2 className="mt-1 text-lg font-black">지도 공유 → 위험교육 → 수기 작성 → 다음 달 분석</h2></div><button type="button" onClick={() => setCurrentPage('admin-training')} className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white hover:bg-orange-600">다국어 교육 / QR 열기</button></div><div className="mt-4 grid gap-2 sm:grid-cols-4">{['지도·교육 공유', '지난달 계도 확인', '다음 달 작성 안내', '월별 6대지표 추적'].map((label, index) => <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><span className="text-xs font-black text-blue-700">0{index + 1}</span><p className="mt-1 text-sm font-black">{label}</p></div>)}</div></section>
        </div>
    );
};

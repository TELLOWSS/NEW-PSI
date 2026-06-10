import React, { useEffect, useMemo, useState } from 'react';
import type { Page, SafetyCheckRecord, WorkerRecord } from '../types';
import { getRouteLabel } from '../config/routeMeta';
import { postAdminJson } from '../utils/adminApiClient';
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

type TrainingSummary = {
    trainingSessions: number;
    trainingSubmissions: number | null;
};

const BOARD_STEPS: BoardStep[] = [
    { number: 1, title: '상세 분석 대시보드', subtitle: '현장 위험과 월별 지표를 상세 분석합니다.', page: 'dashboard', accent: 'blue' },
    { number: 2, title: '위험성평가 작성·분석', subtitle: '사진, PDF 또는 수기 내용으로 평가를 작성합니다.', page: 'ocr-analysis', accent: 'blue' },
    { number: 3, title: '월별 계도 리포트', subtitle: '지난달 작성 내용을 익명화하여 공유합니다.', page: 'monthly-guidance-report', accent: 'orange' },
    { number: 4, title: 'A4 교육자료 만들기', subtitle: '다음 달 위험작업 교육자료를 준비합니다.', page: 'a4-education-material', accent: 'orange' },
    { number: 5, title: 'PPT·PDF 한 장 요약', subtitle: '기존 교육자료를 현장용 한 장으로 정리합니다.', page: 'ppt-pdf-one-page-summary', accent: 'blue' },
    { number: 6, title: '다국어 교육·QR', subtitle: '언어별 교육을 배포하고 참여를 확인합니다.', page: 'admin-training', accent: 'green' },
    { number: 7, title: '월별 성과 확인', subtitle: '개선 이행과 반복 위험 변화를 확인합니다.', page: 'performance-analysis', accent: 'green' },
    { number: 8, title: '환경 설정', subtitle: '현장, 언어, 화면 구성을 관리합니다.', page: 'settings', accent: 'blue' },
];

const QUICK_FLOW: Array<{ title: string; subtitle: string; page: Page }> = [
    { title: '지난달 기록 분석', subtitle: '사진·PDF·수기 분석', page: 'ocr-analysis' },
    { title: '계도 리포트 공유', subtitle: '익명화 집단 자료', page: 'monthly-guidance-report' },
    { title: '다음 달 교육 준비', subtitle: 'A4 교육자료 생성', page: 'a4-education-material' },
    { title: '수기 평가 작성', subtitle: '현장 기록 직접 입력', page: 'ocr-analysis' },
    { title: '성과 변화 확인', subtitle: '월별 6대 지표', page: 'performance-analysis' },
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

const formatMonth = (date = new Date()) => `${date.getFullYear()}년 ${date.getMonth() + 1}월`;

const getMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const getRecentMonthKeys = (count: number): string[] => {
    const now = new Date();
    return Array.from({ length: count }, (_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
        return getMonthKey(date);
    });
};

const TrendChart = ({ values, color = '#2563eb', label }: { values: number[]; color?: string; label: string }) => {
    if (values.length < 2) {
        return <p className="mt-3 rounded-xl bg-slate-50 px-3 py-4 text-center text-xs font-bold text-slate-400">추세 데이터가 부족합니다.</p>;
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(1, max - min);
    const points = values
        .map((value, index) => `${index * (120 / (values.length - 1))},${42 - ((value - min) / range) * 32}`)
        .join(' ');
    return (
        <svg viewBox="0 0 120 48" className="mt-3 h-12 w-full" role="img" aria-label={label}>
            <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
            {values.map((value, index) => (
                <circle key={`${value}-${index}`} cx={index * (120 / (values.length - 1))} cy={42 - ((value - min) / range) * 32} r="2.5" fill={color} />
            ))}
        </svg>
    );
};

export const IntegratedWorkBoard: React.FC<IntegratedWorkBoardProps> = ({
    workerRecords,
    safetyCheckRecords,
    setCurrentPage,
    onOpenAdvanced,
}) => {
    const [showFeatureLocker, setShowFeatureLocker] = useState(false);
    const [composition, setComposition] = useState<UiCompositionConfig>(() => loadUiCompositionConfig());
    const [trainingSummary, setTrainingSummary] = useState<TrainingSummary | null>(null);
    const [trainingSummaryError, setTrainingSummaryError] = useState('');

    useEffect(() => {
        let active = true;
        void postAdminJson<{ ok: true; summary: TrainingSummary }>(
            '/api/admin/training',
            { action: 'dashboard-summary' },
            { fallbackMessage: '서버 교육 현황을 불러오지 못했습니다.' },
        )
            .then((response) => {
                if (!active) return;
                setTrainingSummary(response.summary);
                setTrainingSummaryError('');
            })
            .catch((error) => {
                if (!active) return;
                setTrainingSummaryError(error instanceof Error ? error.message : '서버 교육 현황을 불러오지 못했습니다.');
            });
        return () => {
            active = false;
        };
    }, []);

    const summary = useMemo(() => {
        const validScores = workerRecords.map((record) => record.safetyScore).filter(Number.isFinite);
        const averageScore = validScores.length
            ? Math.round(validScores.reduce((sum, value) => sum + value, 0) / validScores.length)
            : 0;
        const highRisk = workerRecords.filter((record) => record.safetyLevel === '초급' || record.safetyScore < 60).length;
        const analyzed = workerRecords.filter((record) => Boolean(record.scoreBreakdown)).length;
        const improvementValues = workerRecords
            .map((record) => record.scoreBreakdown?.improvementExecution)
            .filter((value): value is number => typeof value === 'number');
        const improvement = improvementValues.length
            ? Math.round(improvementValues.reduce((sum, value) => sum + value, 0) / improvementValues.length / 20 * 100)
            : 0;
        const workTypes = new Set(workerRecords.map((record) => record.jobField).filter(Boolean)).size;
        return { averageScore, highRisk, analyzed, improvement, workTypes };
    }, [workerRecords]);

    const monthlyTrends = useMemo(() => {
        const monthKeys = getRecentMonthKeys(6);
        const scoreValues: number[] = [];
        const improvementValues: number[] = [];

        monthKeys.forEach((monthKey) => {
            const monthRecords = workerRecords.filter((record) => {
                const date = new Date(record.date);
                return !Number.isNaN(date.getTime()) && getMonthKey(date) === monthKey;
            });
            const scores = monthRecords.map((record) => record.safetyScore).filter(Number.isFinite);
            const improvements = monthRecords
                .map((record) => record.scoreBreakdown?.improvementExecution)
                .filter((value): value is number => typeof value === 'number');
            if (scores.length) scoreValues.push(Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length));
            if (improvements.length) improvementValues.push(Math.round(improvements.reduce((sum, value) => sum + value, 0) / improvements.length / 20 * 100));
        });

        return { scoreValues, improvementValues };
    }, [workerRecords]);

    const recentUploads = useMemo(() => workerRecords.slice(0, 3), [workerRecords]);
    const topRisks = useMemo(() => {
        const counts = new Map<string, number>();
        workerRecords.forEach((record) => {
            (record.weakAreas || []).forEach((risk) => counts.set(risk, (counts.get(risk) || 0) + 1));
        });
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    }, [workerRecords]);

    const updateFeature = (page: Page, visible: boolean) => {
        const next = saveUiCompositionConfig(setSidebarPageVisible(composition, page, visible));
        setComposition(next);
    };

    const showAllFeatures = () => {
        let next = getDefaultUiCompositionConfig();
        OPTIONAL_FEATURES.forEach((page) => {
            next = setSidebarPageVisible(next, page, true);
        });
        setComposition(saveUiCompositionConfig(next));
    };

    const openStep = (step: BoardStep) => {
        if (step.page === 'dashboard') {
            onOpenAdvanced();
            return;
        }
        setCurrentPage(step.page);
    };

    return (
        <div className="min-h-full space-y-4 bg-[#f7f9fc] pb-12 text-slate-900">
            <section className="rounded-3xl border border-slate-200 bg-white px-4 py-5 shadow-sm sm:px-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                        <p className="text-xs font-black text-blue-700">오늘의 안전업무</p>
                        <h1 className="mt-1 text-2xl font-black tracking-tight text-[#0c2348]">PSI 통합 업무 보드</h1>
                        <p className="mt-2 text-sm font-semibold text-slate-500">작성, 분석, 교육, 개선 확인을 한 화면에서 시작합니다.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">{formatMonth()} 운영</span>
                        <button type="button" onClick={() => setShowFeatureLocker((value) => !value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:border-blue-300 hover:text-blue-700">
                            {showFeatureLocker ? '기능 설정 닫기' : '화면 기능 설정'}
                        </button>
                    </div>
                </div>

                <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    {QUICK_FLOW.map((item, index) => (
                        <button key={item.title} type="button" onClick={() => setCurrentPage(item.page)} className="group flex min-h-20 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-white hover:shadow-md">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-white text-sm font-black text-blue-700">{index + 1}</span>
                            <span>
                                <span className="block text-xs font-black text-slate-800">{item.title}</span>
                                <span className="mt-1 block text-[11px] font-semibold text-slate-500">{item.subtitle}</span>
                            </span>
                        </button>
                    ))}
                </div>
            </section>

            {showFeatureLocker && (
                <section className="rounded-3xl border border-blue-200 bg-white p-5 shadow-lg shadow-blue-100/50">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-xs font-black text-blue-600">화면 기능 설정</p>
                            <h2 className="mt-1 text-lg font-black">현장에서 사용할 메뉴를 선택하세요.</h2>
                        </div>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setComposition(resetUiCompositionConfig())} className="min-h-11 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600">기본값</button>
                            <button type="button" onClick={showAllFeatures} className="min-h-11 rounded-xl bg-[#0c377d] px-3 py-2 text-xs font-black text-white">모두 표시</button>
                        </div>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {composition.sidebarOrder.map((page) => {
                            const fixed = CORE_MENU_PAGES.has(page);
                            const visible = !composition.hiddenSidebarPages.includes(page);
                            return (
                                <label key={page} className={`flex min-h-12 items-center justify-between rounded-xl border px-3 py-3 ${fixed ? 'border-blue-100 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>
                                    <span className="text-sm font-bold text-slate-700">{getRouteLabel(page, 'practitioner')}</span>
                                    <input type="checkbox" checked={visible} disabled={fixed} onChange={(event) => updateFeature(page, event.target.checked)} className="h-5 w-5 rounded border-slate-300 text-blue-700 focus:ring-blue-600 disabled:opacity-50" />
                                </label>
                            );
                        })}
                    </div>
                </section>
            )}

            <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-black text-amber-800">데이터 기준</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-amber-700">
                    작성물과 AI 분석 수치는 현재 브라우저에 저장된 현장 기록 기준입니다. 교육 세션과 참여 기록은 서버에 저장된 전체 운영 데이터입니다.
                </p>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                {[
                    ['현장 작성물', `${workerRecords.length}건`, '이 브라우저'],
                    ['AI 분석 완료', `${summary.analyzed}건`, `평균 ${summary.averageScore}점`],
                    ['고위험 집중', `${summary.highRisk}건`, '교육 우선 대상'],
                    ['개선 이행', `${summary.improvement}%`, `${summary.workTypes}개 공종`],
                    ['교육 세션', trainingSummary ? `${trainingSummary.trainingSessions}건` : '-', '서버 전체'],
                    ['교육 참여', trainingSummary?.trainingSubmissions == null ? '-' : `${trainingSummary.trainingSubmissions}건`, '서버 전체'],
                ].map(([label, value, helper]) => (
                    <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <p className="text-xs font-black text-slate-500">{label}</p>
                        <p className="mt-2 text-2xl font-black text-[#0c377d]">{value}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-400">{helper}</p>
                    </div>
                ))}
            </section>

            {trainingSummaryError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
                    서버 교육 현황을 표시하지 못했습니다. 관리자 로그인을 다시 확인해 주세요.
                </p>
            )}

            <section className="grid gap-4 xl:grid-cols-4">
                {BOARD_STEPS.map((step) => (
                    <button key={step.number} type="button" onClick={() => openStep(step)} className="group min-h-[240px] rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl">
                        <div className="flex items-start justify-between">
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#082d66] text-sm font-black text-white">{step.number}</span>
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${accentClass[step.accent]}`}>{step.number === 1 ? '상세 보기' : '바로가기'}</span>
                        </div>
                        <h3 className="mt-4 text-base font-black text-slate-900">{step.title}</h3>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{step.subtitle}</p>

                        {step.number === 1 && (
                            <div className="mt-4">
                                <div className="grid grid-cols-2 gap-2 text-center">
                                    <div className="rounded-xl bg-slate-50 p-2"><b className="text-lg text-blue-700">{summary.averageScore}</b><span className="block text-[10px] text-slate-400">평균 점수</span></div>
                                    <div className="rounded-xl bg-slate-50 p-2"><b className="text-lg text-emerald-700">{summary.workTypes}</b><span className="block text-[10px] text-slate-400">분석 공종</span></div>
                                </div>
                                <TrendChart values={monthlyTrends.scoreValues} label="최근 월별 평균 안전점수 추세" />
                            </div>
                        )}
                        {step.number === 2 && <div className="mt-5 rounded-2xl border border-dashed border-blue-200 bg-blue-50 p-4 text-center"><p className="text-sm font-black text-blue-800">사진·PDF·수기 입력</p><p className="mt-1 text-[11px] text-blue-600">현장 상황에 맞는 입력 방식을 선택합니다.</p></div>}
                        {step.number === 3 && <div className="mt-4 space-y-2">{topRisks.length ? topRisks.map(([risk, count], index) => <div key={risk} className="flex items-center gap-2 text-xs"><b className="w-5 text-blue-700">{index + 1}</b><span className="flex-1 truncate font-bold">{risk}</span><span className="text-slate-400">{count}건</span></div>) : <p className="rounded-xl bg-slate-50 p-4 text-xs font-bold text-slate-400">분석 후 주요 위험 항목이 표시됩니다.</p>}</div>}
                        {step.number === 4 && <div className="mt-4 rounded-2xl bg-orange-50 p-4 text-center"><b className="text-3xl text-orange-700">A4</b><p className="mt-2 text-xs font-bold text-orange-800">인쇄 가능한 현장 교육자료</p></div>}
                        {step.number === 5 && <div className="mt-4 space-y-2">{recentUploads.length ? recentUploads.map((record) => <div key={record.id} className="truncate rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">{record.filename || `${record.date} 분석자료`}</div>) : <p className="rounded-xl bg-slate-50 p-4 text-xs font-bold text-slate-400">등록된 자료가 없습니다.</p>}</div>}
                        {step.number === 6 && <div className="mt-4 rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-black text-emerald-800">서버 교육 세션</p><p className="mt-2 text-2xl font-black text-emerald-700">{trainingSummary ? trainingSummary.trainingSessions : '-'}건</p><p className="mt-1 text-[11px] font-semibold text-emerald-700">실제 QR은 교육 화면에서 생성됩니다.</p></div>}
                        {step.number === 7 && <div className="mt-4"><p className="text-xs font-black text-emerald-800">개선 이행 추세</p><TrendChart values={monthlyTrends.improvementValues} color="#059669" label="최근 월별 개선 이행 추세" /></div>}
                        {step.number === 8 && <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs font-bold leading-6 text-slate-600">현장 정보, 언어, 분석 키, 화면 구성을 설정 화면에서 관리합니다.</div>}

                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] font-black text-blue-700">
                            <span>{step.number === 1 ? `${safetyCheckRecords.length}건 현장점검` : '화면 열기'}</span>
                            <span aria-hidden="true" className="transition group-hover:translate-x-1">→</span>
                        </div>
                    </button>
                ))}
            </section>

            {!workerRecords.length && (
                <section className="rounded-3xl border border-dashed border-blue-200 bg-white p-6 text-center">
                    <h2 className="text-lg font-black text-slate-900">아직 이 브라우저에 현장 기록이 없습니다.</h2>
                    <p className="mt-2 text-sm font-semibold text-slate-500">사진, PDF 또는 수기 입력으로 첫 위험성평가를 등록하면 실제 지표와 추세가 표시됩니다.</p>
                    <button type="button" onClick={() => setCurrentPage('ocr-analysis')} className="mt-4 min-h-11 rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white hover:bg-blue-800">첫 평가 작성하기</button>
                </section>
            )}
        </div>
    );
};

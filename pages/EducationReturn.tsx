import React, { useMemo } from 'react';
import type { Page, WorkerRecord } from '../types';
import { buildEducationReturnSummary } from '../utils/educationReturnSummary';

interface EducationReturnProps {
    workerRecords: WorkerRecord[];
    onNavigateToPage: (page: Page) => void;
}

type Tone = 'blue' | 'purple' | 'green' | 'orange';

const toneClass: Record<Tone, { badge: string; icon: string; button: string; soft: string }> = {
    blue: {
        badge: 'bg-blue-600 text-white',
        icon: 'bg-blue-100 text-blue-700',
        button: 'bg-blue-700 text-white hover:bg-blue-800',
        soft: 'border-blue-200 bg-blue-50 text-blue-800',
    },
    purple: {
        badge: 'bg-violet-600 text-white',
        icon: 'bg-violet-100 text-violet-700',
        button: 'bg-violet-700 text-white hover:bg-violet-800',
        soft: 'border-violet-200 bg-violet-50 text-violet-800',
    },
    green: {
        badge: 'bg-emerald-700 text-white',
        icon: 'bg-emerald-100 text-emerald-700',
        button: 'bg-emerald-700 text-white hover:bg-emerald-800',
        soft: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    },
    orange: {
        badge: 'bg-orange-500 text-white',
        icon: 'bg-orange-100 text-orange-700',
        button: 'bg-orange-600 text-white hover:bg-orange-700',
        soft: 'border-orange-200 bg-orange-50 text-orange-800',
    },
};

const CameraIcon = () => (
    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h3l1.5-2h7L17 8h3v10H4V8z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13a3 3 0 106 0 3 3 0 00-6 0z" />
    </svg>
);

const VerifyIcon = () => (
    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4h8l3 3v13H5V4h3z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-5" />
    </svg>
);

const EducationIcon = () => (
    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6l8-3 8 3-8 3-8-3z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 10v4c0 2 3 4 6 4s6-2 6-4v-4" />
    </svg>
);

const DocumentIcon = () => (
    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 3h7l4 4v14H7V3z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6M9 16h6" />
    </svg>
);

const ReportIcon = () => (
    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11a4 4 0 10-8 0 4 4 0 008 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 21a8 8 0 0116 0" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 5l2 2 3-4" />
    </svg>
);

const TrackingIcon = () => (
    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19V9m7 10V5m7 14v-7" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 20h17" />
    </svg>
);

const ArrowIcon = () => (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
);

const StepItem: React.FC<{ number: string; title: string; desc: string; icon: React.ReactNode; tone: Tone }> = ({ number, title, desc, icon, tone }) => {
    const classes = toneClass[tone];
    return (
        <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black ${classes.badge}`}>{number}</span>
            <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${classes.icon}`}>{icon}</span>
            <div className="min-w-0">
                <p className="text-lg font-black text-slate-950">{title}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">{desc}</p>
            </div>
        </div>
    );
};

const MetricCard: React.FC<{ label: string; value: string; icon: React.ReactNode; tone: Tone }> = ({ label, value, icon, tone }) => {
    const classes = toneClass[tone];
    return (
        <div className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${classes.icon}`}>{icon}</span>
            <div>
                <p className="text-xs font-black text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
            </div>
        </div>
    );
};

const OutputCard: React.FC<{
    number: string;
    title: string;
    status: string;
    statusTone: Tone;
    icon: React.ReactNode;
    children: React.ReactNode;
    primaryLabel: string;
    onPrimary: () => void;
    secondary?: Array<{ label: string; onClick: () => void }>;
}> = ({ number, title, status, statusTone, icon, children, primaryLabel, onPrimary, secondary }) => {
    const statusClasses = toneClass[statusTone];
    return (
        <article data-education-return="output-card" className="flex min-h-[300px] flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm font-black ${statusClasses.badge}`}>{number}</span>
                    <span className={`flex h-16 w-16 items-center justify-center rounded-2xl ${statusClasses.icon}`}>{icon}</span>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClasses.soft}`}>{status}</span>
            </div>
            <h3 className="mt-4 text-2xl font-black leading-tight text-slate-950">{title}</h3>
            <div className="mt-4 flex-1">{children}</div>
            <button
                type="button"
                onClick={onPrimary}
                className={`mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition ${toneClass.blue.button}`}
            >
                {primaryLabel}
                <ArrowIcon />
            </button>
            {secondary && secondary.length > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {secondary.map((item) => (
                        <button
                            key={item.label}
                            type="button"
                            onClick={item.onClick}
                            className="min-h-11 rounded-2xl border border-blue-200 bg-white px-3 py-2 text-sm font-black text-blue-700 transition hover:bg-blue-50"
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </article>
    );
};

const EducationReturn: React.FC<EducationReturnProps> = ({ workerRecords, onNavigateToPage }) => {
    const summary = useMemo(() => buildEducationReturnSummary(workerRecords), [workerRecords]);
    const trendPrefix = summary.monthlyTrendPct > 0 ? '+' : '';
    const riskText = summary.topRisks.join(' · ');
    const repeatedRiskText = summary.repeatedRiskKeywords.slice(0, 3).join(' · ');

    return (
        <div data-education-return="page" className="psi-page space-y-5 pb-16">
            <section data-education-return="hero" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-start 2xl:justify-between">
                    <div className="max-w-4xl">
                        <p className="text-xs font-black text-slate-500">교육 환류</p>
                        <h2 className="mt-1 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">PSI 교육 환류 센터</h2>
                        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600 sm:text-base">
                            검증된 기록은 세 가지 결과물로 돌아갑니다. 현장 공통교육, 개인 보호 리포트, 월별 계도·추적자료입니다.
                        </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3 2xl:min-w-[620px]">
                        <MetricCard label="OCR 분석 완료" value={`${summary.completedRecords}건`} tone="blue" icon={<VerifyIcon />} />
                        <MetricCard label="관리자 확인 필요" value={`${summary.reviewRequiredRecords}건`} tone="orange" icon={<VerifyIcon />} />
                        <MetricCard label="다국어 환류 가능" value={`${summary.supportedLanguageCount}개 언어`} tone="green" icon={<EducationIcon />} />
                    </div>
                </div>

                <div data-education-return="three-step-flow" className="mt-6 rounded-3xl border border-blue-200 bg-blue-50/40 px-4 py-5">
                    <div className="grid gap-5 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-center">
                        <StepItem number="1" title="찍는다" desc="수기 기록지 사진/PDF 업로드" tone="blue" icon={<CameraIcon />} />
                        <ArrowIcon />
                        <StepItem number="2" title="확인한다" desc="OCR·AI 분석 결과 관리자 검증" tone="purple" icon={<VerifyIcon />} />
                        <ArrowIcon />
                        <StepItem number="3" title="교육한다" desc="세 가지 교육 출력물 생성" tone="green" icon={<EducationIcon />} />
                    </div>
                </div>
            </section>

            <section data-education-return="outputs" className="grid gap-4 xl:grid-cols-3">
                <OutputCard
                    number="01"
                    title="원페이지 교육자료"
                    status={summary.onePageStatus}
                    statusTone="green"
                    icon={<DocumentIcon />}
                    primaryLabel="교육자료 만들기"
                    onPrimary={() => onNavigateToPage('a4-education-material')}
                    secondary={[
                        { label: '필요 언어본 보기', onClick: () => onNavigateToPage('a4-education-material') },
                        { label: 'QR/음성 파일럿', onClick: () => onNavigateToPage('admin-training') },
                    ]}
                >
                    <div className="space-y-3">
                        <div className="grid gap-2 sm:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                <p className="text-xs font-black text-slate-500">기준월</p>
                                <p className="mt-1 text-lg font-black text-blue-800">{summary.targetMonth}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                <p className="text-xs font-black text-slate-500">공종</p>
                                <p className="mt-1 truncate text-lg font-black text-slate-900">{summary.workScopeLabel}</p>
                            </div>
                        </div>
                        <div className="rounded-2xl bg-slate-100 px-4 py-3">
                            <p className="text-xs font-black text-slate-500">중점 위험 TOP3</p>
                            <p className="mt-1 text-base font-black text-slate-950">{riskText}</p>
                        </div>
                    </div>
                </OutputCard>

                <OutputCard
                    number="02"
                    title="개인 보호 리포트"
                    status={summary.reportStatus === '확인 필요' ? `확인 필요 ${summary.reviewRequiredRecords}명` : summary.reportStatus}
                    statusTone={summary.reviewRequiredRecords > 0 ? 'orange' : 'purple'}
                    icon={<ReportIcon />}
                    primaryLabel="리포트 확인"
                    onPrimary={() => onNavigateToPage('reports')}
                >
                    <div className="overflow-hidden rounded-2xl border border-slate-200">
                        {[
                            ['보호 우선 신호', '고위험 행동·현장 알림'],
                            ['응답 품질 신호', '응답 일관성·이해도 확인'],
                            ['관리자 관점 확인', '개인별 위험 인식·실천 점검'],
                        ].map(([label, desc]) => (
                            <div key={label} className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-3 last:border-b-0">
                                <div>
                                    <p className="text-sm font-black text-slate-900">{label}</p>
                                    <p className="mt-0.5 text-xs font-semibold text-slate-500">{desc}</p>
                                </div>
                                <ArrowIcon />
                            </div>
                        ))}
                    </div>
                </OutputCard>

                <OutputCard
                    number="03"
                    title="월별 계도·추적자료"
                    status={summary.monthlyStatus}
                    statusTone="green"
                    icon={<TrackingIcon />}
                    primaryLabel="월별 자료 보기"
                    onPrimary={() => onNavigateToPage('monthly-guidance-report')}
                >
                    <div className="overflow-hidden rounded-2xl border border-slate-200">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-3">
                            <p className="text-sm font-black text-slate-900">전월 대비</p>
                            <div className="text-right">
                                <p className="text-xl font-black text-emerald-700">{trendPrefix}{summary.monthlyTrendPct}%</p>
                                <p className="text-xs font-semibold text-slate-500">위험 신호 변화</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-3">
                            <p className="text-sm font-black text-slate-900">반복 위험 키워드</p>
                            <div className="text-right">
                                <p className="text-lg font-black text-slate-950">{summary.repeatedRiskKeywords.length}개</p>
                                <p className="max-w-[180px] truncate text-xs font-semibold text-slate-500">{repeatedRiskText}</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 px-3 py-3">
                            <p className="text-sm font-black text-slate-900">개선 이행률</p>
                            <p className="text-xl font-black text-blue-700">{summary.improvementRate}%</p>
                        </div>
                    </div>
                </OutputCard>
            </section>

            <section data-education-return="proof-message" className="rounded-3xl border border-blue-200 bg-blue-50 px-5 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-black leading-6 text-slate-800">
                        익숙한 수기 작성 흐름을 유지한 채, 버려지던 종이를 예측 가능한 데이터로 구조화합니다.
                    </p>
                    <div className="flex items-center gap-2 text-sm font-black text-blue-700">
                        <span>찍는다</span>
                        <ArrowIcon />
                        <span>확인한다</span>
                        <ArrowIcon />
                        <span>교육한다</span>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default EducationReturn;

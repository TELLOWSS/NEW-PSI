import React, { useMemo, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import type { MonthlyGuidanceReport as GuidanceData, SixMetricBreakdown, WorkerRecord } from '../types';
import { FieldRadarChart } from '../components/charts/FieldRadarChart';
import { buildMonthlyCoreMetricSeries } from '../utils/coreMetrics';

interface Props { workerRecords: WorkerRecord[]; }

type MetricKey = keyof SixMetricBreakdown;
type ChartPoint = { month: string; value: number; label: string };

const metrics: Array<{ key: MetricKey; label: string; max: number; description: string }> = [
    { key: 'psychological', label: '응답 충실도', max: 10, description: '위험을 구체적으로 기록하는 경향' },
    { key: 'jobUnderstanding', label: '공종이해', max: 20, description: '본인 작업·도구·자재를 구체적으로 연결하는 수준' },
    { key: 'riskAssessmentUnderstanding', label: '위험성평가 이해', max: 20, description: '예정 작업의 위험요소와 대책을 연결하는 수준' },
    { key: 'proficiency', label: '숙련도', max: 30, description: '현장 경험이 반영된 실효성 있는 대책 수준' },
    { key: 'improvementExecution', label: '개선이행', max: 20, description: '지난달 교육·지적사항이 이번 달 작성내용과 실천행동에 반영되었는지 확인하는 지표' },
    { key: 'repeatViolationPenalty', label: '반복지적 보완', max: 30, description: '같은 위험요소나 불안전행동의 반복 여부를 다음 교육에 반영하기 위한 지표' },
];

const monthKey = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};
const shiftMonth = (month: string, amount: number) => {
    const [year, number] = month.split('-').map(Number);
    const date = new Date(year, number - 1 + amount, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (month: string) => {
    const [year, number] = month.split('-');
    return `${year}년 ${Number(number)}월`;
};
const monthDistance = (fromMonth: string, toMonth: string) => {
    const [fromYear, fromNumber] = fromMonth.split('-').map(Number);
    const [toYear, toNumber] = toMonth.split('-').map(Number);
    if (![fromYear, fromNumber, toYear, toNumber].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
    return (toYear - fromYear) * 12 + (toNumber - fromNumber);
};
const defaultMonth = (records: WorkerRecord[]) => {
    const months = records.map((record) => monthKey(record.date)).filter(Boolean).sort();
    if (months.length) return months[months.length - 1];
    const now = new Date();
    return shiftMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, -1);
};
const clean = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();
const riskMap = (records: WorkerRecord[]) => {
    const result = new Map<string, { count: number; workTypes: Set<string> }>();
    records.forEach((record) => {
        const risks = [...(record.weakAreas || []), ...(record.suggestions || []).slice(0, 1)].map(clean).filter((item) => item.length > 1);
        new Set(risks).forEach((risk) => {
            const item = result.get(risk) || { count: 0, workTypes: new Set<string>() };
            item.count += 1;
            item.workTypes.add(record.jobField || '미분류 공종');
            result.set(risk, item);
        });
    });
    return result;
};
const average = (records: WorkerRecord[], key: MetricKey) => {
    const values = records.map((record) => record.scoreBreakdown?.[key]).filter((value): value is number => typeof value === 'number');
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : 0;
};
const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const SparkLine: React.FC<{ points: ChartPoint[] }> = ({ points }) => {
    const width = 360;
    const height = 150;
    const padding = 22;
    const safePoints = points.length > 0 ? points : [{ month: '', value: 0, label: '자료 대기' }];
    const max = Math.max(100, ...safePoints.map((point) => point.value));
    const min = Math.min(0, ...safePoints.map((point) => point.value));
    const range = max - min || 1;
    const xStep = safePoints.length > 1 ? (width - padding * 2) / (safePoints.length - 1) : 0;
    const coords = safePoints.map((point, index) => {
        const x = padding + index * xStep;
        const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
        return { ...point, x, y };
    });
    const line = coords.map((point) => `${point.x},${point.y}`).join(' ');
    const area = coords.length > 1
        ? `M ${coords[0].x},${height - padding} L ${line} L ${coords[coords.length - 1].x},${height - padding} Z`
        : '';

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" role="img" aria-label="월별 위험인식 신호 변화 차트">
            <defs>
                <linearGradient id="monthlyTrackingGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
                </linearGradient>
            </defs>
            {[0, 25, 50, 75, 100].map((tick) => {
                const y = height - padding - ((tick - min) / range) * (height - padding * 2);
                return (
                    <g key={tick}>
                        <line x1={padding} x2={width - padding} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 5" />
                        <text x={4} y={y + 4} className="fill-slate-400 text-[10px] font-bold">{tick}</text>
                    </g>
                );
            })}
            {area && <path d={area} fill="url(#monthlyTrackingGradient)" />}
            <polyline points={line} fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {coords.map((point) => (
                <g key={`${point.month}-${point.value}`}>
                    <circle cx={point.x} cy={point.y} r="5" fill="#ffffff" stroke="#2563eb" strokeWidth="3" />
                    <text x={point.x} y={height - 4} textAnchor="middle" className="fill-slate-500 text-[10px] font-black">{point.label}</text>
                </g>
            ))}
        </svg>
    );
};

const TrackingAnalysisPanel: React.FC<{
    report: GuidanceData;
    monthlyPoints: ChartPoint[];
    delta: number;
}> = ({ report, monthlyPoints, delta }) => {
    const currentAverage = monthlyPoints[monthlyPoints.length - 1]?.value ?? 0;
    const maxRiskCount = Math.max(1, ...report.topRiskFactors.map((risk) => risk.count));
    const weakestMetrics = metrics
        .map((metric) => {
            const value = report.sixMetricTrends[`${metric.key}Avg` as keyof GuidanceData['sixMetricTrends']];
            return { ...metric, value, percent: metric.max > 0 ? (Math.abs(value) / metric.max) * 100 : 0 };
        })
        .sort((a, b) => a.percent - b.percent)
        .slice(0, 3);
    const worsenedCount = report.repeatedIssues.filter((issue) => issue.trend === 'worsened' || issue.trend === 'same').length;
    const trendTone = delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-rose-700' : 'text-slate-700';
    const trendLabel = delta > 0 ? '개선 흐름' : delta < 0 ? '추가 확인' : '유지';

    return (
        <section data-monthly-guidance="tracking-analysis" className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <article data-monthly-guidance="trend-chart" className="rounded-2xl border border-blue-100 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-black text-blue-700">월별 변화 차트</p>
                        <h3 className="mt-1 text-lg font-black text-slate-950">위험인식 신호 흐름</h3>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-bold text-slate-500">최근 월 평균</p>
                        <p className="text-2xl font-black text-blue-700">{currentAverage}</p>
                    </div>
                </div>
                <div className="mt-3 rounded-2xl bg-slate-50 px-2 py-3">
                    <SparkLine points={monthlyPoints} />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {[
                        ['월간 판정', trendLabel, trendTone],
                        ['전월 차이', `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`, trendTone],
                        ['분석 표본', `${report.analyzedRecords}건`, 'text-slate-800'],
                    ].map(([label, value, color]) => (
                        <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                            <p className="text-[11px] font-bold text-slate-500">{label}</p>
                            <p className={`mt-1 text-base font-black ${color}`}>{value}</p>
                        </div>
                    ))}
                </div>
            </article>

            <article className="grid gap-4">
                <div data-monthly-guidance="risk-bars" className="rounded-2xl border border-rose-100 bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-black text-slate-950">반복 위험 막대 분석</h3>
                        <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">{worsenedCount}개 유지·증가</span>
                    </div>
                    <div className="mt-4 space-y-3">
                        {report.topRiskFactors.length ? report.topRiskFactors.slice(0, 5).map((risk) => (
                            <div key={risk.riskName}>
                                <div className="flex justify-between gap-3 text-xs font-black">
                                    <span className="truncate text-slate-700">{risk.riskName}</span>
                                    <span className="text-rose-700">{risk.count}건</span>
                                </div>
                                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
                                    <div className="h-full rounded-full bg-rose-500" style={{ width: `${clampPercent((risk.count / maxRiskCount) * 100)}%` }} />
                                </div>
                            </div>
                        )) : <Empty />}
                    </div>
                </div>

                <div data-monthly-guidance="metric-bars" className="rounded-2xl border border-amber-100 bg-white p-5">
                    <h3 className="text-lg font-black text-slate-950">보강 우선 지표 TOP3</h3>
                    <p className="mt-1 text-xs font-semibold text-slate-500">낮은 지표부터 다음 교육 문구와 예시를 보강합니다.</p>
                    <div className="mt-4 space-y-3">
                        {weakestMetrics.map((metric) => (
                            <div key={metric.key} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                                <div className="flex justify-between gap-3 text-xs font-black">
                                    <span className="text-slate-800">{metric.label}</span>
                                    <span className="text-amber-700">{metric.value} / {metric.max}</span>
                                </div>
                                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white">
                                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${clampPercent(metric.percent)}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </article>
        </section>
    );
};

const createReport = (records: WorkerRecord[], previous: WorkerRecord[], assessmentMonth: string, educationMonth: string): GuidanceData => {
    const currentRisks = riskMap(records);
    const previousRisks = riskMap(previous);
    const topRiskFactors = [...currentRisks.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 5).map(([riskName, item]) => ({
        riskName,
        count: item.count,
        relatedWorkTypes: [...item.workTypes].slice(0, 4),
        guidanceMessage: `${riskName} 발생 조건을 작업 전 확인하고 제거·차단·보호구 순서로 대책을 작성합니다.`,
    }));
    const answers = records.flatMap((record) => (record.handwrittenAnswers || []).map((answer) => ({
        question: `${clean(answer.questionNumber) || '위험요소 및 안전대책'} · ${record.jobField || '미분류 공종'}`,
        answer: clean(answer.koreanTranslation || answer.answerText),
    }))).filter((item) => item.answer);
    const fallbackRisk = topRiskFactors[0]?.riskName || '작업 전 위험요소';
    const repeatedIssues = topRiskFactors.map((risk) => {
        const before = previousRisks.get(risk.riskName)?.count || 0;
        const trend = before === 0 ? 'new' : risk.count < before ? 'improved' : risk.count > before ? 'worsened' : 'same';
        return { issueName: risk.riskName, previousCount: before, currentCount: risk.count, trend: trend as 'new' | 'improved' | 'worsened' | 'same', guidanceMessage: trend === 'improved' ? '감소 흐름을 유지하고 실제 작업 전 확인까지 이어갑니다.' : '다음 교육에서 작업 상황과 실천행동을 함께 제시합니다.' };
    });
    return {
        siteName: 'PSI 적용 현장', educationMonth, basedOnAssessmentMonth: assessmentMonth,
        totalWorkers: new Set(records.map((r) => r.worker_uuid || r.workerUuid || r.employeeId || r.name)).size,
        analyzedRecords: records.length,
        overallSummary: `${monthLabel(assessmentMonth)} 작성자료 ${records.length}건을 익명화해 분석했습니다. 개인별 수치 공개가 아니라 현장 전체의 작성 경향과 다음 교육의 중점 행동을 확인하는 계도자료입니다.`,
        topRiskFactors,
        goodWritingExamples: [...answers].sort((a, b) => b.answer.length - a.answer.length).slice(0, 2).map((item) => ({ ...item, example: item.answer, whyGood: '위험 상황과 행동이 구체적으로 연결되어 작업 전 확인에 활용할 수 있습니다.' })),
        poorWritingExamples: [...answers].sort((a, b) => a.answer.length - b.answer.length).slice(0, 2).map((item) => ({ question: item.question, example: item.answer, improvedExample: `${fallbackRisk}이 발생하는 위치와 작업 순서를 확인하고, 작업 전 차단조치와 보호구 상태를 확인한다.`, coachingPoint: '단어만 적기보다 언제·어디서·무엇을 확인할지 한 문장으로 작성합니다.' })),
        repeatedIssues,
        sixMetricTrends: {
            psychologicalAvg: average(records, 'psychological'), jobUnderstandingAvg: average(records, 'jobUnderstanding'),
            riskAssessmentUnderstandingAvg: average(records, 'riskAssessmentUnderstanding'), proficiencyAvg: average(records, 'proficiency'),
            improvementExecutionAvg: average(records, 'improvementExecution'), repeatViolationPenaltyAvg: average(records, 'repeatViolationPenalty'),
        },
        nextMonthEducationFocus: topRiskFactors.slice(0, 3).map((risk) => `${risk.riskName}: 작업 전 확인사항과 실천행동을 구체적으로 작성`),
        multilingualSummaries: [
            { languageCode: 'ko', summaryText: `지난달 주요 위험은 ${fallbackRisk}입니다. 작업 전 위험요소와 안전대책을 구체적으로 확인합니다.` },
            { languageCode: 'en', summaryText: `Last month's key risk was ${fallbackRisk}. Check the hazard and specific safe action before work.`, koVerificationText: `지난달 주요 위험 ${fallbackRisk}과 작업 전 확인 안내` },
            { languageCode: 'vi', summaryText: `Rủi ro chính tháng trước là ${fallbackRisk}. Hãy kiểm tra nguy cơ và hành động an toàn trước khi làm việc.`, koVerificationText: `지난달 주요 위험 ${fallbackRisk}과 작업 전 확인 안내` },
            { languageCode: 'zh', summaryText: `上个月的主要风险是${fallbackRisk}。作业前请确认危险因素和具体安全措施。`, koVerificationText: `지난달 주요 위험 ${fallbackRisk}과 작업 전 확인 안내` },
        ],
        createdAt: new Date().toISOString(),
    };
};

const MonthlyGuidanceReport: React.FC<Props> = ({ workerRecords }) => {
    const months = useMemo(() => [...new Set([...workerRecords.map((r) => monthKey(r.date)).filter(Boolean), defaultMonth(workerRecords)])].sort().reverse(), [workerRecords]);
    const [assessmentMonth, setAssessmentMonth] = useState(() => defaultMonth(workerRecords));
    const [educationMonth, setEducationMonth] = useState(() => shiftMonth(defaultMonth(workerRecords), 1));
    const [radarMode, setRadarMode] = useState<'field' | 'team'>('field');
    const [showQr, setShowQr] = useState(false);
    const records = useMemo(() => workerRecords.filter((r) => monthKey(r.date) === assessmentMonth), [workerRecords, assessmentMonth]);
    const previous = useMemo(() => workerRecords.filter((r) => monthKey(r.date) === shiftMonth(assessmentMonth, -1)), [workerRecords, assessmentMonth]);
    const report = useMemo(() => createReport(records, previous, assessmentMonth, educationMonth), [records, previous, assessmentMonth, educationMonth]);
    const monthlySeries = useMemo(() => buildMonthlyCoreMetricSeries(workerRecords), [workerRecords]);
    const selectedMonthIndex = monthlySeries.findIndex((point) => point.month === assessmentMonth);
    const monthlyChartPoints = useMemo<ChartPoint[]>(() => (
        monthlySeries
            .filter((point) => {
                const distance = monthDistance(point.month, assessmentMonth);
                return distance >= 0 && distance < 6;
            })
            .slice(-6)
            .map((point) => ({
            month: point.month,
            value: point.averageScore,
            label: point.month.slice(2).replace('-', '.'),
        }))
    ), [monthlySeries, assessmentMonth]);
    const selectedMonthPoint = selectedMonthIndex >= 0 ? monthlySeries[selectedMonthIndex] : monthlySeries[monthlySeries.length - 1];
    const previousMonthPoint = monthlySeries.find((point) => point.month === shiftMonth(assessmentMonth, -1));
    const monthlyDelta = Number(((selectedMonthPoint?.averageScore || 0) - (previousMonthPoint?.averageScore || 0)).toFixed(1));
    const weakest = metrics.map((metric) => ({ ...metric, value: report.sixMetricTrends[`${metric.key}Avg` as keyof GuidanceData['sixMetricTrends']] })).sort((a, b) => a.value / a.max - b.value / b.max)[0];
    const downloadOutline = () => {
        const text = [`[PSI 월별 계도 브리핑] ${monthLabel(educationMonth)}`, `기준자료: ${monthLabel(assessmentMonth)}`, '', report.overallSummary, '', '위험요소 TOP5', ...report.topRiskFactors.map((r, i) => `${i + 1}. ${r.riskName} (${r.count}건) - ${r.guidanceMessage}`), '', '이번 달 실천행동', ...report.nextMonthEducationFocus.map((v) => `- ${v}`), '', '※ 개인 실명·점수·순위는 교육자료에 포함하지 않습니다.'].join('\n');
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = `PSI_${assessmentMonth}_PPT브리핑개요.txt`; link.click(); URL.revokeObjectURL(url);
    };
    const copyLanguages = async () => {
        await navigator.clipboard.writeText((report.multilingualSummaries || []).map((v) => `[${v.languageCode.toUpperCase()}]\n${v.summaryText}`).join('\n\n'));
        alert('다국어 계도 요약을 복사했습니다.');
    };
    const qrValue = typeof window === 'undefined' ? `psi://monthly-guidance/${assessmentMonth}` : `${window.location.origin}${window.location.pathname}?monthlyGuidance=${assessmentMonth}`;

    return <div className="space-y-5 pb-16">
        <style>{`@media print { .guidance-no-print { display:none !important; } .guidance-print { box-shadow:none !important; border:0 !important; } }`}</style>
        <section className="guidance-no-print rounded-3xl border border-sky-800 bg-gradient-to-br from-sky-950 via-slate-900 to-indigo-950 p-5 text-white shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">PSI Monthly Education Cycle</p>
            <h2 className="mt-2 text-2xl font-black">지난달 작성사항 기반 교육 종료 전 계도자료</h2>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-300">개인별 분석은 관리자 추적에만 사용하고, 교육 현장에는 익명화된 작성 경향·반복지적·개선 행동만 공유합니다.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-4">{['기록 수집·OCR 분석', '6대 지표·반복지적 추출', '익명 계도자료 공유', '다음 달 작업 기준 기록'].map((v, i) => <div key={v} className="rounded-2xl border border-white/10 bg-white/10 p-3 text-xs font-bold"><span className="mr-2 text-sky-300">{i + 1}</span>{v}</div>)}</div>
        </section>

        <section className="guidance-no-print grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2">
            <label className="text-sm font-black text-slate-700">기준월 선택<select value={assessmentMonth} onChange={(e) => { setAssessmentMonth(e.target.value); setEducationMonth(shiftMonth(e.target.value, 1)); }} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold">{months.map((m) => <option key={m} value={m}>{monthLabel(m)} 작성자료 기반</option>)}</select></label>
            <label className="text-sm font-black text-slate-700">이번 교육월 선택<input type="month" value={educationMonth} onChange={(e) => setEducationMonth(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold" /></label>
        </section>

        <main className="guidance-print space-y-5 rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-6">
            <header className="border-b border-slate-200 pb-5"><p className="text-xs font-black text-indigo-600">{monthLabel(assessmentMonth)} 작성자료 기반</p><div className="mt-1 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-black text-slate-950">{monthLabel(educationMonth)} 월별 계도 리포트</h2><span className="rounded-full bg-emerald-100 px-4 py-2 text-xs font-black text-emerald-800">실명·개인별 수치 제거 완료</span></div><p className="mt-2 text-sm font-semibold text-slate-600">{report.overallSummary}</p></header>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['분석 건수', `${report.analyzedRecords}건`], ['참여 인원', `${report.totalWorkers}명`], ['가장 많이 나온 위험', report.topRiskFactors[0]?.riskName || '분석자료 없음'], ['가장 약한 지표', weakest?.label || '분석자료 없음']].map(([k, v]) => <div key={k} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold text-slate-500">{k}</p><p className="mt-2 text-lg font-black text-slate-900">{v}</p></div>)}</section>
            <TrackingAnalysisPanel report={report} monthlyPoints={monthlyChartPoints} delta={monthlyDelta} />
            <section data-monthly-guidance="group-radar" className="rounded-2xl border border-indigo-100 bg-white p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <p className="text-xs font-black text-indigo-700">공종·팀 레이더 분석</p>
                        <h3 className="mt-1 text-lg font-black text-slate-950">위험인식 신호와 응답 일관성 비교</h3>
                        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                            메뉴 리뉴얼 전 제공되던 레이더차트를 월별 추적자료에 다시 연결했습니다. 공종별 흐름과 팀별 편차를 같은 화면에서 전환해 확인합니다.
                        </p>
                    </div>
                    <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                        {[
                            ['field', '공종별'],
                            ['team', '팀별'],
                        ].map(([mode, label]) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => setRadarMode(mode as 'field' | 'team')}
                                className={`min-h-10 rounded-xl px-4 text-sm font-black transition ${
                                    radarMode === mode
                                        ? 'bg-slate-950 text-white shadow-sm'
                                        : 'text-slate-600 hover:bg-white'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
                    <div className="h-[320px] rounded-2xl border border-slate-100 bg-slate-50 p-3">
                        <FieldRadarChart records={records} mode={radarMode} />
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <p className="text-xs font-black text-slate-700">해석 기준</p>
                        <div className="mt-3 space-y-3">
                            {[
                                ['평균 위험인식 신호', '작성된 위험성평가 기록의 평균 흐름입니다. 낮은 축은 다음 교육의 우선 보강 대상입니다.'],
                                ['응답 일관성 지수', '같은 공종·팀 안에서 응답 편차가 큰지 확인합니다. 편차가 크면 교육 전달 방식이나 작업 이해도 차이를 점검합니다.'],
                                [radarMode === 'team' ? '팀별 비교' : '공종별 비교', radarMode === 'team' ? '팀장 기준으로 묶어 팀별 편차를 봅니다. 팀명이 없으면 분석에서 제외됩니다.' : '공종 기준으로 묶어 어떤 작업군에 교육 보강이 필요한지 봅니다.'],
                            ].map(([title, body]) => (
                                <div key={title} className="rounded-xl bg-white px-3 py-3">
                                    <p className="text-sm font-black text-slate-900">{title}</p>
                                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{body}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
            <section className="grid gap-5 lg:grid-cols-2">
                <ReportBox title="많이 나온 위험요소 TOP5">{report.topRiskFactors.length ? report.topRiskFactors.map((risk, i) => <div key={risk.riskName} className="rounded-xl bg-slate-50 p-3"><div className="flex justify-between gap-3"><p className="font-black">{i + 1}. {risk.riskName}</p><b className="text-rose-700">{risk.count}건</b></div><p className="mt-1 text-xs font-bold text-slate-500">{risk.relatedWorkTypes.join(' · ')}</p><p className="mt-2 text-sm font-semibold text-slate-700">{risk.guidanceMessage}</p></div>) : <Empty />}</ReportBox>
                <ReportBox title="반복지적 개선관리">{report.repeatedIssues.length ? report.repeatedIssues.map((issue) => <div key={issue.issueName} className="rounded-xl border border-slate-100 p-3"><div className="flex justify-between gap-3"><b>{issue.issueName}</b><span className="text-xs font-black text-amber-700">{issue.previousCount || 0} → {issue.currentCount || 0}</span></div><p className="mt-1 text-xs font-semibold text-slate-600">{issue.guidanceMessage}</p></div>) : <Empty />}</ReportBox>
            </section>
            <ReportBox title="좋은 작성 예시 vs 미흡 작성 예시" subtitle="개인정보는 제거하고 공종과 작성 방식만 공유합니다."><div className="grid gap-4 lg:grid-cols-2"><Examples title="좋은 작성 예시" color="emerald" items={report.goodWritingExamples.map((v) => ({ head: v.question, body: `“${v.example}”`, foot: v.whyGood }))} /><Examples title="미흡 작성 예시와 개선안" color="amber" items={report.poorWritingExamples.map((v) => ({ head: v.question, body: `미흡: “${v.example}”\n개선: “${v.improvedExample}”`, foot: v.coachingPoint }))} /></div></ReportBox>
            <ReportBox title="6대 지표 월별 변화"><p className="rounded-xl bg-indigo-50 p-3 text-sm font-bold leading-6 text-indigo-900">6대 지표는 근로자를 징계하거나 순위를 매기기 위한 점수가 아니라, 매월 작성되는 위험성평가 기록을 통해 현장 전체의 위험 인식 수준과 개선 흐름을 정량적으로 확인하기 위한 교육·계도 지표입니다.</p><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{metrics.map((m) => { const value = report.sixMetricTrends[`${m.key}Avg` as keyof GuidanceData['sixMetricTrends']]; return <div key={m.key} className="rounded-xl border border-slate-200 p-4"><div className="flex justify-between text-sm font-black"><span>{m.label}</span><span>{value} / {m.max}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, Math.round(Math.abs(value) / m.max * 100))}%` }} /></div><p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{m.description}</p></div>; })}</div></ReportBox>
            <section className="rounded-2xl bg-slate-900 p-5 text-white"><h3 className="text-lg font-black">이번 달 개선해야 할 실천행동</h3><ul className="mt-3 space-y-2 text-sm font-semibold text-slate-200">{report.nextMonthEducationFocus.length ? report.nextMonthEducationFocus.map((v) => <li key={v}>• {v}</li>) : <li>• 분석자료 수집 후 교육 중점 행동을 생성합니다.</li>}</ul></section>
        </main>

        <section className="guidance-no-print rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-black">교육용 공유자료 생성</h3><p className="mt-1 text-sm font-semibold text-slate-500">개인 식별정보 없이 현장 전체 계도용 자료만 생성합니다.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Action label="A4 요약 인쇄" onClick={() => window.print()} color="bg-slate-900" /><Action label="PPT 브리핑 개요" onClick={downloadOutline} color="bg-indigo-600" /><Action label="다국어 요약 복사" onClick={() => void copyLanguages()} color="bg-emerald-600" /><Action label="QR 보기" onClick={() => setShowQr((v) => !v)} color="bg-sky-600" /></div>{showQr && <div className="mt-4 flex flex-col items-center rounded-2xl border border-sky-200 bg-sky-50 p-5"><QRCodeCanvas value={qrValue} size={180} includeMargin /><p className="mt-3 text-xs font-bold text-sky-800">{monthLabel(assessmentMonth)} 익명 계도자료</p></div>}</section>
        <section className="guidance-no-print grid gap-4 md:grid-cols-3">{[['A4 교육자료 자동생성', '위험성평가 작성 전 도움자료'], ['PPT/PDF 한장요약', '기존 현장 교육자료를 A4 한 장으로 요약'], ['월별 계도 리포트', '지난달 작성사항을 익명 분석해 교육 종료 전 전체 공유']].map(([t, d]) => <div key={t} className="rounded-2xl border border-slate-200 bg-white p-4"><b>{t}</b><p className="mt-2 text-sm font-semibold text-slate-600">{d}</p></div>)}</section>
    </div>;
};

const ReportBox: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-lg font-black">{title}</h3>{subtitle && <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p>}<div className="mt-4 space-y-3">{children}</div></section>;
const Empty = () => <p className="text-sm font-bold text-slate-500">선택한 기준월의 분석자료가 없습니다.</p>;
const Examples: React.FC<{ title: string; color: 'emerald' | 'amber'; items: Array<{ head: string; body: string; foot: string }> }> = ({ title, color, items }) => {
    const titleClass = color === 'emerald' ? 'text-emerald-700' : 'text-amber-700';
    const cardClass = color === 'emerald'
        ? 'border-emerald-200 bg-emerald-50'
        : 'border-amber-200 bg-amber-50';
    return <div className="space-y-3"><p className={`text-sm font-black ${titleClass}`}>{title}</p>{items.length ? items.map((v, i) => <article key={`${v.head}-${i}`} className={`whitespace-pre-line rounded-2xl border p-4 ${cardClass}`}><p className={`text-xs font-black ${titleClass}`}>{v.head}</p><p className="mt-2 font-bold text-slate-900">{v.body}</p><p className="mt-2 text-xs font-semibold text-slate-600">{v.foot}</p></article>) : <Empty />}</div>;
};const Action: React.FC<{ label: string; onClick: () => void; color: string }> = ({ label, onClick, color }) => <button type="button" onClick={onClick} className={`${color} rounded-xl px-4 py-3 text-sm font-black text-white`}>{label}</button>;

export default MonthlyGuidanceReport;

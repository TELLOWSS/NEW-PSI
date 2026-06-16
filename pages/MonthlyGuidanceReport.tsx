import React, { useMemo, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import type { MonthlyGuidanceReport as GuidanceData, SixMetricBreakdown, WorkerRecord } from '../types';

interface Props { workerRecords: WorkerRecord[]; }

type MetricKey = keyof SixMetricBreakdown;
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
        overallSummary: `${monthLabel(assessmentMonth)} 작성자료 ${records.length}건을 익명화해 분석했습니다. 개인 점수 공개가 아니라 현장 전체의 작성 경향과 다음 교육의 중점 행동을 확인하는 계도자료입니다.`,
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
    const [showQr, setShowQr] = useState(false);
    const records = useMemo(() => workerRecords.filter((r) => monthKey(r.date) === assessmentMonth), [workerRecords, assessmentMonth]);
    const previous = useMemo(() => workerRecords.filter((r) => monthKey(r.date) === shiftMonth(assessmentMonth, -1)), [workerRecords, assessmentMonth]);
    const report = useMemo(() => createReport(records, previous, assessmentMonth, educationMonth), [records, previous, assessmentMonth, educationMonth]);
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
            <header className="border-b border-slate-200 pb-5"><p className="text-xs font-black text-indigo-600">{monthLabel(assessmentMonth)} 작성자료 기반</p><div className="mt-1 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-black text-slate-950">{monthLabel(educationMonth)} 월별 계도 리포트</h2><span className="rounded-full bg-emerald-100 px-4 py-2 text-xs font-black text-emerald-800">실명·개인점수 제거 완료</span></div><p className="mt-2 text-sm font-semibold text-slate-600">{report.overallSummary}</p></header>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['분석 건수', `${report.analyzedRecords}건`], ['참여 인원', `${report.totalWorkers}명`], ['가장 많이 나온 위험', report.topRiskFactors[0]?.riskName || '분석자료 없음'], ['가장 약한 지표', weakest?.label || '분석자료 없음']].map(([k, v]) => <div key={k} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold text-slate-500">{k}</p><p className="mt-2 text-lg font-black text-slate-900">{v}</p></div>)}</section>
            <section className="grid gap-5 lg:grid-cols-2">
                <ReportBox title="많이 나온 위험요소 TOP5">{report.topRiskFactors.length ? report.topRiskFactors.map((risk, i) => <div key={risk.riskName} className="rounded-xl bg-slate-50 p-3"><div className="flex justify-between gap-3"><p className="font-black">{i + 1}. {risk.riskName}</p><b className="text-rose-700">{risk.count}건</b></div><p className="mt-1 text-xs font-bold text-slate-500">{risk.relatedWorkTypes.join(' · ')}</p><p className="mt-2 text-sm font-semibold text-slate-700">{risk.guidanceMessage}</p></div>) : <Empty />}</ReportBox>
                <ReportBox title="반복지적 개선관리">{report.repeatedIssues.length ? report.repeatedIssues.map((issue) => <div key={issue.issueName} className="rounded-xl border border-slate-100 p-3"><div className="flex justify-between gap-3"><b>{issue.issueName}</b><span className="text-xs font-black text-amber-700">{issue.previousCount || 0} → {issue.currentCount || 0}</span></div><p className="mt-1 text-xs font-semibold text-slate-600">{issue.guidanceMessage}</p></div>) : <Empty />}</ReportBox>
            </section>
            <ReportBox title="좋은 작성 예시 vs 미흡 작성 예시" subtitle="개인정보는 제거하고 공종과 작성 방식만 공유합니다."><div className="grid gap-4 lg:grid-cols-2"><Examples title="좋은 작성 예시" color="emerald" items={report.goodWritingExamples.map((v) => ({ head: v.question, body: `“${v.example}”`, foot: v.whyGood }))} /><Examples title="미흡 작성 예시와 개선안" color="amber" items={report.poorWritingExamples.map((v) => ({ head: v.question, body: `미흡: “${v.example}”\n개선: “${v.improvedExample}”`, foot: v.coachingPoint }))} /></div></ReportBox>
            <ReportBox title="6대 지표 월별 변화"><p className="rounded-xl bg-indigo-50 p-3 text-sm font-bold leading-6 text-indigo-900">6대 지표는 근로자를 징계하거나 순위를 매기기 위한 점수가 아니라, 매월 작성되는 위험성평가 기록을 통해 현장 전체의 위험 인식 수준과 개선 흐름을 정량적으로 확인하기 위한 교육·계도 지표입니다.</p><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{metrics.map((m) => { const value = report.sixMetricTrends[`${m.key}Avg` as keyof GuidanceData['sixMetricTrends']]; return <div key={m.key} className="rounded-xl border border-slate-200 p-4"><div className="flex justify-between text-sm font-black"><span>{m.label}</span><span>{value} / {m.max}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, Math.round(Math.abs(value) / m.max * 100))}%` }} /></div><p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{m.description}</p></div>; })}</div></ReportBox>
            <section className="rounded-2xl bg-slate-900 p-5 text-white"><h3 className="text-lg font-black">이번 달 개선해야 할 실천행동</h3><ul className="mt-3 space-y-2 text-sm font-semibold text-slate-200">{report.nextMonthEducationFocus.length ? report.nextMonthEducationFocus.map((v) => <li key={v}>• {v}</li>) : <li>• 분석자료 수집 후 교육 중점 행동을 생성합니다.</li>}</ul></section>
        </main>

        <section className="guidance-no-print rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-black">교육용 공유자료 생성</h3><p className="mt-1 text-sm font-semibold text-slate-500">개인 식별정보 없이 현장 전체 계도용 자료만 생성합니다.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Action label="A4 요약 인쇄" onClick={() => window.print()} color="bg-slate-900" /><Action label="PPT 브리핑 개요" onClick={downloadOutline} color="bg-indigo-600" /><Action label="다국어 요약 복사" onClick={() => void copyLanguages()} color="bg-emerald-600" /><Action label="QR 보기" onClick={() => setShowQr((v) => !v)} color="bg-sky-600" /></div>{showQr && <div className="mt-4 flex flex-col items-center rounded-2xl border border-sky-200 bg-sky-50 p-5"><QRCodeCanvas value={qrValue} size={180} includeMargin /><p className="mt-3 text-xs font-bold text-sky-800">{monthLabel(assessmentMonth)} 익명 계도자료</p></div>}</section>
        <section className="guidance-no-print grid gap-4 md:grid-cols-3">{[['A4 교육자료 자동생성', '다음 달 위험성평가 작성 전 도움자료'], ['PPT/PDF 한장요약', '기존 현장 교육자료를 A4 한 장으로 요약'], ['월별 계도 리포트', '지난달 작성사항을 익명 분석해 교육 종료 전 전체 공유']].map(([t, d]) => <div key={t} className="rounded-2xl border border-slate-200 bg-white p-4"><b>{t}</b><p className="mt-2 text-sm font-semibold text-slate-600">{d}</p></div>)}</section>
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

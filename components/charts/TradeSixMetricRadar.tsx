/**
 * 취약 타겟 그룹의 6대 지표 분석 (Radar Chart Panel)
 * - 선택된 공종+국적 그룹의 6대 지표 방사형 차트
 * - 현장 전체 평균과 함께 비교 표시
 */
import React from 'react';
import {
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import {
    type TradeNationalityGroupData,
    type SixMetricAverages,
} from '../../utils/dashboardDataTransformer';

interface Props {
    targetGroup: TradeNationalityGroupData | null;
    siteAverageMetrics: SixMetricAverages;
}

const SIX_METRIC_KEYS = [
    'psychological',
    'jobUnderstanding',
    'riskAssessmentUnderstanding',
    'proficiency',
    'improvementExecution',
    'repeatViolationPenalty',
] as const;

const SIX_METRIC_LABELS: Record<typeof SIX_METRIC_KEYS[number], string> = {
    psychological: '심리지표',
    jobUnderstanding: '업무이해도',
    riskAssessmentUnderstanding: '위험성평가',
    proficiency: '숙련도',
    improvementExecution: '개선이행도',
    repeatViolationPenalty: '반복위반 패널티',
};

type SixMetricKey = typeof SIX_METRIC_KEYS[number];

const METRIC_MAX: Record<SixMetricKey, number> = {
    psychological:              10,
    jobUnderstanding:           20,
    riskAssessmentUnderstanding:20,
    proficiency:                30,
    improvementExecution:       20,
    repeatViolationPenalty:     30, // 절댓값 표시
};

const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const item = payload[0].payload;
    return (
        <div className="bg-slate-900/95 text-white text-xs rounded-xl shadow-2xl p-3 border border-white/10">
            <p className="font-bold mb-1 text-indigo-300">{item.metric}</p>
            {payload.map((p: any) => (
                <div key={p.dataKey} className="flex justify-between gap-4">
                    <span style={{ color: p.stroke }}>{p.name}</span>
                    <span className="font-bold">{p.value}점/{item.max}점</span>
                </div>
            ))}
        </div>
    );
};

const RISK_BADGE = (score: number) => {
    if (score < 60) return { label: '고위험', color: 'bg-red-100 text-red-700' };
    if (score < 75) return { label: '주의',   color: 'bg-amber-100 text-amber-700' };
    return { label: '양호', color: 'bg-emerald-100 text-emerald-700' };
};

export const TradeSixMetricRadar: React.FC<Props> = ({ targetGroup, siteAverageMetrics }) => {
    if (!targetGroup) {
        return (
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 flex items-center justify-center min-h-[320px]">
                <p className="text-slate-400 text-sm">위 그래프에서 분석할 작업조를 클릭하세요.</p>
            </div>
        );
    }

    const badge = RISK_BADGE(targetGroup.compositeScore);

    const chartData = SIX_METRIC_KEYS.map(key => ({
        metric: SIX_METRIC_LABELS[key],
        max: METRIC_MAX[key],
        타겟:   Math.abs(targetGroup.metrics[key]),
        현장평균: Math.abs(siteAverageMetrics[key]),
    }));

    // 지표별 취약도 순위 (타겟 점수 / 최대점수 비율)
    const weakMetrics = SIX_METRIC_KEYS
        .map(k => ({
            label: SIX_METRIC_LABELS[k],
            ratio: Math.abs(targetGroup.metrics[k]) / METRIC_MAX[k],
        }))
        .sort((a, b) => a.ratio - b.ratio)
        .slice(0, 3);

    return (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-4 sm:p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-800">
                        취약 타겟 그룹 · 6대 지표 분석
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">공종 통합 또는 공종·국적 기준으로 현장 평균 대비 취약 지점을 확인합니다.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold">
                        {targetGroup.trade} · {targetGroup.nationality}
                    </span>
                    <span className={`px-3 py-1.5 rounded-lg text-xs font-bold ${badge.color}`}>
                        {badge.label} {targetGroup.compositeScore}점
                    </span>
                    <span className="text-xs text-slate-500 font-medium">{targetGroup.workerCount}명</span>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-center">
                {/* Radar Chart */}
                <div className="w-full">
                    <ResponsiveContainer width="100%" height={250}>
                        <RadarChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis
                                dataKey="metric"
                                tick={{ fontSize: 10, fontWeight: 600, fill: '#475569' }}
                            />
                            <PolarRadiusAxis
                                angle={90}
                                tick={{ fontSize: 9, fill: '#94a3b8' }}
                                tickCount={4}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend
                                iconType="circle"
                                iconSize={8}
                                wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                            />
                            <Radar
                                name="현장 평균"
                                dataKey="현장평균"
                                stroke="#cbd5e1"
                                fill="#e2e8f0"
                                fillOpacity={0.4}
                                dot={false}
                            />
                            <Radar
                                name={`${targetGroup.trade}·${targetGroup.nationality}`}
                                dataKey="타겟"
                                stroke="#f59e0b"
                                fill="#fef3c7"
                                fillOpacity={0.6}
                                dot={{ fill: '#f59e0b', r: 4 }}
                                activeDot={{ r: 6, fill: '#d97706' }}
                            />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>

                {/* 취약 지표 요약 */}
                <div className="space-y-3">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                        ⚡ 취약 지표 TOP 3 (TBM 교육 타겟)
                    </p>
                    {weakMetrics.map((m, i) => (
                        <div key={m.label} className="flex items-center gap-3">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                                i === 0 ? 'bg-red-100 text-red-600' :
                                i === 1 ? 'bg-amber-100 text-amber-600' :
                                'bg-yellow-50 text-yellow-600'
                            }`}>{i + 1}</span>
                            <div className="flex-1">
                                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                                    <span>{m.label}</span>
                                    <span>{Math.round(m.ratio * 100)}%</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-1.5">
                                    <div
                                        className={`h-1.5 rounded-full transition-all duration-500 ${
                                            m.ratio < 0.6 ? 'bg-red-400' :
                                            m.ratio < 0.75 ? 'bg-amber-400' : 'bg-emerald-400'
                                        }`}
                                        style={{ width: `${m.ratio * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* 6대 지표 전체 점수표 */}
                    <div className="mt-4 rounded-xl bg-slate-50 p-3">
                        <p className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wide">전체 지표 점수</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
                            {SIX_METRIC_KEYS.map(k => (
                                <div key={k} className="flex justify-between text-slate-600">
                                    <span className="truncate mr-1">{SIX_METRIC_LABELS[k]}</span>
                                    <span className="font-bold shrink-0">
                                        {Math.abs(targetGroup.metrics[k])}/{METRIC_MAX[k]}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

/**
 * 취약 타겟 그룹의 6대 지표 분석 (Radar Chart Panel)
 * - 선택된 공종+국적 그룹의 6대 지표 방사형 차트
 * - 현장 전체 평균과 함께 비교 표시
 */
import React from 'react';
import { buildRadarMetrics, metricValue, SIX_METRIC_KEYS, SIX_METRIC_LABELS, METRIC_MAX } from '../../utils/radarMetrics';
import { getSafetyLevelThresholds } from '../../utils/safetyLevelUtils';
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

const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const item = payload[0].payload;
    return (
        <div className="bg-slate-900/95 text-white text-xs rounded-xl shadow-2xl p-3 border border-white/10">
            <p className="font-bold mb-1 text-indigo-300">{item.metric}</p>
            {payload.map((p: any) => (
                <div key={p.dataKey} className="flex justify-between gap-4">
                    <span style={{ color: p.stroke }}>{p.name}</span>
                    <span className="font-bold">{p.value}% ({p.dataKey === '타겟' ? item.targetRaw : item.siteRaw}/{item.max}점)</span>
                </div>
            ))}
        </div>
    );
};

const RISK_BADGE = (score: number) => {
    const thresholds = getSafetyLevelThresholds();
    if (score < thresholds.intermediateMin) return { label: '추가 확인', color: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200/20' };
    if (score < thresholds.advancedMin) return { label: '주의',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/20' };
    return { label: '양호', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/20' };
};

export const TradeSixMetricRadar: React.FC<Props> = ({ targetGroup, siteAverageMetrics }) => {
    if (!targetGroup) {
        return (
            <div className="psi-industrial-panel p-6 flex items-center justify-center min-h-[320px]">
                <p className="text-[var(--psi-text-subtle)] text-sm">위 그래프에서 분석할 작업조를 클릭하세요.</p>
            </div>
        );
    }

    const badge = RISK_BADGE(targetGroup.compositeScore);
    const isIntegratedNationality = targetGroup.nationality === '전체 국적';

    const chartData = buildRadarMetrics(targetGroup.metrics, siteAverageMetrics);
    const weakMetrics = chartData
        .filter(item => item.타겟 !== null)
        .map(item => ({ label: item.metric, ratio: item.타겟! / 100 }))
        .sort((a, b) => a.ratio - b.ratio)
        .slice(0, 3);

    return (
        <div className="psi-industrial-panel p-4 sm:p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                    <h3 className="text-base sm:text-lg font-bold text-[var(--psi-text)]">
                        팀 기준 6대 지표 분석
                    </h3>
                    <p className="text-xs text-[var(--psi-text-subtle)] mt-0.5">
                        {isIntegratedNationality
                            ? '선택 팀의 국적 통합 기준으로 현장 평균 대비 취약 지점을 확인합니다.'
                            : `선택 팀 내부 ${targetGroup.nationality} 세부 기준으로 현장 평균 대비 취약 지점을 확인합니다.`}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-3 py-1.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200/20 rounded-lg text-xs font-bold">
                        {targetGroup.trade} 팀
                    </span>
                    <span className="px-3 py-1.5 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border border-violet-200/20 rounded-lg text-xs font-bold">
                        {isIntegratedNationality ? '국적 통합' : `국적 ${targetGroup.nationality}`}
                    </span>
                    <span className={`px-3 py-1.5 rounded-lg text-xs font-bold ${badge.color}`}>
                        {badge.label} {targetGroup.compositeScore}점
                    </span>
                    <span className="text-xs text-[var(--psi-text-subtle)] font-medium">{targetGroup.workerCount}명</span>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-center">
                {/* Radar Chart */}
                <div className="w-full">
                    <p className="mb-3 text-sm text-[var(--psi-text-muted)]">5개 역량을 각 항목 만점 대비 0–100%로 비교합니다. 반복위반 감점은 별도로 표시합니다.</p>
                    <ResponsiveContainer width="100%" height={250}>
                        <RadarChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                            <PolarGrid stroke="var(--psi-border)" />
                            <PolarAngleAxis
                                dataKey="metric"
                                tick={{ fontSize: 10, fontWeight: 600, fill: 'var(--psi-text-muted)' }}
                            />
                            <PolarRadiusAxis
                                angle={90}
                                domain={[0, 100]}
                                tick={{ fontSize: 9, fill: 'var(--psi-text-subtle)' }}
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
                                stroke="var(--psi-border-strong)"
                                fill="var(--psi-border)"
                                fillOpacity={0.4}
                                dot={false}
                            />
                            <Radar
                                name={`${targetGroup.trade}팀·${targetGroup.nationality}`}
                                dataKey="타겟"
                                stroke="#f59e0b"
                                fill="#fef3c7"
                                fillOpacity={isIntegratedNationality ? 0.35 : 0.55}
                                dot={{ fill: '#f59e0b', r: 4 }}
                                activeDot={{ r: 6, fill: '#d97706' }}
                            />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>

                {/* 취약 지표 요약 */}
                <div className="space-y-3">
                    <p className="text-xs font-bold text-[var(--psi-text-muted)] uppercase tracking-wide">
                        우선 확인할 응답 지표 (상대적으로 낮은 순)
                    </p>
                    {weakMetrics.map((m, i) => (
                        <div key={m.label} className="flex items-center gap-3">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                                i === 0 ? 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-300' :
                                i === 1 ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300' :
                                'bg-yellow-50 text-yellow-600 dark:bg-yellow-950/40 dark:text-yellow-300'
                            }`}>{i + 1}</span>
                            <div className="flex-1">
                                <div className="flex justify-between text-xs font-medium text-[var(--psi-text-muted)] mb-1">
                                    <span>{m.label}</span>
                                    <span>{Math.round(m.ratio * 100)}%</span>
                                </div>
                                <div className="w-full bg-[var(--psi-surface-muted)] border border-[var(--psi-border)] rounded-full h-1.5">
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
                    <div className="mt-4 rounded-xl bg-[var(--psi-surface-muted)] border border-[var(--psi-border)] p-3">
                        <p className="text-[10px] font-bold text-[var(--psi-text-subtle)] mb-2 uppercase tracking-wide">전체 지표 점수</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
                            {SIX_METRIC_KEYS.map(k => (
                                <div key={k} className="flex justify-between text-[var(--psi-text-muted)]">
                                    <span className="truncate mr-1">{SIX_METRIC_LABELS[k]}</span>
                                    <span className="font-bold shrink-0">
                                        {metricValue(k, targetGroup.metrics[k]) === null ? '자료 없음' : `${metricValue(k, targetGroup.metrics[k])}/${METRIC_MAX[k]}점`}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <p className="mt-3 text-sm text-[var(--psi-text-muted)]">반복위반 감점은 낮을수록 좋습니다. 감점 0점은 취약 지표가 아닙니다. 응답 점수만으로 현장 조치 완료를 판단하지 않습니다.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

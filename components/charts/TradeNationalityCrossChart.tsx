/**
 * 공종 x 국적 교차 안전 숙련도 차트 (Grouped Bar Chart)
 * - X축: 공종
 * - 각 그룹 내 막대: 국적별 종합 평균 점수
 * - 막대 클릭 → 타겟 그룹(공종+국적) 선택
 */
import React from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell,
} from 'recharts';
import type { DashboardTransformedData } from '../../utils/dashboardDataTransformer';
import { useResolvedTheme } from '../../hooks/useResolvedTheme';

const NAT_COLORS = [
    '#6366f1', '#f59e0b', '#ef4444', '#10b981', '#0ea5e9', '#8b5cf6', '#14b8a6', '#f97316',
];

export interface SelectedTarget {
    trade: string;
    nationality: string;
}

interface Props {
    onSelect: (target: SelectedTarget) => void;
    selected: SelectedTarget | null;
    data: DashboardTransformedData;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;
    return (
        <div className="bg-slate-900/95 text-white text-xs rounded-xl shadow-2xl p-3 border border-white/10 min-w-[140px]">
            <p className="font-bold text-sm mb-2 text-indigo-300">{label} 공종</p>
            {payload.map((p: any) => (
                <div key={p.name} className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.fill }} />
                    <span className="flex-1">{p.name}</span>
                    <span className="font-bold">{p.value}점</span>
                </div>
            ))}
        </div>
    );
};

export const TradeNationalityCrossChart: React.FC<Props> = ({ onSelect, selected, data }) => {
    const theme = useResolvedTheme();
    const isDark = theme === 'dark';
    const hasData = data.barData.length > 0 && data.nationalities.length > 0;
    const chartMinWidth = Math.max(420, data.barData.length * 88);

    const handleClick = (trade: string, nationality: string) => {
        onSelect({ trade, nationality });
    };

    const cellHighlightColor = isDark ? '#ffffff' : '#0f172a';

    return (
        <div className="psi-industrial-panel p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                    <h3 className="text-base sm:text-lg font-bold text-[var(--psi-text)]">
                        팀 내부 국적 드릴다운
                    </h3>
                    <p className="text-xs text-[var(--psi-text-subtle)] mt-0.5">
                        메인 팀 비교는 전체 국적 통합 기준으로 유지됩니다. 막대 클릭은 팀 내부 국적 차이를 해석 근거로 확인할 때만 사용합니다.
                    </p>
                </div>
                {selected && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200/20 rounded-lg text-xs font-bold">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                        선택됨: {selected.trade} · {selected.nationality}
                    </span>
                )}
            </div>
            {!hasData ? (
                <div className="h-[320px] flex flex-col items-center justify-center text-center text-[var(--psi-text-subtle)]">
                    <p className="font-semibold text-sm">팀 내부 국적 드릴다운 데이터가 아직 없습니다.</p>
                    <p className="text-xs mt-1">평가 기록이 수집되면 보조 드릴다운 차트가 자동으로 표시됩니다.</p>
                </div>
            ) : (
                <>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className="px-2.5 py-1 rounded-lg bg-[var(--psi-surface-muted)] border border-[var(--psi-border)] text-[var(--psi-text-muted)] text-[11px] font-bold">
                            공종 {data.barData.length}개
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-300 border border-indigo-200/10 text-[11px] font-bold">
                            국적 {data.nationalities.length}개
                        </span>
                    </div>
                    <div className="flex gap-3 mb-4 overflow-x-auto pb-1">
                        {data.nationalities.map((nat, index) => (
                            <div key={nat} className="flex items-center gap-1.5 text-xs text-[var(--psi-text-muted)] font-medium whitespace-nowrap shrink-0">
                                <span className="w-3 h-3 rounded-sm" style={{ background: NAT_COLORS[index % NAT_COLORS.length] }} />
                                {nat}
                            </div>
                        ))}
                    </div>
                    <div className="w-full overflow-x-auto pb-1">
                        <div style={{ minWidth: chartMinWidth }}>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart
                                    data={data.barData}
                                    margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
                                    barCategoryGap="20%"
                                    barGap={3}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--psi-border)" vertical={false} />
                                    <XAxis
                                        dataKey="trade"
                                        tick={{ fontSize: 12, fontWeight: 600, fill: 'var(--psi-text-muted)' }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        domain={[0, 100]}
                                        tick={{ fontSize: 11, fill: 'var(--psi-text-subtle)' }}
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(v) => `${v}점`}
                                        width={46}
                                    />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.05)' }} />
                                    {data.nationalities.map((nat, index) => (
                                        <Bar
                                            key={nat}
                                            dataKey={nat}
                                            radius={[4, 4, 0, 0]}
                                            maxBarSize={32}
                                            cursor="pointer"
                                            onClick={(row) => handleClick((row.trade ?? '') as string, nat)}
                                        >
                                            {data.barData.map(row => {
                                                const isSelected =
                                                    selected?.trade === row.trade &&
                                                    selected?.nationality === nat;
                                                const color = NAT_COLORS[index % NAT_COLORS.length];
                                                return (
                                                    <Cell
                                                        key={`${row.trade}-${nat}`}
                                                        fill={isSelected ? cellHighlightColor : color}
                                                        opacity={selected && !isSelected ? 0.45 : 1}
                                                        stroke={isSelected ? color : 'none'}
                                                        strokeWidth={2}
                                                    />
                                                );
                                            })}
                                        </Bar>
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </>
            )}
            {/* 하단 위험도 안내 */}
            <p className="text-[10px] sm:text-xs text-[var(--psi-text-subtle)] mt-3 text-right">
                ※ 60점 미만: 추가 확인 · 60~75점: 주의 · 75점 이상: 양호
            </p>
        </div>
    );
};

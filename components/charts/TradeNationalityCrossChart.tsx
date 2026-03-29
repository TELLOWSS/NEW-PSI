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
    const hasData = data.barData.length > 0 && data.nationalities.length > 0;

    const handleClick = (trade: string, nationality: string) => {
        onSelect({ trade, nationality });
    };

    return (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-800">
                        공종 × 국적 교차 안전 숙련도
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        막대를 클릭하면 해당 작업조의 6대 지표 분석이 표시됩니다.
                    </p>
                </div>
                {selected && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                        선택됨: {selected.trade} · {selected.nationality}
                    </span>
                )}
            </div>
            {!hasData ? (
                <div className="h-[320px] flex flex-col items-center justify-center text-center text-slate-400">
                    <p className="font-semibold text-sm">공종/국적 분석 데이터가 아직 없습니다.</p>
                    <p className="text-xs mt-1">평가 기록이 수집되면 교차 차트가 자동으로 표시됩니다.</p>
                </div>
            ) : (
                <>
                    <div className="flex flex-wrap gap-3 mb-4">
                        {data.nationalities.map((nat, index) => (
                            <div key={nat} className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                                <span className="w-3 h-3 rounded-sm" style={{ background: NAT_COLORS[index % NAT_COLORS.length] }} />
                                {nat}
                            </div>
                        ))}
                    </div>
                    <div className="w-full overflow-x-auto">
                        <div style={{ minWidth: 420 }}>
                            <ResponsiveContainer width="100%" height={320}>
                                <BarChart
                                    data={data.barData}
                                    margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
                                    barCategoryGap="20%"
                                    barGap={3}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                    <XAxis
                                        dataKey="trade"
                                        tick={{ fontSize: 12, fontWeight: 600, fill: '#475569' }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        domain={[0, 100]}
                                        tick={{ fontSize: 11, fill: '#94a3b8' }}
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
                                                        fill={isSelected ? '#1e293b' : color}
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
            <p className="text-[10px] sm:text-xs text-slate-400 mt-3 text-right">
                ※ 60점 미만: 고위험 · 60~75점: 주의 · 75점 이상: 양호
            </p>
        </div>
    );
};

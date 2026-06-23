import React, { useEffect, useRef } from 'react';
import type { Chart } from 'chart.js/auto';
import type { SafetyCheckRecord } from '../../types';
import { ensureChartJs } from '../../utils/externalScripts';
import { useResolvedTheme } from '../../hooks/useResolvedTheme';

interface ChartProps {
    records: SafetyCheckRecord[];
}

export const SafetyCheckDonutChart: React.FC<ChartProps> = ({ records }) => {
    const theme = useResolvedTheme();
    const isDark = theme === 'dark';
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    const twoWeeksAgoForView = new Date();
    twoWeeksAgoForView.setDate(twoWeeksAgoForView.getDate() - 14);
    const recentRecordsForView = records.filter(r => new Date(r.date) >= twoWeeksAgoForView);
    const hasRecentData = recentRecordsForView.some((record) => record.type === 'unsafe_action' || record.type === 'unsafe_condition');

    useEffect(() => {
        let disposed = false;

        const renderChart = async () => {
            if (!chartRef.current) return;
            const ctx = chartRef.current.getContext('2d');
            if (!ctx) return;

            const ChartLib = await ensureChartJs().catch(() => null);
            if (!ChartLib || disposed) return;

            const twoWeeksAgo = new Date();
            twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

            const recentRecords = records.filter(r => new Date(r.date) >= twoWeeksAgo);

            const typeCounts = recentRecords.reduce((acc, record) => {
                if (record.type === 'unsafe_action') {
                    acc.unsafe_action++;
                } else if (record.type === 'unsafe_condition') {
                    acc.unsafe_condition++;
                }
                return acc;
            }, { unsafe_action: 0, unsafe_condition: 0 });
            
            const total = typeCounts.unsafe_action + typeCounts.unsafe_condition;
            const labels = [`불안전한 상태`, `불안전한 행동`];
            const data = [typeCounts.unsafe_condition, typeCounts.unsafe_action];
            
            // Create Gradients
            const orangeGradient = ctx.createLinearGradient(0, 0, 0, chartRef.current.height);
            orangeGradient.addColorStop(0, 'rgba(251, 146, 60, 1)');
            orangeGradient.addColorStop(1, 'rgba(249, 115, 22, 1)');

            const redGradient = ctx.createLinearGradient(0, 0, 0, chartRef.current.height);
            redGradient.addColorStop(0, 'rgba(248, 113, 113, 1)');
            redGradient.addColorStop(1, 'rgba(239, 68, 68, 1)');

            if (chartInstance.current) {
                chartInstance.current.destroy();
            }

            const surfaceColor = isDark ? '#111827' : '#ffffff';
            const legendTextColor = isDark ? '#94a3b8' : '#475569';
            const tooltipBg = isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(15, 23, 42, 0.9)';

            try {
                chartInstance.current = new ChartLib(ctx, {
                    type: 'doughnut',
                    data: {
                        labels,
                        datasets: [{
                            data,
                            backgroundColor: total > 0 ? [
                                orangeGradient,
                                redGradient,
                            ] : [isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'],
                            borderColor: total > 0 ? surfaceColor : (isDark ? 'rgba(255,255,255,0.03)' : '#e2e8f0'),
                            borderWidth: 4,
                            hoverOffset: 8,
                            hoverBorderColor: surfaceColor
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '70%',
                        plugins: {
                            legend: {
                                display: total > 0,
                                position: 'bottom',
                                labels: {
                                    padding: 20,
                                    usePointStyle: true,
                                    pointStyle: 'circle',
                                    font: {
                                        size: 12,
                                        family: "'Pretendard', sans-serif"
                                    },
                                    color: legendTextColor
                                }
                            },
                            tooltip: {
                                enabled: total > 0,
                                backgroundColor: tooltipBg,
                                callbacks: {
                                    label: function(context: unknown) {
                                        const ctx = context as {
                                            dataset?: { label?: string; data?: unknown[] };
                                            parsed?: number;
                                            label?: string;
                                            raw?: unknown;
                                        };
                                        let label = ctx.dataset?.label ?? '';
                                        if (label) label += ': ';
                                        if (typeof ctx.parsed !== 'undefined' && ctx.parsed !== null) {
                                            const dataArr = Array.isArray(ctx.dataset?.data) ? ctx.dataset!.data!.map(d => Number(d)) : [];
                                            const totalSum = dataArr.reduce((a: number, b: number) => a + (Number.isFinite(b) ? b : 0), 0);
                                            const percentage = totalSum > 0 ? ((Number(ctx.parsed) / totalSum * 100).toFixed(1) + '%') : '0%';
                                            label += `${ctx.label ?? ''}: ${String(ctx.raw)}건 (${percentage})`;
                                        }
                                        return label;
                                    }
                                }
                            }
                        },
                    }
                });
            } catch (e) {
                console.error("Donut chart error:", e);
            }
        };

        void renderChart();

        return () => {
            disposed = true;
            if (chartInstance.current) {
                chartInstance.current.destroy();
                chartInstance.current = null;
            }
        };
    }, [records, theme, isDark]);

    return (
        <div className="relative h-full w-full">
            <canvas ref={chartRef} />
            {!hasRecentData && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="rounded-full bg-[var(--psi-surface-muted)] border border-[var(--psi-border)] px-3 py-1 text-[11px] font-bold text-[var(--psi-text-muted)]">
                        최근 2주 점검 데이터 없음
                    </div>
                </div>
            )}
        </div>
    );
};

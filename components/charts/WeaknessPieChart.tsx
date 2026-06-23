import React, { useEffect, useRef } from 'react';
import type { Chart } from 'chart.js/auto';
import type { WorkerRecord } from '../../types';
import { ensureChartJs } from '../../utils/externalScripts';
import { useResolvedTheme } from '../../hooks/useResolvedTheme';

interface ChartProps {
    records: WorkerRecord[];
}

const backgroundColors = [
    'rgba(239, 68, 68, 0.7)',
    'rgba(59, 130, 246, 0.7)',
    'rgba(245, 158, 11, 0.7)',
    'rgba(34, 197, 94, 0.7)',
    'rgba(139, 92, 246, 0.7)',
    'rgba(236, 72, 153, 0.7)',
];

export const WeaknessPieChart: React.FC<ChartProps> = ({ records }) => {
    const theme = useResolvedTheme();
    const isDark = theme === 'dark';
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        let disposed = false;

        const renderChart = async () => {
            if (!chartRef.current) return;

            const ChartLib = await ensureChartJs().catch(() => null);
            if (!ChartLib || disposed || !chartRef.current) return;

            const weaknessCounts = records.flatMap(r => r.weakAreas).reduce((acc, area) => {
                acc[area] = (acc[area] || 0) + 1;
                return acc;
            }, {} as { [key: string]: number });
            
            if (chartInstance.current) {
                chartInstance.current.destroy();
                chartInstance.current = null;
            }

            const ctx = chartRef.current.getContext('2d');
            if (!ctx) return;

            if (disposed) return;

            if (Object.keys(weaknessCounts).length === 0) {
                ctx.clearRect(0, 0, chartRef.current.width, chartRef.current.height);
                ctx.save();
                ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
                ctx.font = "700 13px 'Pretendard', sans-serif";
                ctx.textAlign = 'center';
                ctx.fillText('취약 분야 데이터 대기 중', chartRef.current.width / 2, chartRef.current.height / 2);
                ctx.restore();
                return;
            }

            const labels = Object.keys(weaknessCounts);
            const data = Object.values(weaknessCounts);

            const surfaceColor = isDark ? '#111827' : 'rgba(255, 255, 255, 0.8)';
            const legendColor = isDark ? '#cbd5e1' : '#475569';
            const tooltipBg = isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(15, 23, 42, 0.9)';

            try {
                chartInstance.current = new ChartLib(ctx, {
                    type: 'pie',
                    data: {
                        labels,
                        datasets: [{
                            label: '취약 분야',
                            data,
                            backgroundColor: backgroundColors,
                            borderColor: surfaceColor,
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: {
                                    color: legendColor,
                                    font: { family: "'Pretendard', sans-serif", size: 11 }
                                }
                            },
                            tooltip: {
                                backgroundColor: tooltipBg
                            }
                        },
                    }
                });
            } catch (e) {
                console.error("Pie Chart error:", e);
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

    return <canvas ref={chartRef} />;
};

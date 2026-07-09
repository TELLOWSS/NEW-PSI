import React, { useEffect, useRef } from 'react';
import type { Chart } from 'chart.js/auto';
import type { WorkerRecord } from '../../types';
import { ensureChartJs } from '../../utils/externalScripts';
import { buildMonthlyCoreMetricSeries } from '../../utils/coreMetrics';
import { useResolvedTheme } from '../../hooks/useResolvedTheme';

interface ChartProps {
    records: WorkerRecord[];
}

export const MonthlyTrendChart: React.FC<ChartProps> = ({ records }) => {
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

            const monthlySeries = buildMonthlyCoreMetricSeries(records);
            let sortedMonths = monthlySeries.map((point) => point.month);
            let dataPoints = monthlySeries.map((point) => point.averageScore);

            if (sortedMonths.length === 0) {
                const today = new Date();
                sortedMonths = [today.toISOString().substring(0, 7)];
                dataPoints = [0];
            }

            // Cleanup previous instance
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }

            const ctx = chartRef.current.getContext('2d');
            if (!ctx) return;

            // Create Gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            if (isDark) {
                gradient.addColorStop(0, 'rgba(96, 165, 250, 0.35)'); // Blue-400
                gradient.addColorStop(1, 'rgba(96, 165, 250, 0.0)');
            } else {
                gradient.addColorStop(0, 'rgba(79, 70, 229, 0.35)'); // Indigo-600
                gradient.addColorStop(1, 'rgba(79, 70, 229, 0.0)');
            }

            const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(226, 232, 240, 0.5)';
            const textColor = isDark ? '#94a3b8' : '#64748b';
            const brandColor = isDark ? '#60a5fa' : '#4f46e5';

            try {
                chartInstance.current = new ChartLib(ctx, {
                    type: 'line',
                    data: {
                        labels: sortedMonths,
                        datasets: [{
                            label: '평균 위험인식 신호',
                            data: dataPoints,
                            fill: true,
                            backgroundColor: gradient,
                            borderColor: brandColor,
                            borderWidth: 3,
                            pointBackgroundColor: isDark ? '#111827' : '#ffffff',
                            pointBorderColor: brandColor,
                            pointBorderWidth: 2,
                            pointRadius: 6,
                            pointHoverRadius: 8,
                            pointHoverBackgroundColor: brandColor,
                            pointHoverBorderColor: isDark ? '#111827' : '#ffffff',
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: 100,
                                grid: {
                                    color: gridColor,
                                    borderDash: [5, 5]
                                },
                                ticks: {
                                    font: { family: "'Noto Sans KR', sans-serif", size: 11 },
                                    color: textColor
                                }
                            },
                            x: {
                                grid: { display: false },
                                ticks: {
                                    font: { family: "'Noto Sans KR', sans-serif", size: 11 },
                                    color: textColor
                                }
                            }
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(15, 23, 42, 0.9)',
                                titleFont: { size: 13 },
                                bodyFont: { size: 13, weight: 'bold' },
                                padding: 12,
                                cornerRadius: 8,
                                displayColors: false,
                                callbacks: {
                                    label: function(context: unknown) {
                                        const ctx = context as { parsed?: unknown };
                                        let parsedVal: unknown = undefined;
                                        if (ctx.parsed && typeof ctx.parsed === 'object' && 'y' in (ctx.parsed as Record<string, unknown>)) {
                                            parsedVal = (ctx.parsed as Record<string, any>).y;
                                        } else {
                                            parsedVal = ctx.parsed;
                                        }
                                        const num = typeof parsedVal === 'number' ? parsedVal : Number(parsedVal ?? 0);
                                        const formatted = Number.isFinite(num) ? num.toFixed(1) : '0.0';
                                        return `위험인식 신호 ${formatted}점`;
                                    }
                                }
                            }
                        },
                        interaction: {
                            mode: 'index',
                            intersect: false,
                        },
                    }
                });
            } catch (e) {
                console.error("Chart creation error:", e);
            }
        };

        void renderChart();

        // Important Cleanup
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

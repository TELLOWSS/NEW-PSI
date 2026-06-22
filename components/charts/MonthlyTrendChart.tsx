
import React, { useEffect, useRef } from 'react';
import type { Chart } from 'chart.js/auto';
import type { WorkerRecord } from '../../types';
import { ensureChartJs } from '../../utils/externalScripts';
import { buildMonthlyCoreMetricSeries } from '../../utils/coreMetrics';

interface ChartProps {
    records: WorkerRecord[];
}

export const MonthlyTrendChart: React.FC<ChartProps> = ({ records }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        let disposed = false;

        const renderChart = async () => {
            if (!chartRef.current) return;

            const ChartLib = await ensureChartJs().catch(() => null);
            if (!ChartLib || disposed || !chartRef.current) return;

        const monthlySeries = buildMonthlyCoreMetricSeries(records);
        // 데이터가 없을 때는 가상 추세를 만들지 않고 대기 기준점만 표시합니다.
        let sortedMonths = monthlySeries.map((point) => point.month);
        let dataPoints = monthlySeries.map((point) => point.averageScore);

        if (sortedMonths.length === 0) {
            const today = new Date();
            sortedMonths = [today.toISOString().substring(0,7)];
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
        gradient.addColorStop(0, 'rgba(79, 70, 229, 0.4)'); // Indigo-600 start
        gradient.addColorStop(1, 'rgba(79, 70, 229, 0.0)'); // Indigo-600 end

            try {
                chartInstance.current = new ChartLib(ctx, {
                type: 'line',
                data: {
                    labels: sortedMonths,
                    datasets: [{
                        label: '평균 응답품질 신호',
                        data: dataPoints,
                        fill: true,
                        backgroundColor: gradient,
                        borderColor: '#4f46e5', // Indigo-600
                        borderWidth: 3,
                        pointBackgroundColor: '#ffffff',
                        pointBorderColor: '#4f46e5',
                        pointBorderWidth: 2,
                        pointRadius: 6,
                        pointHoverRadius: 8,
                        pointHoverBackgroundColor: '#4f46e5',
                        pointHoverBorderColor: '#ffffff',
                        tension: 0.4 // Smooth curve
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
                                color: 'rgba(226, 232, 240, 0.5)', // Slate-200 light
                                borderDash: [5, 5]
                            },
                            ticks: {
                                font: { family: "'Noto Sans KR', sans-serif", size: 11 },
                                color: '#64748b'
                            }
                        },
                        x: {
                            grid: { display: false },
                            ticks: {
                                font: { family: "'Noto Sans KR', sans-serif", size: 11 },
                                color: '#64748b'
                            }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.9)',
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
                                    return `응답품질 ${formatted}점`;
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
        
    }, [records]);

    return <canvas ref={chartRef} />;
};

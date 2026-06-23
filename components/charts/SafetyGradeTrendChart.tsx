import React, { useEffect, useRef } from 'react';
import type { Chart } from 'chart.js/auto';
import type { WorkerRecord } from '../../types';
import { ensureChartJs } from '../../utils/externalScripts';
import { useResolvedTheme } from '../../hooks/useResolvedTheme';

interface ChartProps {
    records: WorkerRecord[];
}

export const SafetyGradeTrendChart: React.FC<ChartProps> = ({ records }) => {
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

            const sortedRecords = [...records].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            
            const monthlyData: Record<string, { high: number; mid: number; low: number }> = {};
            
            sortedRecords.forEach(r => {
                const month = r.date.substring(0, 7);
                if (!monthlyData[month]) monthlyData[month] = { high: 0, mid: 0, low: 0 };
                
                if (r.safetyLevel === '고급') monthlyData[month].high++;
                else if (r.safetyLevel === '중급') monthlyData[month].mid++;
                else monthlyData[month].low++;
            });

            const labels = Object.keys(monthlyData).sort();
            if (labels.length === 0) return;

            const dataHigh = labels.map(m => monthlyData[m].high);
            const dataMid = labels.map(m => monthlyData[m].mid);
            const dataLow = labels.map(m => monthlyData[m].low);

            if (chartInstance.current) {
                chartInstance.current.destroy();
            }

            const ctx = chartRef.current.getContext('2d');
            if (!ctx) return;

            const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9';
            const textColor = isDark ? '#94a3b8' : '#64748b';
            const legendColor = isDark ? '#cbd5e1' : '#475569';
            const tooltipBg = isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(15, 23, 42, 0.9)';

            try {
                chartInstance.current = new ChartLib(ctx, {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [
                            {
                                label: '고급 (우수)',
                                data: dataHigh,
                                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.7)' : 'rgba(16, 185, 129, 0.8)',
                                borderColor: '#10b981',
                                borderWidth: 1,
                                borderRadius: 4,
                            },
                            {
                                label: '중급 (보통)',
                                data: dataMid,
                                backgroundColor: isDark ? 'rgba(245, 158, 11, 0.7)' : 'rgba(245, 158, 11, 0.8)',
                                borderColor: '#f59e0b',
                                borderWidth: 1,
                                borderRadius: 4,
                            },
                            {
                                label: '초급 (관리필요)',
                                data: dataLow,
                                backgroundColor: isDark ? 'rgba(239, 68, 68, 0.7)' : 'rgba(239, 68, 68, 0.8)',
                                borderColor: '#ef4444',
                                borderWidth: 1,
                                borderRadius: 4,
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'top',
                                labels: {
                                    usePointStyle: true,
                                    font: { family: "'Pretendard', sans-serif", size: 11 },
                                    color: legendColor
                                }
                            },
                            tooltip: {
                                mode: 'index',
                                intersect: false,
                                backgroundColor: tooltipBg
                            }
                        },
                        scales: {
                            x: {
                                stacked: true,
                                grid: { display: false },
                                ticks: {
                                    color: textColor,
                                    font: { family: "'Pretendard', sans-serif", size: 10 }
                                }
                            },
                            y: {
                                stacked: true,
                                beginAtZero: true,
                                grid: { color: gridColor },
                                ticks: {
                                    color: textColor,
                                    font: { family: "'Pretendard', sans-serif", size: 10 }
                                }
                            }
                        }
                    }
                });
            } catch (e) {
                console.error("Grade Trend Chart Error:", e);
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

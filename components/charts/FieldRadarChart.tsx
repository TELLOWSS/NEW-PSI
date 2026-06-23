import React, { useEffect, useRef } from 'react';
import type { Chart } from 'chart.js/auto';
import type { WorkerRecord } from '../../types';
import { ensureChartJs } from '../../utils/externalScripts';
import { useResolvedTheme } from '../../hooks/useResolvedTheme';

interface ChartProps {
    records: WorkerRecord[];
    mode?: 'field' | 'team';
}

export const FieldRadarChart: React.FC<ChartProps> = ({ records, mode = 'field' }) => {
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

            const metrics: Record<string, { scores: number[], counts: number }> = {};
            
            records.forEach(r => {
                let key = '';
                if (mode === 'team') {
                    if (!r.teamLeader || r.teamLeader === '미지정') return;
                    key = `${r.teamLeader} (${r.jobField})`;
                } else {
                    key = r.jobField || '미분류';
                }

                if (!metrics[key]) metrics[key] = { scores: [], counts: 0 };
                metrics[key].scores.push(r.safetyScore);
                metrics[key].counts++;
            });

            const limit = mode === 'team' ? 8 : 10;
            const topItems = Object.entries(metrics)
                .sort((a, b) => b[1].counts - a[1].counts)
                .slice(0, limit);

            const labels = topItems.map(([key]) => key);
            const scoreData = topItems.map(([, data]) => 
                data.scores.length > 0 ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length : 0
            );
            
            const consistencyData = topItems.map(([, data]) => {
                if (data.scores.length < 1) return 0;
                const mean = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
                const variance = data.scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.scores.length;
                const consistency = Math.max(0, 100 - Math.sqrt(variance) * 2.5); 
                return consistency;
            });

            if (chartInstance.current) {
                chartInstance.current.destroy();
            }

            const ctx = chartRef.current.getContext('2d');
            if (!ctx) return;

            // Theme colors
            const brandColor = isDark ? '#60a5fa' : '#4f46e5';
            const brandBg = isDark ? 'rgba(96, 165, 250, 0.2)' : 'rgba(79, 70, 229, 0.2)';
            const accentColor = isDark ? '#2dd4bf' : '#14b8a6';
            const accentBg = isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(20, 184, 166, 0.2)';

            const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0,0,0,0.08)';
            const angleLineColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0,0,0,0.05)';
            const textColor = isDark ? '#cbd5e1' : '#475569';
            const legendColor = isDark ? '#94a3b8' : '#475569';
            const tooltipBg = isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(15, 23, 42, 0.9)';

            try {
                chartInstance.current = new ChartLib(ctx, {
                    type: 'radar',
                    data: {
                        labels: labels.length > 0 ? labels : ['데이터 없음'],
                        datasets: [
                            {
                                label: '평균 응답품질 신호',
                                data: scoreData.length > 0 ? scoreData : [0],
                                fill: true,
                                backgroundColor: brandBg,
                                borderColor: brandColor,
                                pointBackgroundColor: brandColor,
                                pointBorderColor: isDark ? '#111827' : '#fff',
                                pointHoverBackgroundColor: isDark ? '#111827' : '#fff',
                                pointHoverBorderColor: brandColor,
                                borderWidth: 2
                            },
                            {
                                label: '응답 일관성 지수',
                                data: consistencyData.length > 0 ? consistencyData : [0],
                                fill: true,
                                backgroundColor: accentBg,
                                borderColor: accentColor,
                                pointBackgroundColor: accentColor,
                                pointBorderColor: isDark ? '#111827' : '#fff',
                                pointHoverBackgroundColor: isDark ? '#111827' : '#fff',
                                pointHoverBorderColor: accentColor,
                                borderWidth: 2
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            r: {
                                angleLines: { color: angleLineColor },
                                grid: { color: gridColor },
                                pointLabels: {
                                    font: { 
                                        size: labels.length > 6 ? 10 : 11,
                                        family: "'Pretendard', sans-serif", 
                                        weight: 'bold' 
                                    },
                                    color: textColor,
                                    padding: 10
                                },
                                ticks: { display: false, backdropColor: 'transparent' },
                                suggestedMin: 0,
                                suggestedMax: 100
                            }
                        },
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: {
                                    usePointStyle: true,
                                    padding: 15,
                                    font: { size: 11, family: "'Pretendard', sans-serif" },
                                    color: legendColor
                                }
                            },
                            tooltip: {
                                backgroundColor: tooltipBg,
                                padding: 12,
                                cornerRadius: 8,
                                titleFont: { size: 13, weight: 'bold' },
                                bodyFont: { size: 12 },
                                displayColors: true,
                                callbacks: {
                                    title: function(items: unknown) {
                                        const arr = items as unknown[];
                                        if (!Array.isArray(arr) || arr.length === 0) return '';
                                        const first = arr[0] as { label?: string } | undefined;
                                        return first?.label ?? '';
                                    }
                                }
                            }
                        }
                    }
                });
            } catch (e) {
                console.error("Radar chart error:", e);
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
    }, [records, mode, theme, isDark]);

    return <canvas ref={chartRef} />;
};

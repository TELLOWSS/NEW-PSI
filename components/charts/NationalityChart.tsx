import React, { useEffect, useRef } from 'react';
import type { Chart, ChartConfiguration } from 'chart.js/auto';
import type { WorkerRecord } from '../../types';
import { ensureChartJs } from '../../utils/externalScripts';
import { useResolvedTheme } from '../../hooks/useResolvedTheme';

interface ChartProps {
    records: WorkerRecord[];
}

const backgroundColors = [
    'rgba(239, 68, 68, 0.8)',
    'rgba(59, 130, 246, 0.8)',
    'rgba(239, 68, 68, 0.8)',
    'rgba(249, 115, 22, 0.8)',
    'rgba(34, 197, 94, 0.8)',
    'rgba(219, 39, 119, 0.8)',
    'rgba(20, 184, 166, 0.8)',
];

const getFlagEmoji = (nationality: string): string => {
    const flags: { [key: string]: string } = {
        '베트남': '🇻🇳',
        '한국': '🇰🇷',
        '대한민국': '🇰🇷',
        '중국': '🇨🇳',
        '태국': '🇹🇭',
        '캄보디아': '🇰🇭',
        '필리핀': '🇵🇭',
        '인도네시아': '🇮🇩',
        '우즈베키스탄': '🇺🇿',
        '네팔': '🇳🇵',
        '몽골': '🇲🇳',
        '카자흐스탄': '🇰🇿'
    };
    return flags[nationality] || '🏳️';
};

export const NationalityChart: React.FC<ChartProps> = ({ records }) => {
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

            const uniqueWorkers = new Map<string, string>();
            records.forEach(r => uniqueWorkers.set(r.name, r.nationality));
        
            const nationalityCounts = Array.from(uniqueWorkers.values()).reduce((acc, nationality) => {
                acc[nationality] = (acc[nationality] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

            const sortedNationalities = Object.entries(nationalityCounts).sort((a, b) => b[1] - a[1]);

            const labels = sortedNationalities.map(([nationality]) => `${getFlagEmoji(nationality)} ${nationality}`);
            const data = sortedNationalities.map(([, count]) => count);
            
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }

            const ctx = chartRef.current.getContext('2d');
            if (!ctx) return;

            const config: ChartConfiguration = {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: '근로자 수',
                        data,
                        backgroundColor: backgroundColors,
                        borderWidth: 0,
                        borderRadius: 4,
                        barPercentage: 0.6,
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            beginAtZero: true,
                            grid: {
                                drawOnChartArea: false,
                            },
                            ticks: {
                                display: false
                            }
                        },
                        y: {
                            grid: {
                                display: false,
                            },
                            ticks: {
                                color: isDark ? '#94a3b8' : '#475569',
                                font: {
                                    size: 13,
                                    weight: 500,
                                    family: "'Pretendard', sans-serif"
                                }
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false,
                        },
                        tooltip: {
                            enabled: true,
                            backgroundColor: isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(15, 23, 42, 0.9)'
                        },
                    },
                },
            };
            
            // @ts-ignore
            config.options.animation = {
                onComplete: (context) => {
                    const chart = context.chart;
                    const ctx = chart.ctx;
                    ctx.font = 'bold 12px "Pretendard"';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    
                    const meta = chart.getDatasetMeta(0);
                    meta.data.forEach((bar, index) => {
                        const barElement = bar as unknown as { x: number; y: number; width: number };
                        const data = chart.data.datasets[0].data[index] as number;
                        ctx.fillStyle = '#fff';
                        const labelPosition = barElement.x - 30;
                        if (barElement.width > 40) {
                            ctx.fillText(`${data}명`, labelPosition, barElement.y);
                        } else {
                            ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
                            ctx.fillText(`${data}명`, barElement.x + 5, barElement.y);
                        }
                    });
                }
            };

            try {
                chartInstance.current = new ChartLib(ctx, config);
            } catch (e) {
                console.error("Chart error:", e);
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

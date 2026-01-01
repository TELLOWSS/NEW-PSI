
import React, { useEffect, useRef } from 'react';
import type { Chart } from 'chart.js/auto';
import type { WorkerRecord } from '../../types';

interface ChartProps {
    records: WorkerRecord[];
}

export const MonthlyTrendChart: React.FC<ChartProps> = ({ records }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        if (!chartRef.current) return;

        // Defensive check: Ensure Chart.js is loaded
        const ChartLib = (window as any).Chart;
        if (!ChartLib) return;

        // Data Aggregation
        const monthlyData = records.reduce((acc, record) => {
            const month = record.date.substring(0, 7); // YYYY-MM
            if (!acc[month]) {
                acc[month] = { totalScore: 0, count: 0 };
            }
            acc[month].totalScore += record.safetyScore;
            acc[month].count++;
            return acc;
        }, {} as { [key: string]: { totalScore: number; count: number } });
        
        // Ensure we have data, otherwise mock a baseline for visualization if empty
        let sortedMonths = Object.keys(monthlyData).sort();
        let dataPoints = sortedMonths.map(month => (monthlyData[month].totalScore / monthlyData[month].count));

        // If no data, show placeholder line
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
                        label: '평균 안전 점수',
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
                                label: (context: any) => `평균 ${context.parsed.y.toFixed(1)}점`
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

        // Important Cleanup
        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
                chartInstance.current = null;
            }
        };
        
    }, [records]);

    return <canvas ref={chartRef} />;
};

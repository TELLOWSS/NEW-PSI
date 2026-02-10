
import React, { useEffect, useRef } from 'react';
import type { Chart } from 'chart.js/auto';
import type { WorkerRecord } from '../../types';
import { getWindowProp } from '../../utils/windowUtils';

interface ChartProps {
    records: WorkerRecord[];
}

export const SafetyGradeTrendChart: React.FC<ChartProps> = ({ records }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        if (!chartRef.current) return;
        const ChartLib = getWindowProp<any>('Chart');
        if (!ChartLib) return;

        // 최근 6개월 데이터만 필터링 및 정렬
        const sortedRecords = [...records].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        // 월별 등급 분포 계산
        const monthlyData: Record<string, { high: number; mid: number; low: number }> = {};
        
        sortedRecords.forEach(r => {
            const month = r.date.substring(0, 7); // YYYY-MM
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

        try {
            chartInstance.current = new ChartLib(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: '고급 (우수)',
                            data: dataHigh,
                            backgroundColor: 'rgba(16, 185, 129, 0.8)', // Emerald-500
                            borderColor: '#10b981',
                            borderWidth: 1,
                            borderRadius: 4,
                        },
                        {
                            label: '중급 (보통)',
                            data: dataMid,
                            backgroundColor: 'rgba(245, 158, 11, 0.8)', // Amber-500
                            borderColor: '#f59e0b',
                            borderWidth: 1,
                            borderRadius: 4,
                        },
                        {
                            label: '초급 (관리필요)',
                            data: dataLow,
                            backgroundColor: 'rgba(239, 68, 68, 0.8)', // Red-500
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
                                font: { family: "'Pretendard', sans-serif", size: 11 }
                            }
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                        }
                    },
                    scales: {
                        x: {
                            stacked: true,
                            grid: { display: false }
                        },
                        y: {
                            stacked: true,
                            beginAtZero: true,
                            grid: { color: '#f1f5f9' } // Slate-100
                        }
                    }
                }
            });
        } catch (e) {
            console.error("Grade Trend Chart Error:", e);
        }

        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
                chartInstance.current = null;
            }
        };
    }, [records]);

    return <canvas ref={chartRef} />;
};


import React, { useEffect, useRef } from 'react';
import type { Chart } from 'chart.js/auto';
import type { WorkerRecord } from '../../types';

interface ChartProps {
    records: WorkerRecord[];
}

export const FieldRadarChart: React.FC<ChartProps> = ({ records }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        if (!chartRef.current) return;

        const ChartLib = (window as any).Chart;
        if (!ChartLib) return;

        // 1. Calculate Metrics per Field
        const fieldMetrics: Record<string, { scores: number[], counts: number }> = {};
        
        records.forEach(r => {
            const field = r.jobField || '미분류';
            if (!fieldMetrics[field]) fieldMetrics[field] = { scores: [], counts: 0 };
            fieldMetrics[field].scores.push(r.safetyScore);
            fieldMetrics[field].counts++;
        });

        // 2. Process Top 10 Fields (기존 5개에서 10개로 확대하여 시스템, 할석 등 누락 방지)
        const topFields = Object.entries(fieldMetrics)
            .sort((a, b) => b[1].counts - a[1].counts)
            .slice(0, 10);

        const labels = topFields.map(([field]) => field);
        const scoreData = topFields.map(([, data]) => 
            data.scores.length > 0 ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length : 0
        );
        
        // Calculate 'Consistency' (inverse of normalized variance)
        const consistencyData = topFields.map(([, data]) => {
            if (data.scores.length < 1) return 0;
            const mean = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
            const variance = data.scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.scores.length;
            const consistency = Math.max(0, 100 - Math.sqrt(variance) * 2.5); 
            return consistency;
        });

        // Cleanup previous instance
        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;

        try {
            chartInstance.current = new ChartLib(ctx, {
                type: 'radar',
                data: {
                    labels: labels.length > 0 ? labels : ['데이터 없음'],
                    datasets: [
                        {
                            label: '평균 안전 점수',
                            data: scoreData.length > 0 ? scoreData : [0],
                            fill: true,
                            backgroundColor: 'rgba(79, 70, 229, 0.2)', // Indigo
                            borderColor: '#4f46e5',
                            pointBackgroundColor: '#4f46e5',
                            pointBorderColor: '#fff',
                            pointHoverBackgroundColor: '#fff',
                            pointHoverBorderColor: '#4f46e5',
                            borderWidth: 2
                        },
                        {
                            label: '안전 일관성 지수',
                            data: consistencyData.length > 0 ? consistencyData : [0],
                            fill: true,
                            backgroundColor: 'rgba(20, 184, 166, 0.2)', // Teal
                            borderColor: '#14b8a6',
                            pointBackgroundColor: '#14b8a6',
                            pointBorderColor: '#fff',
                            pointHoverBackgroundColor: '#fff',
                            pointHoverBorderColor: '#14b8a6',
                            borderWidth: 2
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        r: {
                            angleLines: { color: 'rgba(0,0,0,0.05)' },
                            grid: { color: 'rgba(0,0,0,0.08)' },
                            pointLabels: {
                                font: { 
                                    size: labels.length > 6 ? 10 : 12, // 라벨이 많아지면 폰트 크기 자동 조절
                                    family: "'Pretendard', sans-serif", 
                                    weight: 'bold' 
                                },
                                color: '#475569',
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
                                font: { size: 11, family: "'Pretendard', sans-serif" }
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.9)',
                            padding: 12,
                            cornerRadius: 8,
                            titleFont: { size: 13, weight: 'bold' },
                            bodyFont: { size: 12 },
                            displayColors: true
                        }
                    }
                }
            });
        } catch(e) {
            console.error("Radar chart error:", e);
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

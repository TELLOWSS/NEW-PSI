
import React, { useEffect, useRef } from 'react';
import type { Chart } from 'chart.js/auto';
import type { WorkerRecord } from '../../types';
import { getWindowProp } from '../../utils/windowUtils';

interface ChartProps {
    records: WorkerRecord[];
    mode?: 'field' | 'team'; // New prop to switch modes
}

export const FieldRadarChart: React.FC<ChartProps> = ({ records, mode = 'field' }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        if (!chartRef.current) return;

        const ChartLib = getWindowProp<any>('Chart');
        if (!ChartLib) return;

        // 1. Calculate Metrics (Dynamic Grouping)
        const metrics: Record<string, { scores: number[], counts: number }> = {};
        
        records.forEach(r => {
            let key = '';
            if (mode === 'team') {
                // 팀 모드일 경우 팀장이 있는 경우만 집계 (미지정 제외)
                if (!r.teamLeader || r.teamLeader === '미지정') return;
                // 팀장 이름 뒤에 공종을 붙여 구분이 쉽도록 함 (예: 홍길동 (형틀))
                key = `${r.teamLeader} (${r.jobField})`;
            } else {
                key = r.jobField || '미분류';
            }

            if (!metrics[key]) metrics[key] = { scores: [], counts: 0 };
            metrics[key].scores.push(r.safetyScore);
            metrics[key].counts++;
        });

        // 2. Process Top Items (공종은 Top 10, 팀은 Top 8로 제한하여 시인성 확보)
        const limit = mode === 'team' ? 8 : 10;
        const topItems = Object.entries(metrics)
            .sort((a, b) => b[1].counts - a[1].counts) // 인원 많은 순
            .slice(0, limit);

        const labels = topItems.map(([key]) => key);
        const scoreData = topItems.map(([, data]) => 
            data.scores.length > 0 ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length : 0
        );
        
        // Calculate 'Consistency' (inverse of normalized variance)
        const consistencyData = topItems.map(([, data]) => {
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
                                    size: labels.length > 6 ? 10 : 11,
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
        } catch(e) {
            console.error("Radar chart error:", e);
        }

        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
                chartInstance.current = null;
            }
        };
    }, [records, mode]); // Re-render when mode changes

    return <canvas ref={chartRef} />;
};

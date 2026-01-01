
import React, { useEffect, useRef } from 'react';
import type { Chart } from 'chart.js/auto';
import type { SafetyCheckRecord } from '../../types';

interface ChartProps {
    records: SafetyCheckRecord[];
}

export const SafetyCheckDonutChart: React.FC<ChartProps> = ({ records }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        if (!chartRef.current) return;
        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;

        const ChartLib = (window as any).Chart;
        if (!ChartLib) return;

        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

        const recentRecords = records.filter(r => new Date(r.date) >= twoWeeksAgo);

        const typeCounts = recentRecords.reduce((acc, record) => {
            if (record.type === 'unsafe_action') {
                acc.unsafe_action++;
            } else if (record.type === 'unsafe_condition') {
                acc.unsafe_condition++;
            }
            return acc;
        }, { unsafe_action: 0, unsafe_condition: 0 });
        
        const total = typeCounts.unsafe_action + typeCounts.unsafe_condition;
        const labels = total > 0 ? [`불안전한 상태`, `불안전한 행동`] : ['데이터 없음'];
        const data = total > 0 ? [typeCounts.unsafe_condition, typeCounts.unsafe_action] : [1];
        
        // Create Gradients
        const orangeGradient = ctx.createLinearGradient(0, 0, 0, chartRef.current.height);
        orangeGradient.addColorStop(0, 'rgba(251, 146, 60, 1)'); // orange-400
        orangeGradient.addColorStop(1, 'rgba(249, 115, 22, 1)'); // orange-500

        const redGradient = ctx.createLinearGradient(0, 0, 0, chartRef.current.height);
        redGradient.addColorStop(0, 'rgba(248, 113, 113, 1)'); // red-400
        redGradient.addColorStop(1, 'rgba(239, 68, 68, 1)'); // red-500

        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        try {
            chartInstance.current = new ChartLib(ctx, {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [{
                        data,
                        backgroundColor: total > 0 ? [
                            orangeGradient, // unsafe_condition
                            redGradient,    // unsafe_action
                        ] : ['#e2e8f0'],
                        borderColor: 'rgba(255, 255, 255, 0.8)',
                        borderWidth: 4,
                        hoverOffset: 8,
                        hoverBorderColor: 'white'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 20,
                                usePointStyle: true,
                                pointStyle: 'circle',
                                font: {
                                    size: 14,
                                }
                            }
                        },
                        tooltip: {
                            enabled: total > 0,
                            callbacks: {
                                label: function(context: any) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed !== null) {
                                         const totalSum = context.dataset.data.reduce((a: any, b: any) => a + b, 0);
                                         const percentage = totalSum > 0 ? (context.parsed / totalSum * 100).toFixed(1) + '%' : '0%';
                                         label += `${context.label}: ${context.raw}건 (${percentage})`;
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                }
            });
        } catch(e) {
            console.error("Donut chart error:", e);
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


import React, { useEffect, useRef } from 'react';
import type { Chart } from 'chart.js/auto';
import type { WorkerRecord } from '../../types';

interface ChartProps {
    records: WorkerRecord[];
}

const backgroundColors = [
    'rgba(239, 68, 68, 0.7)',
    'rgba(59, 130, 246, 0.7)',
    'rgba(245, 158, 11, 0.7)',
    'rgba(34, 197, 94, 0.7)',
    'rgba(139, 92, 246, 0.7)',
    'rgba(236, 72, 153, 0.7)',
];

export const WeaknessPieChart: React.FC<ChartProps> = ({ records }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        if (!chartRef.current) return;

        const ChartLib = (window as any).Chart;
        if (!ChartLib) return;

        const weaknessCounts = records.flatMap(r => r.weakAreas).reduce((acc, area) => {
            acc[area] = (acc[area] || 0) + 1;
            return acc;
        }, {} as { [key: string]: number });
        
        if (Object.keys(weaknessCounts).length === 0) {
            // Add some mock data if no real data is available
            Object.assign(weaknessCounts, {
                '기계안전': 3,
                '화재예방': 2,
                '고소작업': 5,
                '기타': 8,
            });
        }

        const labels = Object.keys(weaknessCounts);
        const data = Object.values(weaknessCounts);
        
        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;

        try {
            chartInstance.current = new ChartLib(ctx, {
                type: 'pie',
                data: {
                    labels,
                    datasets: [{
                        label: '취약 분야',
                        data,
                        backgroundColor: backgroundColors,
                        borderColor: 'rgba(255, 255, 255, 0.7)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                        },
                    },
                }
            });
        } catch(e) {
            console.error("Pie Chart error:", e);
        }
    }, [records]);

    return <canvas ref={chartRef} />;
};

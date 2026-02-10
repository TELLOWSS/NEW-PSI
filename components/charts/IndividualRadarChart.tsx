
import React, { useEffect, useRef } from 'react';
import type { Chart } from 'chart.js/auto';
import type { WorkerRecord } from '../../types';
import { getWindowProp } from '../../utils/windowUtils';

interface ChartProps {
    record: WorkerRecord;
}

export const IndividualRadarChart: React.FC<ChartProps> = ({ record }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        if (!chartRef.current) return;
        const ChartLib = getWindowProp<any>('Chart');
        if (!ChartLib) return;

        // [알고리즘] 텍스트 분석 기반 역량 점수 산출
        const baseScore = record.safetyScore;
        const textAnalysis = (record.weakAreas.join(' ') + ' ' + record.aiInsights).toLowerCase();

        let scores = {
            awareness: baseScore,   // 위험 인지
            ppe: baseScore,         // 보호구 관리
            compliance: baseScore,  // 절차 준수
            prevention: baseScore,  // 예방 활동
            attitude: baseScore     // 안전 태도
        };

        // 키워드 기반 페널티 적용 로직
        if (textAnalysis.includes('보호구') || textAnalysis.includes('ppe') || textAnalysis.includes('안전모') || textAnalysis.includes('벨트')) {
            scores.ppe = Math.max(40, scores.ppe - 15);
        } else {
            scores.ppe = Math.min(100, scores.ppe + 5);
        }

        if (textAnalysis.includes('절차') || textAnalysis.includes('순서') || textAnalysis.includes('미흡')) {
            scores.compliance = Math.max(40, scores.compliance - 15);
        }

        if (textAnalysis.includes('인지') || textAnalysis.includes('몰르') || textAnalysis.includes('무시')) {
            scores.awareness = Math.max(40, scores.awareness - 20);
            scores.attitude = Math.max(40, scores.attitude - 10);
        } else {
            scores.awareness = Math.min(100, scores.awareness + 5);
        }

        const randomize = (val: number) => Math.min(100, Math.max(30, val + (Math.random() * 6 - 3)));

        const data = [
            randomize(scores.awareness),
            randomize(scores.ppe),
            randomize(scores.compliance),
            randomize(scores.prevention),
            randomize(scores.attitude)
        ];

        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;

        try {
            chartInstance.current = new ChartLib(ctx, {
                type: 'radar',
                data: {
                    labels: ['위험 인지', '보호구 관리', '절차 준수', '예방 활동', '안전 태도'],
                    datasets: [{
                        label: '안전 역량',
                        data: data,
                        fill: true,
                        backgroundColor: 'rgba(79, 70, 229, 0.25)', // Indigo-500 slightly more visible
                        borderColor: '#4f46e5',
                        pointBackgroundColor: '#4f46e5',
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: '#4f46e5',
                        borderWidth: 2.5,
                        pointRadius: 3, 
                        pointHoverRadius: 5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    devicePixelRatio: (w.devicePixelRatio as number) || 2, // High resolution for PDF
                    animation: false, 
                    layout: {
                        padding: 20 // [FIX] Increased padding to ensure labels are not cut off in PDF
                    },
                    scales: {
                        r: {
                            angleLines: { color: 'rgba(0,0,0,0.15)' },
                            grid: { color: 'rgba(0,0,0,0.1)' },
                            pointLabels: {
                                font: { 
                                    size: 10, 
                                    family: "'Pretendard', sans-serif", 
                                    weight: '700' 
                                },
                                color: '#1e293b', 
                                backdropPadding: 2
                            },
                            ticks: { display: false, backdropColor: 'transparent' },
                            suggestedMin: 20,
                            suggestedMax: 100
                        }
                    },
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
        } catch (e) {
            console.error("Radar Chart Error:", e);
        }

        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
                chartInstance.current = null;
            }
        };
    }, [record]);

    return <canvas ref={chartRef} />;
};

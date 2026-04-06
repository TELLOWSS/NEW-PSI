
import React, { useEffect, useRef } from 'react';
import type { Chart } from 'chart.js/auto';
import type { SixMetricBreakdown, WorkerRecord } from '../../types';
import { ensureChartJs } from '../../utils/externalScripts';
import { getWindowProp } from '../../utils/windowUtils';
import { deriveCompetencyProfile } from '../../utils/evidenceUtils';

const RADAR_LABELS = ['① 심리', '② 업무', '③ 위험', '④ 숙련', '⑤ 개선', '⑥ 패널티'];
const RADAR_METRIC_MAX = [10, 20, 20, 30, 20, 30] as const;

interface ChartProps {
    record: WorkerRecord;
}

const clampMetric = (value: number, max: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(max, Math.round(value)));
};

const hasValidScoreBreakdown = (scoreBreakdown?: SixMetricBreakdown): scoreBreakdown is SixMetricBreakdown => {
    if (!scoreBreakdown) return false;

    return [
        scoreBreakdown.psychological,
        scoreBreakdown.jobUnderstanding,
        scoreBreakdown.riskAssessmentUnderstanding,
        scoreBreakdown.proficiency,
        scoreBreakdown.improvementExecution,
        scoreBreakdown.repeatViolationPenalty,
    ].some((value) => Number.isFinite(value));
};

const buildRadarBreakdown = (record: WorkerRecord): SixMetricBreakdown => {
    if (hasValidScoreBreakdown(record.scoreBreakdown)) {
        return record.scoreBreakdown;
    }

    const profile = record.competencyProfile || deriveCompetencyProfile(record);
    return {
        psychological: clampMetric((profile.psychologicalScore / 100) * 10, 10),
        jobUnderstanding: clampMetric((profile.jobUnderstandingScore / 100) * 20, 20),
        riskAssessmentUnderstanding: clampMetric((profile.riskAssessmentUnderstandingScore / 100) * 20, 20),
        proficiency: clampMetric((profile.proficiencyScore / 100) * 30, 30),
        improvementExecution: clampMetric((profile.improvementExecutionScore / 100) * 20, 20),
        repeatViolationPenalty: clampMetric((profile.repeatViolationPenalty / 20) * 30, 30),
    };
};

export const IndividualRadarChart: React.FC<ChartProps> = ({ record }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        let disposed = false;

        const renderChart = async () => {
            if (!chartRef.current) return;
            const ChartLib = await ensureChartJs().catch(() => null);
            if (!ChartLib || disposed || !chartRef.current) return;

            const breakdown = buildRadarBreakdown(record);
            const metricValues = [
                breakdown.psychological,
                breakdown.jobUnderstanding,
                breakdown.riskAssessmentUnderstanding,
                breakdown.proficiency,
                breakdown.improvementExecution,
                breakdown.repeatViolationPenalty,
            ];
            const data = metricValues.map((value, index) => Math.max(0, Math.min(100, Math.round((value / RADAR_METRIC_MAX[index]) * 100))));

            if (chartInstance.current) {
                chartInstance.current.destroy();
            }

            const ctx = chartRef.current.getContext('2d');
            if (!ctx) return;

            try {
                chartInstance.current = new ChartLib(ctx, {
                    type: 'radar',
                    data: {
                        labels: RADAR_LABELS,
                        datasets: [{
                            label: '6대 지표',
                            data,
                            fill: true,
                            backgroundColor: 'rgba(79, 70, 229, 0.2)',
                            borderColor: '#4f46e5',
                            pointBackgroundColor: '#4f46e5',
                            pointBorderColor: '#fff',
                            pointHoverBackgroundColor: '#fff',
                            pointHoverBorderColor: '#4f46e5',
                            borderWidth: 2,
                            pointRadius: 2.1,
                            pointHoverRadius: 3.2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        devicePixelRatio: getWindowProp<number>('devicePixelRatio') || 2,
                        animation: false,
                        layout: {
                            padding: {
                                top: 14,
                                right: 18,
                                bottom: 14,
                                left: 18,
                            }
                        },
                        elements: {
                            line: {
                                tension: 0.08,
                            }
                        },
                        scales: {
                            r: {
                                angleLines: { color: 'rgba(71,85,105,0.16)' },
                                grid: { color: 'rgba(71,85,105,0.1)' },
                                pointLabels: {
                                    font: {
                                        size: 7.5,
                                        family: "'Pretendard', sans-serif",
                                        weight: '700'
                                    },
                                    color: '#334155',
                                    padding: 4,
                                    centerPointLabels: false,
                                },
                                ticks: {
                                    display: false,
                                    backdropColor: 'transparent',
                                    stepSize: 25,
                                },
                                suggestedMin: 0,
                                suggestedMax: 100,
                                beginAtZero: true,
                            }
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: { enabled: false },
                        }
                    }
                });
            } catch (e) {
                console.error("Radar Chart Error:", e);
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
    }, [record]);

    return <canvas ref={chartRef} className="block w-full h-full" />;
};

import React, { useEffect, useMemo, useRef } from 'react';
import type { Chart } from 'chart.js/auto';
import type { WorkerRecord } from '../../types';
import { ensureChartJs } from '../../utils/externalScripts';
import { buildGroupScoreChartEvidence } from '../../utils/livingChartEvidenceL11';
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
    const chartEvidence = useMemo(() => buildGroupScoreChartEvidence(records, mode), [records, mode]);
    const hasChartData = chartEvidence.rows.length > 0;

    useEffect(() => {
        let disposed = false;

        const renderChart = async () => {
            if (!chartRef.current || !hasChartData) return;

            const ChartLib = await ensureChartJs().catch(() => null);
            if (!ChartLib || disposed || !chartRef.current) return;

            const labels = chartEvidence.rows.map(row => row.label);
            const scoreData = chartEvidence.rows.map(row => row.average);
            // This spread-derived reference remains explicitly nonofficial.
            // With one valid response it is unavailable, not an artificial 100.
            const consistencyData = chartEvidence.rows.map(row => row.spreadReference);

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
                        labels,
                        datasets: [
                            {
                                label: '평균 위험인식 신호',
                                data: scoreData,
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
                                label: '점수 편차 참고값(비공식)',
                                data: consistencyData,
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
    }, [chartEvidence, hasChartData, theme, isDark]);

    return hasChartData
        ? <div data-l11-group-chart="ready" className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1"><canvas ref={chartRef} role="img" aria-label="공종·팀별 유효 점수 참고 차트 · 원점수의 현장안전 승인 의미 없음" /></div>
            <p className="pt-1 text-center text-[10px] font-semibold text-slate-600 dark:text-slate-300">유효 점수만 평균 · 미입력/오류 제외 · 팀명은 익명 표시 · 편차 참고값은 공식 6대 지표가 아닙니다.</p>
        </div>
        : <div data-l11-group-chart="empty" role="status" className="flex h-full min-h-32 items-center justify-center rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">이 공종·팀 범위에 유효 점수가 없어 비교 차트를 그리지 않습니다. 빈 기록은 0점이 아닙니다.</div>;
};

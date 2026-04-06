
import React from 'react';
import type { SixMetricBreakdown, WorkerRecord } from '../../types';
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
    const breakdown = buildRadarBreakdown(record);
    const metricValues = [
        breakdown.psychological,
        breakdown.jobUnderstanding,
        breakdown.riskAssessmentUnderstanding,
        breakdown.proficiency,
        breakdown.improvementExecution,
        breakdown.repeatViolationPenalty,
    ];
    const percentages = metricValues.map((value, index) => Math.max(0, Math.min(100, Math.round((value / RADAR_METRIC_MAX[index]) * 100))));

    const size = 220;
    const center = size / 2;
    const radius = 66;
    const labelRadius = 90;
    const levels = [0.25, 0.5, 0.75, 1];
    const startAngle = -Math.PI / 2;
    const step = (Math.PI * 2) / RADAR_LABELS.length;

    const points = percentages.map((value, index) => {
        const angle = startAngle + step * index;
        const scaledRadius = radius * (value / 100);
        return {
            x: center + Math.cos(angle) * scaledRadius,
            y: center + Math.sin(angle) * scaledRadius,
        };
    });

    const polygonPath = points.map((point) => `${point.x},${point.y}`).join(' ');

    return (
        <svg viewBox={`0 0 ${size} ${size}`} className="block h-full w-full" role="img" aria-label="6대 지표 레이더 차트">
            <defs>
                <linearGradient id="radar-fill-gradient" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="rgba(79,70,229,0.34)" />
                    <stop offset="100%" stopColor="rgba(59,130,246,0.14)" />
                </linearGradient>
            </defs>

            {levels.map((level) => {
                const ringPoints = RADAR_LABELS.map((_, index) => {
                    const angle = startAngle + step * index;
                    return `${center + Math.cos(angle) * radius * level},${center + Math.sin(angle) * radius * level}`;
                }).join(' ');
                return (
                    <polygon
                        key={`ring-${level}`}
                        points={ringPoints}
                        fill="none"
                        stroke="rgba(71,85,105,0.12)"
                        strokeWidth="1"
                    />
                );
            })}

            {RADAR_LABELS.map((_, index) => {
                const angle = startAngle + step * index;
                return (
                    <line
                        key={`axis-${index}`}
                        x1={center}
                        y1={center}
                        x2={center + Math.cos(angle) * radius}
                        y2={center + Math.sin(angle) * radius}
                        stroke="rgba(71,85,105,0.14)"
                        strokeWidth="1"
                    />
                );
            })}

            <polygon points={polygonPath} fill="url(#radar-fill-gradient)" stroke="#4F46E5" strokeWidth="2.5" strokeLinejoin="round" />

            {points.map((point, index) => (
                <g key={`point-${RADAR_LABELS[index]}`}>
                    <circle cx={point.x} cy={point.y} r="4.2" fill="#ffffff" />
                    <circle cx={point.x} cy={point.y} r="2.8" fill="#4F46E5" />
                </g>
            ))}

            {RADAR_LABELS.map((label, index) => {
                const angle = startAngle + step * index;
                const x = center + Math.cos(angle) * labelRadius;
                const y = center + Math.sin(angle) * labelRadius;
                const anchor = x < center - 6 ? 'end' : x > center + 6 ? 'start' : 'middle';
                return (
                    <text
                        key={`label-${label}`}
                        x={x}
                        y={y}
                        textAnchor={anchor}
                        dominantBaseline="middle"
                        fontSize="11"
                        fontWeight="700"
                        fill="#334155"
                    >
                        {label}
                    </text>
                );
            })}
        </svg>
    );
};

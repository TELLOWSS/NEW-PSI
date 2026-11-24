import React from 'react';
import type { NexusPipelineCase } from '../../utils/nexusQuickPipeline';
import type { NexusZoneAxis } from '../../utils/nexusStructuralTaxonomy';

interface Props {
  pipelineCases: readonly NexusPipelineCase[];
  activeZoneAxis?: NexusZoneAxis | '';
  activeNodeIndex: string;
  onSelectFloor: (zoneAxis: NexusZoneAxis, structuralNodeIndex: string) => void;
}

interface ElevationFloorBand {
  id: string;
  label: string;
  subLabel: string;
  zoneAxis: NexusZoneAxis;
  nodeIndex: string;
  y: number;
  height: number;
  tone: 'amber' | 'cyan' | 'emerald' | 'violet';
}

const ELEVATION_FLOORS: readonly ElevationFloorBand[] = [
  {
    id: 'rooftop',
    label: '옥탑 · 타워크레인',
    subLabel: '양중·샤클·풍속',
    zoneAxis: 'rooftop_special',
    nodeIndex: '09',
    y: 10,
    height: 34,
    tone: 'cyan',
  },
  {
    id: 'transfer',
    label: '전이층 · 시스템동바리',
    subLabel: '고층고 가새·U헤드',
    zoneAxis: 'rooftop_special',
    nodeIndex: '07',
    y: 48,
    height: 36,
    tone: 'violet',
  },
  {
    id: 'superstructure',
    label: '지상 기준층 · 갱폼/AL폼',
    subLabel: '인상·해체·안전난간',
    zoneAxis: 'superstructure_std',
    nodeIndex: '03',
    y: 88,
    height: 38,
    tone: 'amber',
  },
  {
    id: 'substructure_rc',
    label: '지하 RC 외벽 · 합벽',
    subLabel: '측압·부력·개구부·밀폐',
    zoneAxis: 'substructure_rc',
    nodeIndex: '01',
    y: 132,
    height: 40,
    tone: 'cyan',
  },
  {
    id: 'foundation',
    label: '기초 · 흙막이 굴착',
    subLabel: '어스앵커·굴착장비',
    zoneAxis: 'foundation',
    nodeIndex: '02',
    y: 176,
    height: 34,
    tone: 'emerald',
  },
];

export const NexusStructuralElevationMap: React.FC<Props> = ({
  pipelineCases,
  activeZoneAxis,
  activeNodeIndex,
  onSelectFloor,
}) => {
  return (
    <div className="nexus-elevation-map" aria-label="골조 건물 수직 단면 인터랙티브 미니맵">
      <div className="nexus-elevation-head">
        <span>SECTION · 단면 클릭 록온</span>
        <small>미결 {pipelineCases.filter(c => c.status !== 'closed').length}건</small>
      </div>
      <div className="nexus-elevation-body">
        <svg viewBox="0 0 260 220" className="nexus-elevation-svg" aria-hidden="true">
          <defs>
            <linearGradient id="elevSlab" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1d3549" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#102131" stopOpacity="0.95" />
            </linearGradient>
          </defs>
          {/* Ground level divider */}
          <line x1="8" y1="129" x2="252" y2="129" stroke="#f0be7788" strokeWidth="1.2" strokeDasharray="4 3" />
          <text x="12" y="126" fill="#ffd9a0" fontSize="7.5" fontWeight="700">GL ±0.00</text>
          {/* Tower crane silhouette */}
          <path d="M214 12 L214 48 M190 18 L244 18 M214 18 L202 28" stroke="#75e6ef99" strokeWidth="1.4" fill="none" />
          {ELEVATION_FLOORS.map(floor => {
            const matched = pipelineCases.filter(
              c => c.status !== 'closed' && (c.zoneAxis === floor.zoneAxis || c.structuralNodeIndex === floor.nodeIndex),
            );
            const hasStop = matched.some(c => c.stopWorkFlag);
            const isSelected =
              activeNodeIndex === floor.nodeIndex ||
              (activeZoneAxis && activeZoneAxis === floor.zoneAxis && floor.nodeIndex !== '09');
            const fill = hasStop
              ? 'rgba(130, 26, 38, 0.72)'
              : isSelected
                ? 'rgba(228, 168, 105, 0.25)'
                : 'url(#elevSlab)';
            const stroke = hasStop
              ? '#ff7880'
              : isSelected
                ? '#ffd18e'
                : 'rgba(117, 230, 239, 0.26)';
            return (
              <g key={floor.id}>
                <rect
                  x="22"
                  y={floor.y}
                  width="184"
                  height={floor.height}
                  rx="5"
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isSelected || hasStop ? 1.5 : 0.9}
                />
                <text x="30" y={floor.y + 15} fill="#eef6fc" fontSize="9.5" fontWeight="700">
                  {floor.label}
                </text>
                <text x="30" y={floor.y + 27} fill="#9cb7c9" fontSize="7.8">
                  #{floor.nodeIndex} · {floor.subLabel}
                </text>
                {matched.length > 0 && (
                  <g>
                    <circle
                      cx="194"
                      cy={floor.y + floor.height / 2}
                      r="8"
                      fill={hasStop ? '#e54856' : '#f0be77'}
                    />
                    <text
                      x="194"
                      y={floor.y + floor.height / 2 + 3}
                      textAnchor="middle"
                      fill="#09131d"
                      fontSize="8.5"
                      fontWeight="800"
                    >
                      {matched.length}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
        <div className="nexus-elevation-buttons" role="group" aria-label="골조 층별 구간 빠른 록온">
          {ELEVATION_FLOORS.map(floor => {
            const openCount = pipelineCases.filter(
              c => c.status !== 'closed' && (c.zoneAxis === floor.zoneAxis || c.structuralNodeIndex === floor.nodeIndex),
            ).length;
            const hasStop = pipelineCases.some(
              c =>
                c.status !== 'closed' &&
                c.stopWorkFlag &&
                (c.zoneAxis === floor.zoneAxis || c.structuralNodeIndex === floor.nodeIndex),
            );
            const isSelected = activeNodeIndex === floor.nodeIndex;
            return (
              <button
                key={floor.id}
                type="button"
                className={'nexus-elevation-btn' + (isSelected ? ' is-selected' : '') + (hasStop ? ' has-stopwork' : '')}
                aria-pressed={isSelected}
                onClick={() => onSelectFloor(floor.zoneAxis, floor.nodeIndex)}
              >
                <span>{floor.label}</span>
                <b>{hasStop ? `⛔ ${openCount}` : openCount > 0 ? `${openCount}건` : `#${floor.nodeIndex}`}</b>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

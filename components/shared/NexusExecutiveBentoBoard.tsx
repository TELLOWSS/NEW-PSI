import React, { useEffect, useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  NEXUS_HEATMAP_HAZARD_COLS,
  buildExecutiveDashboardCsv,
  type NexusExecutiveBentoSnapshot,
} from '../../utils/nexusExecutiveBentoMetrics';
import type { NexusZoneAxis } from '../../utils/nexusStructuralTaxonomy';

interface Props {
  snapshot: NexusExecutiveBentoSnapshot;
  reducedMotion: boolean;
  selectedZoneAxis: NexusZoneAxis | '';
  onSelectHeatmapCell: (zoneAxis: NexusZoneAxis, structuralNodeIndex: string) => void;
  onSelectSiteBar?: (siteId: string) => void;
  onSelectKpi?: (kpiKey: string) => void;
}

const useKineticNumber = (target: number, reduced: boolean): number => {
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    if (reduced || typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') {
      setDisplay(target);
      return;
    }
    const startVal = display;
    if (startVal === target) return;
    let frame = 0;
    const duration = 380;
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(startVal + (target - startVal) * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduced]);

  return reduced ? target : display;
};

const KineticNumberText: React.FC<{ value: number; unit: string; reduced: boolean }> = ({
  value,
  unit,
  reduced,
}) => {
  const animated = useKineticNumber(value, reduced);
  return (
    <strong className="nexus-bento-kpi-value">
      {animated.toLocaleString('ko-KR')}
      <small>{unit}</small>
    </strong>
  );
};

const MiniSparkline: React.FC<{ points: readonly number[]; tone: string }> = ({ points, tone }) => {
  const max = Math.max(1, ...points);
  const min = Math.min(...points);
  const span = Math.max(1, max - min);
  const width = 96;
  const height = 28;
  const coords = points.map((v, i) => {
    const x = Math.round((i / Math.max(1, points.length - 1)) * (width - 8) + 4);
    const y = Math.round(height - 4 - ((v - min) / span) * (height - 8));
    return `${x},${y}`;
  });
  const strokeColor =
    tone === 'cyan'
      ? '#75e6ef'
      : tone === 'emerald'
        ? '#68e3b0'
        : tone === 'violet'
          ? '#c7a4ff'
          : '#f6c786';

  return (
    <svg className="nexus-bento-sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords.join(' ')}
      />
      {coords.length > 0 && (
        <circle
          cx={coords[coords.length - 1].split(',')[0]}
          cy={coords[coords.length - 1].split(',')[1]}
          r="2.8"
          fill={strokeColor}
        />
      )}
    </svg>
  );
};

export const NexusExecutiveBentoBoard: React.FC<Props> = ({
  snapshot,
  reducedMotion,
  selectedZoneAxis,
  onSelectHeatmapCell,
  onSelectSiteBar,
  onSelectKpi,
}) => {
  const [downloadNotice, setDownloadNotice] = useState('');

  const handleLiquidPointerMove = (e: React.MouseEvent<HTMLElement>) => {
    if (reducedMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / Math.max(1, rect.width)) * 100);
    const y = Math.round(((e.clientY - rect.top) / Math.max(1, rect.height)) * 100);
    e.currentTarget.style.setProperty('--mx', `${x}%`);
    e.currentTarget.style.setProperty('--my', `${y}%`);
  };

  const handleDownloadCsv = () => {
    const csv = buildExecutiveDashboardCsv(snapshot);
    try {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `PSI-경영안전브리핑-${snapshot.asOfDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setDownloadNotice(`엑셀용 브리핑 파일(PSI-경영안전브리핑-${snapshot.asOfDate}.csv)을 다운로드했습니다.`);
    } catch {
      setDownloadNotice('브라우저에서 파일 다운로드를 차단했습니다. 워크벤치 요약 복사를 이용해 주세요.');
    }
  };

  return (
    <section
      className="nexus-bento-board"
      aria-label="Sovereign Executive Bento 다차원 안전 분석 보드"
    >
      <div className="nexus-bento-header">
        <div>
          <span className="nexus-3axis-kicker">
            EXECUTIVE ANALYTICS BOARD · 3D 황금 구체 · 엑셀 교차 분석 연동
          </span>
          <h2>전사 골조·형틀·건설기계 경영 브리핑 대시보드</h2>
        </div>
        <div className="nexus-bento-header-actions">
          <span className="nexus-bento-scope-pill">{snapshot.scopeLabel} · 기준 {snapshot.asOfDate}</span>
          {snapshot.stopWorkCount > 0 && (
            <span className="nexus-bento-stopwork-pill">⛔ 임시통제·작업중지 {snapshot.stopWorkCount}건</span>
          )}
          <button type="button" className="nexus-bento-csv-btn" onClick={handleDownloadCsv}>
            📊 엑셀(CSV) 경영 브리핑 저장
          </button>
        </div>
      </div>

      {downloadNotice && <p role="status" className="nexus-3axis-feedback">{downloadNotice}</p>}

      <div className="nexus-bento-kpis" role="group" aria-label="핵심 성과 지표 4종">
        {snapshot.kpis.map(kpi => {
          const radius = 17;
          const circumference = 2 * Math.PI * radius;
          const offset = circumference - (Math.min(100, Math.max(0, kpi.targetRatePct)) / 100) * circumference;
          return (
            <article
              key={kpi.key}
              className={`nexus-bento-card tone-${kpi.tone}` + (onSelectKpi ? ' is-clickable' : '')}
              role={onSelectKpi ? 'button' : undefined}
              tabIndex={onSelectKpi ? 0 : undefined}
              aria-label={onSelectKpi ? `${kpi.label} 상세 처리함 열기` : undefined}
              onClick={onSelectKpi ? () => onSelectKpi(kpi.key) : undefined}
              onKeyDown={
                onSelectKpi
                  ? e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectKpi(kpi.key);
                      }
                    }
                  : undefined
              }
              onMouseMove={handleLiquidPointerMove}
            >
              <div className="nexus-bento-card-top">
                <div>
                  <small>{kpi.eyebrow}</small>
                  <h3>{kpi.label}</h3>
                </div>
                <svg className="nexus-bento-ring" viewBox="0 0 44 44" aria-hidden="true">
                  <circle cx="22" cy="22" r={radius} className="ring-bg" />
                  <circle
                    cx="22"
                    cy="22"
                    r={radius}
                    className={`ring-fg tone-${kpi.tone}`}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                  />
                  <text x="22" y="25" textAnchor="middle">{kpi.targetRatePct}%</text>
                </svg>
              </div>
              <div className="nexus-bento-card-mid">
                <KineticNumberText value={kpi.primaryValue} unit={kpi.unit} reduced={reducedMotion} />
                <MiniSparkline points={kpi.sparkline} tone={kpi.tone} />
              </div>
              <div className="nexus-bento-card-foot">
                <span className="nexus-bento-delta-pill">{kpi.badgeText}</span>
                <p>{kpi.helperText}</p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="nexus-bento-middle-grid">
        <div
          className="nexus-bento-card nexus-bento-heatmap-panel"
          onMouseMove={handleLiquidPointerMove}
        >
          <div className="nexus-bento-panel-head">
            <div>
              <strong>구간 × 5대 위험유형 조건부 히트맵 (클릭 시 3D 구체 자동 록온)</strong>
              <small>지하RC·기초·지상·전이층의 위험 밀도를 클릭해 해당 공정으로 즉시 교차 탐색합니다.</small>
            </div>
            <div className="nexus-heatmap-legend" aria-hidden="true">
              <span>낮음</span>
              <i className="heat-0" />
              <i className="heat-1" />
              <i className="heat-2" />
              <i className="heat-3" />
              <span>집중</span>
            </div>
          </div>
          <div className="nexus-heatmap-table-wrap" role="grid" aria-label="구간별 위험유형 교차 히트맵">
            <div className="nexus-heatmap-header-row" role="row">
              <span className="nexus-heatmap-corner" role="columnheader">구간 \ 위험</span>
              {NEXUS_HEATMAP_HAZARD_COLS.map(col => (
                <span key={col.id} role="columnheader">{col.label}</span>
              ))}
            </div>
            {snapshot.heatmapRows.map(row => (
              <div
                key={row.zoneAxis}
                role="row"
                className={
                  'nexus-heatmap-data-row' + (selectedZoneAxis === row.zoneAxis ? ' is-zone-active' : '')
                }
              >
                <span className="nexus-heatmap-row-label" role="rowheader">{row.zoneLabel}</span>
                {row.cells.map(cell => (
                  <button
                    key={`${cell.zoneAxis}-${cell.hazardId}`}
                    type="button"
                    role="gridcell"
                    className={`nexus-heatmap-cell heat-${cell.heatLevel}`}
                    onClick={() => onSelectHeatmapCell(cell.zoneAxis, cell.structuralNodeIndex)}
                    aria-label={`${cell.zoneLabel} ${cell.hazardId} 사건 ${cell.count}건 · 구체 #${cell.structuralNodeIndex} 록온`}
                  >
                    <b>{cell.count > 0 ? `${cell.count}건` : `시드 ${cell.seedCount}`}</b>
                    <small>{cell.openCount > 0 ? `미결 ${cell.openCount}` : `#${cell.structuralNodeIndex}`}</small>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div
          className="nexus-bento-card nexus-bento-combo-panel"
          onMouseMove={handleLiquidPointerMove}
        >
          <div className="nexus-bento-panel-head">
            <div>
              <strong>전사 현장 비교 복합 분석 (미결 · 기계점검 · 교육이수율)</strong>
              <small>현장별 조치 부하(막대)와 12개국어 안전교육 이수 곡선(%)을 동시에 비교합니다.</small>
            </div>
          </div>
          <div className="nexus-bento-chart-box" style={{ width: '100%', height: 215, minWidth: 0 }}>
            <ResponsiveContainer width="100%" height={215} minWidth={220}>
              <ComposedChart
                data={[...snapshot.siteComboSeries]}
                margin={{ top: 10, right: 12, left: -16, bottom: 2 }}
              >
                <defs>
                  <linearGradient id="nexusGoldBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f6c786" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#b97732" stopOpacity={0.45} />
                  </linearGradient>
                  <linearGradient id="nexusCyanAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#75e6ef" stopOpacity={0.36} />
                    <stop offset="100%" stopColor="#75e6ef" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(130, 165, 190, 0.14)" />
                <XAxis dataKey="name" tick={{ fill: '#c6d8e4', fontSize: 11 }} axisLine={{ stroke: '#3c556b' }} />
                <YAxis yAxisId="left" allowDecimals={false} tick={{ fill: '#e8bf84', fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" tick={{ fill: '#75e6ef', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(9, 20, 32, 0.94)',
                    borderColor: 'rgba(244, 194, 127, 0.45)',
                    borderRadius: 10,
                    color: '#edf6fc',
                    fontSize: 11.5,
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={24}
                  wrapperStyle={{ fontSize: '11px', color: '#cfe3ef' }}
                />
                <Bar yAxisId="left" dataKey="미결조치" fill="url(#nexusGoldBarGrad)" radius={[5, 5, 0, 0]} barSize={24} />
                <Bar yAxisId="left" dataKey="기계점검" fill="#c7a4ff" radius={[5, 5, 0, 0]} barSize={16} />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="교육이수율"
                  stroke="#75e6ef"
                  strokeWidth={2.2}
                  fill="url(#nexusCyanAreaGrad)"
                  isAnimationActive={!reducedMotion}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {onSelectSiteBar && (
            <div className="nexus-bento-combo-chips" role="group" aria-label="차트 현장 빠른 선택">
              {snapshot.siteComboSeries.map(row => (
                <button
                  key={row.siteId}
                  type="button"
                  onClick={() => onSelectSiteBar(row.siteId)}
                >
                  {row.name} · 미결 {row.미결조치} / 이수 {row.교육이수율}%
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        className="nexus-bento-card nexus-bento-funnel-panel"
        onMouseMove={handleLiquidPointerMove}
      >
        <div className="nexus-bento-panel-head">
          <strong>폐루프 5단계 전환 퍼널 (발견 → 조치 → 인계 → 재점검 → 종결)</strong>
          <small>어느 단계에 미결 병목이 쌓여 있는지 즉시 확인합니다.</small>
        </div>
        <div className="nexus-funnel-grid" role="list" aria-label="폐루프 5단계 전환 현황">
          {snapshot.funnelStages.map(stage => (
            <div key={stage.key} role="listitem" className={`nexus-funnel-stage tone-${stage.tone}`}>
              <div className="nexus-funnel-top">
                <span>{stage.label}</span>
                <b>{stage.count}건 ({stage.pct}%)</b>
              </div>
              <div className="nexus-funnel-track" aria-hidden="true">
                <i style={{ width: `${stage.count > 0 ? Math.max(8, stage.pct) : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

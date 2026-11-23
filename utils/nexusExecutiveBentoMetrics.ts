import type { WorkerRecord } from '../types';
import { getKoreanCalendarDay } from './monthlyFieldFollowup';
import type { NexusEquipmentPhotoSubmission } from './nexusEquipmentPhotoReport';
import type { NexusExecutiveTrainingCampaign } from './nexusExecutiveTrainingPipeline';
import {
  NEXUS_SITE_PORTFOLIO,
  matchesPortfolioSite,
  type NexusAiInvestigationRecord,
  type NexusHqVisitPlan,
} from './nexusHqCommandLoop';
import type { NexusPipelineCase } from './nexusQuickPipeline';
import {
  NEXUS_STRUCTURAL_INCIDENT_SEEDS,
  NEXUS_ZONE_AXIS_OPTIONS,
  type NexusZoneAxis,
} from './nexusStructuralTaxonomy';
import { escapeSpreadsheetCsvCell } from './spreadsheetCsv';

export interface NexusBentoKpiItem {
  key: 'closure' | 'equipment' | 'training' | 'hq_command';
  eyebrow: string;
  label: string;
  primaryValue: number;
  unit: string;
  targetRatePct: number;
  badgeText: string;
  helperText: string;
  sparkline: readonly number[];
  tone: 'gold' | 'cyan' | 'emerald' | 'violet';
}

export const NEXUS_HEATMAP_HAZARD_COLS = [
  { id: '추락', label: '추락', matchMechanisms: ['추락'] },
  { id: '붕괴·도괴', label: '붕괴·도괴', matchMechanisms: ['붕괴·도괴', '전도'] },
  { id: '낙하·비래', label: '낙하·비래', matchMechanisms: ['낙하·비래'] },
  { id: '협착·끼임', label: '협착·끼임', matchMechanisms: ['협착·끼임'] },
  { id: '밀폐·측압', label: '밀폐·측압', matchMechanisms: ['질식·중독'], matchEquip: ['confined_earth_pressure'] },
] as const;

export type NexusHeatmapHazardId = (typeof NEXUS_HEATMAP_HAZARD_COLS)[number]['id'];

export interface NexusHeatmapCell {
  zoneAxis: NexusZoneAxis;
  zoneLabel: string;
  hazardId: NexusHeatmapHazardId;
  count: number;
  openCount: number;
  seedCount: number;
  structuralNodeIndex: string;
  heatLevel: 0 | 1 | 2 | 3;
}

export interface NexusSiteComboRow {
  siteId: string;
  name: string;
  미결조치: number;
  기계점검: number;
  교육이수율: number;
}

export interface NexusFunnelStage {
  key: string;
  label: string;
  count: number;
  pct: number;
  tone: 'amber' | 'gold' | 'cyan' | 'violet' | 'emerald';
}

export interface NexusExecutiveBentoSnapshot {
  asOfDate: string;
  scopeLabel: string;
  totalOperationalCases: number;
  stopWorkCount: number;
  kpis: readonly NexusBentoKpiItem[];
  heatmapRows: readonly {
    zoneAxis: NexusZoneAxis;
    zoneLabel: string;
    cells: readonly NexusHeatmapCell[];
  }[];
  siteComboSeries: readonly NexusSiteComboRow[];
  funnelStages: readonly NexusFunnelStage[];
}

const DEFAULT_NODE_BY_ZONE: Record<NexusZoneAxis, string> = {
  substructure_rc: '01',
  foundation: '01',
  superstructure_std: '03',
  rooftop_special: '07',
};

const padSparkline = (base: readonly number[], tail: number): readonly number[] => {
  const safeTail = Math.max(0, Math.round(tail));
  return [...base.slice(0, 5), safeTail];
};

export const buildExecutiveBentoSnapshot = (input: {
  pipelineCases: readonly NexusPipelineCase[];
  visitPlans: readonly NexusHqVisitPlan[];
  investigations: readonly NexusAiInvestigationRecord[];
  trainingCampaigns: readonly NexusExecutiveTrainingCampaign[];
  equipmentReports: readonly NexusEquipmentPhotoSubmission[];
  workerRecords?: readonly WorkerRecord[];
  selectedSiteId?: string;
  asOfDate?: string;
}): NexusExecutiveBentoSnapshot => {
  const asOfDate = input.asOfDate || getKoreanCalendarDay();
  const siteId = input.selectedSiteId || '';
  const activeSite = NEXUS_SITE_PORTFOLIO.find(s => s.siteId === siteId);
  const scopeLabel = activeSite ? activeSite.shortLabel : '전사 골조·형틀·지하RC 통합 포트폴리오';

  const scopedCases = input.pipelineCases.filter(c =>
    matchesPortfolioSite(`${c.locationLabel} ${c.observationNote}`, siteId),
  );
  const scopedVisits = input.visitPlans.filter(v =>
    matchesPortfolioSite(`${v.siteName} ${v.purpose}`, siteId),
  );
  const scopedInvs = input.investigations.filter(i =>
    matchesPortfolioSite(`${i.siteName} ${i.incidentTitle} ${i.rawSummary}`, siteId),
  );
  const scopedEquip = input.equipmentReports.filter(eq =>
    !siteId || eq.siteId === siteId || matchesPortfolioSite(`${eq.siteName} ${eq.workActivity}`, siteId),
  );
  const scopedTraining = activeSite
    ? input.trainingCampaigns.filter(
        t => t.structuralNodeIndex === activeSite.focusNodeIndex || matchesPortfolioSite(t.title, siteId),
      )
    : input.trainingCampaigns;

  const totalCases = scopedCases.length;
  const closedCases = scopedCases.filter(c => c.status === 'closed').length;
  const openCases = scopedCases.filter(c => c.status !== 'closed');
  const overdueCount = openCases.filter(c => c.dueDate && c.dueDate < asOfDate).length;
  const stopWorkCount = openCases.filter(c => c.stopWorkFlag).length;
  const closureRatePct = totalCases > 0 ? Math.round((closedCases / totalCases) * 100) : 0;

  const equipTotal = scopedEquip.length;
  const equipVerified = scopedEquip.filter(
    e => e.status === 'hq_verified_for_ceo' || e.status === 'reported_to_ceo',
  ).length;
  const equipReported = scopedEquip.filter(e => e.status === 'reported_to_ceo').length;
  const equipPending = scopedEquip.filter(e => e.status === 'submitted_to_hq').length;
  const equipReadyRatePct = equipTotal > 0 ? Math.round((equipVerified / equipTotal) * 100) : 0;

  const totalTargets = scopedTraining.reduce((sum, t) => sum + Math.max(1, t.targetWorkers || 0), 0);
  const totalSignatures = scopedTraining.reduce((sum, t) => sum + Math.max(0, t.confirmedSignatures || 0), 0);
  const trainingCompletionPct =
    totalTargets > 0 ? Math.min(100, Math.round((totalSignatures / totalTargets) * 100)) : 0;
  const maxNationalities = scopedTraining.reduce(
    (max, t) => Math.max(max, t.participatingNationalities || 0),
    0,
  );

  const pendingApprovals = scopedInvs.filter(i => i.status === 'ai_draft_pending_hq').length;
  const approvedInvs = scopedInvs.filter(i => i.status === 'hq_approved_propagated').length;
  const activeVisits = scopedVisits.filter(v => v.status !== 'action_issued_closed').length;
  const hqQueueTotal = pendingApprovals + equipPending + activeVisits;
  const workerCount = input.workerRecords?.length ?? 0;

  const kpis: NexusBentoKpiItem[] = [
    {
      key: 'closure',
      eyebrow: '03 · 06 CLOSED-LOOP',
      label: '전 현장 조치 종결률',
      primaryValue: closureRatePct,
      unit: '%',
      targetRatePct: totalCases > 0 ? closureRatePct : 0,
      badgeText: stopWorkCount > 0 ? `작업중지 ${stopWorkCount}건` : `미결 ${openCases.length} · 초과 ${overdueCount}건`,
      helperText:
        totalCases > 0
          ? `총 ${totalCases}건 중 ${closedCases}건 재점검 종결 (연동 평가 ${workerCount}건)`
          : '등록된 3축 시정조치 대기 중',
      sparkline: padSparkline([42, 48, 55, 61, Math.max(30, closureRatePct - 6)], closureRatePct || 12),
      tone: 'gold',
    },
    {
      key: 'equipment',
      eyebrow: 'HEAVY EQUIPMENT PHOTO',
      label: '건설기계 사용전 사진보고',
      primaryValue: equipTotal,
      unit: '건',
      targetRatePct: equipReadyRatePct,
      badgeText: `CEO보고 ${equipReported} · 적합 ${equipVerified}`,
      helperText:
        equipTotal > 0
          ? `본사 검토대기 ${equipPending}건 · 경영진 보고 준비율 ${equipReadyRatePct}%`
          : '펌프카·크레인 사용전 점검 사진 대기',
      sparkline: padSparkline([1, 2, 2, 3, Math.max(1, equipVerified)], equipTotal || 1),
      tone: 'cyan',
    },
    {
      key: 'training',
      eyebrow: '04 CEO 12-LANG TRAINING',
      label: '12개국어 교육 서명 이수율',
      primaryValue: trainingCompletionPct,
      unit: '%',
      targetRatePct: trainingCompletionPct,
      badgeText: `${totalSignatures}/${totalTargets}명 (${maxNationalities}개국)`,
      helperText:
        scopedTraining.length > 0
          ? `발령 캠페인 ${scopedTraining.length}건 다국어 모국어 서명 환류`
          : '대표이사 안전교육 캠페인 발령 대기',
      sparkline: padSparkline([25, 38, 52, 68, Math.max(20, trainingCompletionPct - 8)], trainingCompletionPct || 10),
      tone: 'emerald',
    },
    {
      key: 'hq_command',
      eyebrow: '01 · 05 HQ DECISION INBOX',
      label: '본사 결재·순회 지휘 대기',
      primaryValue: hqQueueTotal,
      unit: '건',
      targetRatePct: hqQueueTotal === 0 ? 100 : Math.min(95, Math.round((approvedInvs / Math.max(1, scopedInvs.length)) * 100)),
      badgeText: `조사결재 ${pendingApprovals} · 순회 ${activeVisits}`,
      helperText: `본사 최종 승인 완료 ${approvedInvs}건 · 02 사례DB 자동 편입`,
      sparkline: padSparkline([4, 5, 3, 4, Math.max(1, hqQueueTotal + 1)], hqQueueTotal),
      tone: 'violet',
    },
  ];

  const heatmapRows = NEXUS_ZONE_AXIS_OPTIONS.map(zoneOpt => {
    const cells: NexusHeatmapCell[] = NEXUS_HEATMAP_HAZARD_COLS.map(col => {
      const matchingSeeds = NEXUS_STRUCTURAL_INCIDENT_SEEDS.filter(seed => {
        if (seed.zoneAxis !== zoneOpt.id) return false;
        const mechMatch = (col.matchMechanisms as readonly string[]).includes(seed.hazardMechanism);
        const equipMatch =
          'matchEquip' in col && (col.matchEquip as readonly string[]).includes(seed.hazardEquipmentAxis);
        return mechMatch || equipMatch;
      });

      const matchingCases = scopedCases.filter(c => {
        if (c.zoneAxis !== zoneOpt.id) return false;
        const seed = NEXUS_STRUCTURAL_INCIDENT_SEEDS.find(s => s.caseCode === c.matchedCaseCode);
        const mechMatch = seed && (col.matchMechanisms as readonly string[]).includes(seed.hazardMechanism);
        const equipMatch =
          'matchEquip' in col && (col.matchEquip as readonly string[]).includes(c.hazardEquipmentAxis);
        return Boolean(mechMatch || equipMatch);
      });

      const matchingInvs = scopedInvs.filter(inv => {
        if (inv.zoneAxis !== zoneOpt.id) return false;
        const mechMatch = (col.matchMechanisms as readonly string[]).includes(inv.hazardMechanism);
        const equipMatch =
          'matchEquip' in col && (col.matchEquip as readonly string[]).includes(inv.hazardEquipmentAxis);
        return Boolean(mechMatch || equipMatch);
      });

      const openCount = matchingCases.filter(c => c.status !== 'closed').length;
      const count = matchingCases.length + matchingInvs.length;
      const seedCount = matchingSeeds.length;
      const structuralNodeIndex =
        matchingCases[0]?.structuralNodeIndex ||
        matchingSeeds[0]?.structuralNodeIndex ||
        DEFAULT_NODE_BY_ZONE[zoneOpt.id];

      const totalSignal = openCount * 2 + count + (seedCount > 0 && count === 0 ? 1 : 0);
      const heatLevel: 0 | 1 | 2 | 3 =
        totalSignal >= 4 || openCount >= 2 ? 3 : totalSignal >= 2 ? 2 : totalSignal === 1 ? 1 : 0;

      return {
        zoneAxis: zoneOpt.id,
        zoneLabel: zoneOpt.shortLabel,
        hazardId: col.id,
        count,
        openCount,
        seedCount,
        structuralNodeIndex,
        heatLevel,
      };
    });
    return {
      zoneAxis: zoneOpt.id,
      zoneLabel: zoneOpt.shortLabel,
      cells,
    };
  });

  const siteComboSeries: NexusSiteComboRow[] = NEXUS_SITE_PORTFOLIO.map(site => {
    const siteCases = input.pipelineCases.filter(c =>
      matchesPortfolioSite(`${c.locationLabel} ${c.observationNote}`, site.siteId),
    );
    const siteOpen = siteCases.filter(c => c.status !== 'closed').length;
    const siteEquip = input.equipmentReports.filter(
      e => e.siteId === site.siteId || matchesPortfolioSite(`${e.siteName} ${e.workActivity}`, site.siteId),
    ).length;
    const siteTraining = input.trainingCampaigns.filter(
      t => t.structuralNodeIndex === site.focusNodeIndex || matchesPortfolioSite(t.title, site.siteId),
    );
    const tTargets = siteTraining.reduce((s, t) => s + Math.max(1, t.targetWorkers || 0), 0);
    const tSigned = siteTraining.reduce((s, t) => s + Math.max(0, t.confirmedSignatures || 0), 0);
    const tRate = tTargets > 0 ? Math.min(100, Math.round((tSigned / tTargets) * 100)) : 0;
    return {
      siteId: site.siteId,
      name: site.shortLabel.split(' · ')[0] || site.shortLabel,
      미결조치: siteOpen,
      기계점검: siteEquip,
      교육이수율: tRate,
    };
  });

  const denom = Math.max(1, totalCases);
  const inAction = scopedCases.filter(c => c.status === 'action_required').length;
  const inHandover = scopedCases.filter(c => c.status === 'handover_pending').length;
  const inRecheck = scopedCases.filter(c => c.status === 'recheck_pending').length;
  const funnelStages: NexusFunnelStage[] = [
    { key: 'total', label: '01·03 위험 발견·접수', count: totalCases, pct: totalCases > 0 ? 100 : 0, tone: 'amber' },
    { key: 'action', label: '06 시정조치 진행', count: inAction, pct: totalCases > 0 ? Math.round((inAction / denom) * 100) : 0, tone: 'gold' },
    { key: 'handover', label: '교대·인계 대기', count: inHandover, pct: totalCases > 0 ? Math.round((inHandover / denom) * 100) : 0, tone: 'cyan' },
    { key: 'recheck', label: '현장 재점검 대기', count: inRecheck, pct: totalCases > 0 ? Math.round((inRecheck / denom) * 100) : 0, tone: 'violet' },
    { key: 'closed', label: '재점검 확인 종결', count: closedCases, pct: totalCases > 0 ? Math.round((closedCases / denom) * 100) : 0, tone: 'emerald' },
  ];

  return {
    asOfDate,
    scopeLabel,
    totalOperationalCases: totalCases,
    stopWorkCount,
    kpis,
    heatmapRows,
    siteComboSeries,
    funnelStages,
  };
};

export const buildExecutiveDashboardCsv = (snapshot: NexusExecutiveBentoSnapshot): string => {
  const rows: (string | number)[][] = [
    ['기준일', '조회범위', '구분', '항목명', '수치', '보조지표'],
    ...snapshot.kpis.map(k => [
      snapshot.asOfDate,
      snapshot.scopeLabel,
      '핵심KPI',
      k.label,
      `${k.primaryValue}${k.unit}`,
      `${k.badgeText} / ${k.helperText}`,
    ]),
    ...snapshot.siteComboSeries.map(s => [
      snapshot.asOfDate,
      snapshot.scopeLabel,
      '현장비교',
      s.name,
      s.미결조치,
      `기계점검 ${s.기계점검}건 / 교육이수율 ${s.교육이수율}%`,
    ]),
    ...snapshot.funnelStages.map(f => [
      snapshot.asOfDate,
      snapshot.scopeLabel,
      '폐루프퍼널',
      f.label,
      f.count,
      `${f.pct}%`,
    ]),
  ];
  return (
    '\uFEFF' +
    rows.map(row => row.map(cell => escapeSpreadsheetCsvCell(cell)).join(',')).join('\r\n')
  );
};

import { getKoreanCalendarDay } from './monthlyFieldFollowup';
import {
  seedEquipmentPhotoSimulation,
  type NexusEquipmentPhotoSubmission,
} from './nexusEquipmentPhotoReport';
import {
  readExecutiveTrainingCampaigns,
  stageExecutiveTrainingHandoff,
  type NexusExecutiveTrainingCampaign,
} from './nexusExecutiveTrainingPipeline';
import type { NexusOrbitLayer } from './nexusSphereProjection';
import {
  classifyStructuralPhotoContext,
  createNexusPipelineCase,
  readNexusPipelineCases,
  type NexusPipelineCase,
} from './nexusQuickPipeline';
import {
  NEXUS_HAZARD_EQUIPMENT_AXIS_OPTIONS,
  NEXUS_PROCESS_AXIS_OPTIONS,
  NEXUS_STRUCTURAL_INCIDENT_SEEDS,
  NEXUS_ZONE_AXIS_OPTIONS,
  type NexusHazardEquipmentAxis,
  type NexusHazardMechanism,
  type NexusProcessAxis,
  type NexusStructuralIncidentSeed,
  type NexusZoneAxis,
} from './nexusStructuralTaxonomy';

export const NEXUS_HQ_VISITS_STORAGE_KEY = 'psi_nexus_hq_visit_plans_v1';
export const NEXUS_AI_INVESTIGATIONS_STORAGE_KEY = 'psi_nexus_ai_investigations_v1';
export const NEXUS_APPROVED_CUSTOM_SEEDS_KEY = 'psi_nexus_approved_custom_seeds_v1';
export const NEXUS_HQ_LOOP_UPDATED_EVENT = 'psi-nexus-hq-loop-updated';

export type NexusCommandRoleMode = 'unified' | 'hq_cso' | 'field_manager';
export type NexusWorkspaceAuthority = 'hq' | 'field';

export interface NexusSitePortfolioItem {
  siteId: string;
  siteName: string;
  shortLabel: string;
  focusZone: NexusZoneAxis;
  focusProcess: NexusProcessAxis;
  focusNodeIndex: string;
  matchTokens: readonly string[];
}

export const NEXUS_SITE_PORTFOLIO: readonly NexusSitePortfolioItem[] = [
  {
    siteId: 'SITE-01-SUBRC',
    siteName: '제1현장 지하 2층 RC구간',
    shortLabel: '제1현장 · 지하2층 RC외벽',
    focusZone: 'substructure_rc',
    focusProcess: 'formwork_general',
    focusNodeIndex: '01',
    matchTokens: ['제1현장', '지하', 'b1', 'b2', '합벽', '피트'],
  },
  {
    siteId: 'SITE-02-GANGFORM',
    siteName: '제2현장 103동 15층 갱폼',
    shortLabel: '제2현장 · 103동 갱폼·AL폼',
    focusZone: 'superstructure_std',
    focusProcess: 'gangform',
    focusNodeIndex: '03',
    matchTokens: ['제2현장', '103동', '14층', '15층', '갱폼', 'al폼', '알폼'],
  },
  {
    siteId: 'SITE-03-SHORING',
    siteName: '제3현장 전이층 시스템동바리',
    shortLabel: '제3현장 · 전이층 동바리·타설',
    focusZone: 'rooftop_special',
    focusProcess: 'concrete_pour',
    focusNodeIndex: '07',
    matchTokens: ['제3현장', '전이층', '동바리', '타설', '고층고'],
  },
];

export const matchesPortfolioSite = (text: string, siteId: string): boolean => {
  if (!siteId) return true;
  const site = NEXUS_SITE_PORTFOLIO.find(s => s.siteId === siteId);
  if (!site) return true;
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return false;
  return site.matchTokens.some(tok => normalized.includes(tok.toLowerCase()));
};

export const matchesScopedSiteRecord = (
  recordSiteId: string | undefined,
  fallbackText: string,
  targetSiteId: string,
): boolean => {
  if (!targetSiteId) return true;
  if (recordSiteId) return recordSiteId === targetSiteId;
  return matchesPortfolioSite(fallbackText, targetSiteId);
};

export const scopeNexusWorkspaceData = (params: {
  workspaceRole: NexusWorkspaceAuthority;
  selectedSiteId?: string;
  assignedFieldSiteId?: string;
  pipelineCases: readonly NexusPipelineCase[];
  visitPlans: readonly NexusHqVisitPlan[];
  investigations: readonly NexusAiInvestigationRecord[];
  trainingCampaigns: readonly NexusExecutiveTrainingCampaign[];
  equipmentReports: readonly NexusEquipmentPhotoSubmission[];
}): {
  effectiveSiteId: string;
  activeSiteMeta: NexusSitePortfolioItem | null;
  pipelineCases: NexusPipelineCase[];
  visitPlans: NexusHqVisitPlan[];
  investigations: NexusAiInvestigationRecord[];
  trainingCampaigns: NexusExecutiveTrainingCampaign[];
  equipmentReports: NexusEquipmentPhotoSubmission[];
} => {
  const effectiveSiteId =
    params.workspaceRole === 'field'
      ? params.assignedFieldSiteId || NEXUS_SITE_PORTFOLIO[0].siteId
      : params.selectedSiteId || '';
  const activeSiteMeta = NEXUS_SITE_PORTFOLIO.find(s => s.siteId === effectiveSiteId) ?? null;

  if (!effectiveSiteId) {
    return {
      effectiveSiteId: '',
      activeSiteMeta: null,
      pipelineCases: [...params.pipelineCases],
      visitPlans: [...params.visitPlans],
      investigations: [...params.investigations],
      trainingCampaigns: [...params.trainingCampaigns],
      equipmentReports: [...params.equipmentReports],
    };
  }

  const pipelineCases = params.pipelineCases.filter(c =>
    matchesScopedSiteRecord(c.siteId, `${c.locationLabel} ${c.observationNote}`, effectiveSiteId),
  );
  const visitPlans = params.visitPlans.filter(v =>
    matchesScopedSiteRecord(v.siteId, `${v.siteName} ${v.purpose}`, effectiveSiteId),
  );
  const investigations = params.investigations.filter(i =>
    matchesScopedSiteRecord(
      i.siteId,
      `${i.siteName} ${i.incidentTitle} ${i.rawSummary}`,
      effectiveSiteId,
    ),
  );
  const equipmentReports = params.equipmentReports.filter(eq =>
    matchesScopedSiteRecord(eq.siteId, `${eq.siteName} ${eq.workActivity}`, effectiveSiteId),
  );
  const trainingCampaigns = params.trainingCampaigns.filter(t => {
    const combined = `${t.title || ''} ${t.sourceTextKo || ''}`;
    if (matchesPortfolioSite(combined, effectiveSiteId)) return true;
    if (String(t.matchedCaseCode || '').startsWith('HQ-')) return true;
    const mentionsOtherSite = NEXUS_SITE_PORTFOLIO.some(
      other => other.siteId !== effectiveSiteId && matchesPortfolioSite(combined, other.siteId),
    );
    if (mentionsOtherSite) return false;
    return (
      Boolean(activeSiteMeta && t.structuralNodeIndex === activeSiteMeta.focusNodeIndex) ||
      NEXUS_SITE_PORTFOLIO.every(s => !matchesPortfolioSite(combined, s.siteId))
    );
  });

  return {
    effectiveSiteId,
    activeSiteMeta,
    pipelineCases,
    visitPlans,
    investigations,
    trainingCampaigns,
    equipmentReports,
  };
};

export type NexusVisitStatus =
  | 'scheduled_briefed'
  | 'in_field_inspection'
  | 'action_issued_closed';

export const NEXUS_VISIT_STATUS_LABELS: Record<NexusVisitStatus, string> = {
  scheduled_briefed: '방문 등록 · 사전브리핑 완료',
  in_field_inspection: '현장 순회점검 진행 중',
  action_issued_closed: '점검 완료 · 조치·인계 환류됨',
};

export interface NexusPreVisitBriefing {
  matchedCaseCode: string;
  matchedCaseTitle: string;
  hazardMechanism: NexusHazardMechanism;
  openPipelineActionsCount: number;
  overdueActionsCount: number;
  keyBriefingPoints: readonly string[];
}

export interface NexusHqVisitPlan {
  visitId: string;
  siteId?: string;
  createdAt: string;
  updatedAt: string;
  visitDate: string;
  inspectorRole: string;
  siteName: string;
  purpose: string;
  zoneAxis: NexusZoneAxis;
  processAxis: NexusProcessAxis;
  hazardEquipmentAxis: NexusHazardEquipmentAxis;
  structuralNodeIndex: string;
  preVisitBriefing: NexusPreVisitBriefing;
  fieldResultNote?: string;
  fieldAcknowledgedAt?: string;
  fieldAcknowledgedBy?: string;
  fieldAcknowledgeNote?: string;
  linkedPipelineCaseId?: string;
  status: NexusVisitStatus;
}

export type NexusInvestigationStatus =
  | 'ai_draft_pending_hq'
  | 'hq_approved_propagated'
  | 'revision_requested';

export const NEXUS_INVESTIGATION_STATUS_LABELS: Record<NexusInvestigationStatus, string> = {
  ai_draft_pending_hq: 'AI 원인분석 초안 · 본사 승인 대기',
  hq_approved_propagated: '본사 승인 완료 · 사례DB·교육 자동 편입',
  revision_requested: '보완 요청됨',
};

export interface NexusSixW {
  when: string;
  where: string;
  who: string;
  what: string;
  how: string;
  why: string;
}

export interface NexusTimelineStep {
  phase: string;
  detail: string;
}

export interface NexusAiInvestigationRecord {
  investigationId: string;
  siteId?: string;
  createdAt: string;
  updatedAt: string;
  siteName: string;
  incidentTitle: string;
  rawSummary: string;
  zoneAxis: NexusZoneAxis;
  processAxis: NexusProcessAxis;
  hazardEquipmentAxis: NexusHazardEquipmentAxis;
  structuralNodeIndex: string;
  hazardMechanism: NexusHazardMechanism;
  matchedReferenceCode: string;
  sixW: NexusSixW;
  timeline: readonly NexusTimelineStep[];
  directCause: string;
  contributingFactor: string;
  rootCause: string;
  preventiveMeasureDraft: string;
  authorLabel: string;
  approverLabel?: string;
  approvedAt?: string;
  approvalNote?: string;
  revisionReviewerLabel?: string;
  revisionNote?: string;
  revisionRequestedAt?: string;
  promotedSeedCode?: string;
  promotedTrainingCampaignId?: string;
  promotedPipelineCaseId?: string;
  status: NexusInvestigationStatus;
}

let memoryVisitStore: NexusHqVisitPlan[] = [];
let memoryInvestigationStore: NexusAiInvestigationRecord[] = [];
let memoryCustomSeedStore: NexusStructuralIncidentSeed[] = [];

const emitHqLoopEvent = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(NEXUS_HQ_LOOP_UPDATED_EVENT));
  }
};

export const readHqVisitPlans = (): NexusHqVisitPlan[] => {
  if (typeof window === 'undefined' || !window.localStorage) return [...memoryVisitStore];
  try {
    const raw = window.localStorage.getItem(NEXUS_HQ_VISITS_STORAGE_KEY);
    if (!raw) return [...memoryVisitStore];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryVisitStore = parsed;
      return [...parsed];
    }
    return [...memoryVisitStore];
  } catch {
    return [...memoryVisitStore];
  }
};

export const writeHqVisitPlans = (plans: readonly NexusHqVisitPlan[]): void => {
  memoryVisitStore = [...plans];
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(NEXUS_HQ_VISITS_STORAGE_KEY, JSON.stringify(plans));
    emitHqLoopEvent();
  } catch {
    // Ignore quota errors
  }
};

export const readAiInvestigations = (): NexusAiInvestigationRecord[] => {
  if (typeof window === 'undefined' || !window.localStorage) return [...memoryInvestigationStore];
  try {
    const raw = window.localStorage.getItem(NEXUS_AI_INVESTIGATIONS_STORAGE_KEY);
    if (!raw) return [...memoryInvestigationStore];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryInvestigationStore = parsed;
      return [...parsed];
    }
    return [...memoryInvestigationStore];
  } catch {
    return [...memoryInvestigationStore];
  }
};

export const writeAiInvestigations = (records: readonly NexusAiInvestigationRecord[]): void => {
  memoryInvestigationStore = [...records];
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(NEXUS_AI_INVESTIGATIONS_STORAGE_KEY, JSON.stringify(records));
    emitHqLoopEvent();
  } catch {
    // Ignore quota errors
  }
};

export const readApprovedCustomIncidentSeeds = (): NexusStructuralIncidentSeed[] => {
  if (typeof window === 'undefined' || !window.localStorage) return [...memoryCustomSeedStore];
  try {
    const raw = window.localStorage.getItem(NEXUS_APPROVED_CUSTOM_SEEDS_KEY);
    if (!raw) return [...memoryCustomSeedStore];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryCustomSeedStore = parsed;
      return [...parsed];
    }
    return [...memoryCustomSeedStore];
  } catch {
    return [...memoryCustomSeedStore];
  }
};

export const writeApprovedCustomIncidentSeeds = (
  seeds: readonly NexusStructuralIncidentSeed[],
): void => {
  memoryCustomSeedStore = [...seeds];
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(NEXUS_APPROVED_CUSTOM_SEEDS_KEY, JSON.stringify(seeds));
    emitHqLoopEvent();
  } catch {
    // Ignore quota errors
  }
};

export const buildPreVisitBriefing = (
  input: {
    siteName?: string;
    purpose?: string;
    zoneAxis?: NexusZoneAxis | '';
    processAxis?: NexusProcessAxis | '';
    hazardEquipmentAxis?: NexusHazardEquipmentAxis | '';
  },
  pipelineCases: readonly NexusPipelineCase[] = readNexusPipelineCases(),
  asOfDate = getKoreanCalendarDay(),
): {
  classification: ReturnType<typeof classifyStructuralPhotoContext>;
  briefing: NexusPreVisitBriefing;
} => {
  const classification = classifyStructuralPhotoContext({
    note: `${input.siteName || ''} ${input.purpose || ''}`.trim(),
    overrideZone: input.zoneAxis || '',
    overrideProcess: input.processAxis || '',
    overrideEquipment: input.hazardEquipmentAxis || '',
  });
  const seed = classification.primarySeed;

  const matchingCases = pipelineCases.filter(
    c =>
      c.status !== 'closed' &&
      (c.structuralNodeIndex === classification.structuralNodeIndex ||
        c.zoneAxis === classification.zoneAxis ||
        c.processAxis === classification.processAxis),
  );
  const overdueCases = matchingCases.filter(c => c.dueDate && c.dueDate < asOfDate);

  const keyBriefingPoints: string[] = [
    `[사전 위험 브리핑] 해당 공정(${seed.caseCode}) 연계 미종결 조치 ${matchingCases.length}건 (기한초과 ${overdueCases.length}건) 우선 확인`,
    `[중점 점검 사항] ${seed.preVisitBriefingPoint}`,
    `[유사사례 원인다조] 직접원인(${seed.directCause}) 및 근본원인(${seed.rootCause}) 재발 여부 현장 대조`,
  ];

  return {
    classification,
    briefing: {
      matchedCaseCode: seed.caseCode,
      matchedCaseTitle: seed.title,
      hazardMechanism: seed.hazardMechanism,
      openPipelineActionsCount: matchingCases.length,
      overdueActionsCount: overdueCases.length,
      keyBriefingPoints,
    },
  };
};

export const createHqVisitPlan = (
  input: {
    siteId?: string;
    visitDate?: string;
    inspectorRole?: string;
    siteName: string;
    purpose: string;
    zoneAxis?: NexusZoneAxis | '';
    processAxis?: NexusProcessAxis | '';
    hazardEquipmentAxis?: NexusHazardEquipmentAxis | '';
  },
  pipelineCases: readonly NexusPipelineCase[] = readNexusPipelineCases(),
  nowIso = new Date().toISOString(),
): NexusHqVisitPlan => {
  const today = getKoreanCalendarDay(new Date(nowIso));
  const { classification, briefing } = buildPreVisitBriefing(input, pipelineCases, today);

  const plan: NexusHqVisitPlan = {
    visitId: `NEXUS-VISIT-${classification.primarySeed.caseCode}-${Date.now().toString(36).toUpperCase()}`,
    siteId: input.siteId || undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
    visitDate: /^\d{4}-\d{2}-\d{2}$/.test(String(input.visitDate || '')) ? String(input.visitDate) : today,
    inspectorRole: String(input.inspectorRole || '').trim() || '본사 안전보건팀 순회점검자',
    siteName: String(input.siteName || '').trim() || '골조·형틀 중점관리 현장',
    purpose: String(input.purpose || '').trim() || classification.primarySeed.preVisitBriefingPoint,
    zoneAxis: classification.zoneAxis,
    processAxis: classification.processAxis,
    hazardEquipmentAxis: classification.hazardEquipmentAxis,
    structuralNodeIndex: classification.structuralNodeIndex,
    preVisitBriefing: briefing,
    status: 'scheduled_briefed',
  };

  const existing = readHqVisitPlans();
  writeHqVisitPlans([plan, ...existing].slice(0, 60));
  return plan;
};

export const startHqFieldInspection = (
  visitId: string,
  checkpointNote?: string,
  nowIso = new Date().toISOString(),
): NexusHqVisitPlan[] => {
  const existing = readHqVisitPlans();
  const updated = existing.map(plan => {
    if (plan.visitId !== visitId) return plan;
    return {
      ...plan,
      status: 'in_field_inspection' as const,
      fieldResultNote:
        String(checkpointNote || '').trim() ||
        `[현장 도착·순회점검 개시] ${plan.preVisitBriefing.matchedCaseCode} 중점 항목 및 미결 위험 현장 대조 중`,
      updatedAt: nowIso,
    };
  });
  writeHqVisitPlans(updated);
  return updated;
};

export const completeHqVisitWithFieldAction = (
  visitId: string,
  fieldResultNote: string,
  nowIso = new Date().toISOString(),
  options?: { dispatchEmergencyTraining?: boolean; targetWorkers?: number },
): {
  updatedPlans: NexusHqVisitPlan[];
  createdPipelineCase: NexusPipelineCase | null;
  createdTrainingCampaign: NexusExecutiveTrainingCampaign | null;
} => {
  const existing = readHqVisitPlans();
  let createdPipelineCase: NexusPipelineCase | null = null;
  let createdTrainingCampaign: NexusExecutiveTrainingCampaign | null = null;

  const updatedPlans = existing.map(plan => {
    if (plan.visitId !== visitId) return plan;
    const note =
      String(fieldResultNote || '').trim() ||
      `[본사 순회점검] ${plan.siteName} · ${plan.purpose} 현장 점검 및 시정조치 지시`;
    const newCase = createNexusPipelineCase(
      {
        siteId: plan.siteId,
        locationLabel: `${plan.siteName} (${plan.inspectorRole})`,
        observationNote: note,
        zoneAxis: plan.zoneAxis,
        processAxis: plan.processAxis,
        hazardEquipmentAxis: plan.hazardEquipmentAxis,
        handoverShift: '본사 순회점검 지시 → 현장 소장·안전팀 인계',
      },
      nowIso,
    );
    createdPipelineCase = newCase;
    if (options?.dispatchEmergencyTraining) {
      const newCampaign = stageExecutiveTrainingHandoff(plan.preVisitBriefing.matchedCaseCode, {
        pipelineCase: newCase,
        targetWorkers: options.targetWorkers ?? 15,
        dispatchImmediately: true,
        nowIso,
      });
      createdTrainingCampaign = newCampaign;
    }
    return {
      ...plan,
      fieldResultNote: note,
      linkedPipelineCaseId: newCase.caseId,
      status: 'action_issued_closed' as const,
      updatedAt: nowIso,
    };
  });

  writeHqVisitPlans(updatedPlans);
  return { updatedPlans, createdPipelineCase, createdTrainingCampaign };
};

export const acknowledgeHqVisitByField = (
  visitId: string,
  ack: { responderLabel?: string; note?: string },
  nowIso = new Date().toISOString(),
): NexusHqVisitPlan[] => {
  const responder = String(ack.responderLabel || '').trim() || '현장 안전관리자';
  const note =
    String(ack.note || '').trim() ||
    '사전 브리핑 미결 위험·동선 확인 완료 · 본사 순회점검 맞이 현장 준비 완료';
  const existing = readHqVisitPlans();
  const updated = existing.map(plan => {
    if (plan.visitId !== visitId) return plan;
    return {
      ...plan,
      fieldAcknowledgedAt: nowIso,
      fieldAcknowledgedBy: responder,
      fieldAcknowledgeNote: note,
      updatedAt: nowIso,
    };
  });
  writeHqVisitPlans(updated);
  return updated;
};

export const buildAiInvestigationDraft = (
  input: {
    siteId?: string;
    siteName: string;
    incidentTitle?: string;
    rawSummary: string;
    when?: string;
    where?: string;
    who?: string;
    authorLabel?: string;
    zoneAxis?: NexusZoneAxis | '';
    processAxis?: NexusProcessAxis | '';
    hazardEquipmentAxis?: NexusHazardEquipmentAxis | '';
  },
  nowIso = new Date().toISOString(),
): NexusAiInvestigationRecord => {
  const summary =
    String(input.rawSummary || '').trim() ||
    '지하 2층 외벽 합벽 거푸집 조립 중 타이볼트 간격 미흡 및 피트 개구부 덮개 미고정 아차사고';
  const classification = classifyStructuralPhotoContext({
    note: `${input.siteName || ''} ${input.incidentTitle || ''} ${summary}`,
    overrideZone: input.zoneAxis || '',
    overrideProcess: input.processAxis || '',
    overrideEquipment: input.hazardEquipmentAxis || '',
  });
  const seed = classification.primarySeed;

  const zoneLabel =
    NEXUS_ZONE_AXIS_OPTIONS.find(z => z.id === classification.zoneAxis)?.shortLabel || '골조 구간';
  const processLabel =
    NEXUS_PROCESS_AXIS_OPTIONS.find(p => p.id === classification.processAxis)?.shortLabel || '형틀 작업';
  const equipLabel =
    NEXUS_HAZARD_EQUIPMENT_AXIS_OPTIONS.find(e => e.id === classification.hazardEquipmentAxis)?.shortLabel ||
    '가설·장비';

  const today = getKoreanCalendarDay(new Date(nowIso));
  const when = String(input.when || '').trim() || `${today} 작업 진행 중`;
  const where = String(input.where || '').trim() || `${input.siteName || '현장'} · ${zoneLabel} 구간`;
  const who = String(input.who || '').trim() || `${processLabel} 작업팀`;

  const record: NexusAiInvestigationRecord = {
    investigationId: `NEXUS-INV-${seed.caseCode}-${Date.now().toString(36).toUpperCase()}`,
    siteId: input.siteId || undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
    siteName: String(input.siteName || '').trim() || '골조·형틀 현장',
    incidentTitle:
      String(input.incidentTitle || '').trim() ||
      `[${zoneLabel} · ${processLabel}] ${seed.hazardMechanism} 아차사고·위험사례 원인조사`,
    rawSummary: summary,
    zoneAxis: classification.zoneAxis,
    processAxis: classification.processAxis,
    hazardEquipmentAxis: classification.hazardEquipmentAxis,
    structuralNodeIndex: classification.structuralNodeIndex,
    hazardMechanism: seed.hazardMechanism,
    matchedReferenceCode: seed.caseCode,
    sixW: {
      when,
      where,
      who,
      what: `${processLabel} 및 ${equipLabel} 취급·설치 작업`,
      how: summary,
      why: seed.rootCause,
    },
    timeline: [
      { phase: '01 · 작업 전 단계', detail: `${where}에서 ${who} 투입 전 사전 구조·방호 상태 점검 미흡` },
      { phase: '02 · 위험 노출 단계', detail: `${seed.directCause} 상태로 작업 진행` },
      { phase: '03 · 사건·아차사고 인지', detail: `${summary} 확인 및 현장 작업 일시 중지·임시 통제` },
      { phase: '04 · 원인분석·대책 수립', detail: `${seed.preventiveMeasure} 이행 및 본사 승인 후 전 현장 전파 대기` },
    ],
    directCause: seed.directCause,
    contributingFactor: seed.contributingFactor,
    rootCause: seed.rootCause,
    preventiveMeasureDraft: seed.preventiveMeasure,
    authorLabel: String(input.authorLabel || '').trim() || '현장 안전관리자',
    status: 'ai_draft_pending_hq',
  };

  return record;
};

export const submitAiInvestigationRecord = (
  input: Parameters<typeof buildAiInvestigationDraft>[0],
  nowIso = new Date().toISOString(),
): NexusAiInvestigationRecord => {
  const draft = buildAiInvestigationDraft(input, nowIso);
  const existing = readAiInvestigations();
  writeAiInvestigations([draft, ...existing].slice(0, 60));
  return draft;
};

/**
 * Approves an AI Root-Cause Investigation (enforcing author != approver rule)
 * and automatically propagates the approved lesson into:
 * 1) `02 사고사례 데이터 DB` (Approved Custom Incident Seed)
 * 2) `04 대표이사 12개국어 안전교육` (Dispatched Campaign)
 * 3) `06 조치·재점검·인계` (Verification Action Item)
 */
export const approveAiInvestigationAndPropagate = (
  investigationId: string,
  approval: {
    approverLabel: string;
    approvalNote?: string;
    directCause?: string;
    contributingFactor?: string;
    rootCause?: string;
    preventiveMeasureDraft?: string;
    targetWorkers?: number;
  },
  nowIso = new Date().toISOString(),
): {
  updatedInvestigations: NexusAiInvestigationRecord[];
  promotedSeed: NexusStructuralIncidentSeed;
  promotedTrainingCampaign: NexusExecutiveTrainingCampaign;
  promotedPipelineCase: NexusPipelineCase;
} => {
  const existing = readAiInvestigations();
  const target = existing.find(item => item.investigationId === investigationId);
  if (!target) {
    throw new Error('승인할 사고조사 초안을 찾을 수 없습니다.');
  }

  const approver = String(approval.approverLabel || '').trim();
  if (!approver) {
    throw new Error('본사 승인자 직책 또는 이름을 입력해 주세요.');
  }
  if (approver.toLowerCase() === target.authorLabel.trim().toLowerCase()) {
    throw new Error('직무 분리 원칙에 따라 사고조사 작성자와 본사 최종 승인자는 서로 달라야 합니다.');
  }

  const finalDirect = String(approval.directCause || target.directCause).trim();
  const finalContrib = String(approval.contributingFactor || target.contributingFactor).trim();
  const finalRoot = String(approval.rootCause || target.rootCause).trim();
  const finalPreventive = String(approval.preventiveMeasureDraft || target.preventiveMeasureDraft).trim();

  const customSeeds = readApprovedCustomIncidentSeeds();
  const promotedSeedCode = `HQ-${target.matchedReferenceCode}-${String(customSeeds.length + 1).padStart(2, '0')}`;
  const baseSeed =
    NEXUS_STRUCTURAL_INCIDENT_SEEDS.find(s => s.caseCode === target.matchedReferenceCode) ??
    NEXUS_STRUCTURAL_INCIDENT_SEEDS[0];

  const promotedSeed: NexusStructuralIncidentSeed = {
    caseCode: promotedSeedCode,
    title: `[본사승인 사례] ${target.incidentTitle}`,
    zoneAxis: target.zoneAxis,
    processAxis: target.processAxis,
    hazardEquipmentAxis: target.hazardEquipmentAxis,
    structuralNodeIndex: target.structuralNodeIndex,
    moduleNodeIndex: '02', // 02 사고사례 데이터 DB
    cycleNodeIndex: baseSeed.cycleNodeIndex,
    hazardMechanism: target.hazardMechanism,
    directCause: finalDirect,
    contributingFactor: finalContrib,
    rootCause: finalRoot,
    preventiveMeasure: finalPreventive,
    preVisitBriefingPoint: `[본사 승인 재발방지 중점] ${finalPreventive}`,
    ceoTrainingPoint: `[본사 사고조사 환류 지시] ${finalDirect} 위험이 확인되면 즉시 작업을 중지하고 ${finalPreventive} 조치를 먼저 완료하십시오.`,
    tradeKeywords: baseSeed.tradeKeywords,
    sourceKind: '골조·형틀 표준 예방 시드 (실제 현장 사고 통계 아님)',
  };

  writeApprovedCustomIncidentSeeds([promotedSeed, ...customSeeds].slice(0, 40));

  const promotedPipelineCase = createNexusPipelineCase(
    {
      siteId: target.siteId,
      locationLabel: `${target.siteName} (${target.sixW.where})`,
      observationNote: `[본사 사고조사 승인 대책 이행] ${target.incidentTitle}`,
      zoneAxis: target.zoneAxis,
      processAxis: target.processAxis,
      hazardEquipmentAxis: target.hazardEquipmentAxis,
      actionTitle: finalPreventive,
      assignee: `${target.sixW.who} 및 현장 안전담당`,
      handoverShift: `본사 승인(${approver}) 재발방지대책 전 현장 교대 인계`,
    },
    nowIso,
  );

  const promotedTrainingCampaign = stageExecutiveTrainingHandoff(promotedSeed, {
    pipelineCase: promotedPipelineCase,
    targetWorkers: approval.targetWorkers ?? 15,
    dispatchImmediately: true,
    nowIso,
  });

  const updatedInvestigations = existing.map(item => {
    if (item.investigationId !== investigationId) return item;
    return {
      ...item,
      directCause: finalDirect,
      contributingFactor: finalContrib,
      rootCause: finalRoot,
      preventiveMeasureDraft: finalPreventive,
      approverLabel: approver,
      approvedAt: nowIso,
      approvalNote: String(approval.approvalNote || '본사 검토·승인 완료 및 전 현장 사례DB·대표이사 교육 전파').trim(),
      promotedSeedCode,
      promotedTrainingCampaignId: promotedTrainingCampaign.campaignId,
      promotedPipelineCaseId: promotedPipelineCase.caseId,
      status: 'hq_approved_propagated' as const,
      updatedAt: nowIso,
    };
  });

  writeAiInvestigations(updatedInvestigations);
  return {
    updatedInvestigations,
    promotedSeed,
    promotedTrainingCampaign,
    promotedPipelineCase,
  };
};

export const requestAiInvestigationRevision = (
  investigationId: string,
  revision: {
    reviewerLabel: string;
    revisionNote: string;
  },
  nowIso = new Date().toISOString(),
): NexusAiInvestigationRecord[] => {
  const existing = readAiInvestigations();
  const target = existing.find(item => item.investigationId === investigationId);
  if (!target) {
    throw new Error('보완 요청할 사고조사 초안을 찾을 수 없습니다.');
  }
  const reviewer = String(revision.reviewerLabel || '').trim() || '본사 CSO·안전보건실장';
  if (reviewer.toLowerCase() === target.authorLabel.trim().toLowerCase()) {
    throw new Error('직무 분리 원칙에 따라 작성자 본인이 보완 요청자를 겸할 수 없습니다.');
  }
  const note =
    String(revision.revisionNote || '').trim() ||
    '현장 작업절차 준수 여부 및 근본원인·재발방지대책의 구체적 실행 기준을 보완하여 재상신 바랍니다.';

  const updated = existing.map(item => {
    if (item.investigationId !== investigationId) return item;
    return {
      ...item,
      status: 'revision_requested' as const,
      revisionReviewerLabel: reviewer,
      revisionNote: note,
      revisionRequestedAt: nowIso,
      updatedAt: nowIso,
    };
  });
  writeAiInvestigations(updated);
  return updated;
};

export const resubmitAiInvestigationRecord = (
  investigationId: string,
  patch: {
    directCause?: string;
    contributingFactor?: string;
    rootCause?: string;
    preventiveMeasureDraft?: string;
    supplementNote?: string;
  },
  nowIso = new Date().toISOString(),
): NexusAiInvestigationRecord[] => {
  const existing = readAiInvestigations();
  const updated = existing.map(item => {
    if (item.investigationId !== investigationId) return item;
    const supp = String(patch.supplementNote || '').trim();
    return {
      ...item,
      directCause: String(patch.directCause || item.directCause).trim(),
      contributingFactor: String(patch.contributingFactor || item.contributingFactor).trim(),
      rootCause: String(patch.rootCause || item.rootCause).trim(),
      preventiveMeasureDraft:
        String(patch.preventiveMeasureDraft || item.preventiveMeasureDraft).trim() +
        (supp ? ` [현장 보완: ${supp}]` : ''),
      status: 'ai_draft_pending_hq' as const,
      updatedAt: nowIso,
    };
  });
  writeAiInvestigations(updated);
  return updated;
};

export interface NexusRoleCommandDigest {
  roleMode: NexusCommandRoleMode;
  siteId: string;
  siteLabel: string;
  openActionsCount: number;
  overdueActionsCount: number;
  handoverPendingCount: number;
  recheckPendingCount: number;
  pendingHqApprovalsCount: number;
  revisionRequestedCount: number;
  activeVisitsCount: number;
  incompleteTrainingCount: number;
  headline: string;
  priorities: readonly {
    id: string;
    badge: string;
    text: string;
    targetTab: 'visit_01' | 'inspect_03_06' | 'investigate_05_02' | 'training_04';
  }[];
}

export const buildRoleCommandDigest = (
  roleMode: NexusCommandRoleMode,
  siteId: string,
  pipelineCases: readonly NexusPipelineCase[],
  visitPlans: readonly NexusHqVisitPlan[],
  investigations: readonly NexusAiInvestigationRecord[],
  trainingCampaigns: readonly NexusExecutiveTrainingCampaign[],
  asOfDate = getKoreanCalendarDay(),
): NexusRoleCommandDigest => {
  const siteObj = NEXUS_SITE_PORTFOLIO.find(s => s.siteId === siteId);
  const siteLabel = siteObj ? siteObj.shortLabel : '전 현장 통합 포트폴리오';

  const scopedCases = pipelineCases.filter(c =>
    matchesScopedSiteRecord(c.siteId, `${c.locationLabel} ${c.observationNote}`, siteId),
  );
  const scopedVisits = visitPlans.filter(v =>
    matchesScopedSiteRecord(v.siteId, `${v.siteName} ${v.purpose}`, siteId),
  );
  const scopedInvs = investigations.filter(i =>
    matchesScopedSiteRecord(i.siteId, `${i.siteName} ${i.incidentTitle} ${i.rawSummary}`, siteId),
  );
  const scopedTraining = siteObj
    ? trainingCampaigns.filter(
      t => t.structuralNodeIndex === siteObj.focusNodeIndex || matchesPortfolioSite(t.title, siteId),
    )
    : trainingCampaigns;

  const openCases = scopedCases.filter(c => c.status !== 'closed');
  const overdueCases = openCases.filter(c => c.dueDate && c.dueDate < asOfDate);
  const handoverPending = openCases.filter(c => c.status === 'handover_pending');
  const recheckPending = openCases.filter(c => c.status === 'recheck_pending');
  const pendingHqApprovals = scopedInvs.filter(i => i.status === 'ai_draft_pending_hq');
  const revisionRequested = scopedInvs.filter(i => i.status === 'revision_requested');
  const activeVisits = scopedVisits.filter(v => v.status !== 'action_issued_closed');
  const incompleteTraining = scopedTraining.filter(t => (t.completionRatePct ?? 0) < 100);

  if (roleMode === 'hq_cso') {
    return {
      roleMode,
      siteId,
      siteLabel,
      openActionsCount: openCases.length,
      overdueActionsCount: overdueCases.length,
      handoverPendingCount: handoverPending.length,
      recheckPendingCount: recheckPending.length,
      pendingHqApprovalsCount: pendingHqApprovals.length,
      revisionRequestedCount: revisionRequested.length,
      activeVisitsCount: activeVisits.length,
      incompleteTrainingCount: incompleteTraining.length,
      headline: `[본사 CSO · 순회점검 지휘 시점] ${siteLabel} — 승인대기 조사 ${pendingHqApprovals.length}건 · 순회점검 ${activeVisits.length}건 · 기한초과 ${overdueCases.length}건`,
      priorities: [
        {
          id: 'hq-p1',
          badge: `05 본사승인 대기 ${pendingHqApprovals.length}건`,
          text: '현장 AI 사고조사 초안의 근본원인·재발방지대책을 검토하여 승인(02 DB·04 교육 편입) 또는 보완지시',
          targetTab: 'investigate_05_02',
        },
        {
          id: 'hq-p2',
          badge: `01 순회점검 ${activeVisits.length}건`,
          text: '방문 전 미결·유사사례 자동 브리핑을 확인하고 현장 순회점검 개시 및 시정조치 지시 발령',
          targetTab: 'visit_01',
        },
        {
          id: 'hq-p3',
          badge: `04 미완료 교육 ${incompleteTraining.length}건`,
          text: '대표이사 12개국어 안전교육 캠페인의 다국적 작업팀 서명 이수율 점검 및 전 현장 전파',
          targetTab: 'training_04',
        },
      ],
    };
  }

  if (roleMode === 'field_manager') {
    return {
      roleMode,
      siteId,
      siteLabel,
      openActionsCount: openCases.length,
      overdueActionsCount: overdueCases.length,
      handoverPendingCount: handoverPending.length,
      recheckPendingCount: recheckPending.length,
      pendingHqApprovalsCount: pendingHqApprovals.length,
      revisionRequestedCount: revisionRequested.length,
      activeVisitsCount: activeVisits.length,
      incompleteTrainingCount: incompleteTraining.length,
      headline: `[현장 안전관리자 실행 시점] ${siteLabel} — 미결·인계 조치 ${openCases.length}건 · 재점검 대기 ${recheckPending.length}건 · 본사 보완요청 ${revisionRequested.length}건`,
      priorities: [
        {
          id: 'field-p1',
          badge: `03·06 현장 미결 ${openCases.length}건 (인계 ${handoverPending.length}·재점검 ${recheckPending.length})`,
          text: '30초 원탭 프리셋으로 골조·형틀 위험을 즉시 등록하고 조치 증빙·교대 인계·재점검 종결 처리',
          targetTab: 'inspect_03_06',
        },
        {
          id: 'field-p2',
          badge: `05 보완요청 ${revisionRequested.length}건 · 아차사고 보고`,
          text: '본사 보완요청 사고조사를 즉시 보강하여 재상신하거나 현장 아차사고를 6하원칙으로 상신',
          targetTab: 'investigate_05_02',
        },
        {
          id: 'field-p3',
          badge: `04 외국인팀 서명대기 ${incompleteTraining.length}건`,
          text: '본사·대표이사 하달 12개국어 안전교육을 현장 외국인 작업팀에 음성 안내하고 모바일 서명 수집',
          targetTab: 'training_04',
        },
      ],
    };
  }

  return {
    roleMode: 'unified',
    siteId,
    siteLabel,
    openActionsCount: openCases.length,
    overdueActionsCount: overdueCases.length,
    handoverPendingCount: handoverPending.length,
    recheckPendingCount: recheckPending.length,
    pendingHqApprovalsCount: pendingHqApprovals.length,
    revisionRequestedCount: revisionRequested.length,
    activeVisitsCount: activeVisits.length,
    incompleteTrainingCount: incompleteTraining.length,
    headline: `[본사·현장 통합 폐루프 지휘] ${siteLabel} — 현장 미결 ${openCases.length}건 · 본사 순회 ${activeVisits.length}건 · 승인대기 ${pendingHqApprovals.length}건 · 교육 미이수 ${incompleteTraining.length}건`,
    priorities: [
      {
        id: 'uni-p1',
        badge: `03·06 현장 조치·인계 ${openCases.length}건`,
        text: '현장 30초 사진점검 · 3축 자동분류 · 교대 인계 · 재점검 종결 루프',
        targetTab: 'inspect_03_06',
      },
      {
        id: 'uni-p2',
        badge: `01 본사 순회점검 ${activeVisits.length}건`,
        text: '본사 행선지 사전 위험브리핑 · 현장 점검 개시 · 시정조치 지시 환류',
        targetTab: 'visit_01',
      },
      {
        id: 'uni-p3',
        badge: `05 사고조사 승인대기 ${pendingHqApprovals.length}건`,
        text: 'AI 6하원칙 원인분석 · 본사 검토/승인/보완지시 · 02 사례DB & 04 교육 자동 편입',
        targetTab: 'investigate_05_02',
      },
    ],
  };
};

export interface NexusSitePortfolioScorecard {
  siteId: string;
  siteName: string;
  shortLabel: string;
  focusNodeIndex: string;
  focusZone: NexusZoneAxis;
  openActionsCount: number;
  overdueActionsCount: number;
  handoverPendingCount: number;
  activeVisitsCount: number;
  pendingApprovalsCount: number;
  revisionRequestedCount: number;
  avgTrainingCompletionPct: number | null;
  urgencyLevel: 'critical' | 'watch' | 'stable';
  urgencyLabel: string;
}

export const buildMultiSitePortfolioMatrix = (
  pipelineCases: readonly NexusPipelineCase[],
  visitPlans: readonly NexusHqVisitPlan[],
  investigations: readonly NexusAiInvestigationRecord[],
  trainingCampaigns: readonly NexusExecutiveTrainingCampaign[],
  asOfDate = getKoreanCalendarDay(),
): readonly NexusSitePortfolioScorecard[] =>
  NEXUS_SITE_PORTFOLIO.map(site => {
    const cases = pipelineCases.filter(c =>
      matchesScopedSiteRecord(c.siteId, `${c.locationLabel} ${c.observationNote}`, site.siteId),
    );
    const visits = visitPlans.filter(v =>
      matchesScopedSiteRecord(v.siteId, `${v.siteName} ${v.purpose}`, site.siteId),
    );
    const invs = investigations.filter(i =>
      matchesScopedSiteRecord(i.siteId, `${i.siteName} ${i.incidentTitle} ${i.rawSummary}`, site.siteId),
    );
    const trainings = trainingCampaigns.filter(
      t => t.structuralNodeIndex === site.focusNodeIndex || matchesPortfolioSite(t.title, site.siteId),
    );

    const openCases = cases.filter(c => c.status !== 'closed');
    const overdueCases = openCases.filter(c => c.dueDate && c.dueDate < asOfDate);
    const handoverPending = openCases.filter(c => c.status === 'handover_pending');
    const activeVisits = visits.filter(v => v.status !== 'action_issued_closed');
    const pendingApprovals = invs.filter(i => i.status === 'ai_draft_pending_hq');
    const revisionRequested = invs.filter(i => i.status === 'revision_requested');

    const validRates = trainings
      .map(t => t.completionRatePct)
      .filter((r): r is number => typeof r === 'number' && Number.isFinite(r));
    const avgTrainingCompletionPct = validRates.length
      ? Math.round(validRates.reduce((a, b) => a + b, 0) / validRates.length)
      : null;

    const riskScore =
      overdueCases.length * 3 +
      pendingApprovals.length * 2 +
      revisionRequested.length * 2 +
      openCases.length;
    const urgencyLevel: 'critical' | 'watch' | 'stable' =
      riskScore >= 3 ? 'critical' : riskScore >= 1 ? 'watch' : 'stable';
    const urgencyLabel =
      urgencyLevel === 'critical'
        ? '집중 지휘 필요'
        : urgencyLevel === 'watch'
          ? '현장 조치·관찰 중'
          : '안정 폐루프 유지';

    return {
      siteId: site.siteId,
      siteName: site.siteName,
      shortLabel: site.shortLabel,
      focusNodeIndex: site.focusNodeIndex,
      focusZone: site.focusZone,
      openActionsCount: openCases.length,
      overdueActionsCount: overdueCases.length,
      handoverPendingCount: handoverPending.length,
      activeVisitsCount: activeVisits.length,
      pendingApprovalsCount: pendingApprovals.length,
      revisionRequestedCount: revisionRequested.length,
      avgTrainingCompletionPct,
      urgencyLevel,
      urgencyLabel,
    };
  });

export const seedMultiSiteOperationalSimulation = (
  nowIso = new Date().toISOString(),
): {
  cases: NexusPipelineCase[];
  visits: NexusHqVisitPlan[];
  investigations: NexusAiInvestigationRecord[];
  campaigns: NexusExecutiveTrainingCampaign[];
  equipmentReports: NexusEquipmentPhotoSubmission[];
} => {
  // 1. Create 3 realistic pipeline cases across Site 1 (Substructure RC), Site 2 (Gangform), Site 3 (System Shoring)
  const case1 = createNexusPipelineCase(
    {
      siteId: 'SITE-01-SUBRC',
      locationLabel: '제1현장 지하 2층 북측 합벽 구간',
      observationNote: '지하 2층 외벽 합벽 거푸집 타이볼트 간격 미흡 및 피트 개구부 덮개 고정 볼트 누락',
      zoneAxis: 'substructure_rc',
      processAxis: 'formwork_general',
      hazardEquipmentAxis: 'confined_earth_pressure',
      assignee: '제1현장 지하RC 형틀반장',
      handoverShift: '주간→야간 지하RC 합벽팀 인계',
    },
    nowIso,
  );
  const case2 = createNexusPipelineCase(
    {
      siteId: 'SITE-02-GANGFORM',
      locationLabel: '제2현장 103동 15층 외벽 갱폼 구간',
      observationNote: '15층 외벽 갱폼 인상 작업 전 타워크레인 샤클 장력 미확인 상태에서 고정 앵커 선해체 위험',
      zoneAxis: 'superstructure_std',
      processAxis: 'gangform',
      hazardEquipmentAxis: 'tower_crane_rigging',
      assignee: '제2현장 갱폼인양 팀장',
      handoverShift: '인양 신호수·크레인 기사 교차 인계',
    },
    nowIso,
  );
  const case3 = createNexusPipelineCase(
    {
      siteId: 'SITE-03-SHORING',
      locationLabel: '제3현장 전이층 고층고 슬래브 하부',
      observationNote: '전이층 시스템동바리 수평연결재 핀 잠금 누락 및 상부 U헤드 편심 보강 필요',
      zoneAxis: 'rooftop_special',
      processAxis: 'formwork_general',
      hazardEquipmentAxis: 'system_shoring',
      assignee: '제3현장 가설·동바리 안전담당',
      handoverShift: '타설 전 동바리 감시팀 인계',
    },
    nowIso,
  );

  // 2. Create 2 HQ Visit Plans (Site 1 in_field_inspection, Site 3 scheduled_briefed)
  const visit1 = createHqVisitPlan(
    {
      siteId: 'SITE-01-SUBRC',
      inspectorRole: '본사 CSO·안전보건실 순회점검단',
      siteName: '제1현장 지하 2층 RC구간',
      purpose: '지하 외벽 합벽 거푸집 측압·부력 대응 및 밀폐 피트 환기·개구부 방호 특별점검',
      zoneAxis: 'substructure_rc',
      processAxis: 'formwork_general',
      hazardEquipmentAxis: 'confined_earth_pressure',
    },
    [case1, case2, case3],
    nowIso,
  );
  startHqFieldInspection(
    visit1.visitId,
    '현장 도착 완료 · 지하 2층 북측 합벽 타이볼트 체결 간격 및 개구부 잠금 상태 대조 점검 중',
    nowIso,
  );
  const visit2 = createHqVisitPlan(
    {
      siteId: 'SITE-03-SHORING',
      inspectorRole: '본사 구조·가설 기술지원팀장',
      siteName: '제3현장 전이층 시스템동바리',
      purpose: '전이층 슬래브 콘크리트 타설 전 시스템동바리 조립도 대조 및 가새·U헤드 편심 점검',
      zoneAxis: 'rooftop_special',
      processAxis: 'concrete_pour',
      hazardEquipmentAxis: 'system_shoring',
    },
    [case1, case2, case3],
    nowIso,
  );

  // 3. Create 2 AI Root-Cause Investigations (Site 2 pending HQ approval, Site 1 revision requested)
  const inv1 = submitAiInvestigationRecord(
    {
      siteId: 'SITE-02-GANGFORM',
      siteName: '제2현장 103동 15층 갱폼',
      incidentTitle: '[제2현장 15F 갱폼] 타워크레인 인양고리 체결 전 앵커볼트 선해체 아차사고',
      rawSummary: '103동 15층 외벽 갱폼 인상 준비 중 무전 신호 혼선으로 인양 샤클 장력 확보 전 앵커볼트 2개소 선해체',
      authorLabel: '제2현장 안전관리자 이현장',
      zoneAxis: 'superstructure_std',
      processAxis: 'gangform',
      hazardEquipmentAxis: 'tower_crane_rigging',
    },
    nowIso,
  );
  const inv2 = submitAiInvestigationRecord(
    {
      siteId: 'SITE-01-SUBRC',
      siteName: '제1현장 지하 2층 RC구간',
      incidentTitle: '[제1현장 B2 합벽] 지하외벽 합벽 타설 중 타이볼트 이완·배부름 변형 아차사고',
      rawSummary: '지하 2층 북측 외벽 콘크리트 타설 중 하부 폼타이·타이볼트 간격 미준수로 국부 배부름 감지 후 타설 즉시 일시중지',
      authorLabel: '제1현장 안전관리자 김안전',
      zoneAxis: 'substructure_rc',
      processAxis: 'concrete_pour',
      hazardEquipmentAxis: 'confined_earth_pressure',
    },
    nowIso,
  );
  requestAiInvestigationRevision(
    inv2.investigationId,
    {
      reviewerLabel: '본사 CSO·안전보건실장',
      revisionNote: '타설 속도(m/hr) 제한 기준과 하부 동바리·합벽 변위 감시자 전담 배치 절차를 구체적으로 명시하여 재상신 바랍니다.',
    },
    nowIso,
  );

  // 4. Create 12-Language Executive Safety Training Campaign for Site 1 Substructure RC
  const campaign1 = stageExecutiveTrainingHandoff('RC-SUB-01', {
    pipelineCase: case1,
    targetWorkers: 16,
    dispatchImmediately: true,
    nowIso,
  });

  // 5. Seed Construction Equipment Pre-Use Photo Reports across 3 sites
  const equipmentReports = seedEquipmentPhotoSimulation(nowIso);

  return {
    cases: readNexusPipelineCases(),
    visits: readHqVisitPlans(),
    investigations: readAiInvestigations(),
    campaigns: [campaign1, ...readExecutiveTrainingCampaigns().filter(c => c.campaignId !== campaign1.campaignId)],
    equipmentReports,
  };
};

export interface NexusHqLoopNodeSummary {
  nodeIndex: string;
  visitCount: number;
  pendingBriefingVisits: number;
  investigationCount: number;
  pendingHqApprovals: number;
  approvedPropagatedCount: number;
}

export const summarizeHqLoopForOrbitLayer = (
  layer: NexusOrbitLayer,
  visits: readonly NexusHqVisitPlan[],
  investigations: readonly NexusAiInvestigationRecord[],
): readonly NexusHqLoopNodeSummary[] => {
  const count = layer === 'cycle' ? 5 : layer === 'modules' ? 6 : 10;
  return Array.from({ length: count }, (_, idx) => {
    const nodeIndex = String(idx + 1).padStart(2, '0');
    const matchedVisits = visits.filter(v => {
      if (layer === 'structural') return v.structuralNodeIndex === nodeIndex;
      if (layer === 'modules') return nodeIndex === '01' || nodeIndex === '06';
      return nodeIndex === '01' || nodeIndex === '04';
    });
    const matchedInvs = investigations.filter(inv => {
      if (layer === 'structural') return inv.structuralNodeIndex === nodeIndex;
      if (layer === 'modules') return nodeIndex === '05' || nodeIndex === '02' || nodeIndex === '04';
      return nodeIndex === '02' || nodeIndex === '05';
    });

    return {
      nodeIndex,
      visitCount: matchedVisits.length,
      pendingBriefingVisits: matchedVisits.filter(v => v.status !== 'action_issued_closed').length,
      investigationCount: matchedInvs.length,
      pendingHqApprovals: matchedInvs.filter(inv => inv.status === 'ai_draft_pending_hq').length,
      approvedPropagatedCount: matchedInvs.filter(inv => inv.status === 'hq_approved_propagated').length,
    };
  });
};

import React, { useMemo, useState } from 'react';
import { getKoreanCalendarDay } from '../../utils/monthlyFieldFollowup';
import {
  NEXUS_EQUIPMENT_PHOTO_STATUS_LABELS,
  NEXUS_EQUIPMENT_TYPE_OPTIONS,
  compileExecutivePhotoBriefingPack,
  compressImageFileToDataUrl,
  reviewEquipmentPhotoByHq,
  submitEquipmentPhotoReport,
  type NexusEquipmentPhotoSubmission,
  type NexusEquipmentType,
  type NexusExecutivePhotoBriefingPack,
} from '../../utils/nexusEquipmentPhotoReport';
import {
  type NexusExecutiveTrainingCampaign,
  stageExecutiveTrainingHandoff,
} from '../../utils/nexusExecutiveTrainingPipeline';
import {
  NEXUS_INVESTIGATION_STATUS_LABELS,
  NEXUS_SITE_PORTFOLIO,
  NEXUS_VISIT_STATUS_LABELS,
  approveAiInvestigationAndPropagate,
  buildAiInvestigationDraft,
  buildMultiSitePortfolioMatrix,
  buildPreVisitBriefing,
  buildRoleCommandDigest,
  completeHqVisitWithFieldAction,
  createHqVisitPlan,
  matchesPortfolioSite,
  requestAiInvestigationRevision,
  resubmitAiInvestigationRecord,
  seedMultiSiteOperationalSimulation,
  startHqFieldInspection,
  submitAiInvestigationRecord,
  type NexusAiInvestigationRecord,
  type NexusCommandRoleMode,
  type NexusHqVisitPlan,
} from '../../utils/nexusHqCommandLoop';
import type { NexusPipelineCase } from '../../utils/nexusQuickPipeline';
import {
  NEXUS_HAZARD_EQUIPMENT_AXIS_OPTIONS,
  NEXUS_PROCESS_AXIS_OPTIONS,
  NEXUS_STRUCTURAL_INCIDENT_SEEDS,
  NEXUS_ZONE_AXIS_OPTIONS,
  type NexusHazardEquipmentAxis,
  type NexusProcessAxis,
  type NexusStructuralIncidentSeed,
  type NexusZoneAxis,
} from '../../utils/nexusStructuralTaxonomy';
import { InspectorNexus3AxisBridge } from './InspectorNexus3AxisBridge';
import { NexusExecutiveTrainingBridge } from './NexusExecutiveTrainingBridge';

export type NexusWorkbenchTab =
  | 'visit_01'
  | 'inspect_03_06'
  | 'equipment_photo'
  | 'investigate_05_02'
  | 'training_04';

interface Props {
  activeTab: NexusWorkbenchTab;
  onTabChange: (tab: NexusWorkbenchTab) => void;
  activeSeed?: NexusStructuralIncidentSeed;
  pipelineCases: readonly NexusPipelineCase[];
  onPipelineCreated: (created: NexusPipelineCase) => void;
  onPipelineUpdated: (updated: NexusPipelineCase[]) => void;
  trainingCampaigns: readonly NexusExecutiveTrainingCampaign[];
  onTrainingCampaignsChange: (next: NexusExecutiveTrainingCampaign[]) => void;
  onOpenAdminTraining: () => void;
  visitPlans: readonly NexusHqVisitPlan[];
  onVisitPlansChange: (next: NexusHqVisitPlan[]) => void;
  investigations: readonly NexusAiInvestigationRecord[];
  onInvestigationsChange: (next: NexusAiInvestigationRecord[]) => void;
  equipmentReports: readonly NexusEquipmentPhotoSubmission[];
  onEquipmentReportsChange: (next: NexusEquipmentPhotoSubmission[]) => void;
  selectedSiteId?: string;
  onSelectedSiteIdChange?: (siteId: string) => void;
  onLockOntoStructuralNode: (structuralNodeIndex: string) => void;
}

export const NexusHqCommandWorkbench: React.FC<Props> = ({
  activeTab,
  onTabChange,
  activeSeed,
  pipelineCases,
  onPipelineCreated,
  onPipelineUpdated,
  trainingCampaigns,
  onTrainingCampaignsChange,
  onOpenAdminTraining,
  visitPlans,
  onVisitPlansChange,
  investigations,
  onInvestigationsChange,
  equipmentReports,
  onEquipmentReportsChange,
  selectedSiteId: controlledSiteId,
  onSelectedSiteIdChange,
  onLockOntoStructuralNode,
}) => {
  // Role Perspective (통합 / 본사 CSO·순회점검 / 현장 안전관리자) & Multi-Site Portfolio Filter
  const [roleMode, setRoleMode] = useState<NexusCommandRoleMode>('unified');
  const [localSiteId, setLocalSiteId] = useState<string>('');
  const selectedSiteId = controlledSiteId !== undefined ? controlledSiteId : localSiteId;
  const setSelectedSiteId = (nextSiteId: string) => {
    setLocalSiteId(nextSiteId);
    onSelectedSiteIdChange?.(nextSiteId);
  };

  // 01 행선지·순회점검 state
  const [visitDate, setVisitDate] = useState(() => getKoreanCalendarDay());
  const [inspectorRole, setInspectorRole] = useState('본사 안전보건팀 순회점검자');
  const [visitSiteName, setVisitSiteName] = useState('');
  const [visitPurpose, setVisitPurpose] = useState('');
  const [visitZone, setVisitZone] = useState<NexusZoneAxis | ''>('');
  const [visitProcess, setVisitProcess] = useState<NexusProcessAxis | ''>('');
  const [visitEquip, setVisitEquip] = useState<NexusHazardEquipmentAxis | ''>('');
  const [visitNotice, setVisitNotice] = useState('');
  const [visitDirectiveNotes, setVisitDirectiveNotes] = useState<Record<string, string>>({});

  // 05 AI 사고조사·원인분석 state
  const [invSiteName, setInvSiteName] = useState('');
  const [invTitle, setInvTitle] = useState('');
  const [invSummary, setInvSummary] = useState('');
  const [invAuthor, setInvAuthor] = useState('현장 안전관리자');
  const [invApprover, setInvApprover] = useState('본사 CSO·안전보건실장');
  const [invZone, setInvZone] = useState<NexusZoneAxis | ''>('');
  const [invProcess, setInvProcess] = useState<NexusProcessAxis | ''>('');
  const [invEquip, setInvEquip] = useState<NexusHazardEquipmentAxis | ''>('');
  const [invNotice, setInvNotice] = useState('');
  const [invError, setInvError] = useState('');
  const [invReviewNotes, setInvReviewNotes] = useState<Record<string, string>>({});
  const [invPreventiveEdits, setInvPreventiveEdits] = useState<Record<string, string>>({});

  // 건설기계 사용전 점검 사진 -> 본사 검토 -> 대표이사·경영진 보고 state
  const [eqSiteId, setEqSiteId] = useState<string>('SITE-01-SUBRC');
  const [eqType, setEqType] = useState<NexusEquipmentType>('concrete_pump_car');
  const [eqWorkActivity, setEqWorkActivity] = useState('');
  const [eqChecklistNote, setEqChecklistNote] = useState('');
  const [eqUploadedBy, setEqUploadedBy] = useState('현장 안전관리자');
  const [eqPhotoName, setEqPhotoName] = useState('');
  const [eqPhotoUrl, setEqPhotoUrl] = useState('');
  const [eqReviewer, setEqReviewer] = useState('본사 안전보건실장 (CSO 보고)');
  const [eqReviewNotesById, setEqReviewNotesById] = useState<Record<string, string>>({});
  const [eqNotice, setEqNotice] = useState('');
  const [eqError, setEqError] = useState('');
  const [latestExecutivePack, setLatestExecutivePack] = useState<NexusExecutivePhotoBriefingPack | null>(null);

  const roleDigest = useMemo(
    () =>
      buildRoleCommandDigest(
        roleMode,
        selectedSiteId,
        pipelineCases,
        visitPlans,
        investigations,
        trainingCampaigns,
      ),
    [roleMode, selectedSiteId, pipelineCases, visitPlans, investigations, trainingCampaigns],
  );

  const siteMatrix = useMemo(
    () =>
      buildMultiSitePortfolioMatrix(
        pipelineCases,
        visitPlans,
        investigations,
        trainingCampaigns,
      ),
    [pipelineCases, visitPlans, investigations, trainingCampaigns],
  );

  const handleLoadMultiSiteSimulation = () => {
    const seeded = seedMultiSiteOperationalSimulation();
    onPipelineUpdated([...seeded.cases]);
    onVisitPlansChange([...seeded.visits]);
    onInvestigationsChange([...seeded.investigations]);
    onTrainingCampaignsChange([...seeded.campaigns]);
    onEquipmentReportsChange([...seeded.equipmentReports]);
    onLockOntoStructuralNode('01');
  };

  const scopedPipelineCases = useMemo(
    () =>
      pipelineCases.filter(c =>
        matchesPortfolioSite(`${c.locationLabel} ${c.observationNote}`, selectedSiteId),
      ),
    [pipelineCases, selectedSiteId],
  );
  const scopedVisitPlans = useMemo(
    () => visitPlans.filter(v => matchesPortfolioSite(`${v.siteName} ${v.purpose}`, selectedSiteId)),
    [visitPlans, selectedSiteId],
  );
  const scopedInvestigations = useMemo(
    () =>
      investigations.filter(i =>
        matchesPortfolioSite(`${i.siteName} ${i.incidentTitle} ${i.rawSummary}`, selectedSiteId),
      ),
    [investigations, selectedSiteId],
  );
  const scopedEquipmentReports = useMemo(
    () =>
      equipmentReports.filter(
        eq =>
          !selectedSiteId ||
          eq.siteId === selectedSiteId ||
          matchesPortfolioSite(`${eq.siteName} ${eq.workActivity}`, selectedSiteId),
      ),
    [equipmentReports, selectedSiteId],
  );

  const selectedEquipMeta = useMemo(
    () => NEXUS_EQUIPMENT_TYPE_OPTIONS.find(o => o.id === eqType) ?? NEXUS_EQUIPMENT_TYPE_OPTIONS[0],
    [eqType],
  );

  const handleEquipPhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEqPhotoName(file.name);
    const dataUrl = await compressImageFileToDataUrl(file);
    setEqPhotoUrl(dataUrl);
  };

  const handleSubmitEquipmentPhoto = () => {
    setEqError('');
    const siteMeta = NEXUS_SITE_PORTFOLIO.find(s => s.siteId === eqSiteId) ?? NEXUS_SITE_PORTFOLIO[0];
    const created = submitEquipmentPhotoReport({
      siteId: siteMeta.siteId,
      siteName: siteMeta.siteName,
      equipmentType: eqType,
      workActivity: eqWorkActivity.trim() || `${siteMeta.shortLabel} ${selectedEquipMeta.label} 사용전 안전점검`,
      inspectionPointSummary: eqChecklistNote.trim() || selectedEquipMeta.defaultChecklist,
      photoName: eqPhotoName || undefined,
      photoDataUrl: eqPhotoUrl || undefined,
      uploadedBy: eqUploadedBy.trim() || '현장 안전관리자',
    });
    onEquipmentReportsChange([
      created,
      ...equipmentReports.filter(e => e.submissionId !== created.submissionId),
    ]);
    onLockOntoStructuralNode(created.structuralNodeIndex);
    setEqNotice(
      `[사용전 점검 사진 전송 완료] ${created.siteName} · ${created.equipmentLabel} 사진이 본사 안전보건실 검토대기함으로 등록되었습니다 (구체 #${created.structuralNodeIndex}).`,
    );
    setEqWorkActivity('');
    setEqChecklistNote('');
    setEqPhotoName('');
    setEqPhotoUrl('');
  };

  const handleReviewEquipmentPhoto = (
    item: NexusEquipmentPhotoSubmission,
    decision: 'hq_verified_for_ceo' | 'revision_requested_hq',
  ) => {
    setEqError('');
    try {
      const updated = reviewEquipmentPhotoByHq(item.submissionId, {
        decision,
        reviewerLabel: eqReviewer.trim() || '본사 안전보건실장 (CSO 보고)',
        reviewNote: eqReviewNotesById[item.submissionId],
      });
      onEquipmentReportsChange([...updated]);
      setEqNotice(
        decision === 'hq_verified_for_ceo'
          ? `[본사 적합 확인] ${item.siteName} · ${item.equipmentLabel} 사진이 대표이사·경영진 보고 대상에 편입되었습니다.`
          : `[보완 요청 발령] ${item.siteName} · ${item.equipmentLabel} 점검 사진 보완을 현장에 요청했습니다.`,
      );
    } catch (err) {
      setEqError(err instanceof Error ? err.message : '본사 사진 검토 중 확인이 필요합니다.');
    }
  };

  const handleCompileExecutivePhotoPack = () => {
    setEqError('');
    try {
      const readyIds = scopedEquipmentReports
        .filter(e => e.status === 'hq_verified_for_ceo' || e.status === 'reported_to_ceo')
        .map(e => e.submissionId);
      const pack = compileExecutivePhotoBriefingPack(readyIds, {
        reporterLabel: eqReviewer.trim() || '본사 안전보건실장 (CSO 보고)',
        ceoAudienceLabel: '대표이사 · 경영진 일일 안전보고',
      });
      setLatestExecutivePack(pack);
      onEquipmentReportsChange([
        ...equipmentReports.map(item => pack.submissions.find(s => s.submissionId === item.submissionId) || item),
      ]);
      setEqNotice(
        `[대표이사·경영진 보고 완료] ${pack.packId} (${pack.siteCoverageCount}개 현장 · ${pack.totalPhotos}건 사진 보고서) 발행 완료!`,
      );
    } catch (err) {
      setEqError(err instanceof Error ? err.message : '경영진 보고서 발행 중 확인이 필요합니다.');
    }
  };

  const handleCopyExecutiveBriefingText = async () => {
    if (!latestExecutivePack) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(latestExecutivePack.summaryText);
      }
      setEqNotice(`[${latestExecutivePack.packId}] 대표이사·경영진 보고 요약문이 클립보드에 복사되었습니다.`);
    } catch {
      setEqNotice('아래 1장 보고서 미리보기에서 텍스트를 선택해 복사해 주세요.');
    }
  };

  const handleDownloadExecutivePhotoCsv = () => {
    if (!latestExecutivePack) return;
    try {
      const blob = new Blob([latestExecutivePack.csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${latestExecutivePack.packId}-건설기계점검보고.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setEqNotice(`${latestExecutivePack.packId} 엑셀(CSV) 대시보드 파일을 다운로드했습니다.`);
    } catch {
      setEqError('파일 다운로드를 시작하지 못했습니다.');
    }
  };

  const handleSelectPortfolioSite = (siteId: string) => {
    setSelectedSiteId(siteId);
    const found = NEXUS_SITE_PORTFOLIO.find(s => s.siteId === siteId);
    if (found) {
      setVisitSiteName(found.siteName);
      setInvSiteName(found.siteName);
      onLockOntoStructuralNode(found.focusNodeIndex);
    }
  };

  const handleSwitchRoleMode = (nextRole: NexusCommandRoleMode) => {
    setRoleMode(nextRole);
    if (nextRole === 'hq_cso') {
      if (activeTab === 'inspect_03_06') {
        onTabChange(investigations.some(i => i.status === 'ai_draft_pending_hq') ? 'investigate_05_02' : 'visit_01');
      }
    } else if (nextRole === 'field_manager') {
      onTabChange('inspect_03_06');
    }
  };

  const livePreVisitPreview = useMemo(
    () =>
      buildPreVisitBriefing(
        {
          siteName: visitSiteName,
          purpose: visitPurpose || activeSeed?.preVisitBriefingPoint || '',
          zoneAxis: visitZone,
          processAxis: visitProcess,
          hazardEquipmentAxis: visitEquip,
        },
        pipelineCases,
      ),
    [visitSiteName, visitPurpose, activeSeed, visitZone, visitProcess, visitEquip, pipelineCases],
  );

  const liveInvestigationPreview = useMemo(
    () =>
      buildAiInvestigationDraft({
        siteName: invSiteName || '골조·형틀 현장',
        incidentTitle: invTitle,
        rawSummary: invSummary || activeSeed?.title || '',
        authorLabel: invAuthor,
        zoneAxis: invZone,
        processAxis: invProcess,
        hazardEquipmentAxis: invEquip,
      }),
    [invSiteName, invTitle, invSummary, activeSeed, invAuthor, invZone, invProcess, invEquip],
  );

  const handleCreateVisitPlan = () => {
    const plan = createHqVisitPlan(
      {
        visitDate,
        inspectorRole,
        siteName: visitSiteName.trim() || '제1현장 골조·형틀 중점구간',
        purpose: visitPurpose.trim() || livePreVisitPreview.classification.primarySeed.preVisitBriefingPoint,
        zoneAxis: visitZone,
        processAxis: visitProcess,
        hazardEquipmentAxis: visitEquip,
      },
      pipelineCases,
    );
    onVisitPlansChange([plan, ...visitPlans.filter(v => v.visitId !== plan.visitId)]);
    onLockOntoStructuralNode(plan.structuralNodeIndex);
    setVisitNotice(
      `[01 행선지·순회점검] ${plan.siteName} 방문 일정과 사전 위험 브리핑(미결 ${plan.preVisitBriefing.openPipelineActionsCount}건·시드 ${plan.preVisitBriefing.matchedCaseCode})이 구체 #${plan.structuralNodeIndex}에 등록되었습니다.`,
    );
    setVisitSiteName('');
    setVisitPurpose('');
  };

  const handleStartVisitInspection = (plan: NexusHqVisitPlan) => {
    const note = visitDirectiveNotes[plan.visitId]?.trim();
    const updated = startHqFieldInspection(plan.visitId, note);
    onVisitPlansChange([...updated]);
    onLockOntoStructuralNode(plan.structuralNodeIndex);
    setVisitNotice(
      `[${plan.siteName}] 현장 순회점검이 개시되었습니다. 사전 브리핑 위험요인과 현장 상태를 대조한 뒤 시정조치·인계를 발령하세요.`,
    );
  };

  const handleCompleteVisitWithAction = (plan: NexusHqVisitPlan, dispatchEmergencyTraining = false) => {
    const customDirective = visitDirectiveNotes[plan.visitId]?.trim();
    const { updatedPlans, createdPipelineCase, createdTrainingCampaign } = completeHqVisitWithFieldAction(
      plan.visitId,
      customDirective ||
        `[본사 순회점검 결과] ${plan.siteName} · ${plan.purpose} 현장 확인 및 시정조치·인계 발령`,
      new Date().toISOString(),
      { dispatchEmergencyTraining, targetWorkers: 15 },
    );
    onVisitPlansChange([...updatedPlans]);
    if (createdPipelineCase) {
      onPipelineCreated(createdPipelineCase);
    }
    if (createdTrainingCampaign) {
      onTrainingCampaignsChange([
        createdTrainingCampaign,
        ...trainingCampaigns.filter(c => c.campaignId !== createdTrainingCampaign.campaignId),
      ]);
    }
    setVisitNotice(
      dispatchEmergencyTraining
        ? `[${plan.siteName}] 순회점검 결과가 06 조치·재점검·인계 및 04 대표이사 12개국어 특별안전교육으로 동시 환류되었습니다.`
        : `[${plan.siteName}] 순회점검 결과가 06 조치·재점검·인계 파이프라인으로 즉시 환류되었습니다.`,
    );
  };

  const handleRequestInvestigationRevision = (inv: NexusAiInvestigationRecord) => {
    setInvError('');
    try {
      const note =
        invReviewNotes[inv.investigationId]?.trim() ||
        '근본원인(작업절차·구조검토) 및 현장 재발방지대책의 구체적 실행 기준을 보완하여 재상신 바랍니다.';
      const updated = requestAiInvestigationRevision(inv.investigationId, {
        reviewerLabel: invApprover.trim() || '본사 CSO·안전보건실장',
        revisionNote: note,
      });
      onInvestigationsChange([...updated]);
      setInvNotice(
        `[본사 보완 요청 발령] ${inv.siteName} (${inv.matchedReferenceCode}) 사고조사 초안에 대해 현장 안전관리자 보완 지시가 전달되었습니다.`,
      );
    } catch (err) {
      setInvError(err instanceof Error ? err.message : '보완 요청 처리 중 확인이 필요합니다.');
    }
  };

  const handleResubmitInvestigation = (inv: NexusAiInvestigationRecord) => {
    setInvError('');
    const updated = resubmitAiInvestigationRecord(inv.investigationId, {
      preventiveMeasureDraft: invPreventiveEdits[inv.investigationId] || inv.preventiveMeasureDraft,
      supplementNote:
        invReviewNotes[inv.investigationId]?.trim() ||
        '본사 지적사항 반영: 작업 전 인양·지지체 구조 안전성 확인 및 신호수·감시자 배치 절차 보강 완료',
    });
    onInvestigationsChange([...updated]);
    setInvNotice(
      `[현장 보완 완료 · 본사 재상신] ${inv.siteName} (${inv.matchedReferenceCode}) 보완 내역이 반영되어 본사 승인 대기 상태로 전환되었습니다.`,
    );
  };

  const handleEscalateCaseToInvestigation = (item: NexusPipelineCase) => {
    const created = submitAiInvestigationRecord({
      siteName: item.locationLabel,
      incidentTitle: `[현장 에스컬레이션] ${item.locationLabel} · ${item.matchedCaseCode} 중대 위험·아차사고 원인조사`,
      rawSummary: `${item.observationNote} (초기 조치: ${item.actionTitle})`,
      authorLabel: item.assignee || '현장 안전관리자',
      zoneAxis: item.zoneAxis,
      processAxis: item.processAxis,
      hazardEquipmentAxis: item.hazardEquipmentAxis,
    });
    onInvestigationsChange([created, ...investigations.filter(i => i.investigationId !== created.investigationId)]);
    onLockOntoStructuralNode(created.structuralNodeIndex);
    onTabChange('investigate_05_02');
    setInvNotice(
      `[03→05 원클릭 에스컬레이션] 현장 점검 건(${item.matchedCaseCode})이 6하원칙·3단계 원인분석 초안으로 자동 변환되어 본사 승인 대기에 등록되었습니다.`,
    );
  };

  const handleDispatchTrainingFromCase = (item: NexusPipelineCase) => {
    const seed =
      NEXUS_STRUCTURAL_INCIDENT_SEEDS.find(s => s.caseCode === item.matchedCaseCode) ??
      activeSeed ??
      NEXUS_STRUCTURAL_INCIDENT_SEEDS[0];
    const created = stageExecutiveTrainingHandoff(seed, {
      pipelineCase: item,
      targetWorkers: 12,
      dispatchImmediately: true,
    });
    onTrainingCampaignsChange([created, ...trainingCampaigns.filter(c => c.campaignId !== created.campaignId)]);
    onLockOntoStructuralNode(item.structuralNodeIndex);
    onTabChange('training_04');
  };

  const handleCreateAiInvestigation = () => {
    setInvError('');
    const created = submitAiInvestigationRecord({
      siteName: invSiteName.trim() || '제1현장 골조·형틀 구간',
      incidentTitle: invTitle.trim(),
      rawSummary: invSummary.trim() || `${liveInvestigationPreview.sixW.where} ${liveInvestigationPreview.hazardMechanism} 아차사고`,
      authorLabel: invAuthor.trim() || '현장 안전관리자',
      zoneAxis: invZone,
      processAxis: invProcess,
      hazardEquipmentAxis: invEquip,
    });
    onInvestigationsChange([created, ...investigations.filter(i => i.investigationId !== created.investigationId)]);
    onLockOntoStructuralNode(created.structuralNodeIndex);
    setInvNotice(
      `[05 AI 사고조사 초안] 6하원칙·시계열·3단계 원인(직접/기여/근본) 구조화가 완료되었습니다. 본사 승인 시 02 사고사례 DB 및 04 대표이사 12개국어 안전교육으로 자동 편입됩니다.`,
    );
    setInvTitle('');
    setInvSummary('');
  };

  const handleApproveInvestigation = (inv: NexusAiInvestigationRecord) => {
    setInvError('');
    try {
      const result = approveAiInvestigationAndPropagate(inv.investigationId, {
        approverLabel: invApprover.trim() || '본사 CSO·안전보건실장',
        approvalNote: invReviewNotes[inv.investigationId]?.trim() || undefined,
        preventiveMeasureDraft: invPreventiveEdits[inv.investigationId]?.trim() || undefined,
      });
      onInvestigationsChange([...result.updatedInvestigations]);
      onPipelineCreated(result.promotedPipelineCase);
      onTrainingCampaignsChange([
        result.promotedTrainingCampaign,
        ...trainingCampaigns.filter(c => c.campaignId !== result.promotedTrainingCampaign.campaignId),
      ]);
      onLockOntoStructuralNode(inv.structuralNodeIndex);
      setInvNotice(
        `[본사 승인 완료] 사례코드 [${result.promotedSeed.caseCode}]가 02 사고사례 DB에 편입되었고, 04 대표이사 12개국어 안전교육 및 06 시정조치·인계로 동시 전파되었습니다.`,
      );
    } catch (err) {
      setInvError(err instanceof Error ? err.message : '본사 승인 처리 중 확인이 필요합니다.');
    }
  };

  const openActionsCount = pipelineCases.filter(c => c.status !== 'closed').length;
  const pendingApprovalCount = investigations.filter(i => i.status === 'ai_draft_pending_hq').length;
  const equipPendingCount = equipmentReports.filter(e => e.status === 'submitted_to_hq').length;
  const equipVerifiedReadyCount = equipmentReports.filter(
    e => e.status === 'hq_verified_for_ceo' || e.status === 'reported_to_ceo',
  ).length;
  const activeVisitCount = visitPlans.filter(v => v.status !== 'action_issued_closed').length;

  const isHqMode = roleMode === 'hq_cso';

  const renderInvestigationDraftForm = () => (
    <>
      <div className="nexus-visit-form-grid">
        <label>
          <span>발생·접수 현장명</span>
          <input
            type="text"
            aria-label="사고조사 현장명"
            value={invSiteName}
            maxLength={80}
            onChange={e => setInvSiteName(e.target.value)}
            placeholder="예: 제1현장 지하 2층 북측 외벽"
          />
        </label>
        <label>
          <span>사건·아차사고 제목 (선택)</span>
          <input
            type="text"
            aria-label="사고조사 제목"
            value={invTitle}
            maxLength={120}
            onChange={e => setInvTitle(e.target.value)}
            placeholder="미입력 시 3축·위험유형 기준 자동 생성"
          />
        </label>
        <label>
          <span>초안 작성자 (현장)</span>
          <input
            type="text"
            aria-label="사고조사 작성자"
            value={invAuthor}
            maxLength={60}
            onChange={e => setInvAuthor(e.target.value)}
          />
        </label>
        <label>
          <span>본사 승인권자 (작성자와 분리 필수)</span>
          <input
            type="text"
            aria-label="본사 승인권자"
            value={invApprover}
            maxLength={60}
            onChange={e => setInvApprover(e.target.value)}
          />
        </label>
      </div>

      <label className="nexus-inv-summary-field">
        <span>현장 사고·아차사고 경위 원문 (입력 즉시 6하원칙·시계열·3단계 원인 자동 구조화)</span>
        <input
          type="text"
          aria-label="사고조사 경위 원문"
          value={invSummary}
          maxLength={400}
          onChange={e => setInvSummary(e.target.value)}
          placeholder="예: 지하 2층 외벽 합벽 거푸집 조립 중 타이볼트 간격 미흡으로 배부름 변형 및 피트 개구부 덮개 미고정 발견"
        />
      </label>

      <div className="nexus-3axis-tags" role="group" aria-label="사고조사 3축 분류">
        <label>
          <span>조사 축1 · 구간</span>
          <select
            aria-label="사고조사 구간 축"
            value={liveInvestigationPreview.zoneAxis}
            onChange={e => setInvZone(e.target.value as NexusZoneAxis)}
          >
            {NEXUS_ZONE_AXIS_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>조사 축2 · 세부작업</span>
          <select
            aria-label="사고조사 작업 축"
            value={liveInvestigationPreview.processAxis}
            onChange={e => setInvProcess(e.target.value as NexusProcessAxis)}
          >
            {NEXUS_PROCESS_AXIS_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>조사 축3 · 가설·장비</span>
          <select
            aria-label="사고조사 가설장비 축"
            value={liveInvestigationPreview.hazardEquipmentAxis}
            onChange={e => setInvEquip(e.target.value as NexusHazardEquipmentAxis)}
          >
            {NEXUS_HAZARD_EQUIPMENT_AXIS_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="nexus-inv-preview-grid">
        <div className="nexus-inv-card">
          <strong>AI 6하원칙 · 시계열 분석 초안</strong>
          <dl className="nexus-seed-tree">
            <div><dt>언제(When)</dt><dd>{liveInvestigationPreview.sixW.when}</dd></div>
            <div><dt>어디서(Where)</dt><dd>{liveInvestigationPreview.sixW.where}</dd></div>
            <div><dt>누가(Who)</dt><dd>{liveInvestigationPreview.sixW.who}</dd></div>
            <div><dt>무엇을(What)</dt><dd>{liveInvestigationPreview.sixW.what}</dd></div>
            <div><dt>어떻게(How)</dt><dd>{liveInvestigationPreview.sixW.how}</dd></div>
            <div><dt>왜(Why)</dt><dd>{liveInvestigationPreview.sixW.why}</dd></div>
          </dl>
        </div>
        <div className="nexus-inv-card">
          <strong>직접원인 → 기여요인 → 근본원인 구조화 초안</strong>
          <dl className="nexus-seed-tree">
            <div><dt>직접원인</dt><dd>{liveInvestigationPreview.directCause}</dd></div>
            <div><dt>기여요인</dt><dd>{liveInvestigationPreview.contributingFactor}</dd></div>
            <div><dt>근본원인</dt><dd>{liveInvestigationPreview.rootCause}</dd></div>
            <div><dt>재발방지대책</dt><dd>{liveInvestigationPreview.preventiveMeasureDraft}</dd></div>
          </dl>
          <button type="button" className="nexus-3axis-submit" onClick={handleCreateAiInvestigation}>
            05 AI 사고조사 초안 등록 (본사 승인 요청) ↗
          </button>
        </div>
      </div>

      <div className="nexus-inv-timeline-strip" aria-label="AI 4단계 시계열 사고 경위 분석">
        {liveInvestigationPreview.timeline.map((step, idx) => (
          <div key={idx} className="nexus-inv-timeline-step">
            <b>{step.phase}</b>
            <span>{step.detail}</span>
          </div>
        ))}
      </div>
    </>
  );

  const renderInvestigationInbox = () =>
    scopedInvestigations.length > 0 ? (
      <div className="nexus-3axis-case-list" aria-label="AI 사고조사 및 본사 승인·환류 내역">
        <strong>05 AI 사고조사 · 본사 승인 및 02 사고사례 DB · 04 대표이사 교육 편입 현황 ({scopedInvestigations.length}건)</strong>
        <ul>
          {scopedInvestigations.slice(0, 5).map(inv => (
            <li key={inv.investigationId} data-status={inv.status}>
              <div className="nexus-3axis-case-row-top">
                <span>
                  <b>[{inv.matchedReferenceCode} · 구체 #{inv.structuralNodeIndex}]</b> {inv.incidentTitle} ({inv.siteName})
                </span>
                <em className={'status-pill status-' + inv.status}>
                  {NEXUS_INVESTIGATION_STATUS_LABELS[inv.status]}
                </em>
              </div>
              <p className="nexus-3axis-case-row-meta">
                직접원인: {inv.directCause} → 근본원인: {inv.rootCause} · 재발방지: {inv.preventiveMeasureDraft} · 작성: {inv.authorLabel}
                {inv.approverLabel ? ` · 승인: ${inv.approverLabel} (편입코드: ${inv.promotedSeedCode})` : ''}
              </p>
              {inv.revisionNote && (
                <p className="nexus-inv-revision-banner">
                  <b>[본사 보완 지시 · {inv.revisionReviewerLabel || '본사 CSO'}]</b> {inv.revisionNote}
                </p>
              )}
              {inv.status === 'ai_draft_pending_hq' && (
                <>
                  <div className="nexus-case-evidence-row nexus-inv-hq-edit-row">
                    <input
                      type="text"
                      aria-label={`본사 재발방지대책 보정 ${inv.matchedReferenceCode}`}
                      value={invPreventiveEdits[inv.investigationId] ?? inv.preventiveMeasureDraft}
                      maxLength={240}
                      onChange={e =>
                        setInvPreventiveEdits(prev => ({
                          ...prev,
                          [inv.investigationId]: e.target.value,
                        }))
                      }
                      placeholder="본사 승인 전 재발방지대책 문구 보정"
                    />
                    <input
                      type="text"
                      aria-label={`본사 승인·보완 지시 코멘트 ${inv.matchedReferenceCode}`}
                      value={invReviewNotes[inv.investigationId] ?? ''}
                      maxLength={200}
                      onChange={e =>
                        setInvReviewNotes(prev => ({
                          ...prev,
                          [inv.investigationId]: e.target.value,
                        }))
                      }
                      placeholder="본사 승인 지시사항 또는 현장 보완 요청 사유 입력"
                    />
                  </div>
                  <div className="nexus-3axis-case-row-actions">
                    <button type="button" onClick={() => handleApproveInvestigation(inv)}>
                      본사 최종 승인 · 02 사고사례 DB 편입 및 04 대표이사 12개국어 교육 자동 발령 ↗
                    </button>
                    <button
                      type="button"
                      className="is-revision-btn"
                      onClick={() => handleRequestInvestigationRevision(inv)}
                    >
                      본사 보완 요청 (현장 재조사 지시)
                    </button>
                  </div>
                </>
              )}
              {inv.status === 'revision_requested' && (
                <>
                  <div className="nexus-case-evidence-row">
                    <input
                      type="text"
                      aria-label={`현장 보완 내역 입력 ${inv.matchedReferenceCode}`}
                      value={invReviewNotes[inv.investigationId] ?? ''}
                      maxLength={220}
                      onChange={e =>
                        setInvReviewNotes(prev => ({
                          ...prev,
                          [inv.investigationId]: e.target.value,
                        }))
                      }
                      placeholder="현장 안전관리자 보완 조사 내역 입력 (예: 구조검토서 대조 및 신호수 무전 교신 절차 보강 완료)"
                    />
                  </div>
                  <div className="nexus-3axis-case-row-actions">
                    <button type="button" onClick={() => handleResubmitInvestigation(inv)}>
                      현장 보완 완료 · 본사 재승인 요청 ↗
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    ) : (
      <p className="nexus-3axis-case-row-meta">현재 선택된 범위에서 본사 결재 대기 또는 승인 완료된 사고조사 건이 없습니다.</p>
    );

  const renderEquipmentUploadForm = () => (
    <div className="nexus-equip-upload-box">
      <div className="nexus-visit-form-grid">
        <label>
          <span>대상 현장 선택</span>
          <select
            aria-label="건설기계 점검 현장 선택"
            value={eqSiteId}
            onChange={e => setEqSiteId(e.target.value)}
          >
            {NEXUS_SITE_PORTFOLIO.map(site => (
              <option key={site.siteId} value={site.siteId}>{site.shortLabel}</option>
            ))}
          </select>
        </label>
        <label>
          <span>건설기계·장비 종류</span>
          <select
            aria-label="건설기계 종류 선택"
            value={eqType}
            onChange={e => setEqType(e.target.value as NexusEquipmentType)}
          >
            {NEXUS_EQUIPMENT_TYPE_OPTIONS.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>작업 내용·타설/인양 위치</span>
          <input
            type="text"
            aria-label="건설기계 작업 내용"
            value={eqWorkActivity}
            maxLength={140}
            onChange={e => setEqWorkActivity(e.target.value)}
            placeholder="예: B2층 외벽 콘크리트 타설 펌프카 사용전 아웃트리거 점검"
          />
        </label>
        <label>
          <span>현장 업로더 (작성자)</span>
          <input
            type="text"
            aria-label="건설기계 사진 업로더"
            value={eqUploadedBy}
            maxLength={60}
            onChange={e => setEqUploadedBy(e.target.value)}
          />
        </label>
      </div>
      <div className="nexus-equip-upload-row">
        <label className="nexus-equip-checklist-input">
          <span>사용전 필수 확인사항 요약</span>
          <input
            type="text"
            aria-label="건설기계 사용전 확인사항"
            value={eqChecklistNote}
            maxLength={220}
            onChange={e => setEqChecklistNote(e.target.value)}
            placeholder={selectedEquipMeta.defaultChecklist}
          />
        </label>
        <label className="nexus-photo-upload-chip">
          <span>📷 점검 사진 첨부 {eqPhotoName ? `(${eqPhotoName.slice(0, 18)})` : ''}</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="건설기계 사용전 점검 사진 첨부"
            onChange={handleEquipPhotoFileChange}
          />
        </label>
        {eqPhotoUrl && <img src={eqPhotoUrl} alt="사용전 점검 사진 미리보기" className="nexus-inline-thumb" />}
        <button type="button" className="nexus-3axis-submit" onClick={handleSubmitEquipmentPhoto}>
          건설기계 사용전 점검 사진 본사 전송 ↗
        </button>
      </div>
    </div>
  );

  const renderEquipmentGalleryAndCeoPack = () => (
    <div className="nexus-equip-hq-section">
      <div className="nexus-equip-ceo-toolbar">
        <label>
          <span>본사 검토·보고 책임자</span>
          <input
            type="text"
            aria-label="건설기계 사진 본사 검토자"
            value={eqReviewer}
            maxLength={60}
            onChange={e => setEqReviewer(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="nexus-3axis-submit"
          onClick={handleCompileExecutivePhotoPack}
          disabled={equipVerifiedReadyCount === 0}
        >
          선별 사진 대표이사·경영진 1장 보고서 발행 &amp; 보고 완료 ({equipVerifiedReadyCount}건) ↗
        </button>
      </div>

      {latestExecutivePack && (
        <div className="nexus-ceo-briefing-sheet" aria-label="대표이사·경영진 일일 안전보고 패키지">
          <div className="nexus-3axis-matched-title">
            <strong>
              🏛️ [{latestExecutivePack.packId}] {latestExecutivePack.ceoAudienceLabel} 발행 완료 ({latestExecutivePack.siteCoverageCount}개 현장 · {latestExecutivePack.totalPhotos}건)
            </strong>
            <div className="nexus-3axis-case-row-actions">
              <button type="button" onClick={handleCopyExecutiveBriefingText}>📋 보고 요약 복사</button>
              <button type="button" onClick={handleDownloadExecutivePhotoCsv}>📊 엑셀(CSV) 저장</button>
            </div>
          </div>
          <pre className="nexus-ceo-pre">{latestExecutivePack.summaryText}</pre>
        </div>
      )}

      {scopedEquipmentReports.length === 0 ? (
        <p className="nexus-3axis-case-row-meta">
          아직 접수된 건설기계 사용전 점검 사진이 없습니다. 현장에서 펌프카·크레인·고소작업대 사진을 업로드하거나 상단 [체험 데이터 불러오기]로 3대 현장 예시를 확인하세요.
        </p>
      ) : (
        <div className="nexus-equip-photo-grid" aria-label="전사 건설기계 사용전 점검 사진 목록">
          {scopedEquipmentReports.map(item => (
            <article key={item.submissionId} className="nexus-equip-photo-card" data-status={item.status}>
              <div className="nexus-equip-thumb-wrap">
                <img src={item.photoDataUrl} alt={`${item.siteName} ${item.equipmentLabel} 사용전 점검 사진`} className="nexus-equip-thumb" />
                <span className={'nexus-equip-status-tag status-' + item.status}>
                  {NEXUS_EQUIPMENT_PHOTO_STATUS_LABELS[item.status]}
                </span>
              </div>
              <div className="nexus-equip-card-body">
                <small>{item.siteName} · {item.equipmentLabel} · 구체 #{item.structuralNodeIndex}</small>
                <h4>{item.workActivity}</h4>
                <p>{item.inspectionPointSummary}</p>
                <div className="nexus-equip-meta-line">
                  <span>업로드: {item.uploadedBy}</span>
                  {item.hqReviewer && <span>검토: {item.hqReviewer}</span>}
                  {item.executivePackId && <span>보고팩: {item.executivePackId}</span>}
                </div>
                {item.hqReviewNote && (
                  <p className="nexus-equip-review-note"><b>본사 의견:</b> {item.hqReviewNote}</p>
                )}
                {item.status === 'submitted_to_hq' && (
                  <div className="nexus-equip-review-controls">
                    <input
                      type="text"
                      aria-label={`본사 사진 검토 의견 ${item.submissionId}`}
                      value={eqReviewNotesById[item.submissionId] ?? ''}
                      maxLength={160}
                      onChange={e =>
                        setEqReviewNotesById(prev => ({ ...prev, [item.submissionId]: e.target.value }))
                      }
                      placeholder="본사 검토 의견 (적합 확인 또는 보완 지시)"
                    />
                    <div className="nexus-3axis-case-row-actions">
                      <button
                        type="button"
                        onClick={() => handleReviewEquipmentPhoto(item, 'hq_verified_for_ceo')}
                      >
                        본사 적합 검토 (경영진 보고 편입)
                      </button>
                      <button
                        type="button"
                        className="is-revision-btn"
                        onClick={() => handleReviewEquipmentPhoto(item, 'revision_requested_hq')}
                      >
                        보완 요청
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <section className="nexus-workbench" aria-label="SAFETY NEXUS 6대 핵심기능 폐루프 통합 워크벤치">
      <div className="nexus-workbench-header">
        <div>
          <span className="nexus-3axis-kicker">CLOSED-LOOP COMMAND WORKBENCH · 본사 · 현장 실전 지휘 스튜디오</span>
          <h2>본사 주도 · 현장 실행 · 건설기계 사진보고 · 12개국어 교육 통합 스튜디오</h2>
        </div>
        <div className="nexus-workbench-header-utils">
          <p>역할 시점에 맞춰 결재함·현장 실행 폼이 자동 재배치됩니다.</p>
          <button
            type="button"
            className="nexus-sim-seed-btn"
            onClick={handleLoadMultiSiteSimulation}
          >
            체험 데이터 불러오기 (3개 현장·장비사진)
          </button>
        </div>
      </div>

      <div className="nexus-role-command-bar" role="region" aria-label="본사 및 현장 안전관리자 역할 시점·다현장 지휘 바">
        <div className="nexus-role-Command-top">
          <div className="nexus-role-switcher" role="group" aria-label="본사·현장 운영 시점 전환">
            <button
              type="button"
              aria-pressed={roleMode === 'unified'}
              onClick={() => handleSwitchRoleMode('unified')}
            >
              ◈ 통합 폐루프 지휘
            </button>
            <button
              type="button"
              aria-pressed={roleMode === 'hq_cso'}
              onClick={() => handleSwitchRoleMode('hq_cso')}
            >
              🏛️ 본사 CSO · 순회점검 입장
            </button>
            <button
              type="button"
              aria-pressed={roleMode === 'field_manager'}
              onClick={() => handleSwitchRoleMode('field_manager')}
            >
              🦺 현장 안전관리자 실행 입장
            </button>
          </div>

          {selectedSiteId && (
            <button
              type="button"
              className="nexus-site-reset-chip"
              onClick={() => setSelectedSiteId('')}
            >
              ✕ 선택 현장 해제 · 전체 현장 보기
            </button>
          )}
        </div>

        <div className="nexus-site-matrix-grid" role="group" aria-label="본사·현장 3대 골조 포트폴리오 실시간 비교 매트릭스">
          {siteMatrix.map(card => (
            <button
              key={card.siteId}
              type="button"
              className={
                'nexus-site-matrix-card urgency-' +
                card.urgencyLevel +
                (selectedSiteId === card.siteId ? ' is-selected' : '')
              }
              aria-pressed={selectedSiteId === card.siteId}
              onClick={() =>
                handleSelectPortfolioSite(selectedSiteId === card.siteId ? '' : card.siteId)
              }
            >
              <div className="nexus-site-matrix-top">
                <strong>{card.shortLabel}</strong>
                <em className={'urgency-badge urgency-' + card.urgencyLevel}>
                  {card.urgencyLabel}
                </em>
              </div>
              <div className="nexus-site-matrix-metrics">
                <span>미결 <b>{card.openActionsCount}</b></span>
                <span>순회 <b>{card.activeVisitsCount}</b></span>
                <span>승인·보완 <b>{card.pendingApprovalsCount + card.revisionRequestedCount}</b></span>
                <span>교육 <b>{card.avgTrainingCompletionPct !== null ? `${card.avgTrainingCompletionPct}%` : '대기'}</b></span>
              </div>
            </button>
          ))}
        </div>

        <div className="nexus-role-digest" aria-live="polite">
          <strong>{roleDigest.headline}</strong>
          <div className="nexus-role-action-strip" role="group" aria-label="역할별 즉시 처리 큐 바로가기">
            <button type="button" onClick={() => onTabChange('investigate_05_02')}>
              05 결재·보완 <b>{pendingApprovalCount + roleDigest.revisionRequestedCount}건</b>
            </button>
            <button type="button" onClick={() => onTabChange('equipment_photo')}>
              🏗️ 기계사진 검토 <b>{equipPendingCount}건</b> · 보고 <b>{equipVerifiedReadyCount}건</b>
            </button>
            <button type="button" onClick={() => onTabChange('visit_01')}>
              01 순회점검 <b>{activeVisitCount}건</b>
            </button>
            <button type="button" onClick={() => onTabChange('inspect_03_06')}>
              03·06 현장미결 <b>{openActionsCount}건</b>
            </button>
            <button type="button" onClick={() => onTabChange('training_04')}>
              04 미이수 교육 <b>{roleDigest.incompleteTrainingCount}건</b>
            </button>
          </div>
        </div>
      </div>

      <div className="nexus-workbench-tabs" role="tablist" aria-label="핵심기능 폐루프 모듈 선택">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'inspect_03_06'}
          className={'nexus-workbench-tab' + (activeTab === 'inspect_03_06' ? ' is-active' : '')}
          onClick={() => onTabChange('inspect_03_06')}
        >
          <small>03 · 02 · 06 현장 실행 루프</small>
          <span>30초 사진점검 · 3축분류 · 조치·인계</span>
          <b>미결 {openActionsCount}건</b>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'equipment_photo'}
          className={'nexus-workbench-tab' + (activeTab === 'equipment_photo' ? ' is-active' : '')}
          onClick={() => onTabChange('equipment_photo')}
        >
          <small>건설기계 사용전 사진</small>
          <span>건설기계 사용전 사진·경영진 보고</span>
          <b>대기 {equipPendingCount} · 보고가능 {equipVerifiedReadyCount}</b>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'training_04'}
          className={'nexus-workbench-tab' + (activeTab === 'training_04' ? ' is-active' : '')}
          onClick={() => onTabChange('training_04')}
        >
          <small>04 대표이사 다국어 안전교육</small>
          <span>12개국어·음성 전파 및 서명 이수율</span>
          <b>캠페인 {trainingCampaigns.length}건</b>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'visit_01'}
          className={'nexus-workbench-tab' + (activeTab === 'visit_01' ? ' is-active' : '')}
          onClick={() => onTabChange('visit_01')}
        >
          <small>01 본사 행선지 · 순회점검</small>
          <span>방문 사전 위험브리핑 & 현장 지시</span>
          <b>일정 {visitPlans.length}건</b>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'investigate_05_02'}
          className={'nexus-workbench-tab' + (activeTab === 'investigate_05_02' ? ' is-active' : '')}
          onClick={() => onTabChange('investigate_05_02')}
        >
          <small>05 · 02 AI 사고조사 · 본사 승인</small>
          <span>6하원칙·원인분석 승인 → 사례DB·교육 편입</span>
          <b>승인대기 {pendingApprovalCount}건</b>
        </button>
      </div>

      <div className="nexus-workbench-panel">
        {activeTab === 'inspect_03_06' && (
          <InspectorNexus3AxisBridge
            note=""
            source="safety-nexus-quick"
            cases={scopedPipelineCases}
            onCaseCreated={onPipelineCreated}
            onCaseUpdated={onPipelineUpdated}
            onEscalateToInvestigation={handleEscalateCaseToInvestigation}
            onDispatchTrainingForCase={handleDispatchTrainingFromCase}
          />
        )}

        {activeTab === 'equipment_photo' && (
          <div className="nexus-equip-studio" aria-label="건설기계 사용전 점검 사진 본사 취합 및 대표이사·경영진 보고 스튜디오">
            <div className="nexus-3axis-bridge-head">
              <div>
                <span className="nexus-3axis-kicker">
                  EQUIPMENT PRE-USE VERIFICATION · 현장 사용전 사진 전송 → 본사 적합 검토 → 대표이사·경영진 일일 보고
                </span>
                <h3>건설기계(펌프카·크레인·고소작업대) 사용전 점검 사진 · 경영진 보고</h3>
              </div>
              <span className="nexus-3axis-confidence">
                접수 {scopedEquipmentReports.length}건 · 본사 적합·보고 {equipVerifiedReadyCount}건
              </span>
            </div>

            {eqError && <p role="alert" className="nexus-inv-error">{eqError}</p>}
            {eqNotice && <p role="status" className="nexus-3axis-feedback">{eqNotice}</p>}

            {isHqMode ? (
              <>
                {renderEquipmentGalleryAndCeoPack()}
                <details className="nexus-collapsible-form">
                  <summary>+ 현장 사용전 점검 사진 직접 업로드 · 대리 등록 열기</summary>
                  {renderEquipmentUploadForm()}
                </details>
              </>
            ) : (
              <>
                {renderEquipmentUploadForm()}
                {renderEquipmentGalleryAndCeoPack()}
              </>
            )}
          </div>
        )}

        {activeTab === 'training_04' && (
          <NexusExecutiveTrainingBridge
            activeSeed={activeSeed}
            campaigns={trainingCampaigns}
            onCampaignsChange={onTrainingCampaignsChange}
            onOpenAdminTraining={onOpenAdminTraining}
          />
        )}

        {activeTab === 'visit_01' && (
          <div className="nexus-hq-visit-studio" aria-label="01 본사 행선지·순회점검 사전 브리핑 스튜디오">
            <div className="nexus-3axis-bridge-head">
              <div>
                <span className="nexus-3axis-kicker">
                  SLICE 4A · 01 행선지·현장점검 → 방문 전 미해결 위험·유사사고 자동 브리핑 → 현장 점검·조치 환류
                </span>
                <h3>01 본사 행선지 등록 및 방문 전 자동 위험 브리핑 (Pre-Visit Briefing)</h3>
              </div>
              <span className="nexus-3axis-confidence">
                연계 구체 포인트 #{livePreVisitPreview.classification.structuralNodeIndex} · 시드 [{livePreVisitPreview.briefing.matchedCaseCode}]
              </span>
            </div>

            <div className="nexus-visit-form-grid">
              <label>
                <span>방문 예정일</span>
                <input
                  type="date"
                  aria-label="순회점검 방문 예정일"
                  value={visitDate}
                  onChange={e => setVisitDate(e.target.value)}
                />
              </label>
              <label>
                <span>본사 점검자·직책</span>
                <input
                  type="text"
                  aria-label="본사 점검자 직책"
                  value={inspectorRole}
                  maxLength={60}
                  onChange={e => setInspectorRole(e.target.value)}
                />
              </label>
              <label>
                <span>대상 현장·구간명</span>
                <input
                  type="text"
                  aria-label="순회점검 대상 현장명"
                  value={visitSiteName}
                  maxLength={100}
                  onChange={e => setVisitSiteName(e.target.value)}
                  placeholder="예: 제1현장 지하 2층 RC외벽 / 제2현장 15층 갱폼"
                />
              </label>
              <label>
                <span>방문 목적·중점 확인사항</span>
                <input
                  type="text"
                  aria-label="순회점검 방문 목적"
                  value={visitPurpose}
                  maxLength={200}
                  onChange={e => setVisitPurpose(e.target.value)}
                  placeholder="예: 지하 외벽 합벽 거푸집 측압·개구부 방호 확인"
                />
              </label>
            </div>

            <div className="nexus-3axis-tags" role="group" aria-label="순회점검 3축 대상 분류">
              <label>
                <span>점검 축1 · 구간</span>
                <select
                  aria-label="순회점검 구간 축"
                  value={livePreVisitPreview.classification.zoneAxis}
                  onChange={e => setVisitZone(e.target.value as NexusZoneAxis)}
                >
                  {NEXUS_ZONE_AXIS_OPTIONS.map(o => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>점검 축2 · 세부작업</span>
                <select
                  aria-label="순회점검 작업 축"
                  value={livePreVisitPreview.classification.processAxis}
                  onChange={e => setVisitProcess(e.target.value as NexusProcessAxis)}
                >
                  {NEXUS_PROCESS_AXIS_OPTIONS.map(o => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>점검 축3 · 가설·장비</span>
                <select
                  aria-label="순회점검 가설장비 축"
                  value={livePreVisitPreview.classification.hazardEquipmentAxis}
                  onChange={e => setVisitEquip(e.target.value as NexusHazardEquipmentAxis)}
                >
                  {NEXUS_HAZARD_EQUIPMENT_AXIS_OPTIONS.map(o => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="nexus-previsit-briefing-box">
              <div className="nexus-3axis-matched-title">
                <strong>
                  이동 중 자동 사전 브리핑 · [{livePreVisitPreview.briefing.matchedCaseCode}] {livePreVisitPreview.briefing.matchedCaseTitle}
                </strong>
                <small>
                  미결 조치 {livePreVisitPreview.briefing.openPipelineActionsCount}건 · 기한초과 {livePreVisitPreview.briefing.overdueActionsCount}건
                </small>
              </div>
              <ul>
                {livePreVisitPreview.briefing.keyBriefingPoints.map((pt, idx) => (
                  <li key={idx}>{pt}</li>
                ))}
              </ul>
              <button type="button" className="nexus-3axis-submit" onClick={handleCreateVisitPlan}>
                01 행선지·사전브리핑 등록 및 구체 포인트 록온 ↗
              </button>
            </div>

            {visitNotice && <p role="status" className="nexus-3axis-feedback">{visitNotice}</p>}

            {scopedVisitPlans.length > 0 && (
              <div className="nexus-3axis-case-list" aria-label="본사 행선지 및 순회점검 이행 목록">
                <strong>등록된 본사 행선지 · 순회점검 브리핑 및 조치 이행 ({scopedVisitPlans.length}건)</strong>
                <ul>
                  {scopedVisitPlans.slice(0, 5).map(plan => (
                    <li key={plan.visitId} data-status={plan.status}>
                      <div className="nexus-3axis-case-row-top">
                        <span>
                          <b>[{plan.visitDate} · 구체 #{plan.structuralNodeIndex}]</b> {plan.siteName} ({plan.inspectorRole}) — {plan.purpose}
                        </span>
                        <em className={'status-pill status-' + plan.status}>
                          {NEXUS_VISIT_STATUS_LABELS[plan.status]}
                        </em>
                      </div>
                      <p className="nexus-3axis-case-row-meta">
                        사전 브리핑 시드: [{plan.preVisitBriefing.matchedCaseCode}] · 미결 {plan.preVisitBriefing.openPipelineActionsCount}건
                        {plan.fieldResultNote ? ` · 점검 기록: ${plan.fieldResultNote}` : ''}
                      </p>
                      {plan.status !== 'action_issued_closed' && (
                        <>
                          <div className="nexus-case-evidence-row">
                            <input
                              type="text"
                              aria-label={`순회점검 현장 지적·지시 메모 ${plan.siteName}`}
                              value={visitDirectiveNotes[plan.visitId] ?? ''}
                              maxLength={200}
                              onChange={e =>
                                setVisitDirectiveNotes(prev => ({ ...prev, [plan.visitId]: e.target.value }))
                              }
                              placeholder="본사 순회점검 현장 지적·시정지시 메모 입력 (예: 북측 합벽 타이볼트 4개소 즉시 보강 및 개구부 덮개 볼트 고정)"
                            />
                          </div>
                          <div className="nexus-3axis-case-row-actions">
                            {plan.status === 'scheduled_briefed' && (
                              <button
                                type="button"
                                className="is-secondary-action"
                                onClick={() => handleStartVisitInspection(plan)}
                              >
                                현장 도착 · 순회점검 개시
                              </button>
                            )}
                            <button type="button" onClick={() => handleCompleteVisitWithAction(plan, false)}>
                              현장 점검 완료 · 즉시 시정조치·인계 발령 ↗
                            </button>
                            <button
                              type="button"
                              className="is-training"
                              onClick={() => handleCompleteVisitWithAction(plan, true)}
                            >
                              시정조치 + 04 대표이사 12개국어 특별교육 동시 발령 ↗
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {activeTab === 'investigate_05_02' && (
          <div className="nexus-ai-investigation-studio" aria-label="05 AI 사고조사·원인분석 및 본사 승인 환류 스튜디오">
            <div className="nexus-3axis-bridge-head">
              <div>
                <span className="nexus-3axis-kicker">
                  SLICE 4B · 05 AI 사고조사(6하원칙·시계열·직접/기여/근본원인) → 본사 승인 → 02 사고사례 DB & 04 대표이사 교육 자동 편입
                </span>
                <h3>05 AI 사고조사·원인분석 구조화 및 본사 승인·전 현장 환류 스튜디오</h3>
              </div>
              <span className="nexus-3axis-confidence">
                AI 초안 · 본사 승인 전 확정 아님 · 구체 #{liveInvestigationPreview.structuralNodeIndex}
              </span>
            </div>

            {isHqMode ? (
              <>
                {invError && <p role="alert" className="nexus-inv-error">{invError}</p>}
                {invNotice && <p role="status" className="nexus-3axis-feedback">{invNotice}</p>}
                {renderInvestigationInbox()}
                <details className="nexus-collapsible-form">
                  <summary>+ 현장 사고조사 초안 직접 작성 열기</summary>
                  {renderInvestigationDraftForm()}
                </details>
              </>
            ) : (
              <>
                {renderInvestigationDraftForm()}
                {invError && <p role="alert" className="nexus-inv-error">{invError}</p>}
                {invNotice && <p role="status" className="nexus-3axis-feedback">{invNotice}</p>}
                {renderInvestigationInbox()}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

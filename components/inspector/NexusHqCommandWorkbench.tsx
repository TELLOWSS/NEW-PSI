import React, { useEffect, useMemo, useState } from 'react';
import { getKoreanCalendarDay } from '../../utils/monthlyFieldFollowup';
import {
  NEXUS_EQUIPMENT_PHOTO_STATUS_LABELS,
  NEXUS_EQUIPMENT_TYPE_OPTIONS,
  batchVerifyPendingEquipmentPhotosByHq,
  compileExecutivePhotoBriefingPack,
  resubmitEquipmentPhotoByField,
  reviewEquipmentPhotoByHq,
  submitEquipmentPhotoReport,
  type NexusEquipmentPhotoStatus,
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
  NEXUS_VISIT_STATUS_LABELS,
  acknowledgeHqVisitByField,
  approveAiInvestigationAndPropagate,
  buildAiInvestigationDraft,
  buildPreVisitBriefing,
  completeHqVisitWithFieldAction,
  createHqVisitPlan,
  matchesPortfolioSite,
  requestAiInvestigationRevision,
  resubmitAiInvestigationRecord,
  startHqFieldInspection,
  submitAiInvestigationRecord,
  type NexusAiInvestigationRecord,
  type NexusHqVisitPlan,
  type NexusWorkspaceAuthority,
} from '../../utils/nexusHqCommandLoop';
import { enqueueNexusOfflineMutation } from '../../utils/nexusOfflineQueue';
import type { NexusPipelineCase } from '../../utils/nexusQuickPipeline';
import {
  NEXUS_SITE_MASTER_UPDATED_EVENT,
  archiveManagedNexusSite,
  readManagedNexusSites,
  resetManagedNexusSites,
  upsertManagedNexusSite,
  type NexusManagedSite,
} from '../../utils/nexusSiteRegistry';
import { compressFieldPhotoForNexus } from '../../utils/nexusSyncEngine';
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
  workspaceRole: NexusWorkspaceAuthority;
  fieldSection?: 'execute' | 'inbox';
  effectiveSiteId: string;
  activeSiteLabel: string;
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
  onLockOntoStructuralNode: (structuralNodeIndex: string) => void;
  onExportExecutivePptx?: () => Promise<void> | void;
  onLoadDemoData?: () => void;
}

export const NexusHqCommandWorkbench: React.FC<Props> = ({
  workspaceRole,
  fieldSection = 'execute',
  effectiveSiteId,
  activeSiteLabel,
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
  onLockOntoStructuralNode,
  onExportExecutivePptx,
  onLoadDemoData,
}) => {
  const isHq = workspaceRole === 'hq';
  const [managedSites, setManagedSites] = useState<NexusManagedSite[]>(() => readManagedNexusSites(true));
  const activeManagedSites = useMemo(
    () => managedSites.filter(s => !s.archived),
    [managedSites],
  );
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteShortLabel, setNewSiteShortLabel] = useState('');
  const [newSiteZone, setNewSiteZone] = useState<NexusZoneAxis>('superstructure_std');
  const [newSiteProcess, setNewSiteProcess] = useState<NexusProcessAxis>('formwork_general');
  const [newSiteManager, setNewSiteManager] = useState('');
  const [newSiteEquipInput, setNewSiteEquipInput] = useState('콘크리트 타설 펌프카, 타워크레인');
  const [siteMasterNotice, setSiteMasterNotice] = useState('');

  useEffect(() => {
    const syncSites = () => setManagedSites(readManagedNexusSites(true));
    window.addEventListener(NEXUS_SITE_MASTER_UPDATED_EVENT, syncSites);
    window.addEventListener('storage', syncSites);
    return () => {
      window.removeEventListener(NEXUS_SITE_MASTER_UPDATED_EVENT, syncSites);
      window.removeEventListener('storage', syncSites);
    };
  }, []);

  const boundSiteMeta =
    managedSites.find(s => s.siteId === effectiveSiteId) ??
    activeManagedSites[0] ??
    managedSites[0];

  // 01 행선지·순회점검 state (HQ authoring)
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
  const [eqSiteId, setEqSiteId] = useState<string>(effectiveSiteId || 'SITE-01-SUBRC');
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
  const [eqStatusFilter, setEqStatusFilter] = useState<'all' | NexusEquipmentPhotoStatus>('all');
  const [selectedEquipIds, setSelectedEquipIds] = useState<string[]>([]);
  const [lightboxItem, setLightboxItem] = useState<NexusEquipmentPhotoSubmission | null>(null);
  const [eqResubmitNotesById, setEqResubmitNotesById] = useState<Record<string, string>>({});
  const [eqResubmitPhotosById, setEqResubmitPhotosById] = useState<Record<string, { name: string; url: string }>>({});
  const [visitAckNotesById, setVisitAckNotesById] = useState<Record<string, string>>({});

  const filteredEquipmentReports = useMemo(
    () =>
      eqStatusFilter === 'all'
        ? equipmentReports
        : equipmentReports.filter(item => item.status === eqStatusFilter),
    [equipmentReports, eqStatusFilter],
  );

  useEffect(() => {
    if (!lightboxItem || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxItem(null);
        return;
      }
      if (filteredEquipmentReports.length <= 1) return;
      const idx = filteredEquipmentReports.findIndex(
        x => x.submissionId === lightboxItem.submissionId,
      );
      if (idx < 0) return;
      if (e.key === 'ArrowRight') {
        const next = filteredEquipmentReports[(idx + 1) % filteredEquipmentReports.length];
        if (next) setLightboxItem(next);
      } else if (e.key === 'ArrowLeft') {
        const prev =
          filteredEquipmentReports[
            (idx - 1 + filteredEquipmentReports.length) % filteredEquipmentReports.length
          ];
        if (prev) setLightboxItem(prev);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightboxItem, filteredEquipmentReports]);

  useEffect(() => {
    if (effectiveSiteId) {
      setEqSiteId(effectiveSiteId);
      setInvSiteName(boundSiteMeta.siteName);
      setVisitSiteName(boundSiteMeta.siteName);
    }
  }, [effectiveSiteId, boundSiteMeta.siteName]);

  const selectedEquipMeta = useMemo(
    () => NEXUS_EQUIPMENT_TYPE_OPTIONS.find(o => o.id === eqType) ?? NEXUS_EQUIPMENT_TYPE_OPTIONS[0],
    [eqType],
  );

  const handleEquipPhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEqPhotoName(file.name);
    const dataUrl = await compressFieldPhotoForNexus(file);
    setEqPhotoUrl(dataUrl);
  };

  const handleSubmitEquipmentPhoto = () => {
    setEqError('');
    const targetSiteMeta = isHq
      ? activeManagedSites.find(s => s.siteId === eqSiteId) ?? activeManagedSites[0] ?? boundSiteMeta
      : boundSiteMeta;
    const created = submitEquipmentPhotoReport({
      siteId: targetSiteMeta.siteId,
      siteName: targetSiteMeta.siteName,
      equipmentType: eqType,
      workActivity:
        eqWorkActivity.trim() || `${targetSiteMeta.shortLabel} ${selectedEquipMeta.label} 사용전 안전점검`,
      inspectionPointSummary: eqChecklistNote.trim() || selectedEquipMeta.defaultChecklist,
      photoName: eqPhotoName || undefined,
      photoDataUrl: eqPhotoUrl || undefined,
      uploadedBy: eqUploadedBy.trim() || '현장 안전관리자',
    });
    enqueueNexusOfflineMutation({
      kind: 'equipment_photo',
      siteId: created.siteId,
      recordId: created.submissionId,
      summary: `${created.siteName} · ${created.equipmentLabel} 사용전 사진`,
    });
    onEquipmentReportsChange([created]);
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
    if (!isHq) return;
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
    if (!isHq) return;
    setEqError('');
    try {
      const eligibleIds = equipmentReports
        .filter(e => e.status === 'hq_verified_for_ceo' || e.status === 'reported_to_ceo')
        .map(e => e.submissionId);
      const selectedReadyIds = selectedEquipIds.filter(id => eligibleIds.includes(id));
      const readyIds = selectedReadyIds.length > 0 ? selectedReadyIds : eligibleIds;
      const pack = compileExecutivePhotoBriefingPack(readyIds, {
        reporterLabel: eqReviewer.trim() || '본사 안전보건실장 (CSO 보고)',
        ceoAudienceLabel: '대표이사 · 경영진 일일 안전보고',
      });
      setLatestExecutivePack(pack);
      setSelectedEquipIds([]);
      onEquipmentReportsChange([...pack.submissions]);
      setEqNotice(
        `[대표이사·경영진 보고 완료] ${pack.packId} (${pack.siteCoverageCount}개 현장 · ${pack.totalPhotos}건 사진 보고서) 발행 완료!`,
      );
    } catch (err) {
      setEqError(err instanceof Error ? err.message : '경영진 보고서 발행 중 확인이 필요합니다.');
    }
  };

  const handleBatchVerifyPendingEquipment = () => {
    if (!isHq) return;
    setEqError('');
    const pendingIds = equipmentReports
      .filter(e => e.status === 'submitted_to_hq')
      .map(e => e.submissionId);
    if (pendingIds.length === 0) {
      setEqError('일괄 적합 처리할 본사 검토대기 사진이 없습니다.');
      return;
    }
    const result = batchVerifyPendingEquipmentPhotosByHq(pendingIds, {
      reviewerLabel: eqReviewer.trim() || '본사 안전보건실장 (CSO 보고)',
    });
    onEquipmentReportsChange([...result.updated]);
    setEqNotice(
      `[일괄 적합 검토 완료] ${result.verifiedCount}건이 경영진 보고 대상으로 편입되었습니다.${result.skippedSelfCount > 0 ? ` (직무분리 원칙으로 자가업로드 ${result.skippedSelfCount}건 제외)` : ''}`,
    );
  };

  const handleResubmitPhotoFileChange = async (
    submissionId: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await compressFieldPhotoForNexus(file);
    setEqResubmitPhotosById(prev => ({ ...prev, [submissionId]: { name: file.name, url } }));
  };

  const handleResubmitEquipmentPhoto = (item: NexusEquipmentPhotoSubmission) => {
    setEqError('');
    try {
      const picked = eqResubmitPhotosById[item.submissionId];
      const updated = resubmitEquipmentPhotoByField(item.submissionId, {
        photoName: picked?.name,
        photoDataUrl: picked?.url,
        supplementNote:
          eqResubmitNotesById[item.submissionId]?.trim() ||
          '본사 지적사항 반영 보완 촬영 완료 · 안전장치 근접 확인 재전송',
        resubmittedBy: `${boundSiteMeta.shortLabel} 안전관리자`,
      });
      enqueueNexusOfflineMutation({
        kind: 'equipment_photo',
        siteId: item.siteId,
        recordId: item.submissionId,
        summary: `[보완 재전송] ${item.siteName} · ${item.equipmentLabel}`,
      });
      onEquipmentReportsChange([...updated]);
      setEqNotice(
        `[현장 보완 사진 본사 재전송] ${item.siteName} · ${item.equipmentLabel} 건이 본사 검토대기로 재상신되었습니다.`,
      );
    } catch (err) {
      setEqError(err instanceof Error ? err.message : '보완 사진 재전송 중 확인이 필요합니다.');
    }
  };

  const handleAcknowledgeVisitByField = (plan: NexusHqVisitPlan) => {
    const updated = acknowledgeHqVisitByField(plan.visitId, {
      responderLabel: `${boundSiteMeta.shortLabel} 안전관리자`,
      note:
        visitAckNotesById[plan.visitId]?.trim() ||
        '사전 브리핑 미결 위험·동선 확인 및 순회점검 현장 준비 완료',
    });
    enqueueNexusOfflineMutation({
      kind: 'visit_ack',
      siteId: plan.siteId || boundSiteMeta.siteId,
      recordId: plan.visitId,
      summary: `[순회접수] ${plan.siteName} (${plan.visitDate})`,
    });
    onVisitPlansChange([...updated]);
    setVisitNotice(
      `[순회점검 현장 접수 확인] ${plan.siteName} (${plan.visitDate}) 본사 점검 사전 브리핑 확인 및 준비 완료 응답이 전달되었습니다.`,
    );
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
        siteId: isHq ? effectiveSiteId || undefined : boundSiteMeta.siteId,
        siteName: isHq ? invSiteName || '골조·형틀 현장' : boundSiteMeta.siteName,
        incidentTitle: invTitle,
        rawSummary: invSummary || activeSeed?.title || '',
        authorLabel: invAuthor,
        zoneAxis: invZone,
        processAxis: invProcess,
        hazardEquipmentAxis: invEquip,
      }),
    [isHq, effectiveSiteId, boundSiteMeta.siteId, boundSiteMeta.siteName, invSiteName, invTitle, invSummary, activeSeed, invAuthor, invZone, invProcess, invEquip],
  );

  const handleCreateVisitPlan = () => {
    if (!isHq) return;
    const rawSite = visitSiteName.trim() || '제1현장 지하 2층 RC구간';
    const resolvedSiteId =
      effectiveSiteId ||
      activeManagedSites.find(s => matchesPortfolioSite(rawSite, s.siteId))?.siteId;
    const plan = createHqVisitPlan(
      {
        siteId: resolvedSiteId,
        visitDate,
        inspectorRole,
        siteName: rawSite,
        purpose: visitPurpose.trim() || livePreVisitPreview.classification.primarySeed.preVisitBriefingPoint,
        zoneAxis: visitZone,
        processAxis: visitProcess,
        hazardEquipmentAxis: visitEquip,
      },
      pipelineCases,
    );
    onVisitPlansChange([plan]);
    onLockOntoStructuralNode(plan.structuralNodeIndex);
    setVisitNotice(
      `[01 행선지·순회점검] ${plan.siteName} 방문 일정과 사전 위험 브리핑(미결 ${plan.preVisitBriefing.openPipelineActionsCount}건·시드 ${plan.preVisitBriefing.matchedCaseCode})이 구체 #${plan.structuralNodeIndex}에 등록되었습니다.`,
    );
    setVisitPurpose('');
  };

  const handleStartVisitInspection = (plan: NexusHqVisitPlan) => {
    if (!isHq) return;
    const note = visitDirectiveNotes[plan.visitId]?.trim();
    const updated = startHqFieldInspection(plan.visitId, note);
    onVisitPlansChange([...updated]);
    onLockOntoStructuralNode(plan.structuralNodeIndex);
    setVisitNotice(
      `[${plan.siteName}] 현장 순회점검이 개시되었습니다. 사전 브리핑 위험요인과 현장 상태를 대조한 뒤 시정조치·인계를 발령하세요.`,
    );
  };

  const handleCompleteVisitWithAction = (plan: NexusHqVisitPlan, dispatchEmergencyTraining = false) => {
    if (!isHq) return;
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
      onTrainingCampaignsChange([createdTrainingCampaign]);
    }
    setVisitNotice(
      dispatchEmergencyTraining
        ? `[${plan.siteName}] 순회점검 결과가 06 조치·재점검·인계 및 04 대표이사 12개국어 특별안전교육으로 동시 환류되었습니다.`
        : `[${plan.siteName}] 순회점검 결과가 06 조치·재점검·인계 파이프라인으로 즉시 환류되었습니다.`,
    );
  };

  const handleRequestInvestigationRevision = (inv: NexusAiInvestigationRecord) => {
    if (!isHq) return;
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
    const resolvedSiteId =
      item.siteId || (!isHq ? boundSiteMeta.siteId : effectiveSiteId || undefined);
    const resolvedSiteName = !isHq ? boundSiteMeta.siteName : item.locationLabel;
    const created = submitAiInvestigationRecord({
      siteId: resolvedSiteId,
      siteName: resolvedSiteName,
      incidentTitle: `[현장 에스컬레이션] ${item.locationLabel} · ${item.matchedCaseCode} 중대 위험·아차사고 원인조사`,
      rawSummary: `${item.observationNote} (초기 조치: ${item.actionTitle})`,
      authorLabel: item.assignee || '현장 안전관리자',
      zoneAxis: item.zoneAxis,
      processAxis: item.processAxis,
      hazardEquipmentAxis: item.hazardEquipmentAxis,
    });
    onInvestigationsChange([created]);
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
    onTrainingCampaignsChange([created]);
    onLockOntoStructuralNode(item.structuralNodeIndex);
    onTabChange('training_04');
  };

  const handleCreateAiInvestigation = () => {
    setInvError('');
    const targetSiteName = isHq
      ? invSiteName.trim() || '제1현장 골조·형틀 구간'
      : boundSiteMeta.siteName;
    const resolvedSiteId = isHq
      ? effectiveSiteId || activeManagedSites.find(s => matchesPortfolioSite(targetSiteName, s.siteId))?.siteId
      : boundSiteMeta.siteId;
    const created = submitAiInvestigationRecord({
      siteId: resolvedSiteId,
      siteName: targetSiteName,
      incidentTitle: invTitle.trim(),
      rawSummary:
        invSummary.trim() ||
        `${liveInvestigationPreview.sixW.where} ${liveInvestigationPreview.hazardMechanism} 아차사고`,
      authorLabel: invAuthor.trim() || '현장 안전관리자',
      zoneAxis: invZone,
      processAxis: invProcess,
      hazardEquipmentAxis: invEquip,
    });
    onInvestigationsChange([created]);
    onLockOntoStructuralNode(created.structuralNodeIndex);
    setInvNotice(
      `[05 AI 사고조사 초안] 6하원칙·시계열·3단계 원인(직접/기여/근본) 구조화가 완료되었습니다. 본사 승인 시 02 사고사례 DB 및 04 대표이사 12개국어 안전교육으로 자동 편입됩니다.`,
    );
    setInvTitle('');
    setInvSummary('');
  };

  const handleApproveInvestigation = (inv: NexusAiInvestigationRecord) => {
    if (!isHq) return;
    setInvError('');
    try {
      const result = approveAiInvestigationAndPropagate(inv.investigationId, {
        approverLabel: invApprover.trim() || '본사 CSO·안전보건실장',
        approvalNote: invReviewNotes[inv.investigationId]?.trim() || undefined,
        preventiveMeasureDraft: invPreventiveEdits[inv.investigationId]?.trim() || undefined,
      });
      onInvestigationsChange([...result.updatedInvestigations]);
      onPipelineCreated(result.promotedPipelineCase);
      onTrainingCampaignsChange([result.promotedTrainingCampaign]);
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
  const revisionRequestedCount = investigations.filter(i => i.status === 'revision_requested').length;
  const equipPendingCount = equipmentReports.filter(e => e.status === 'submitted_to_hq').length;
  const equipVerifiedReadyCount = equipmentReports.filter(
    e => e.status === 'hq_verified_for_ceo' || e.status === 'reported_to_ceo',
  ).length;
  const activeVisitCount = visitPlans.filter(v => v.status !== 'action_issued_closed').length;
  const incompleteTrainingCount = trainingCampaigns.filter(t => (t.completionRatePct ?? 0) < 100).length;

  const renderInvestigationDraftForm = (fieldLocked: boolean) => (
    <>
      <div className="nexus-visit-form-grid">
        {fieldLocked ? (
          <div className="nexus-field-locked-site-pill">
            <span>발생 현장 (단일 현장 고정)</span>
            <strong>🔒 {boundSiteMeta.siteName}</strong>
          </div>
        ) : (
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
        )}
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
        {!fieldLocked && (
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
        )}
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

  const renderInvestigationInbox = (showHqControls: boolean) =>
    investigations.length > 0 ? (
      <div className="nexus-3axis-case-list" aria-label="AI 사고조사 및 승인·보완 내역">
        <strong>
          {showHqControls
            ? `05 AI 사고조사 · 본사 최종 결재함 (${investigations.length}건)`
            : `05 ${boundSiteMeta.shortLabel} 상신 및 본사 보완지시 현황 (${investigations.length}건)`}
        </strong>
        <ul>
          {investigations.slice(0, 6).map(inv => (
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
              {showHqControls && inv.status === 'ai_draft_pending_hq' && (
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
      <div className="nexus-empty-action-box">
        <p className="nexus-3axis-case-row-meta">
          현재 선택된 범위에서 결재 대기 또는 승인 완료된 사고조사 건이 없습니다.
        </p>
        {showHqControls && onLoadDemoData && (
          <button type="button" onClick={onLoadDemoData}>
            체험 데이터 불러오기 (3개 현장·장비사진)
          </button>
        )}
      </div>
    );

  const renderEquipmentUploadForm = (fieldLocked: boolean) => (
    <div className="nexus-equip-upload-box">
      <div className="nexus-visit-form-grid">
        {fieldLocked ? (
          <div className="nexus-field-locked-site-pill">
            <span>소속 현장 (고정 · 타현장 선택 불가)</span>
            <strong>🔒 {boundSiteMeta.shortLabel}</strong>
          </div>
        ) : (
          <label>
            <span>대상 현장 선택 (본사 대리 등록)</span>
            <select
              aria-label="건설기계 점검 현장 선택"
              value={eqSiteId}
              onChange={e => setEqSiteId(e.target.value)}
            >
              {activeManagedSites.map(site => (
                <option key={site.siteId} value={site.siteId}>{site.shortLabel}</option>
              ))}
            </select>
          </label>
        )}
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

  const renderEquipmentGalleryAndCeoPack = (showHqControls: boolean) => (
    <div className="nexus-equip-hq-section">
      {showHqControls && (
        <>
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
            <div className="nexus-equip-toolbar-actions">
              {equipPendingCount > 0 && (
                <button
                  type="button"
                  className="nexus-equip-batch-btn"
                  onClick={handleBatchVerifyPendingEquipment}
                >
                  ✅ 대기 사진 일괄 적합 확인 ({equipPendingCount}건)
                </button>
              )}
              <button
                type="button"
                className="nexus-3axis-submit"
                onClick={handleCompileExecutivePhotoPack}
                disabled={equipVerifiedReadyCount === 0}
              >
                선별 사진 대표이사·경영진 1장 보고서 발행 &amp; 보고 완료 ({selectedEquipIds.length > 0 ? selectedEquipIds.length : equipVerifiedReadyCount}건) ↗
              </button>
            </div>
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
                  {onExportExecutivePptx && (
                    <button type="button" className="nexus-3axis-submit" onClick={() => void onExportExecutivePptx()}>
                      📽️ CEO 사진 보고 PPTX 저장
                    </button>
                  )}
                </div>
              </div>
              <pre className="nexus-ceo-pre">{latestExecutivePack.summaryText}</pre>
            </div>
          )}
        </>
      )}

      {equipmentReports.length > 0 && (
        <div className="nexus-equip-filter-bar" role="group" aria-label="건설기계 사진 상태별 필터">
          {[
            ['all', `전체 (${equipmentReports.length})`],
            ['submitted_to_hq', `검토대기 (${equipmentReports.filter(e => e.status === 'submitted_to_hq').length})`],
            ['revision_requested_hq', `보완요청 (${equipmentReports.filter(e => e.status === 'revision_requested_hq').length})`],
            ['hq_verified_for_ceo', `본사적합 (${equipmentReports.filter(e => e.status === 'hq_verified_for_ceo').length})`],
            ['reported_to_ceo', `CEO보고완료 (${equipmentReports.filter(e => e.status === 'reported_to_ceo').length})`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={eqStatusFilter === key}
              onClick={() => setEqStatusFilter(key as typeof eqStatusFilter)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {filteredEquipmentReports.length === 0 ? (
        <div className="nexus-empty-action-box">
          <p className="nexus-3axis-case-row-meta">
            {equipmentReports.length === 0
              ? showHqControls
                ? '접수된 건설기계 사용전 점검 사진이 없습니다. 아래 버튼으로 3대 현장 예시를 즉시 불러올 수 있습니다.'
                : `${boundSiteMeta.shortLabel}에서 본사로 전송한 사용전 점검 사진이 아직 없습니다. 위 양식으로 펌프카·크레인·고소작업대 사진을 전송하세요.`
              : '선택한 상태에 해당하는 건설기계 점검 사진이 없습니다.'}
          </p>
          {equipmentReports.length > 0 && eqStatusFilter !== 'all' && (
            <button type="button" onClick={() => setEqStatusFilter('all')}>
              전체 상태 보기
            </button>
          )}
          {equipmentReports.length === 0 && showHqControls && onLoadDemoData && (
            <button type="button" onClick={onLoadDemoData}>
              체험 데이터 불러오기 (3개 현장·장비사진)
            </button>
          )}
        </div>
      ) : (
        <div
          className="nexus-equip-photo-grid"
          aria-label={showHqControls ? '전사 건설기계 사용전 점검 사진 목록' : '우리 현장 건설기계 사용전 점검 사진 전송 내역'}
        >
          {filteredEquipmentReports.map(item => (
            <article key={item.submissionId} className="nexus-equip-photo-card" data-status={item.status}>
              <div className="nexus-equip-thumb-wrap">
                <button
                  type="button"
                  className="nexus-equip-thumb-btn"
                  aria-label={`${item.siteName} ${item.equipmentLabel} 점검 사진 확대 보기`}
                  onClick={() => setLightboxItem(item)}
                >
                  <img src={item.photoDataUrl} alt={`${item.siteName} ${item.equipmentLabel} 사용전 점검 사진`} className="nexus-equip-thumb" />
                  <span className="nexus-equip-zoom-hint">🔍 확대</span>
                </button>
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
                {item.fieldSupplementNote && (
                  <p className="nexus-equip-supplement-note"><b>현장 보완:</b> {item.fieldSupplementNote}</p>
                )}
                {showHqControls && (item.status === 'hq_verified_for_ceo' || item.status === 'reported_to_ceo') && (
                  <label className="nexus-equip-select-check">
                    <input
                      type="checkbox"
                      checked={selectedEquipIds.includes(item.submissionId)}
                      onChange={e =>
                        setSelectedEquipIds(prev =>
                          e.target.checked
                            ? [...prev, item.submissionId]
                            : prev.filter(id => id !== item.submissionId),
                        )
                      }
                    />
                    <span>CEO 일일 보고서 개별 선별 포함</span>
                  </label>
                )}
                {showHqControls && item.status === 'submitted_to_hq' && (
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
                {!showHqControls && item.status === 'revision_requested_hq' && (
                  <div className="nexus-equip-field-resubmit">
                    <div className="nexus-case-evidence-row">
                      <input
                        type="text"
                        aria-label={`건설기계 사진 보완 메모 ${item.submissionId}`}
                        value={eqResubmitNotesById[item.submissionId] ?? ''}
                        maxLength={180}
                        onChange={e =>
                          setEqResubmitNotesById(prev => ({ ...prev, [item.submissionId]: e.target.value }))
                        }
                        placeholder="보완 촬영 조치 내용 입력 (예: 샤클 풀림방지 핀 근접 재촬영 완료)"
                      />
                      <label className="nexus-photo-upload-chip">
                        <span>📷 보완 사진 재첨부 {eqResubmitPhotosById[item.submissionId]?.name ? `(${eqResubmitPhotosById[item.submissionId].name.slice(0, 12)})` : ''}</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          aria-label={`보완 사진 재첨부 ${item.submissionId}`}
                          onChange={e => handleResubmitPhotoFileChange(item.submissionId, e)}
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      className="nexus-3axis-submit"
                      onClick={() => handleResubmitEquipmentPhoto(item)}
                    >
                      현장 보완 사진 본사 재전송 ↗
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {lightboxItem && (() => {
        const lbIdx = filteredEquipmentReports.findIndex(
          x => x.submissionId === lightboxItem.submissionId,
        );
        const totalLb = filteredEquipmentReports.length;
        const stepLightbox = (delta: number) => {
          if (totalLb <= 1) return;
          const nextIdx = (Math.max(0, lbIdx) + delta + totalLb) % totalLb;
          const nextItem = filteredEquipmentReports[nextIdx];
          if (nextItem) setLightboxItem(nextItem);
        };
        const quickApproveInModal = (decision: 'hq_verified_for_ceo' | 'revision_requested_hq') => {
          handleReviewEquipmentPhoto(lightboxItem, decision);
          const nextPending = filteredEquipmentReports.find(
            x => x.submissionId !== lightboxItem.submissionId && x.status === 'submitted_to_hq',
          );
          if (nextPending) {
            setLightboxItem(nextPending);
          } else {
            setLightboxItem(null);
          }
        };
        return (
          <div
            className="nexus-equip-lightbox-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="건설기계 점검 사진 확대 보기"
            onClick={() => setLightboxItem(null)}
          >
            <div className="nexus-equip-lightbox-dialog" onClick={e => e.stopPropagation()}>
              <div className="nexus-equip-lightbox-head">
                <div>
                  <small>
                    {lightboxItem.siteName} · {lightboxItem.equipmentLabel} · 구체 #{lightboxItem.structuralNodeIndex}
                    {totalLb > 0 && lbIdx >= 0 ? ` (${lbIdx + 1} / ${totalLb})` : ''}
                  </small>
                  <h4>{lightboxItem.workActivity}</h4>
                </div>
                <div className="nexus-lightbox-nav">
                  {totalLb > 1 && (
                    <>
                      <button type="button" onClick={() => stepLightbox(-1)} aria-label="이전 사진 보기">
                        ◀ 이전 사진
                      </button>
                      <button type="button" onClick={() => stepLightbox(1)} aria-label="다음 사진 보기">
                        다음 사진 ▶
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => setLightboxItem(null)} aria-label="사진 확대 창 닫기">
                    ✕ 닫기
                  </button>
                </div>
              </div>
              <img
                src={lightboxItem.photoDataUrl}
                alt={`${lightboxItem.siteName} ${lightboxItem.equipmentLabel} 확대 보기`}
                className="nexus-equip-lightbox-img"
              />
              <p className="nexus-3axis-case-row-meta">
                확인 핵심: {lightboxItem.inspectionPointSummary} · 업로드: {lightboxItem.uploadedBy}
                {lightboxItem.hqReviewNote ? ` · 본사 의견: ${lightboxItem.hqReviewNote}` : ''}
              </p>
              {showHqControls && lightboxItem.status === 'submitted_to_hq' && (
                <div className="nexus-lightbox-decision-bar">
                  <button
                    type="button"
                    className="nexus-3axis-submit"
                    onClick={() => quickApproveInModal('hq_verified_for_ceo')}
                  >
                    ✅ 적합 승인 후 다음 사진
                  </button>
                  <button
                    type="button"
                    className="is-revision-btn"
                    onClick={() => quickApproveInModal('revision_requested_hq')}
                  >
                    🔁 보완 요청 후 다음
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );

  // Determine allowed module tabs based on authority & section
  const visibleTabs: readonly { id: NexusWorkbenchTab; small: string; title: string; badge: string }[] = isHq
    ? [
      {
        id: 'equipment_photo',
        small: '건설기계 사진 · CEO 보고',
        title: '건설기계 사진 검토 · CEO 보고',
        badge: `대기 ${equipPendingCount} · 보고가능 ${equipVerifiedReadyCount}`,
      },
      {
        id: 'investigate_05_02',
        small: '05 · 02 본사 승인',
        title: '05 · 02 사고조사 승인·보완',
        badge: `승인대기 ${pendingApprovalCount}건`,
      },
      {
        id: 'visit_01',
        small: '01 본사 순회점검',
        title: '01 본사 행선지 · 순회점검',
        badge: `일정 ${visitPlans.length}건`,
      },
      {
        id: 'training_04',
        small: '04 대표이사 다국어 교육',
        title: '04 대표이사 다국어 안전교육',
        badge: `캠페인 ${trainingCampaigns.length}건`,
      },
      {
        id: 'inspect_03_06',
        small: '전 현장 실행 관제',
        title: '전 현장 조치·작업중지 관제',
        badge: `미결 ${openActionsCount}건`,
      },
    ]
    : fieldSection === 'execute'
      ? [
        {
          id: 'inspect_03_06',
          small: '03 · 02 · 06 현장 실행',
          title: '30초 사진점검 · 작업중지 · 교대인계',
          badge: `미결 ${openActionsCount}건`,
        },
        {
          id: 'equipment_photo',
          small: '건설기계 사용전 점검',
          title: '건설기계 사용전 사진 본사 전송',
          badge: `전송 ${equipmentReports.length}건`,
        },
      ]
      : [
        {
          id: 'training_04',
          small: '04 본사 하달 교육',
          title: '04 대표이사 12개국어 교육 이행',
          badge: `캠페인 ${trainingCampaigns.length}건`,
        },
        {
          id: 'investigate_05_02',
          small: '05 내 현장 아차사고',
          title: '05 아차사고 상신 · 보완 재상신',
          badge: `보완요청 ${revisionRequestedCount}건`,
        },
        {
          id: 'visit_01',
          small: '01 본사 순회점검 수신',
          title: '01 본사 순회점검 지시 수신',
          badge: `일정 ${visitPlans.length}건`,
        },
      ];

  const resolvedActiveTab: NexusWorkbenchTab = visibleTabs.some(t => t.id === activeTab)
    ? activeTab
    : visibleTabs[0].id;

  return (
    <section
      className="nexus-workbench"
      aria-label={isHq ? '본사 통합 결재·보고·순회 스튜디오' : '현장 단일현장 실행·수신 스튜디오'}
    >
      <div className="nexus-workbench-header">
        <div>
          <span className="nexus-3axis-kicker">
            {isHq
              ? 'HQ SOVEREIGN COMMAND · 전 현장 통합 결재 · CEO 사진 보고 · 순회 지휘'
              : `FIELD ISOLATED WORKSPACE · ${boundSiteMeta.shortLabel} 전용 (타현장 정보 차단됨)`}
          </span>
          <h2>
            {isHq
              ? '본사 CSO 결재 · 건설기계 CEO 보고 · 순회 지휘 통합 스튜디오'
              : fieldSection === 'execute'
                ? `${boundSiteMeta.siteName} — 30초 현장 점검 · 기계 사진 전송`
                : `${boundSiteMeta.siteName} — 본사 하달 교육 · 보완 재상신 · 순회 수신함`}
          </h2>
        </div>
        {isHq ? (
          <div className="nexus-role-action-strip" role="group" aria-label="본사 즉시 처리 큐 바로가기">
            <button type="button" onClick={() => onTabChange('equipment_photo')}>
              🏗️ 기계사진 대기 <b>{equipPendingCount}건</b> · 보고 <b>{equipVerifiedReadyCount}건</b>
            </button>
            <button type="button" onClick={() => onTabChange('investigate_05_02')}>
              05 결재 <b>{pendingApprovalCount}건</b>
            </button>
            <button type="button" onClick={() => onTabChange('visit_01')}>
              01 순회 <b>{activeVisitCount}건</b>
            </button>
            <button type="button" onClick={() => onTabChange('training_04')}>
              04 미이수 <b>{incompleteTrainingCount}건</b>
            </button>
            <button type="button" onClick={() => onTabChange('inspect_03_06')}>
              03·06 미결 <b>{openActionsCount}건</b>
            </button>
          </div>
        ) : (
          <div className="nexus-field-isolation-pill">
            🔒 {boundSiteMeta.shortLabel} 범위만 표시 ({activeSiteLabel})
          </div>
        )}
      </div>

      {isHq && (
        <details className="nexus-site-master-details">
          <summary>🏗️ 우리 회사 현장 · 투입 건설기계 마스터 관리 ({activeManagedSites.length}개 활성 현장)</summary>
          <div className="nexus-site-master-panel">
            {siteMasterNotice && <p role="status" className="nexus-3axis-feedback">{siteMasterNotice}</p>}
            <div className="nexus-visit-form-grid">
              <label>
                <span>신규 현장명</span>
                <input
                  type="text"
                  aria-label="신규 현장명 입력"
                  value={newSiteName}
                  maxLength={80}
                  onChange={e => setNewSiteName(e.target.value)}
                  placeholder="예: 제4현장 인천 물류센터 골조"
                />
              </label>
              <label>
                <span>단축 라벨</span>
                <input
                  type="text"
                  aria-label="현장 단축 라벨"
                  value={newSiteShortLabel}
                  maxLength={40}
                  onChange={e => setNewSiteShortLabel(e.target.value)}
                  placeholder="예: 제4현장 · 인천 골조·PC"
                />
              </label>
              <label>
                <span>주력 구간·공정</span>
                <select
                  aria-label="신규 현장 주력 구간"
                  value={newSiteZone}
                  onChange={e => setNewSiteZone(e.target.value as NexusZoneAxis)}
                >
                  {NEXUS_ZONE_AXIS_OPTIONS.map(o => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>세부 주력 공정</span>
                <select
                  aria-label="신규 현장 세부 공정"
                  value={newSiteProcess}
                  onChange={e => setNewSiteProcess(e.target.value as NexusProcessAxis)}
                >
                  {NEXUS_PROCESS_AXIS_OPTIONS.map(o => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>현장 안전책임자</span>
                <input
                  type="text"
                  aria-label="현장 안전책임자"
                  value={newSiteManager}
                  maxLength={40}
                  onChange={e => setNewSiteManager(e.target.value)}
                  placeholder="예: 박안전 소장"
                />
              </label>
              <label>
                <span>투입 건설기계(쉼표 구분)</span>
                <input
                  type="text"
                  aria-label="투입 건설기계 목록"
                  value={newSiteEquipInput}
                  maxLength={140}
                  onChange={e => setNewSiteEquipInput(e.target.value)}
                />
              </label>
            </div>
            <div className="nexus-3axis-case-row-actions">
              <button
                type="button"
                className="nexus-3axis-submit"
                onClick={() => {
                  try {
                    const { sites, savedSite } = upsertManagedNexusSite({
                      siteName: newSiteName,
                      shortLabel: newSiteShortLabel || undefined,
                      focusZone: newSiteZone,
                      focusProcess: newSiteProcess,
                      managerName: newSiteManager || undefined,
                      registeredEquipment: newSiteEquipInput.split(',').map(v => v.trim()).filter(Boolean),
                    });
                    setManagedSites(sites);
                    setNewSiteName('');
                    setNewSiteShortLabel('');
                    setNewSiteManager('');
                    setSiteMasterNotice(`[현장 마스터 등록] ${savedSite.shortLabel} 현장이 본사·현장 격리 포트폴리오에 반영되었습니다.`);
                  } catch (err) {
                    setSiteMasterNotice(err instanceof Error ? err.message : '현장 등록 정보를 확인해 주세요.');
                  }
                }}
              >
                + 우리 회사 현장 추가 · 즉시 반영
              </button>
              <button
                type="button"
                onClick={() => {
                  const defaults = resetManagedNexusSites();
                  setManagedSites(defaults);
                  setSiteMasterNotice('기본 골조 3대 포트폴리오 마스터로 초기화했습니다.');
                }}
              >
                기본 3대 현장 복원
              </button>
            </div>
            <ul className="nexus-site-master-list" aria-label="등록된 회사 현장 마스터 목록">
              {managedSites.map(site => (
                <li key={site.siteId} data-archived={site.archived ? 'true' : 'false'}>
                  <div>
                    <strong>{site.shortLabel}</strong>
                    <small>
                      책임: {site.managerName || '미지정'} · 장비: {site.registeredEquipment.join(', ') || '미등록'}
                    </small>
                  </div>
                  <div className="nexus-3axis-case-row-actions">
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const next = archiveManagedNexusSite(site.siteId, !site.archived);
                          setManagedSites(next);
                          setSiteMasterNotice(
                            site.archived
                              ? `[현장 복원] ${site.shortLabel} 현장을 다시 활성화했습니다.`
                              : `[준공·보관 처리] ${site.shortLabel} 현장을 활성 관제 목록에서 보관했습니다.`,
                          );
                        } catch (err) {
                          setSiteMasterNotice(err instanceof Error ? err.message : '변경 불가');
                        }
                      }}
                    >
                      {site.archived ? '현장 재활성화' : '준공·보관'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}

      <div className="nexus-workbench-tabs" role="tablist" aria-label="권한별 전용 업무 모듈 선택">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={resolvedActiveTab === tab.id}
            className={'nexus-workbench-tab' + (resolvedActiveTab === tab.id ? ' is-active' : '')}
            onClick={() => onTabChange(tab.id)}
          >
            <small>{tab.small}</small>
            <span>{tab.title}</span>
            <b>{tab.badge}</b>
          </button>
        ))}
      </div>

      <div className="nexus-workbench-panel">
        {resolvedActiveTab === 'inspect_03_06' && (
          <InspectorNexus3AxisBridge
            workspaceRole={workspaceRole}
            note=""
            source="safety-nexus-quick"
            lockedSiteId={isHq ? undefined : boundSiteMeta.siteId}
            lockedSiteName={isHq ? undefined : boundSiteMeta.siteName}
            cases={pipelineCases}
            onCaseCreated={onPipelineCreated}
            onCaseUpdated={onPipelineUpdated}
            onEscalateToInvestigation={handleEscalateCaseToInvestigation}
            onDispatchTrainingForCase={isHq ? handleDispatchTrainingFromCase : undefined}
          />
        )}

        {resolvedActiveTab === 'equipment_photo' && (
          <div className="nexus-equip-studio" aria-label="건설기계 사용전 점검 사진 스튜디오">
            <div className="nexus-3axis-bridge-head">
              <div>
                <span className="nexus-3axis-kicker">
                  {isHq
                    ? 'HQ EQUIPMENT VERIFICATION · 전 현장 사용전 사진 검토 → 대표이사·경영진 일일 1장 보고'
                    : 'FIELD EQUIPMENT UPLOAD · 작업 투입 전 건설기계 안전사진 촬영·본사 전송'}
                </span>
                <h3>
                  {isHq
                    ? '건설기계(펌프카·크레인·고소작업대) 사용전 점검 사진 · 경영진 보고'
                    : `${boundSiteMeta.shortLabel} 건설기계 사용전 점검 사진 본사 전송`}
                </h3>
              </div>
              <span className="nexus-3axis-confidence">
                접수 {equipmentReports.length}건 · 본사 적합·보고 {equipVerifiedReadyCount}건
              </span>
            </div>

            {eqError && <p role="alert" className="nexus-inv-error">{eqError}</p>}
            {eqNotice && <p role="status" className="nexus-3axis-feedback">{eqNotice}</p>}

            {isHq ? (
              <>
                {renderEquipmentGalleryAndCeoPack(true)}
                <details className="nexus-collapsible-form">
                  <summary>+ 현장 사용전 점검 사진 대리 등록 열기</summary>
                  {renderEquipmentUploadForm(false)}
                </details>
              </>
            ) : (
              <>
                {renderEquipmentUploadForm(true)}
                {renderEquipmentGalleryAndCeoPack(false)}
              </>
            )}
          </div>
        )}

        {resolvedActiveTab === 'training_04' && (
          <NexusExecutiveTrainingBridge
            workspaceRole={workspaceRole}
            siteLabel={boundSiteMeta.shortLabel}
            siteId={boundSiteMeta.siteId}
            activeSeed={activeSeed}
            campaigns={trainingCampaigns}
            onCampaignsChange={onTrainingCampaignsChange}
            onOpenAdminTraining={onOpenAdminTraining}
          />
        )}

        {resolvedActiveTab === 'visit_01' && (
          <div className="nexus-hq-visit-studio" aria-label="01 본사 행선지·순회점검 스튜디오">
            <div className="nexus-3axis-bridge-head">
              <div>
                <span className="nexus-3axis-kicker">
                  {isHq
                    ? 'SLICE 4A · 01 행선지·현장점검 → 방문 전 미해결 위험·유사사고 자동 브리핑 → 현장 점검·조치 환류'
                    : `FIELD VISIT INBOX · ${boundSiteMeta.shortLabel} 대상 본사 순회점검 일정·사전지시 수신함`}
                </span>
                <h3>
                  {isHq
                    ? '01 본사 행선지 등록 및 방문 전 자동 위험 브리핑 (Pre-Visit Briefing)'
                    : `01 우리 현장(${boundSiteMeta.shortLabel}) 본사 순회점검 및 사전 지시사항`}
                </h3>
              </div>
              {isHq && (
                <span className="nexus-3axis-confidence">
                  연계 구체 포인트 #{livePreVisitPreview.classification.structuralNodeIndex} · 시드 [{livePreVisitPreview.briefing.matchedCaseCode}]
                </span>
              )}
            </div>

            {isHq && (
              <>
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
              </>
            )}

            {visitNotice && <p role="status" className="nexus-3axis-feedback">{visitNotice}</p>}

            {visitPlans.length > 0 ? (
              <div className="nexus-3axis-case-list" aria-label="본사 행선지 및 순회점검 이행 목록">
                <strong>
                  {isHq
                    ? `등록된 본사 행선지 · 순회점검 브리핑 및 조치 이행 (${visitPlans.length}건)`
                    : `${boundSiteMeta.shortLabel} 예정·완료된 본사 순회점검 (${visitPlans.length}건)`}
                </strong>
                <ul>
                  {visitPlans.slice(0, 5).map(plan => (
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
                      {!isHq && plan.preVisitBriefing.keyBriefingPoints.length > 0 && (
                        <ul className="nexus-field-visit-bullets">
                          {plan.preVisitBriefing.keyBriefingPoints.map((pt, idx) => (
                            <li key={idx}>{pt}</li>
                          ))}
                        </ul>
                      )}
                      {plan.fieldAcknowledgedAt && (
                        <p className="nexus-visit-ack-badge">
                          ✅ 현장 접수 완료 ({plan.fieldAcknowledgedBy || '현장 안전관리자'}): {plan.fieldAcknowledgeNote}
                        </p>
                      )}
                      {!isHq && !plan.fieldAcknowledgedAt && (
                        <div className="nexus-visit-ack-box">
                          <div className="nexus-case-evidence-row">
                            <input
                              type="text"
                              aria-label={`본사 순회점검 현장 접수 메모 ${plan.visitId}`}
                              value={visitAckNotesById[plan.visitId] ?? ''}
                              maxLength={180}
                              onChange={e =>
                                setVisitAckNotesById(prev => ({ ...prev, [plan.visitId]: e.target.value }))
                              }
                              placeholder="현장 사전 준비 완료 메모 (예: 지하 2층 동바리·개구부 사전 확인 및 안내 준비 완료)"
                            />
                          </div>
                          <div className="nexus-3axis-case-row-actions">
                            <button type="button" onClick={() => handleAcknowledgeVisitByField(plan)}>
                              ✅ 현장 접수 확인 · 사전 준비 완료 응답
                            </button>
                          </div>
                        </div>
                      )}
                      {isHq && plan.status !== 'action_issued_closed' && (
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
            ) : (
              <p className="nexus-3axis-case-row-meta">
                {isHq
                  ? '등록된 본사 행선지가 없습니다.'
                  : `${boundSiteMeta.shortLabel} 대상으로 배정된 본사 순회점검 일정이 없습니다.`}
              </p>
            )}
          </div>
        )}

        {resolvedActiveTab === 'investigate_05_02' && (
          <div className="nexus-ai-investigation-studio" aria-label="05 AI 사고조사·원인분석 스튜디오">
            <div className="nexus-3axis-bridge-head">
              <div>
                <span className="nexus-3axis-kicker">
                  {isHq
                    ? 'SLICE 4B · 05 AI 사고조사(6하원칙·시계열·원인) → 본사 승인 → 02 사고사례 DB & 04 대표이사 교육 자동 편입'
                    : `FIELD INVESTIGATION SUBMISSION · ${boundSiteMeta.shortLabel} 아차사고 초안 상신 및 보완 재상신`}
                </span>
                <h3>
                  {isHq
                    ? '05 AI 사고조사·원인분석 본사 승인 및 전 현장 환류 스튜디오'
                    : `05 ${boundSiteMeta.shortLabel} 아차사고 초안 상신 및 본사 보완 지시 대응`}
                </h3>
              </div>
              <span className="nexus-3axis-confidence">
                AI 초안 · 본사 승인 전 확정 아님 · 구체 #{liveInvestigationPreview.structuralNodeIndex}
              </span>
            </div>

            {isHq ? (
              <>
                {invError && <p role="alert" className="nexus-inv-error">{invError}</p>}
                {invNotice && <p role="status" className="nexus-3axis-feedback">{invNotice}</p>}
                {renderInvestigationInbox(true)}
                <details className="nexus-collapsible-form">
                  <summary>+ 현장 사고조사 초안 대리 작성 열기</summary>
                  {renderInvestigationDraftForm(false)}
                </details>
              </>
            ) : (
              <>
                {renderInvestigationDraftForm(true)}
                {invError && <p role="alert" className="nexus-inv-error">{invError}</p>}
                {invNotice && <p role="status" className="nexus-3axis-feedback">{invNotice}</p>}
                {renderInvestigationInbox(false)}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

import { beforeEach, describe, expect, it } from 'vitest';
import {
  acknowledgeHqVisitByField,
  approveAiInvestigationAndPropagate,
  buildMultiSitePortfolioMatrix,
  buildRoleCommandDigest,
  completeHqVisitWithFieldAction,
  createHqVisitPlan,
  readApprovedCustomIncidentSeeds,
  requestAiInvestigationRevision,
  resubmitAiInvestigationRecord,
  scopeNexusWorkspaceData,
  seedMultiSiteOperationalSimulation,
  startHqFieldInspection,
  submitAiInvestigationRecord,
  summarizeHqLoopForOrbitLayer,
  writeAiInvestigations,
  writeApprovedCustomIncidentSeeds,
  writeHqVisitPlans,
} from '../utils/nexusHqCommandLoop';
import { readExecutiveTrainingCampaigns, writeExecutiveTrainingCampaigns } from '../utils/nexusExecutiveTrainingPipeline';
import { createNexusPipelineCase, readNexusPipelineCases, writeNexusPipelineCases } from '../utils/nexusQuickPipeline';
import { writeEquipmentPhotoSubmissions } from '../utils/nexusEquipmentPhotoReport';

describe('Slice 4 · 01 HQ Pre-Visit Briefing + 05 AI Root-Cause Investigation Approval -> 02 Incident DB & 04 Training Auto-Propagation', () => {
  beforeEach(() => {
    writeHqVisitPlans([]);
    writeAiInvestigations([]);
    writeApprovedCustomIncidentSeeds([]);
    writeNexusPipelineCases([]);
    writeExecutiveTrainingCampaigns([]);
  });

  it('registers an HQ visit plan with automatic pre-visit risk briefing, starts field inspection, and issues field inspection actions + emergency 12-lang training into Slice 2 & 3', () => {
    const visit = createHqVisitPlan(
      {
        visitDate: '2026-11-22',
        inspectorRole: '본사 안전보건팀장',
        siteName: '제1현장 지하 2층 RC 구간',
        purpose: '지하 외벽 거푸집 측압·타이볼트 및 개구부 방호 점검',
      },
      [],
      '2026-11-21T09:00:00Z',
    );

    expect(visit.zoneAxis).toBe('substructure_rc');
    expect(visit.structuralNodeIndex).toBe('01');
    expect(visit.preVisitBriefing.matchedCaseCode).toBe('RC-SUB-01');
    expect(visit.preVisitBriefing.keyBriefingPoints.length).toBe(3);

    const started = startHqFieldInspection(
      visit.visitId,
      '지하 2층 합벽 구간 도착, 타이볼트 간격 실측 개시',
      '2026-11-22T10:00:00Z',
    );
    expect(started[0].status).toBe('in_field_inspection');

    const { updatedPlans, createdPipelineCase, createdTrainingCampaign } = completeHqVisitWithFieldAction(
      visit.visitId,
      '지하 2층 북측 타이볼트 2개소 보강 및 피트 개구부 덮개 즉시 고정 지시',
      '2026-11-22T11:00:00Z',
      { dispatchEmergencyTraining: true, targetWorkers: 14 },
    );
    expect(updatedPlans[0].status).toBe('action_issued_closed');
    expect(createdPipelineCase).not.toBeNull();
    expect(createdPipelineCase?.structuralNodeIndex).toBe('01');
    expect(createdTrainingCampaign).not.toBeNull();
    expect(createdTrainingCampaign?.targetWorkers).toBe(14);
    expect(readNexusPipelineCases()).toHaveLength(1);
    expect(readExecutiveTrainingCampaigns()).toHaveLength(1);
  });

  it('seeds a 3-site operational portfolio simulation and computes multi-site urgency matrix scorecards', () => {
    const seeded = seedMultiSiteOperationalSimulation('2026-11-21T08:00:00Z');
    expect(seeded.cases.length).toBeGreaterThanOrEqual(3);
    expect(seeded.visits.length).toBeGreaterThanOrEqual(2);
    expect(seeded.investigations.length).toBeGreaterThanOrEqual(2);
    expect(seeded.campaigns.length).toBeGreaterThanOrEqual(1);
    expect(seeded.equipmentReports.length).toBeGreaterThanOrEqual(3);

    const matrix = buildMultiSitePortfolioMatrix(
      seeded.cases,
      seeded.visits,
      seeded.investigations,
      seeded.campaigns,
      '2026-11-21',
    );
    expect(matrix).toHaveLength(3);
    expect(matrix[0].siteId).toBe('SITE-01-SUBRC');
    expect(matrix[0].openActionsCount).toBeGreaterThanOrEqual(1);
    expect(matrix[0].revisionRequestedCount).toBe(1);
    expect(matrix[1].siteId).toBe('SITE-02-GANGFORM');
    expect(matrix[1].pendingApprovalsCount).toBe(1);
  });

  it('supports HQ revision request -> field manager supplement & resubmission -> HQ CSO approval & auto-propagation', () => {
    const draft = submitAiInvestigationRecord(
      {
        siteName: '제2현장 14층 골조 구간',
        rawSummary: '14층 외벽 갱폼 인상 작업 중 타워크레인 인양고리 장력 확인 전 고정 앵커볼트 선해체 아차사고',
        authorLabel: '현장 안전관리자 김현장',
      },
      '2026-11-21T10:00:00Z',
    );

    expect(draft.processAxis).toBe('gangform');
    expect(draft.structuralNodeIndex).toBe('03');
    expect(draft.timeline).toHaveLength(4);
    expect(draft.status).toBe('ai_draft_pending_hq');

    // Author cannot self-approve or self-request revision
    expect(() =>
      approveAiInvestigationAndPropagate(draft.investigationId, {
        approverLabel: '현장 안전관리자 김현장',
      }),
    ).toThrow(/직무 분리 원칙/);

    // HQ CSO requests revision first
    const afterRevisionReq = requestAiInvestigationRevision(
      draft.investigationId,
      {
        reviewerLabel: '본사 CSO 박본사',
        revisionNote: '타워크레인 신호수와 갱폼 내부 작업자 간 무전 교신 절차 보강 방안을 명시해 재상신 바랍니다.',
      },
      '2026-11-21T10:30:00Z',
    );
    expect(afterRevisionReq[0].status).toBe('revision_requested');
    expect(afterRevisionReq[0].revisionNote).toContain('무전 교신');

    // Field Safety Manager digest reflects revision request
    const fieldDigest = buildRoleCommandDigest(
      'field_manager',
      'SITE-02-GANGFORM',
      [],
      [],
      afterRevisionReq,
      [],
    );
    expect(fieldDigest.revisionRequestedCount).toBe(1);

    // Field Safety Manager supplements and resubmits
    const afterResubmit = resubmitAiInvestigationRecord(
      draft.investigationId,
      {
        supplementNote: '인양고리 장력 확인 후 무전 승인 하에 볼트 해체하도록 2인1조 교차확인 절차 반영',
      },
      '2026-11-21T11:00:00Z',
    );
    expect(afterResubmit[0].status).toBe('ai_draft_pending_hq');
    expect(afterResubmit[0].preventiveMeasureDraft).toContain('2인1조 교차확인');

    // HQ CSO approves -> promotes to 02 Incident DB, 04 12-Lang Training, and 06 Action/Handover
    const approved = approveAiInvestigationAndPropagate(
      draft.investigationId,
      {
        approverLabel: '본사 CSO 박본사',
        targetWorkers: 18,
      },
      '2026-11-21T12:00:00Z',
    );

    expect(approved.updatedInvestigations[0].status).toBe('hq_approved_propagated');
    expect(approved.promotedSeed.caseCode).toMatch(/^HQ-GF-LIFT-03-/);
    expect(readApprovedCustomIncidentSeeds()).toHaveLength(1);
    expect(readExecutiveTrainingCampaigns()).toHaveLength(1);
    expect(readExecutiveTrainingCampaigns()[0].targetWorkers).toBe(18);
    expect(readNexusPipelineCases()).toHaveLength(1);

    const moduleSummary = summarizeHqLoopForOrbitLayer('modules', [], approved.updatedInvestigations);
    expect(moduleSummary[4].nodeIndex).toBe('05'); // 05 AI 사고조사
    expect(moduleSummary[4].approvedPropagatedCount).toBe(1);
  });

  it('strictly isolates single-site records for field mode while allowing full all-site and drilldown views for HQ mode', () => {
    writeEquipmentPhotoSubmissions([]);
    const seeded = seedMultiSiteOperationalSimulation('2026-11-24T06:00:00Z');
    // Also verify explicit siteId binding overrides misleading free-text keywords (e.g. '갱폼' in Site 1)
    const miswordedSite1Case = createNexusPipelineCase(
      {
        siteId: 'SITE-01-SUBRC',
        locationLabel: 'B2층 자재반입구 (갱폼 자재 적치 확인)',
        observationNote: '갱폼 자재 임시 거치대 고정상태 점검',
      },
      '2026-11-24T06:05:00Z',
    );
    const allCases = [miswordedSite1Case, ...seeded.cases];

    const site1Field = scopeNexusWorkspaceData({
      workspaceRole: 'field',
      assignedFieldSiteId: 'SITE-01-SUBRC',
      pipelineCases: allCases,
      visitPlans: seeded.visits,
      investigations: seeded.investigations,
      trainingCampaigns: seeded.campaigns,
      equipmentReports: seeded.equipmentReports,
    });

    expect(site1Field.effectiveSiteId).toBe('SITE-01-SUBRC');
    expect(site1Field.pipelineCases.some(c => c.caseId === miswordedSite1Case.caseId)).toBe(true);
    expect(site1Field.pipelineCases.every(c => c.siteId === 'SITE-01-SUBRC')).toBe(true);
    expect(site1Field.visitPlans.every(v => v.siteId === 'SITE-01-SUBRC')).toBe(true);
    expect(site1Field.investigations.every(i => i.siteId === 'SITE-01-SUBRC')).toBe(true);

    // Field manager acknowledges HQ visit briefing
    const site1Visit = site1Field.visitPlans[0];
    expect(site1Visit).toBeDefined();
    const acked = acknowledgeHqVisitByField(
      site1Visit!.visitId,
      { responderLabel: '제1현장 안전관리자', note: '사전 브리핑 미결 위험 확인 및 현장 안내 준비 완료' },
      '2026-11-24T06:30:00Z',
    );
    expect(acked.find(v => v.visitId === site1Visit!.visitId)?.fieldAcknowledgedBy).toBe('제1현장 안전관리자');
    expect(acked.find(v => v.visitId === site1Visit!.visitId)?.fieldAcknowledgeNote).toContain('준비 완료');
    expect(site1Field.equipmentReports.every(e => e.siteId === 'SITE-01-SUBRC')).toBe(true);
    expect(site1Field.investigations.some(i => i.siteName.includes('제2현장'))).toBe(false);
    expect(site1Field.visitPlans.some(v => v.siteName.includes('제3현장'))).toBe(false);

    const hqAll = scopeNexusWorkspaceData({
      workspaceRole: 'hq',
      selectedSiteId: '',
      pipelineCases: allCases,
      visitPlans: seeded.visits,
      investigations: seeded.investigations,
      trainingCampaigns: seeded.campaigns,
      equipmentReports: seeded.equipmentReports,
    });
    expect(hqAll.pipelineCases).toHaveLength(allCases.length);
    expect(hqAll.visitPlans).toHaveLength(seeded.visits.length);
    expect(hqAll.investigations).toHaveLength(seeded.investigations.length);
    expect(hqAll.equipmentReports).toHaveLength(seeded.equipmentReports.length);

    const hqSite2Drill = scopeNexusWorkspaceData({
      workspaceRole: 'hq',
      selectedSiteId: 'SITE-02-GANGFORM',
      pipelineCases: allCases,
      visitPlans: seeded.visits,
      investigations: seeded.investigations,
      trainingCampaigns: seeded.campaigns,
      equipmentReports: seeded.equipmentReports,
    });
    expect(hqSite2Drill.pipelineCases.every(c => c.siteId === 'SITE-02-GANGFORM')).toBe(true);
    expect(hqSite2Drill.investigations.every(i => i.siteId === 'SITE-02-GANGFORM')).toBe(true);
    expect(hqSite2Drill.equipmentReports.every(e => e.siteId === 'SITE-02-GANGFORM')).toBe(true);
  });
});

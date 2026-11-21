import { beforeEach, describe, expect, it } from 'vitest';
import {
  approveAiInvestigationAndPropagate,
  buildRoleCommandDigest,
  completeHqVisitWithFieldAction,
  createHqVisitPlan,
  readApprovedCustomIncidentSeeds,
  requestAiInvestigationRevision,
  resubmitAiInvestigationRecord,
  startHqFieldInspection,
  submitAiInvestigationRecord,
  summarizeHqLoopForOrbitLayer,
  writeAiInvestigations,
  writeApprovedCustomIncidentSeeds,
  writeHqVisitPlans,
} from '../utils/nexusHqCommandLoop';
import { readExecutiveTrainingCampaigns, writeExecutiveTrainingCampaigns } from '../utils/nexusExecutiveTrainingPipeline';
import { readNexusPipelineCases, writeNexusPipelineCases } from '../utils/nexusQuickPipeline';

describe('Slice 4 · 01 HQ Pre-Visit Briefing + 05 AI Root-Cause Investigation Approval -> 02 Incident DB & 04 Training Auto-Propagation', () => {
  beforeEach(() => {
    writeHqVisitPlans([]);
    writeAiInvestigations([]);
    writeApprovedCustomIncidentSeeds([]);
    writeNexusPipelineCases([]);
    writeExecutiveTrainingCampaigns([]);
  });

  it('registers an HQ visit plan with automatic pre-visit risk briefing, starts field inspection, and issues field inspection actions into Slice 2', () => {
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

    const { updatedPlans, createdPipelineCase } = completeHqVisitWithFieldAction(
      visit.visitId,
      '지하 2층 북측 타이볼트 2개소 보강 및 피트 개구부 덮개 즉시 고정 지시',
      '2026-11-22T11:00:00Z',
    );
    expect(updatedPlans[0].status).toBe('action_issued_closed');
    expect(createdPipelineCase).not.toBeNull();
    expect(createdPipelineCase?.structuralNodeIndex).toBe('01');
    expect(readNexusPipelineCases()).toHaveLength(1);
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
});

import { beforeEach, describe, expect, it } from 'vitest';
import {
  batchVerifyPendingEquipmentPhotosByHq,
  buildUnifiedCeoDailyBriefing,
  compileExecutivePhotoBriefingPack,
  readEquipmentPhotoSubmissions,
  resubmitEquipmentPhotoByField,
  reviewEquipmentPhotoByHq,
  seedEquipmentPhotoSimulation,
  submitEquipmentPhotoReport,
  writeEquipmentPhotoSubmissions,
} from '../utils/nexusEquipmentPhotoReport';
import {
  buildExecutiveBentoSnapshot,
  buildExecutiveDashboardCsv,
} from '../utils/nexusExecutiveBentoMetrics';
import { seedMultiSiteOperationalSimulation } from '../utils/nexusHqCommandLoop';
import { writeNexusPipelineCases } from '../utils/nexusQuickPipeline';
import { writeExecutiveTrainingCampaigns } from '../utils/nexusExecutiveTrainingPipeline';

describe('Equipment Pre-Use Photo Report & Sovereign Executive Bento Metrics', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    writeEquipmentPhotoSubmissions([]);
    writeNexusPipelineCases([]);
    writeExecutiveTrainingCampaigns([]);
  });

  it('submits equipment pre-use photo, enforces HQ separation-of-duty, compiles CEO briefing pack with CSV formula escaping', () => {
    const pumpSubmission = submitEquipmentPhotoReport(
      {
        siteId: 'SITE-01-SUBRC',
        siteName: '제1현장 지하 2층 RC구간',
        equipmentType: 'concrete_pump_car',
        workActivity: '=CMD|calc!A0 지하 2층 타설 펌프카 점검',
        inspectionPointSummary: '아웃트리거 깔판 보강',
        uploadedBy: '현장 안전관리자 김안전',
      },
      '2026-11-22T07:30:00Z',
    );
    expect(pumpSubmission.status).toBe('submitted_to_hq');
    expect(pumpSubmission.structuralNodeIndex).toBe('06');

    const craneSubmission = submitEquipmentPhotoReport(
      {
        siteId: 'SITE-02-GANGFORM',
        siteName: '제2현장 103동 15층 갱폼',
        equipmentType: 'tower_crane',
        workActivity: '+타워크레인 인양 샤클·무전 신호수 확인',
        uploadedBy: '현장 안전관리자 이안전',
      },
      '2026-11-22T07:45:00Z',
    );
    expect(craneSubmission.structuralNodeIndex).toBe('09');

    // Same person cannot HQ-review their own uploaded inspection photo
    expect(() =>
      reviewEquipmentPhotoByHq(pumpSubmission.submissionId, {
        decision: 'hq_verified_for_ceo',
        reviewerLabel: '현장 안전관리자 김안전',
      }),
    ).toThrow(/직무 분리 원칙/);

    const afterHqRevision = reviewEquipmentPhotoByHq(
      craneSubmission.submissionId,
      {
        decision: 'revision_requested_hq',
        reviewerLabel: '본사 안전보건실 박실장',
        reviewNote: '샤클 풀림방지 핀 정면 클로즈업 추가 촬영 요망',
      },
      '2026-11-22T08:00:00Z',
    );
    expect(afterHqRevision.find(r => r.submissionId === craneSubmission.submissionId)?.status).toBe(
      'revision_requested_hq',
    );

    const afterHqVerified = reviewEquipmentPhotoByHq(
      pumpSubmission.submissionId,
      {
        decision: 'hq_verified_for_ceo',
        reviewerLabel: '본사 안전보건실 박실장',
        reviewNote: '깔판 및 잭 지지상태 양호 · 경영진 일일 보고 편입 적합',
      },
      '2026-11-22T08:10:00Z',
    );
    expect(afterHqVerified.find(r => r.submissionId === pumpSubmission.submissionId)?.status).toBe(
      'hq_verified_for_ceo',
    );

    const pack = compileExecutivePhotoBriefingPack(
      [pumpSubmission.submissionId],
      {
        reporterLabel: '본사 CSO · 안전보건실',
        ceoAudienceLabel: '대표이사·경영진 일일 안전보고',
      },
      '2026-11-22T08:30:00Z',
    );
    expect(pack.totalPhotos).toBe(1);
    expect(pack.verifiedCount).toBe(1);
    expect(pack.siteCoverageCount).toBe(1);
    expect(pack.summaryText).toContain('대표이사·경영진 일일 안전보고');
    expect(pack.csvContent.startsWith('\uFEFF')).toBe(true);
    // Formula injection neutralization uses leading tab inside escaped CSV cell
    expect(pack.csvContent).toContain('\t=CMD|calc!A0');
    const latestStore = readEquipmentPhotoSubmissions();
    expect(latestStore.find(s => s.submissionId === pumpSubmission.submissionId)?.status).toBe(
      'reported_to_ceo',
    );
    expect(latestStore.find(s => s.submissionId === craneSubmission.submissionId)?.status).toBe(
      'revision_requested_hq',
    );
  });

  it('computes 4 executive KPIs, 4x5 heatmap cells, 3 site combo series, 5 funnel stages, and safe CSV export', () => {
    const seeded = seedMultiSiteOperationalSimulation('2026-11-22T08:00:00Z');
    const equipSeeded = seedEquipmentPhotoSimulation('2026-11-22T08:15:00Z');
    expect(equipSeeded.length).toBeGreaterThanOrEqual(3);

    const snapshot = buildExecutiveBentoSnapshot({
      pipelineCases: seeded.cases,
      visitPlans: seeded.visits,
      investigations: seeded.investigations,
      trainingCampaigns: seeded.campaigns,
      equipmentReports: equipSeeded,
      selectedSiteId: '',
      asOfDate: '2026-11-22',
    });

    expect(snapshot.kpis).toHaveLength(4);
    expect(snapshot.heatmapRows).toHaveLength(4);
    snapshot.heatmapRows.forEach(row => {
      expect(row.cells).toHaveLength(5);
    });
    expect(snapshot.siteComboSeries).toHaveLength(3);
    expect(snapshot.funnelStages).toHaveLength(5);

    const csv = buildExecutiveDashboardCsv(snapshot);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('전 현장 조치 종결률');
    expect(csv).toContain('건설기계 사용전 사진보고');
  });

  it('supports field equipment photo resubmission, HQ batch verification with separation-of-duty, and unified CEO daily briefing', () => {
    const ownUpload = submitEquipmentPhotoReport(
      {
        siteId: 'SITE-01-SUBRC',
        equipmentType: 'concrete_pump_car',
        workActivity: '펌프카 아웃트리거 점검',
        uploadedBy: '본사 안전보건실 박실장',
      },
      '2026-11-24T07:00:00Z',
    );
    const fieldUpload = submitEquipmentPhotoReport(
      {
        siteId: 'SITE-02-GANGFORM',
        siteName: '=FORMULA() 제2현장 103동',
        equipmentType: 'tower_crane',
        workActivity: '타워크레인 샤클 근접 점검',
        uploadedBy: '제2현장 안전관리자 이현장',
      },
      '2026-11-24T07:10:00Z',
    );

    // HQ requests revision on fieldUpload, then Field resubmits -> back to submitted_to_hq
    reviewEquipmentPhotoByHq(
      fieldUpload.submissionId,
      { decision: 'revision_requested_hq', reviewerLabel: '본사 안전보건실 박실장', reviewNote: '샤클 핀 재촬영 요망' },
      '2026-11-24T07:20:00Z',
    );
    const afterResubmit = resubmitEquipmentPhotoByField(
      fieldUpload.submissionId,
      { supplementNote: '샤클 핀 풀림방지 클로즈업 재촬영 완료', resubmittedBy: '제2현장 안전관리자 이현장' },
      '2026-11-24T07:30:00Z',
    );
    const resubmittedItem = afterResubmit.find(i => i.submissionId === fieldUpload.submissionId);
    expect(resubmittedItem?.status).toBe('submitted_to_hq');
    expect(resubmittedItem?.fieldSupplementNote).toContain('재촬영');

    // Batch verify by 박실장 should verify fieldUpload and skip ownUpload by separation-of-duty
    const batch = batchVerifyPendingEquipmentPhotosByHq([], {
      reviewerLabel: '본사 안전보건실 박실장',
    });
    expect(batch.verifiedCount).toBe(1);
    expect(batch.skippedSelfCount).toBe(1);
    expect(batch.updated.find(i => i.submissionId === ownUpload.submissionId)?.status).toBe('submitted_to_hq');
    expect(batch.updated.find(i => i.submissionId === fieldUpload.submissionId)?.status).toBe('hq_verified_for_ceo');

    const seeded = seedMultiSiteOperationalSimulation('2026-11-24T08:00:00Z');
    const daily = buildUnifiedCeoDailyBriefing({
      asOfDate: '2026-11-24',
      reporterLabel: '본사 CSO',
      pipelineCases: seeded.cases,
      visitPlans: seeded.visits,
      investigations: seeded.investigations,
      trainingCampaigns: seeded.campaigns,
      equipmentReports: batch.updated,
    });
    expect(daily.briefingId).toBe('CEO-DAILY-20261124');
    expect(daily.equipReadyCount).toBeGreaterThanOrEqual(1);
    expect(daily.summaryText).toContain('대표이사 · 경영진 일일 전사 안전 통합 브리핑');
    expect(daily.csvContent.startsWith('\uFEFF')).toBe(true);
    expect(daily.csvContent).toContain('\t=FORMULA()');
  });
});

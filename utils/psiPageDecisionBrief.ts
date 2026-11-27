import { getRouteMeta } from '../config/routeMeta';
import type { Page, SafetyCheckRecord, WorkerRecord } from '../types';
import { readAccidentBigDataStore, computeAccidentBigDataAnalytics } from './accidentBigData';
import {
  getAllowedDecisionPersonas,
  NEXUS_DECISION_PERSONA_META,
  type NexusDecisionPersona,
  type NexusDecisionSignalLevel,
} from './nexusDecisionBrief';
import type { NexusEquipmentPhotoSubmission } from './nexusEquipmentPhotoReport';
import type { NexusExecutiveTrainingCampaign } from './nexusExecutiveTrainingPipeline';
import type {
  NexusAiInvestigationRecord,
  NexusHqVisitPlan,
  NexusWorkspaceAuthority,
} from './nexusHqCommandLoop';
import type { NexusPipelineCase } from './nexusQuickPipeline';
import { readSiteIssueList, SITE_ISSUES_STORAGE_KEY } from './siteIssueStorage';

export interface PsiConnectedPageAction {
  id: string;
  label: string;
  targetPage: Page;
  tone: 'primary' | 'danger' | 'neutral';
}

export interface PsiConnectedPageReason {
  id: string;
  tag: string;
  summary: string;
}

export type PsiConnectedPageTrendTone = 'positive' | 'warning' | 'critical' | 'neutral';

export interface PsiConnectedPageMetric {
  id: string;
  label: string;
  value: string;
  deltaNote: string;
  numericValue: number;
  unitSuffix: string;
  deltaBadge: string;
  trendPoints: readonly number[];
  trendTone: PsiConnectedPageTrendTone;
}

export interface PsiConnectedPageBriefViewModel {
  page: Page;
  pageLabel: string;
  authority: NexusWorkspaceAuthority;
  persona: NexusDecisionPersona;
  personaLabel: string;
  scopeLabel: string;
  offlinePendingCount: number;
  openActionCount: number;
  signalLevel: NexusDecisionSignalLevel;
  signalLabel: string;
  soWhatHeadline: string;
  soWhatSubline: string;
  whyReasons: readonly PsiConnectedPageReason[];
  howActions: readonly PsiConnectedPageAction[];
  outcomeMetrics: readonly PsiConnectedPageMetric[];
  outcomeProofLine: string;
}

export const NEXUS_AUTHORITY_STORAGE_KEY = 'psi_nexus_workspace_authority_v1';

export const readActiveNexusAuthority = (): NexusWorkspaceAuthority => {
  if (typeof window === 'undefined' || !window.localStorage) return 'hq';
  try {
    return window.localStorage.getItem(NEXUS_AUTHORITY_STORAGE_KEY) === 'field' ? 'field' : 'hq';
  } catch {
    return 'hq';
  }
};

const pct = (part: number, total: number): number =>
  total <= 0 ? 100 : Math.round((part / total) * 100);

/**
 * 지표의 현재 수준과 경보 성격에 맞춰 결정론적 6단계 추세선(0..100)을 생성합니다.
 */
const buildMetricTrend = (
  currentLevelPct: number,
  tone: PsiConnectedPageTrendTone,
): readonly number[] => {
  const end = Math.max(8, Math.min(96, Math.round(currentLevelPct)));
  const clamp = (v: number) => Math.max(6, Math.min(96, Math.round(v)));
  if (tone === 'positive') {
    return [clamp(end - 18), clamp(end - 13), clamp(end - 10), clamp(end - 6), clamp(end - 2), end];
  }
  if (tone === 'critical') {
    return [clamp(end - 24), clamp(end - 18), clamp(end - 8), clamp(end - 12), clamp(end - 4), end];
  }
  if (tone === 'warning') {
    return [clamp(end - 12), clamp(end + 6), clamp(end - 4), clamp(end + 3), clamp(end - 2), end];
  }
  return [clamp(end - 10), clamp(end - 8), clamp(end - 5), clamp(end - 4), clamp(end - 2), end];
};

const makeMetric = (params: {
  id: string;
  label: string;
  numericValue: number;
  unitSuffix: string;
  deltaNote: string;
  deltaBadge: string;
  trendPct: number;
  trendTone: PsiConnectedPageTrendTone;
}): PsiConnectedPageMetric => ({
  id: params.id,
  label: params.label,
  value: `${params.numericValue}${params.unitSuffix}`,
  deltaNote: params.deltaNote,
  numericValue: params.numericValue,
  unitSuffix: params.unitSuffix,
  deltaBadge: params.deltaBadge,
  trendPoints: buildMetricTrend(params.trendPct, params.trendTone),
  trendTone: params.trendTone,
});

export const buildConnectedPageDecisionBrief = (params: {
  page: Page;
  authority: NexusWorkspaceAuthority;
  persona: NexusDecisionPersona;
  siteScopeLabel?: string;
  workerRecords: readonly WorkerRecord[];
  safetyCheckRecords: readonly SafetyCheckRecord[];
  pipelineCases: readonly NexusPipelineCase[];
  equipmentReports: readonly NexusEquipmentPhotoSubmission[];
  trainingCampaigns: readonly NexusExecutiveTrainingCampaign[];
  visitPlans: readonly NexusHqVisitPlan[];
  investigations: readonly NexusAiInvestigationRecord[];
  offlinePendingCount: number;
}): PsiConnectedPageBriefViewModel => {
  const allowed = getAllowedDecisionPersonas(params.authority);
  const resolvedPersona: NexusDecisionPersona = allowed.includes(params.persona)
    ? params.persona
    : allowed[0];

  const meta = getRouteMeta(params.page);
  const pageLabel = meta.practitionerLabel || meta.fallbackTitle;
  const scopeLabel =
    params.siteScopeLabel?.trim() ||
    (params.authority === 'hq' ? '전사 통합 관제 범위' : '단일 현장 격리 범위');

  const records = params.workerRecords ?? [];
  const beginnerOrHighRisk = records.filter(
    r => r.safetyLevel === '초급' || r.selfAssessedRiskLevel === '상' || Number(r.safetyScore) < 70,
  );
  const ocrAttention = records.filter(
    r => r.ocrStatus === 'OCR_REQUIRED' || r.ocrStatus === 'TEXT_ONLY_REVIEW',
  );
  const missingPhotoWorkers = records.filter(
    r => !r.profileImage || r.profileImage.length <= 50,
  );
  const avgScore =
    records.length > 0
      ? Math.round(records.reduce((s, r) => s + (Number(r.safetyScore) || 0), 0) / records.length)
      : 0;

  const jobCounts = new Map<string, number>();
  for (const r of beginnerOrHighRisk) {
    const job = (r.jobField || '미분류 공종').trim();
    jobCounts.set(job, (jobCounts.get(job) ?? 0) + 1);
  }
  const topRiskJobEntry = Array.from(jobCounts.entries()).sort((a, b) => b[1] - a[1])[0];

  const openCases = params.pipelineCases.filter(c => c.status !== 'closed');
  const stopWorkCases = openCases.filter(c => Boolean(c.stopWorkFlag));
  const closureRatePct = pct(
    params.pipelineCases.length - openCases.length,
    params.pipelineCases.length,
  );
  const pendingEquip = params.equipmentReports.filter(e => e.status === 'submitted_to_hq');
  const revisionEquip = params.equipmentReports.filter(e => e.status === 'revision_requested_hq');
  const readyEquip = params.equipmentReports.filter(
    e => e.status === 'hq_verified_for_ceo' || e.status === 'reported_to_ceo',
  );
  const pendingApprovals = params.investigations.filter(i => i.status === 'ai_draft_pending_hq');
  const unackedVisits = params.visitPlans.filter(v => !v.fieldAcknowledgedAt);
  const totalTargetWorkers = params.trainingCampaigns.reduce(
    (sum, c) => sum + Math.max(0, Number(c.targetWorkers || 0)),
    0,
  );
  const totalConfirmedWorkers = params.trainingCampaigns.reduce(
    (sum, c) => sum + Math.max(0, Number(c.confirmedSignatures || 0)),
    0,
  );
  const trainingRatePct =
    totalTargetWorkers > 0
      ? Math.min(100, Math.round((totalConfirmedWorkers / totalTargetWorkers) * 100))
      : 100;

  const personaTag = NEXUS_DECISION_PERSONA_META[resolvedPersona].shortLabel;

  let signalLevel: NexusDecisionSignalLevel =
    stopWorkCases.length > 0 || revisionEquip.length > 0 || beginnerOrHighRisk.length >= 3
      ? 'critical'
      : openCases.length + pendingEquip.length + ocrAttention.length + beginnerOrHighRisk.length > 0
        ? 'watch'
        : 'stable';

  let soWhatHeadline = '';
  let soWhatSubline = '';
  let whyReasons: PsiConnectedPageReason[] = [];
  let howActions: PsiConnectedPageAction[] = [];
  let outcomeMetrics: PsiConnectedPageMetric[] = [];
  let outcomeProofLine = '';

  switch (params.page) {
    case 'ocr-analysis': {
      if (records.length === 0) {
        soWhatHeadline =
          stopWorkCases.length > 0 || openCases.length > 0
            ? `[${personaTag}] 위험성평가 기록지 등록 대기 · 연계 현장 작업중지 ${stopWorkCases.length}건·미결 ${openCases.length}건 우선 확인`
            : `[${personaTag}] 첫 위험성평가 기록지를 등록하면 취약 공종·교육 환류가 자동 연동됩니다`;
      } else {
        soWhatHeadline =
          beginnerOrHighRisk.length > 0 || ocrAttention.length > 0
            ? `[${personaTag}] 취약·초급 ${beginnerOrHighRisk.length}명 · 재확인 대상 ${ocrAttention.length}건 우선 분류 필요`
            : `전체 ${records.length}건 위험성평가 정상 판독 완료 · 취약 인원 집중 관리 없음`;
      }
      soWhatSubline = '판독 결과에서 바로 교육자료 발송 또는 현장 사진·조치 연계를 실행하세요.';
      whyReasons = [
        topRiskJobEntry
          ? {
              id: 'ocr-top-job',
              tag: `${topRiskJobEntry[0]} 공종 집중`,
              summary: `체감 위험 '상' 또는 초급(70점 미만) 기록 ${topRiskJobEntry[1]}건이 확인되었습니다.`,
            }
          : {
              id: 'ocr-score',
              tag: `평균 안전점수 ${avgScore}점`,
              summary: `누적 ${records.length}건 분석 기준 · 재확인 대상 ${ocrAttention.length}건 포함`,
            },
        {
          id: 'ocr-nexus-link',
          tag: '현장 연계 상태',
          summary: `진행 중 작업중지 ${stopWorkCases.length}건 · 시정조치 미결 ${openCases.length}건과 상호 대조 중`,
        },
      ];
      howActions = [
        { id: 'ocr-to-edu', label: '교육 환류로 즉시 연결', targetPage: 'education-return', tone: 'primary' },
        { id: 'ocr-to-insp', label: '사진점검·개선관리 열기', targetPage: 'safety-inspector', tone: 'neutral' },
        { id: 'ocr-to-nexus', label: '3D 지휘·결재함 복귀', targetPage: 'safety-nexus', tone: 'neutral' },
      ];
      outcomeMetrics = [
        makeMetric({
          id: 'm1',
          label: '누적 분석 기록',
          numericValue: records.length,
          unitSuffix: '건',
          deltaNote: `평균 ${avgScore}점`,
          deltaBadge: records.length > 0 ? `평균 ${avgScore}점` : '첫 등록 대기',
          trendPct: records.length > 0 ? avgScore : 24,
          trendTone: avgScore >= 80 ? 'positive' : records.length === 0 ? 'neutral' : 'warning',
        }),
        makeMetric({
          id: 'm2',
          label: '집중 케어 대상',
          numericValue: beginnerOrHighRisk.length,
          unitSuffix: '명',
          deltaNote: `재확인 ${ocrAttention.length}건`,
          deltaBadge: beginnerOrHighRisk.length > 0 ? '우선 교육 권고' : '안정 구간',
          trendPct: beginnerOrHighRisk.length > 0 ? Math.min(92, 32 + beginnerOrHighRisk.length * 14) : 14,
          trendTone: beginnerOrHighRisk.length >= 3 ? 'critical' : beginnerOrHighRisk.length > 0 ? 'warning' : 'positive',
        }),
        makeMetric({
          id: 'm3',
          label: '현장 조치 종결률',
          numericValue: closureRatePct,
          unitSuffix: '%',
          deltaNote: `미결 ${openCases.length}건`,
          deltaBadge: openCases.length > 0 ? `미결 ${openCases.length}건` : '전건 종결',
          trendPct: closureRatePct,
          trendTone: closureRatePct >= 80 ? 'positive' : closureRatePct >= 40 ? 'warning' : 'critical',
        }),
      ];
      outcomeProofLine = `위험성평가 판독 결과가 교육 환류·개선 이력·입체 지휘 화면에 실시간 연동됩니다.`;
      break;
    }

    case 'safety-inspector': {
      const equipIssueTotal = revisionEquip.length + pendingEquip.length;
      signalLevel =
        stopWorkCases.length > 0 || revisionEquip.length > 0
          ? 'critical'
          : equipIssueTotal + openCases.length > 0
            ? 'watch'
            : 'stable';
      soWhatHeadline =
        revisionEquip.length > 0 || stopWorkCases.length > 0
          ? `[${personaTag}] 본사 보완요청 사진 ${revisionEquip.length}건 · 작업중지 ${stopWorkCases.length}건 즉시 조치 필요`
          : `건설기계 본사 검토대기 ${pendingEquip.length}건 · 현장 사진 점검 정상 가동 중`;
      soWhatSubline = '촬영·검토 후 안전지능 네트워크 본사 보고함과 대표이사 1장 요약에 즉시 반영됩니다.';
      whyReasons = [
        {
          id: 'insp-eq',
          tag: `건설기계 사진 ${params.equipmentReports.length}건`,
          summary: `보완요청 ${revisionEquip.length}건 · 본사 검토대기 ${pendingEquip.length}건 · 적합·보고 ${readyEquip.length}건`,
        },
        {
          id: 'insp-check',
          tag: `불안전 점검 ${params.safetyCheckRecords.length}건`,
          summary: `현장 시정조치 미결 ${openCases.length}건(작업중지 ${stopWorkCases.length}건 포함) 추적 중`,
        },
      ];
      howActions = [
        { id: 'insp-to-issue', label: '안전조치 통합 허브 이동', targetPage: 'site-issue-management', tone: stopWorkCases.length > 0 ? 'danger' : 'primary' },
        { id: 'insp-to-ocr', label: '위험성평가 기록 대조', targetPage: 'ocr-analysis', tone: 'neutral' },
        { id: 'insp-to-nexus', label: '안전지능 지휘함 이동', targetPage: 'safety-nexus', tone: 'neutral' },
      ];
      const eqPassPct = pct(readyEquip.length, params.equipmentReports.length);
      outcomeMetrics = [
        makeMetric({
          id: 'm1',
          label: '기계사진 적합률',
          numericValue: eqPassPct,
          unitSuffix: '%',
          deltaNote: `적합·보고 ${readyEquip.length}건`,
          deltaBadge: revisionEquip.length > 0 ? `보완 ${revisionEquip.length}건` : '적합 유지',
          trendPct: eqPassPct,
          trendTone: eqPassPct >= 80 ? 'positive' : revisionEquip.length > 0 ? 'critical' : 'warning',
        }),
        makeMetric({
          id: 'm2',
          label: '조치 종결률',
          numericValue: closureRatePct,
          unitSuffix: '%',
          deltaNote: `작업중지 ${stopWorkCases.length}건`,
          deltaBadge: stopWorkCases.length > 0 ? `중지 ${stopWorkCases.length}건 통제` : '통제 구역 0건',
          trendPct: closureRatePct,
          trendTone: stopWorkCases.length > 0 ? 'critical' : closureRatePct >= 80 ? 'positive' : 'warning',
        }),
        makeMetric({
          id: 'm3',
          label: '대기 전송',
          numericValue: params.offlinePendingCount,
          unitSuffix: '건',
          deltaNote: params.offlinePendingCount > 0 ? '재동기화 필요' : '동기화 완료',
          deltaBadge: params.offlinePendingCount > 0 ? '오프라인 보호 중' : '실시간 연동',
          trendPct: params.offlinePendingCount > 0 ? Math.min(90, 35 + params.offlinePendingCount * 15) : 12,
          trendTone: params.offlinePendingCount > 0 ? 'warning' : 'positive',
        }),
      ];
      outcomeProofLine = `사진 1장으로 본사 검토 · 작업중지 통제 · 중대재해 증빙 편철까지 한 번에 연결됩니다.`;
      break;
    }

    case 'education-return':
    case 'a4-education-material':
    case 'admin-training': {
      signalLevel =
        trainingRatePct < 80 || beginnerOrHighRisk.length > 0
          ? 'watch'
          : 'stable';
      soWhatHeadline =
        totalTargetWorkers > totalConfirmedWorkers
          ? `[${personaTag}] 다국어 교육 미서명 ${totalTargetWorkers - totalConfirmedWorkers}명 · 집중 보호 ${beginnerOrHighRisk.length}명 교육 전파 필요`
          : `다국어 교육 서명률 ${trainingRatePct}% 달성 · 원페이지 교육·개인 리포트 준비 완료`;
      soWhatSubline = '외국인 근로자 모국어 이해 확인과 자필 서명 수합으로 현장 실행 누락을 막습니다.';
      whyReasons = [
        {
          id: 'edu-camp',
          tag: `다국어 캠페인 ${params.trainingCampaigns.length}건`,
          summary: `서명 완료 ${totalConfirmedWorkers} / 지정 대상 ${totalTargetWorkers}명 (${trainingRatePct}%)`,
        },
        {
          id: 'edu-weak',
          tag: topRiskJobEntry ? `${topRiskJobEntry[0]} 우선 교육` : '근로자 취약 항목 연계',
          summary: `위험성평가 초급·고체감 인원 ${beginnerOrHighRisk.length}명에게 맞춤형 교안 우선 배정 권장`,
        },
      ];
      howActions = [
        { id: 'edu-to-a4', label: '1페이지 교육자료 생성', targetPage: 'a4-education-material', tone: 'primary' },
        { id: 'edu-to-month', label: '월별 계도 리포트 확인', targetPage: 'monthly-guidance-report', tone: 'neutral' },
        { id: 'edu-to-nexus', label: '안전지능 지휘함 복귀', targetPage: 'safety-nexus', tone: 'neutral' },
      ];
      outcomeMetrics = [
        makeMetric({
          id: 'm1',
          label: '모국어 서명률',
          numericValue: trainingRatePct,
          unitSuffix: '%',
          deltaNote: `${totalConfirmedWorkers}/${totalTargetWorkers}명`,
          deltaBadge: trainingRatePct >= 90 ? '목표 근접' : '이수 독려',
          trendPct: trainingRatePct,
          trendTone: trainingRatePct >= 85 ? 'positive' : 'warning',
        }),
        makeMetric({
          id: 'm2',
          label: '연계 평가 기록',
          numericValue: records.length,
          unitSuffix: '건',
          deltaNote: `집중 대상 ${beginnerOrHighRisk.length}명`,
          deltaBadge: beginnerOrHighRisk.length > 0 ? `우선 ${beginnerOrHighRisk.length}명` : '전원 안정',
          trendPct: records.length > 0 ? Math.min(92, Math.max(25, avgScore)) : 20,
          trendTone: beginnerOrHighRisk.length > 0 ? 'warning' : 'positive',
        }),
        makeMetric({
          id: 'm3',
          label: '본사 사고조사 연계',
          numericValue: pendingApprovals.length,
          unitSuffix: '건',
          deltaNote: '승인 즉시 교육 발령',
          deltaBadge: pendingApprovals.length > 0 ? '결재 대기' : '지연 없음',
          trendPct: pendingApprovals.length > 0 ? Math.min(88, 30 + pendingApprovals.length * 16) : 14,
          trendTone: pendingApprovals.length > 0 ? 'warning' : 'neutral',
        }),
      ];
      outcomeProofLine = `다국어 교육 수합 이력과 자필 서명 PNG가 증빙 ZIP 패키지에 자동 포함됩니다.`;
      break;
    }

    case 'site-issue-management':
    case 'safety-checks':
    case 'safety-compliance-hub': {
      signalLevel =
        stopWorkCases.length > 0 || openCases.length >= 3
          ? 'critical'
          : openCases.length > 0 || unackedVisits.length > 0
            ? 'watch'
            : 'stable';
      soWhatHeadline =
        stopWorkCases.length > 0
          ? `[${personaTag}] 작업중지 ${stopWorkCases.length}건 · 미결 시정조치 ${openCases.length}건 종결 처리 우선`
          : `현장 시정·이슈 ${openCases.length}건 추적 중 · 순회 미접수 ${unackedVisits.length}건`;
      soWhatSubline = '조치 전/후 사진 등록과 재점검 완료 시 전사 종결률과 감사 증빙이 자동 상승합니다.';
      whyReasons = [
        openCases[0]
          ? {
              id: 'iss-lead',
              tag: openCases[0].stopWorkFlag ? '작업중지 우선' : '미결 조치 1순위',
              summary: `${openCases[0].locationLabel} — ${openCases[0].actionTitle || openCases[0].observationNote}`.slice(0, 74),
            }
          : {
              id: 'iss-clean',
              tag: '미결 조치 0건',
              summary: '현재 등록된 작업중지 및 미결 시정조치가 없습니다.',
            },
        {
          id: 'iss-check-rec',
          tag: `현장 점검 ${params.safetyCheckRecords.length}건`,
          summary: `본사 순회계획 ${params.visitPlans.length}건 중 미접수 ${unackedVisits.length}건 연동`,
        },
      ];
      howActions = [
        { id: 'iss-to-insp', label: '현장 사진으로 즉시 보완', targetPage: 'safety-inspector', tone: stopWorkCases.length > 0 ? 'danger' : 'primary' },
        { id: 'iss-to-hub', label: '점검 이행 현황 확인', targetPage: 'safety-compliance-hub', tone: 'neutral' },
        { id: 'iss-to-nexus', label: '안전지능 지휘함 이동', targetPage: 'safety-nexus', tone: 'neutral' },
      ];
      outcomeMetrics = [
        makeMetric({
          id: 'm1',
          label: '조치 종결률',
          numericValue: closureRatePct,
          unitSuffix: '%',
          deltaNote: `미결 ${openCases.length}건`,
          deltaBadge: openCases.length > 0 ? `남은 조치 ${openCases.length}건` : '전건 종결',
          trendPct: closureRatePct,
          trendTone: closureRatePct >= 80 ? 'positive' : stopWorkCases.length > 0 ? 'critical' : 'warning',
        }),
        makeMetric({
          id: 'm2',
          label: '작업중지 구역',
          numericValue: stopWorkCases.length,
          unitSuffix: '건',
          deltaNote: '선조치 후 재개',
          deltaBadge: stopWorkCases.length > 0 ? '즉시 통제 필요' : '해제 완료',
          trendPct: stopWorkCases.length > 0 ? Math.min(92, 42 + stopWorkCases.length * 18) : 10,
          trendTone: stopWorkCases.length > 0 ? 'critical' : 'positive',
        }),
        makeMetric({
          id: 'm3',
          label: '대기 전송',
          numericValue: params.offlinePendingCount,
          unitSuffix: '건',
          deltaNote: '오프라인 보호',
          deltaBadge: params.offlinePendingCount > 0 ? '재연결 시 반영' : '실시간 완료',
          trendPct: params.offlinePendingCount > 0 ? Math.min(86, 30 + params.offlinePendingCount * 15) : 12,
          trendTone: params.offlinePendingCount > 0 ? 'warning' : 'positive',
        }),
      ];
      outcomeProofLine = `이행 완료·재점검 이력이 본사 승인 및 중대재해처벌법 증빙에 즉시 반영됩니다.`;
      break;
    }

    case 'accident-bigdata': {
      const accidentStore = readAccidentBigDataStore();
      const analytics = computeAccidentBigDataAnalytics(accidentStore.items, records);
      const topAlert = analytics.crossLinkAlerts[0];
      soWhatHeadline =
        analytics.totalCount > 0
          ? `[${personaTag}] 누적 사고 ${analytics.totalCount}건 · 최다 공종 ${analytics.topJobField?.label || '집계중'}(${analytics.topHazardType?.label || '위험요인'}) 위험성평가 환류 필요`
          : `[${personaTag}] 유료 Gemini · ChatGPT 변환 파일로 0원 원도급사 사고 빅데이터 구축 시작`;
      soWhatSubline =
        topAlert
          ? `${topAlert.reasonSummary} — 작업 전 점검과 교육자료로 바로 연결하세요.`
          : '전용 변환 지시문을 복사해 외부 AI에 PDF를 맡긴 뒤 결과 JSON/CSV를 붙여넣으면 즉시 DB가 쌓입니다.';
      whyReasons = [
        {
          id: 'acc-bd-top',
          tag: analytics.topHazardType ? `최다 재해유형: ${analytics.topHazardType.label}` : '원도급사 양식 표준화 준비',
          summary: analytics.totalCount > 0
            ? `${analytics.contractorCount}개 원도급사 사례 기준 중상·중대 비율 ${analytics.severeRatePct}% (${analytics.severeCount}건)`
            : '원도급사마다 다른 PDF 양식을 NEW-PSI 12대 재해유형·표준공종 스키마로 통일합니다.',
        },
        {
          id: 'acc-bd-link',
          tag: topAlert ? `현장 위험성평가 교차 경고 (${topAlert.jobField})` : '추가 API 비용 0원 구조',
          summary: topAlert?.checkpoints[0]
            ? `핵심 사전 점검: ${topAlert.checkpoints[0]}`
            : 'DB 축적 후 공종·원인 빅데이터 통계와 위험성평가 환류는 추가 토큰 없이 무제한 실행됩니다.',
        },
      ];
      howActions = [
        { id: 'acc-to-ocr', label: '위험성평가 기록지 점검', targetPage: 'ocr-analysis', tone: 'primary' },
        { id: 'acc-to-edu', label: '동종재해 교육자료 제작', targetPage: 'a4-education-material', tone: 'neutral' },
        { id: 'acc-to-nexus', label: '안전지능 지휘 센터', targetPage: 'safety-nexus', tone: 'neutral' },
      ];
      outcomeMetrics = [
        makeMetric({
          id: 'm1',
          label: '누적 사고 사례',
          numericValue: analytics.totalCount,
          unitSuffix: '건',
          deltaNote: `${analytics.contractorCount}개 원도급사`,
          deltaBadge: analytics.totalCount > 0 ? 'DB 가동 중' : '등록 대기',
          trendPct: analytics.totalCount > 0 ? Math.min(95, 25 + analytics.totalCount * 8) : 15,
          trendTone: analytics.totalCount > 0 ? 'positive' : 'neutral',
        }),
        makeMetric({
          id: 'm2',
          label: '중상·중대 비율',
          numericValue: analytics.severeRatePct,
          unitSuffix: '%',
          deltaNote: `아차사고 ${analytics.nearMissCount}건`,
          deltaBadge: analytics.severeCount > 0 ? `중점 ${analytics.severeCount}건` : '중대재해 0건',
          trendPct: analytics.severeRatePct,
          trendTone: analytics.severeRatePct >= 40 ? 'critical' : analytics.severeCount > 0 ? 'warning' : 'positive',
        }),
        makeMetric({
          id: 'm3',
          label: '교차 경보 공종',
          numericValue: analytics.crossLinkAlerts.length,
          unitSuffix: '개',
          deltaNote: topAlert ? topAlert.jobField : '연동 대기',
          deltaBadge: topAlert ? `${topAlert.topHazard} 집중` : '정상',
          trendPct: analytics.crossLinkAlerts.length > 0 ? Math.min(92, analytics.crossLinkAlerts.length * 22) : 20,
          trendTone: analytics.crossLinkAlerts.length > 0 ? 'warning' : 'positive',
        }),
      ];
      outcomeProofLine = '축적된 원도급사 사고 데이터는 개인정보 비식별 검증을 거쳐 현장 교육·점검 기준과 자동 연동됩니다.';
      break;
    }

    case 'monthly-guidance-report':
    case 'reports':
    case 'predictive-analysis':
    case 'performance-analysis':
    case 'survey-intelligence':
    case 'worker-management':
    case 'individual-report':
    case 'safety-behavior-management': {
      soWhatHeadline =
        beginnerOrHighRisk.length > 0 || pendingApprovals.length > 0
          ? `[${personaTag}] 취약군 ${beginnerOrHighRisk.length}명 · 사고조사 결재 ${pendingApprovals.length}건 기반 집중 관리 권고`
          : `전사 평균 ${avgScore}점 · ${records.length}건 기반 계도·성과 분석 정상 운영`;
      soWhatSubline = '분석 인사이트를 월별 보고·다국어 교육·안전지능 지휘 화면의 실행 항목으로 바로 전환하세요.';
      whyReasons = [
        topRiskJobEntry
          ? {
              id: 'ana-job',
              tag: `핵심 취약 공종: ${topRiskJobEntry[0]}`,
              summary: `고체감·초급 기록 ${topRiskJobEntry[1]}건 집중 — 현장 점검과 맞춤 교육 병행 필요`,
            }
          : {
              id: 'ana-avg',
              tag: `평균 ${avgScore}점 (${records.length}건)`,
              summary: `프로필 사진 미등록 ${missingPhotoWorkers.length}명 · 다국어 교육 이수 ${trainingRatePct}%`,
            },
        {
          id: 'ana-ops',
          tag: '현장 실행 연계',
          summary: `시정조치 미결 ${openCases.length}건 · 기계사진 적합 ${readyEquip.length}/${params.equipmentReports.length}건`,
        },
      ];
      howActions = [
        { id: 'ana-to-rep', label: '종합 리포트 생성', targetPage: 'reports', tone: 'primary' },
        { id: 'ana-to-edu', label: '교육 환류로 즉시 전파', targetPage: 'education-return', tone: 'neutral' },
        { id: 'ana-to-nexus', label: '안전지능 지휘함 이동', targetPage: 'safety-nexus', tone: 'neutral' },
      ];
      outcomeMetrics = [
        makeMetric({
          id: 'm1',
          label: '전체 평균 점수',
          numericValue: avgScore,
          unitSuffix: '점',
          deltaNote: `총 ${records.length}건`,
          deltaBadge: avgScore >= 80 ? '우수 수준' : records.length > 0 ? '보완 관리' : '등록 대기',
          trendPct: records.length > 0 ? avgScore : 25,
          trendTone: avgScore >= 80 ? 'positive' : records.length === 0 ? 'neutral' : 'warning',
        }),
        makeMetric({
          id: 'm2',
          label: '조치 종결률',
          numericValue: closureRatePct,
          unitSuffix: '%',
          deltaNote: `미결 ${openCases.length}건`,
          deltaBadge: openCases.length > 0 ? `미결 ${openCases.length}건` : '전건 종결',
          trendPct: closureRatePct,
          trendTone: closureRatePct >= 80 ? 'positive' : 'warning',
        }),
        makeMetric({
          id: 'm3',
          label: '서명 이수율',
          numericValue: trainingRatePct,
          unitSuffix: '%',
          deltaNote: `적합 사진 ${readyEquip.length}건`,
          deltaBadge: trainingRatePct >= 85 ? '이수 양호' : '서명 독려',
          trendPct: trainingRatePct,
          trendTone: trainingRatePct >= 85 ? 'positive' : 'warning',
        }),
      ];
      outcomeProofLine = `분석 통계는 실시간으로 경영진 1장 브리핑과 월간 계도 PDF/PPTX 근거로 사용됩니다.`;
      break;
    }

    default: {
      // dashboard, settings, feedback, etc.
      soWhatHeadline =
        stopWorkCases.length > 0 || pendingEquip.length + revisionEquip.length > 0
          ? `[${personaTag}] 작업중지 ${stopWorkCases.length}건 · 기계사진 처리 ${pendingEquip.length + revisionEquip.length}건 즉시 확인`
          : `전 현장 안전 신호 안정 · 등록 기록 ${records.length}건 및 조치 종결률 ${closureRatePct}%`;
      soWhatSubline = '아래 실행 버튼으로 필요한 기능 화면 또는 3D 안전지능 지휘 센터로 한 번에 이동하세요.';
      whyReasons = [
        {
          id: 'def-rec',
          tag: `평가 기록 ${records.length}건`,
          summary: `평균 ${avgScore}점 · 초급/고체감 주의 ${beginnerOrHighRisk.length}명 · 재확인 필요 ${ocrAttention.length}건`,
        },
        {
          id: 'def-ops',
          tag: `본사·현장 폐루프`,
          summary: `미결 조치 ${openCases.length}건 · 사진 대기/보완 ${pendingEquip.length + revisionEquip.length}건 · 서명 ${trainingRatePct}%`,
        },
      ];
      howActions = [
        { id: 'def-to-nexus', label: 'Ψ 안전지능 네트워크 열기', targetPage: 'safety-nexus', tone: 'primary' },
        { id: 'def-to-ocr', label: '위험성평가 분석 보기', targetPage: 'ocr-analysis', tone: 'neutral' },
        { id: 'def-to-insp', label: '사진점검·개선관리 열기', targetPage: 'safety-inspector', tone: 'neutral' },
      ];
      const defaultEqPct = pct(readyEquip.length, params.equipmentReports.length);
      outcomeMetrics = [
        makeMetric({
          id: 'm1',
          label: '조치 종결률',
          numericValue: closureRatePct,
          unitSuffix: '%',
          deltaNote: `작업중지 ${stopWorkCases.length}건`,
          deltaBadge: stopWorkCases.length > 0 ? `중지 ${stopWorkCases.length}건` : '전건 통제',
          trendPct: closureRatePct,
          trendTone: stopWorkCases.length > 0 ? 'critical' : closureRatePct >= 80 ? 'positive' : 'warning',
        }),
        makeMetric({
          id: 'm2',
          label: '기계사진 검증',
          numericValue: defaultEqPct,
          unitSuffix: '%',
          deltaNote: `${readyEquip.length}/${params.equipmentReports.length}건`,
          deltaBadge: pendingEquip.length + revisionEquip.length > 0 ? `처리 대기 ${pendingEquip.length + revisionEquip.length}건` : '모두 적합',
          trendPct: defaultEqPct,
          trendTone: defaultEqPct >= 80 ? 'positive' : 'warning',
        }),
        makeMetric({
          id: 'm3',
          label: '모국어 서명률',
          numericValue: trainingRatePct,
          unitSuffix: '%',
          deltaNote: `${totalConfirmedWorkers}명 확인`,
          deltaBadge: trainingRatePct >= 85 ? '이수 양호' : '서명 독려',
          trendPct: trainingRatePct,
          trendTone: trainingRatePct >= 85 ? 'positive' : 'warning',
        }),
      ];
      outcomeProofLine = `모든 연계 화면이 동일한 현장 권한·야외 고대비 모드·결론 브리핑 기준을 공유합니다.`;
      break;
    }
  }

  const openSiteIssueCount = typeof window === 'undefined'
    ? 0
    : readSiteIssueList<{ id: string; status?: string }>(() =>
        window.localStorage.getItem(SITE_ISSUES_STORAGE_KEY),
      ).items.filter(item => item.status !== '조치 완료').length;

  return {
    page: params.page,
    pageLabel,
    authority: params.authority,
    persona: resolvedPersona,
    personaLabel: NEXUS_DECISION_PERSONA_META[resolvedPersona].label,
    scopeLabel,
    offlinePendingCount: params.offlinePendingCount,
    openActionCount:
      openCases.length + pendingEquip.length + revisionEquip.length + openSiteIssueCount,
    signalLevel,
    signalLabel:
      signalLevel === 'critical'
        ? '즉시 조치 필요'
        : signalLevel === 'watch'
          ? '검토 · 확인 필요'
          : '정상 가동 중',
    soWhatHeadline,
    soWhatSubline,
    whyReasons: whyReasons.slice(0, 2),
    howActions: howActions.slice(0, 3),
    outcomeMetrics: outcomeMetrics.slice(0, 3),
    outcomeProofLine,
  };
};

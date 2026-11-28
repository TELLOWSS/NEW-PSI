import type { WorkerRecord } from '../types';
import { getKoreanCalendarDay } from './monthlyFieldFollowup';
import {
  readEquipmentPhotoSubmissions,
  type NexusEquipmentPhotoSubmission,
} from './nexusEquipmentPhotoReport';
import {
  readExecutiveTrainingCampaigns,
  type NexusExecutiveTrainingCampaign,
} from './nexusExecutiveTrainingPipeline';
import {
  matchesScopedSiteRecord,
  readAiInvestigations,
  readHqVisitPlans,
  type NexusAiInvestigationRecord,
  type NexusHqVisitPlan,
} from './nexusHqCommandLoop';
import { readNexusPipelineCases, type NexusPipelineCase } from './nexusQuickPipeline';
import {
  readManagedNexusSites,
  type NexusManagedSite,
} from './nexusSiteRegistry';

export const SAPA_DEFENSE_RECORDS_KEY = 'psi_sapa_defense_ledger_v1';
export const SAPA_GOVERNANCE_MODE_KEY = 'psi_sapa_governance_mode_v1';
export const SAPA_DEFENSE_UPDATED_EVENT = 'psi-sapa-defense-updated';

/**
 * Stage 1 (erp_bridge): Coexists with company ERP — generates summary PDFs for ERP drafting and binds ERP doc metadata/attachments.
 * Stage 2 (psi_native): Replaces ERP safety approvals natively inside PSI using configurable multi-step approval lines.
 */
export type SapaGovernanceMode = 'erp_bridge' | 'psi_native';

export type SapaCardId =
  | 'CARD-01'
  | 'CARD-02'
  | 'CARD-03'
  | 'CARD-04'
  | 'CARD-05'
  | 'CARD-06'
  | 'CARD-07'
  | 'CARD-08'
  | 'CARD-09';

export type SapaRoutineCycle = 'monthly_5min' | 'semiannual_mandatory' | 'annual_or_mobilization';

export type SapaApprovalPresetId =
  | 'site_authority'
  | 'hq_safety_review'
  | 'hq_budget_review'
  | 'ceo_mandatory';

export type SapaApprovalStepStatus = 'pending' | 'approved' | 'revision_requested';

export type SapaErpApprovalStatus =
  | 'not_drafted'
  | 'in_progress'
  | 'approved'
  | 'revision_needed';

export type SapaDefenseSignal = 'green' | 'purple' | 'yellow' | 'red';

export interface SapaApprovalStep {
  stepOrder: number;
  roleCode: 'site_safety' | 'site_director' | 'hq_safety' | 'hq_procurement' | 'cso' | 'ceo' | 'custom';
  roleLabel: string;
  status: SapaApprovalStepStatus;
  actorName: string;
  actedAt: string;
  note: string;
}

export interface SapaErpCustomField {
  key: string;
  label: string;
  value: string;
}

export interface SapaErpBridgeRecord {
  erpDocNo: string;
  erpSiteCode: string;
  erpBudgetCode: string;
  erpCostCenter: string;
  erpVendorCode: string;
  erpApprovalStatus: SapaErpApprovalStatus;
  erpApprovedAt: string;
  erpAmountKrw?: number;
  erpAttachmentName: string;
  erpAttachmentDataUrl: string;
  erpCustomFields: SapaErpCustomField[];
}

export interface SapaAutoEvidenceSnapshot {
  ocrRiskRecordCount: number;
  pipelineCaseCount: number;
  stopWorkCount: number;
  equipmentPhotoCount: number;
  trainingSignatureCount: number;
  hqVisitCount: number;
  investigationCount: number;
  overdueActionCount: number;
}

export interface SapaDefenseCardSpec {
  cardId: SapaCardId;
  code: string;
  shortTitle: string;
  title: string;
  legalBasis: string;
  folderName: string;
  cycle: SapaRoutineCycle;
  cycleLabel: string;
  inputOwnerLabel: string;
  defaultPresetId: SapaApprovalPresetId;
  structuralRiskFocus: string;
  defenseObjective: string;
  requiredArtifacts: readonly string[];
  isCritical: boolean;
}

export interface SapaDefenseCardRecord {
  recordKey: string; // `${siteId}::${cardId}::${periodKey}`
  siteId: string;
  siteName: string;
  cardId: SapaCardId;
  periodKey: string; // e.g. '2026-11'
  dueDate: string; // YYYY-MM-DD
  presetId: SapaApprovalPresetId;
  approvalSteps: SapaApprovalStep[];
  erpBridge: SapaErpBridgeRecord;
  summaryMemo: string;
  ceoDirectiveNote: string;
  ceoDirectiveType: '' | 'confirmed' | 'budget_support' | 'revision_ordered';
  autoEvidence: SapaAutoEvidenceSnapshot;
  sealHash: string;
  sealedAt: string;
  updatedAt: string;
}

export interface SapaDefenseHydratedCard extends SapaDefenseCardRecord {
  spec: SapaDefenseCardSpec;
  signal: SapaDefenseSignal;
  signalLabel: string;
  daysRemaining: number;
  dDayLabel: string;
  isRoutineComplete: boolean;
  isPendingExecutive: boolean;
}

export interface SapaDefensePortfolioSummary {
  totalCells: number;
  greenCount: number;
  purpleCount: number;
  yellowCount: number;
  redCount: number;
  defenseReadinessPct: number;
  pendingCeoCount: number;
  erpConnectedCount: number;
  psiSealedCount: number;
  criticalGapCount: number;
}

export const SAPA_ROUTINE_CYCLE_LABELS: Record<SapaRoutineCycle, string> = {
  monthly_5min: '월간 5분 루틴',
  semiannual_mandatory: '반기 필수 보고',
  annual_or_mobilization: '착공·연간 1회',
};

export const SAPA_ERP_STATUS_LABELS: Record<SapaErpApprovalStatus, string> = {
  not_drafted: 'ERP 미기안',
  in_progress: 'ERP 결재중',
  approved: 'ERP 완결',
  revision_needed: 'ERP 보완필요',
};

export const SAPA_APPROVAL_PRESETS: Record<
  SapaApprovalPresetId,
  {
    id: SapaApprovalPresetId;
    label: string;
    description: string;
    steps: readonly { roleCode: SapaApprovalStep['roleCode']; roleLabel: string }[];
  }
> = {
  site_authority: {
    id: 'site_authority',
    label: '현장 전결 라인 (2단계)',
    description: '현장 안전담당 → 현장소장 전결 (일상 위험성평가·간담회·비상훈련)',
    steps: [
      { roleCode: 'site_safety', roleLabel: '현장 안전담당' },
      { roleCode: 'site_director', roleLabel: '현장소장(전결)' },
    ],
  },
  hq_safety_review: {
    id: 'hq_safety_review',
    label: '본사 안전검토 라인 (3단계)',
    description: '현장 안전담당 → 현장소장 → 본사 안전보건실 (개선확인·비상대응)',
    steps: [
      { roleCode: 'site_safety', roleLabel: '현장 안전담당' },
      { roleCode: 'site_director', roleLabel: '현장소장' },
      { roleCode: 'hq_safety', roleLabel: '본사 안전보건실' },
    ],
  },
  hq_budget_review: {
    id: 'hq_budget_review',
    label: '공무·예산 합동 라인 (4단계)',
    description: '현장 안전/공무 → 현장소장 → 본사 공무/구매 → 본사 안전실·CSO (예산·협력팀·장비)',
    steps: [
      { roleCode: 'site_safety', roleLabel: '현장 안전·공무' },
      { roleCode: 'site_director', roleLabel: '현장소장' },
      { roleCode: 'hq_procurement', roleLabel: '본사 공무·계약' },
      { roleCode: 'cso', roleLabel: '본사 안전실·CSO' },
    ],
  },
  ceo_mandatory: {
    id: 'ceo_mandatory',
    label: '경영책임자 필수 결재 라인 (4단계)',
    description: '현장소장 → 본사 안전실 → CSO/임원 → 대표이사 (방침·반기평가·종합보고)',
    steps: [
      { roleCode: 'site_director', roleLabel: '현장소장' },
      { roleCode: 'hq_safety', roleLabel: '본사 안전실' },
      { roleCode: 'cso', roleLabel: 'CSO·임원' },
      { roleCode: 'ceo', roleLabel: '대표이사(최종)' },
    ],
  },
};

export const SAPA_CEO_DIRECTIVE_TEMPLATES: readonly {
  type: 'confirmed' | 'budget_support' | 'revision_ordered';
  label: string;
  text: string;
}[] = [
  {
    type: 'confirmed',
    label: '보고 확인 · 무결성 봉인',
    text: '현장별 법정 루틴 이행 현황 및 증빙 자료를 이상 없이 보고 확인함.',
  },
  {
    type: 'budget_support',
    label: '안전예산 · 인력 즉시 지원 승인',
    text: '골조 고위험 구간(동바리·갱폼·추락방지) 보강을 위해 요청 안전관리비 및 전담 인력 추가 투입을 즉시 승인함.',
  },
  {
    type: 'revision_ordered',
    label: '미흡 사항 보완 · 재보고 지시',
    text: '미비 항목(시정 전·후 사진 또는 협력팀 이행점검표) 보완 완료 후 본사 안전실을 경유해 재보고 바람.',
  },
];

export const SAPA_DEFENSE_CARD_SPECS: readonly SapaDefenseCardSpec[] = [
  {
    cardId: 'CARD-01',
    code: '01',
    shortTitle: '경영방침·목표',
    title: '안전보건 경영방침 및 현장 목표 설정',
    legalBasis: '중대재해처벌법 시행령 제4조 제1호',
    folderName: '01_시행령4조1호_경영방침목표',
    cycle: 'annual_or_mobilization',
    cycleLabel: '연 1회 + 착공 시',
    inputOwnerLabel: '본사 안전실 / 현장소장',
    defaultPresetId: 'ceo_mandatory',
    structuralRiskFocus: '골조 공종 특성(추락·붕괴 제로)을 반영한 대표이사 서명 방침서 및 현장 게시 증빙',
    defenseObjective: '경영책임자가 전사·현장 단위 안전목표와 경영방침을 명시적으로 수립·전파했음을 입증',
    requiredArtifacts: [
      '대표이사 서명 연간 안전보건 경영방침서',
      '현장별(골조팀 포함) 안전목표 수립서',
      '현장 사무실·조회 장소 게시 사진 1건 이상',
    ],
    isCritical: false,
  },
  {
    cardId: 'CARD-02',
    code: '02',
    shortTitle: '조직·전결권',
    title: '안전전담 조직 · 자격인력 및 CSO 전결권 위임',
    legalBasis: '중대재해처벌법 시행령 제4조 제2호 · 제6호',
    folderName: '02_시행령4조2_6호_조직자격전결권',
    cycle: 'annual_or_mobilization',
    cycleLabel: '착공 시 + 변동 시',
    inputOwnerLabel: '본사 안전실 · 인사/공무',
    defaultPresetId: 'ceo_mandatory',
    structuralRiskFocus: '유자격 안전관리자 선임 및 CSO/안전보건책임자 실질 예산·인사 전결권 규정 확보',
    defenseObjective: '법정 유자격자 배치와 권한 위임의 형식성이 아닌 실질 권한 부여를 입증',
    requiredArtifacts: [
      '안전관리자 선임계 및 건설안전 자격증 사본',
      'CSO·현장소장 안전보건 위임전결규정/이사회 보고서',
      '전담 안전조직 편성표 및 직무분장표',
    ],
    isCritical: false,
  },
  {
    cardId: 'CARD-03',
    code: '03',
    shortTitle: '위험성평가·개선',
    title: '유해·위험요인 확인 및 개선이행 (골조 핵심)',
    legalBasis: '중대재해처벌법 시행령 제4조 제3호',
    folderName: '03_시행령4조3호_위험성평가개선',
    cycle: 'monthly_5min',
    cycleLabel: '상시 / 월간 마감',
    inputOwnerLabel: 'PSI 자동 집계 + 현장소장',
    defaultPresetId: 'hq_safety_review',
    structuralRiskFocus: '시스템동바리·갱폼·합벽·타설·타워크레인 등 골조 고위험 요인의 사전 도출 및 개선 전후 사진',
    defenseObjective: '형식적 서류 평가가 아니라 근로자·현장 지적 위험이 실제 시정 완료되었음을 입증',
    requiredArtifacts: [
      '근로자 자필 위험성평가 OCR 분석 대장 (Q1~Q5)',
      '골조 사진점검 개선 전·후 대조 및 작업중지 해제 기록',
      '월간 위험성평가 검토·개선 이행 보고서',
    ],
    isCritical: true,
  },
  {
    cardId: 'CARD-04',
    code: '04',
    shortTitle: '안전예산 집행',
    title: '산업안전보건관리비·안전예산 편성 및 집행',
    legalBasis: '중대재해처벌법 시행령 제4조 제4호',
    folderName: '04_시행령4조4호_안전예산집행',
    cycle: 'monthly_5min',
    cycleLabel: '연 편성 + 월간 집행',
    inputOwnerLabel: '현장 공무 / 본사 안전실',
    defaultPresetId: 'hq_budget_review',
    structuralRiskFocus: '추락방지망·안전난간·동바리 보강재·보호구 등 안전예산의 목적 외 사용 방지 및 적기 집행',
    defenseObjective: '안전 비용을 아끼지 않고 현장 요청에 맞춰 실제 예산을 편성·집행했음을 증명',
    requiredArtifacts: [
      '현장별 연간 안전보건관리비 편성 계획서',
      '월별 집행 실적 내역(ERP 전표번호 및 금액 연동)',
      '추가 안전시설물 요청 시 예산 승인 결재 기록',
    ],
    isCritical: false,
  },
  {
    cardId: 'CARD-05',
    code: '05',
    shortTitle: '책임자 반기평가',
    title: '안전보건관리책임자 · 관리감독자 업무수행 평가',
    legalBasis: '중대재해처벌법 시행령 제4조 제5호',
    folderName: '05_시행령4조5호_책임자반기평가',
    cycle: 'semiannual_mandatory',
    cycleLabel: '반기 1회 필수 (6·12월)',
    inputOwnerLabel: '본사 안전실 / 대표이사',
    defaultPresetId: 'ceo_mandatory',
    structuralRiskFocus: '현장소장·철근/형틀 관리감독자가 실제 안전점검·시정조치를 수행했는지 반기별 정량 평가',
    defenseObjective: '현장소장 선임 후 방치하지 않고 본사·대표이사가 반기별 업무 충실도를 평가·피드백했음을 입증',
    requiredArtifacts: [
      '관리책임자·관리감독자 직무수행 평가기준표',
      'PSI 현장 조치이행률·기한초과율 연계 반기 평가표',
      '대표이사/CSO 보고 및 개선 지시 결재본',
    ],
    isCritical: true,
  },
  {
    cardId: 'CARD-06',
    code: '06',
    shortTitle: '종사자 의견청취',
    title: '종사자(협력팀 포함) 의견청취 및 개선고지',
    legalBasis: '중대재해처벌법 시행령 제4조 제7호',
    folderName: '06_시행령4조7호_종사자의견청취',
    cycle: 'monthly_5min',
    cycleLabel: '월간 / 분기 확인',
    inputOwnerLabel: '현장 안전담당 / 현장소장',
    defaultPresetId: 'site_authority',
    structuralRiskFocus: '골조 작업팀·일용직·외국인 근로자의 건의사항 수렴 후 실제 개선조치 및 현장 재고지 완료 증빙',
    defenseObjective: '근로자 의견을 듣기만 하고 묵인한 것이 아니라 개선 후 근로자에게 회신·고지했음을 입증',
    requiredArtifacts: [
      '자필 Q1~Q5 의견·건의 추출 목록 및 안전간담회 사진',
      '건의사항 조치결과 요약 및 근로자 고지 게시 사진',
    ],
    isCritical: true,
  },
  {
    cardId: 'CARD-07',
    code: '07',
    shortTitle: '비상대응·훈련',
    title: '중대재해 대비 비상조치 매뉴얼 및 모의훈련',
    legalBasis: '중대재해처벌법 시행령 제4조 제8호',
    folderName: '07_시행령4조8호_비상대응훈련',
    cycle: 'semiannual_mandatory',
    cycleLabel: '반기 1회 필수 (6·12월)',
    inputOwnerLabel: '현장소장 / 안전담당',
    defaultPresetId: 'hq_safety_review',
    structuralRiskFocus: '거푸집 동바리 붕괴·고소 추락·지하 질식 시 초기 작업중지·119 신고·구호 매뉴얼 및 실제 훈련',
    defenseObjective: '사고 직후 골든타임 대응 매뉴얼과 정기 훈련·12개국어 전파가 작동했음을 입증',
    requiredArtifacts: [
      '골조 공종 맞춤형 중대재해 비상조치 매뉴얼',
      '비상조치 모의훈련 사진·강평 일지 및 QR 참석 서명부',
    ],
    isCritical: false,
  },
  {
    cardId: 'CARD-08',
    code: '08',
    shortTitle: '협력팀·장비 평가',
    title: '수급인(철근·형틀팀·장비) 적격성 평가 및 반기점검',
    legalBasis: '중대재해처벌법 시행령 제4조 제9호',
    folderName: '08_시행령4조9호_협력팀장비점검',
    cycle: 'semiannual_mandatory',
    cycleLabel: '계약 전 + 반기 1회',
    inputOwnerLabel: '본사 공무·안전 / 현장소장',
    defaultPresetId: 'hq_budget_review',
    structuralRiskFocus: '재하도급 골조팀·타워크레인·펌프카·고소작업대 등 고위험 도급·장비 업체 안전역량 검증',
    defenseObjective: '저가 무분별 하도급이 아닌 안전보건 수준 평가 후 계약·반기 이행점검을 수행했음을 입증',
    requiredArtifacts: [
      '수급인(골조팀·건설기계) 계약 전 안전보건 역량평가표',
      '건설기계 사용전 점검 사진 대장 및 반기 안전이행점검표',
    ],
    isCritical: true,
  },
  {
    cardId: 'CARD-09',
    code: '09',
    shortTitle: '대표이사 결재·지시',
    title: '경영책임자 보고확인 · 예산지원 · 개선지시 (작동성 총괄)',
    legalBasis: '중대재해처벌법 제4조 · 시행령 제4조 종합',
    folderName: '09_대표이사_보고결재_지시이력',
    cycle: 'monthly_5min',
    cycleLabel: '월간 보고 + 반기 봉인',
    inputOwnerLabel: '대표이사 / CSO',
    defaultPresetId: 'ceo_mandatory',
    structuralRiskFocus: '전 현장의 방어 카드를 대표이사가 직접 보고받고 예산·인력·시정을 지시한 타임스탬프 봉인 이력',
    defenseObjective: '검찰·법원이 요구하는 "경영책임자의 실질적 관심과 작동성"의 결정적 증거',
    requiredArtifacts: [
      '월간·반기 중처법 방어 카드 대표이사 결재·지시 원문',
      '예산·인력 지원 승인 이력 및 SHA-256 무결성 해시',
    ],
    isCritical: true,
  },
];

export const SAPA_DEFENSE_CARD_SPEC_MAP: Record<SapaCardId, SapaDefenseCardSpec> = Object.fromEntries(
  SAPA_DEFENSE_CARD_SPECS.map(spec => [spec.cardId, spec]),
) as Record<SapaCardId, SapaDefenseCardSpec>;

let memoryRecords: SapaDefenseCardRecord[] | null = null;
let memoryGovernanceMode: SapaGovernanceMode | null = null;

const emitSapaUpdated = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SAPA_DEFENSE_UPDATED_EVENT));
  }
};

const createStepsFromPreset = (presetId: SapaApprovalPresetId): SapaApprovalStep[] =>
  SAPA_APPROVAL_PRESETS[presetId].steps.map((s, idx) => ({
    stepOrder: idx + 1,
    roleCode: s.roleCode,
    roleLabel: s.roleLabel,
    status: 'pending',
    actorName: '',
    actedAt: '',
    note: '',
  }));

const createDefaultErpBridge = (siteId: string): SapaErpBridgeRecord => ({
  erpDocNo: '',
  erpSiteCode: siteId,
  erpBudgetCode: 'SAFE-MGT-01',
  erpCostCenter: `CC-${siteId.replace(/[^A-Z0-9]/gi, '').slice(0, 8)}`,
  erpVendorCode: '',
  erpApprovalStatus: 'not_drafted',
  erpApprovedAt: '',
  erpAmountKrw: undefined,
  erpAttachmentName: '',
  erpAttachmentDataUrl: '',
  erpCustomFields: [],
});

export const computeRoutineDueDate = (cycle: SapaRoutineCycle, asOfDate: string): string => {
  const year = Number(asOfDate.slice(0, 4)) || 2026;
  const month = Number(asOfDate.slice(5, 7)) || 11;
  if (cycle === 'monthly_5min') {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }
  if (cycle === 'semiannual_mandatory') {
    return month <= 6 ? `${year}-06-30` : `${year}-12-31`;
  }
  return `${year}-12-31`;
};

const calcDaysDiff = (fromDate: string, toDate: string): number => {
  const a = Date.parse(`${fromDate}T00:00:00Z`);
  const b = Date.parse(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
};

export const computeSapaSealHash = async (record: {
  recordKey: string;
  siteId: string;
  cardId: SapaCardId;
  periodKey: string;
  summaryMemo: string;
  ceoDirectiveNote: string;
  erpBridge: SapaErpBridgeRecord;
  approvalSteps: readonly SapaApprovalStep[];
}): Promise<string> => {
  const payload = JSON.stringify({
    recordKey: record.recordKey,
    siteId: record.siteId,
    cardId: record.cardId,
    periodKey: record.periodKey,
    summaryMemo: record.summaryMemo,
    ceoDirectiveNote: record.ceoDirectiveNote,
    erpDocNo: record.erpBridge.erpDocNo,
    erpSiteCode: record.erpBridge.erpSiteCode,
    erpBudgetCode: record.erpBridge.erpBudgetCode,
    erpApprovalStatus: record.erpBridge.erpApprovalStatus,
    steps: record.approvalSteps.map(s => `${s.roleLabel}:${s.status}:${s.actorName}:${s.actedAt}`),
  });
  const bytes = new TextEncoder().encode(payload);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes.buffer);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(16, '0');
};

export const readSapaGovernanceMode = (): SapaGovernanceMode => {
  if (memoryGovernanceMode) return memoryGovernanceMode;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(SAPA_GOVERNANCE_MODE_KEY);
      if (raw === 'erp_bridge' || raw === 'psi_native') {
        memoryGovernanceMode = raw;
        return raw;
      }
    } catch {
      // ignore
    }
  }
  memoryGovernanceMode = 'erp_bridge';
  return 'erp_bridge';
};

export const writeSapaGovernanceMode = (mode: SapaGovernanceMode): SapaGovernanceMode => {
  memoryGovernanceMode = mode;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(SAPA_GOVERNANCE_MODE_KEY, mode);
    } catch {
      // ignore
    }
  }
  emitSapaUpdated();
  return mode;
};

export const readSapaDefenseRecords = (): SapaDefenseCardRecord[] => {
  if (memoryRecords) return memoryRecords.map(r => ({ ...r }));
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(SAPA_DEFENSE_RECORDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          memoryRecords = parsed as SapaDefenseCardRecord[];
          return memoryRecords.map(r => ({ ...r }));
        }
      }
    } catch {
      // ignore
    }
  }
  memoryRecords = [];
  return [];
};

export const writeSapaDefenseRecords = (records: readonly SapaDefenseCardRecord[]): SapaDefenseCardRecord[] => {
  const copy = records.map(r => ({
    ...r,
    approvalSteps: r.approvalSteps.map(s => ({ ...s })),
    erpBridge: {
      ...r.erpBridge,
      erpCustomFields: r.erpBridge.erpCustomFields.map(f => ({ ...f })),
    },
  }));
  memoryRecords = copy;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(SAPA_DEFENSE_RECORDS_KEY, JSON.stringify(copy));
    } catch {
      // ignore
    }
  }
  emitSapaUpdated();
  return copy;
};

export const resetSapaDefenseStore = () => {
  memoryRecords = [];
  memoryGovernanceMode = 'erp_bridge';
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(SAPA_DEFENSE_RECORDS_KEY);
      window.localStorage.removeItem(SAPA_GOVERNANCE_MODE_KEY);
    } catch {
      // ignore
    }
  }
  emitSapaUpdated();
};

const buildSiteAutoEvidence = (
  site: NexusManagedSite,
  deps: {
    workerRecords: readonly WorkerRecord[];
    pipelineCases: readonly NexusPipelineCase[];
    equipmentReports: readonly NexusEquipmentPhotoSubmission[];
    trainingCampaigns: readonly NexusExecutiveTrainingCampaign[];
    visitPlans: readonly NexusHqVisitPlan[];
    investigations: readonly NexusAiInvestigationRecord[];
  },
): SapaAutoEvidenceSnapshot => {
  const siteId = site.siteId;
  const matchedWorkers = deps.workerRecords.filter(w =>
    matchesScopedSiteRecord(undefined, `${w.jobField || ''} ${w.teamLeader || ''}`, siteId) || deps.workerRecords.length <= 25,
  );
  const matchedCases = deps.pipelineCases.filter(c =>
    matchesScopedSiteRecord(c.siteId, `${c.locationLabel} ${c.actionTitle}`, siteId),
  );
  const matchedEq = deps.equipmentReports.filter(e =>
    matchesScopedSiteRecord(e.siteId, `${e.siteName} ${e.workActivity}`, siteId),
  );
  const signatureCount = deps.trainingCampaigns.reduce(
    (sum, c) =>
      sum +
      (c.workerSignatureReceipts ?? []).filter(r => !r.siteId || r.siteId === siteId).length,
    0,
  );
  const matchedVisits = deps.visitPlans.filter(v =>
    matchesScopedSiteRecord(v.siteId, `${v.siteName} ${v.purpose}`, siteId),
  );
  const matchedInvs = deps.investigations.filter(inv =>
    matchesScopedSiteRecord(inv.siteId, `${inv.siteName} ${inv.incidentTitle}`, siteId),
  );

  return {
    ocrRiskRecordCount: matchedWorkers.length,
    pipelineCaseCount: matchedCases.length,
    stopWorkCount: matchedCases.filter(c => c.stopWorkFlag).length,
    equipmentPhotoCount: matchedEq.length,
    trainingSignatureCount: signatureCount,
    hqVisitCount: matchedVisits.length,
    investigationCount: matchedInvs.length,
    overdueActionCount: matchedCases.filter(c => c.status !== 'closed').length,
  };
};

export const evaluateDefenseSignal = (
  record: SapaDefenseCardRecord,
  mode: SapaGovernanceMode,
  asOfDate: string,
): { signal: SapaDefenseSignal; signalLabel: string; daysRemaining: number; dDayLabel: string; isComplete: boolean; isPendingExecutive: boolean } => {
  const daysRemaining = calcDaysDiff(asOfDate, record.dueDate);
  const dDayLabel =
    daysRemaining < 0
      ? `D+${Math.abs(daysRemaining)} 초과`
      : daysRemaining === 0
        ? 'D-DAY 마감'
        : `D-${daysRemaining}`;

  const stepsApproved =
    record.approvalSteps.length > 0 && record.approvalSteps.every(s => s.status === 'approved');
  const hasRevision =
    record.approvalSteps.some(s => s.status === 'revision_requested') ||
    record.erpBridge.erpApprovalStatus === 'revision_needed' ||
    record.ceoDirectiveType === 'revision_ordered';

  if (hasRevision) {
    return {
      signal: 'red',
      signalLabel: '보완필요(재상신)',
      daysRemaining,
      dDayLabel,
      isComplete: false,
      isPendingExecutive: false,
    };
  }

  const erpApproved =
    record.erpBridge.erpApprovalStatus === 'approved' && Boolean(record.erpBridge.erpDocNo.trim());

  const isComplete =
    mode === 'erp_bridge'
      ? (erpApproved || (Boolean(record.sealHash) && stepsApproved))
      : Boolean(record.sealHash) && stepsApproved;

  if (isComplete) {
    return {
      signal: 'green',
      signalLabel: mode === 'erp_bridge' && erpApproved ? 'ERP+방어봉인' : '방어완료(봉인)',
      daysRemaining,
      dDayLabel,
      isComplete: true,
      isPendingExecutive: false,
    };
  }

  const nextPendingStep = record.approvalSteps.find(s => s.status === 'pending');
  const awaitingCeoOrCso =
    Boolean(record.summaryMemo.trim() || record.erpBridge.erpDocNo.trim()) &&
    (nextPendingStep?.roleCode === 'ceo' || nextPendingStep?.roleCode === 'cso');

  const isPendingExecutive =
    awaitingCeoOrCso ||
    (record.erpBridge.erpApprovalStatus === 'in_progress' && Boolean(record.erpBridge.erpDocNo.trim()));

  if (isPendingExecutive) {
    return {
      signal: 'purple',
      signalLabel: nextPendingStep ? `${nextPendingStep.roleLabel} 결재대기` : '결재·확인대기',
      daysRemaining,
      dDayLabel,
      isComplete: false,
      isPendingExecutive: true,
    };
  }

  if (daysRemaining <= 14) {
    return {
      signal: daysRemaining < 0 ? 'red' : 'yellow',
      signalLabel: daysRemaining < 0 ? '법정 기한초과' : '마감임박',
      daysRemaining,
      dDayLabel,
      isComplete: false,
      isPendingExecutive: false,
    };
  }

  return {
    signal: 'red',
    signalLabel: '미이행(대기)',
    daysRemaining,
    dDayLabel,
    isComplete: false,
    isPendingExecutive: false,
  };
};

export interface HydrateSapaDefenseInput {
  workerRecords?: readonly WorkerRecord[];
  sites?: readonly NexusManagedSite[];
  pipelineCases?: readonly NexusPipelineCase[];
  equipmentReports?: readonly NexusEquipmentPhotoSubmission[];
  trainingCampaigns?: readonly NexusExecutiveTrainingCampaign[];
  visitPlans?: readonly NexusHqVisitPlan[];
  investigations?: readonly NexusAiInvestigationRecord[];
  asOfDate?: string;
}

export const hydrateSapaDefenseMatrix = (
  input: HydrateSapaDefenseInput = {},
): {
  asOfDate: string;
  periodKey: string;
  mode: SapaGovernanceMode;
  sites: NexusManagedSite[];
  cards: SapaDefenseHydratedCard[];
  summary: SapaDefensePortfolioSummary;
} => {
  const asOfDate = input.asOfDate || getKoreanCalendarDay();
  const periodKey = asOfDate.slice(0, 7);
  const mode = readSapaGovernanceMode();
  const sites = [...(input.sites ?? readManagedNexusSites(false))];
  const stored = readSapaDefenseRecords();
  const storedMap = new Map(stored.map(r => [r.recordKey, r]));

  const deps = {
    workerRecords: input.workerRecords ?? [],
    pipelineCases: input.pipelineCases ?? readNexusPipelineCases(),
    equipmentReports: input.equipmentReports ?? readEquipmentPhotoSubmissions(),
    trainingCampaigns: input.trainingCampaigns ?? readExecutiveTrainingCampaigns(),
    visitPlans: input.visitPlans ?? readHqVisitPlans(),
    investigations: input.investigations ?? readAiInvestigations(),
  };

  const hydratedCards: SapaDefenseHydratedCard[] = [];

  for (const site of sites) {
    const autoEvidence = buildSiteAutoEvidence(site, deps);
    for (const spec of SAPA_DEFENSE_CARD_SPECS) {
      const recordKey = `${site.siteId}::${spec.cardId}::${periodKey}`;
      const existing = storedMap.get(recordKey);
      const base: SapaDefenseCardRecord = existing
        ? {
            ...existing,
            siteName: site.siteName,
            autoEvidence,
            erpBridge: {
              ...createDefaultErpBridge(site.siteId),
              ...existing.erpBridge,
              erpSiteCode: existing.erpBridge?.erpSiteCode || site.siteId,
              erpCustomFields: existing.erpBridge?.erpCustomFields ?? [],
            },
            approvalSteps:
              existing.approvalSteps?.length > 0
                ? existing.approvalSteps
                : createStepsFromPreset(existing.presetId || spec.defaultPresetId),
          }
        : {
            recordKey,
            siteId: site.siteId,
            siteName: site.siteName,
            cardId: spec.cardId,
            periodKey,
            dueDate: computeRoutineDueDate(spec.cycle, asOfDate),
            presetId: spec.defaultPresetId,
            approvalSteps: createStepsFromPreset(spec.defaultPresetId),
            erpBridge: createDefaultErpBridge(site.siteId),
            summaryMemo:
              spec.cardId === 'CARD-03' && autoEvidence.ocrRiskRecordCount + autoEvidence.pipelineCaseCount > 0
                ? `PSI 자동집계: 자필 위험성평가 ${autoEvidence.ocrRiskRecordCount}건 · 시정조치 파이프라인 ${autoEvidence.pipelineCaseCount}건 연동됨`
                : '',
            ceoDirectiveNote: '',
            ceoDirectiveType: '',
            autoEvidence,
            sealHash: '',
            sealedAt: '',
            updatedAt: `${asOfDate}T09:00:00Z`,
          };

      const evalRes = evaluateDefenseSignal(base, mode, asOfDate);
      hydratedCards.push({
        ...base,
        spec,
        signal: evalRes.signal,
        signalLabel: evalRes.signalLabel,
        daysRemaining: evalRes.daysRemaining,
        dDayLabel: evalRes.dDayLabel,
        isRoutineComplete: evalRes.isComplete,
        isPendingExecutive: evalRes.isPendingExecutive,
      });
    }
  }

  const totalCells = hydratedCards.length;
  const greenCount = hydratedCards.filter(c => c.signal === 'green').length;
  const purpleCount = hydratedCards.filter(c => c.signal === 'purple').length;
  const yellowCount = hydratedCards.filter(c => c.signal === 'yellow').length;
  const redCount = hydratedCards.filter(c => c.signal === 'red').length;
  const erpConnectedCount = hydratedCards.filter(
    c => Boolean(c.erpBridge.erpDocNo.trim()) || c.erpBridge.erpApprovalStatus === 'approved',
  ).length;
  const psiSealedCount = hydratedCards.filter(c => Boolean(c.sealHash)).length;
  const criticalGapCount = hydratedCards.filter(
    c => c.spec.isCritical && (c.signal === 'red' || c.signal === 'yellow'),
  ).length;

  return {
    asOfDate,
    periodKey,
    mode,
    sites,
    cards: hydratedCards,
    summary: {
      totalCells,
      greenCount,
      purpleCount,
      yellowCount,
      redCount,
      defenseReadinessPct: totalCells > 0 ? Math.round((greenCount / totalCells) * 100) : 0,
      pendingCeoCount: purpleCount,
      erpConnectedCount,
      psiSealedCount,
      criticalGapCount,
    },
  };
};

export const upsertSapaDefenseCardRecord = (
  record: SapaDefenseCardRecord,
  nowIso = new Date().toISOString(),
): SapaDefenseCardRecord[] => {
  const list = readSapaDefenseRecords();
  const nextRecord: SapaDefenseCardRecord = {
    ...record,
    updatedAt: nowIso,
  };
  const idx = list.findIndex(r => r.recordKey === nextRecord.recordKey);
  if (idx >= 0) {
    list[idx] = nextRecord;
  } else {
    list.push(nextRecord);
  }
  return writeSapaDefenseRecords(list);
};

export const applyApprovalPresetToCard = (
  record: SapaDefenseCardRecord,
  presetId: SapaApprovalPresetId,
  nowIso = new Date().toISOString(),
): SapaDefenseCardRecord => {
  const updated: SapaDefenseCardRecord = {
    ...record,
    presetId,
    approvalSteps: createStepsFromPreset(presetId),
    sealHash: '',
    sealedAt: '',
    updatedAt: nowIso,
  };
  upsertSapaDefenseCardRecord(updated, nowIso);
  return updated;
};

export const updateCardApprovalSteps = (
  record: SapaDefenseCardRecord,
  steps: readonly SapaApprovalStep[],
  nowIso = new Date().toISOString(),
): SapaDefenseCardRecord => {
  const normalized = steps.map((s, idx) => ({ ...s, stepOrder: idx + 1 }));
  const updated: SapaDefenseCardRecord = {
    ...record,
    approvalSteps: normalized,
    sealHash: normalized.every(s => s.status === 'approved') ? record.sealHash : '',
    sealedAt: normalized.every(s => s.status === 'approved') ? record.sealedAt : '',
    updatedAt: nowIso,
  };
  upsertSapaDefenseCardRecord(updated, nowIso);
  return updated;
};

export const advanceApprovalStepOnCard = async (
  record: SapaDefenseCardRecord,
  params: {
    stepOrder: number;
    decision: 'approved' | 'revision_requested';
    actorName: string;
    note?: string;
    nowIso?: string;
  },
): Promise<SapaDefenseCardRecord> => {
  const nowIso = params.nowIso || new Date().toISOString();
  const nextSteps = record.approvalSteps.map(step => {
    if (step.stepOrder !== params.stepOrder) return step;
    return {
      ...step,
      status: params.decision,
      actorName: params.actorName.trim() || step.roleLabel,
      actedAt: nowIso,
      note: (params.note ?? '').trim(),
    };
  });
  const allApproved = nextSteps.length > 0 && nextSteps.every(s => s.status === 'approved');
  const nextRecord: SapaDefenseCardRecord = {
    ...record,
    approvalSteps: nextSteps,
    updatedAt: nowIso,
    sealHash: '',
    sealedAt: '',
  };
  if (allApproved) {
    nextRecord.sealHash = await computeSapaSealHash(nextRecord);
    nextRecord.sealedAt = nowIso;
  }
  upsertSapaDefenseCardRecord(nextRecord, nowIso);
  return nextRecord;
};

export const applyCeoDirectiveAndSealCard = async (
  record: SapaDefenseCardRecord,
  params: {
    directiveType: 'confirmed' | 'budget_support' | 'revision_ordered';
    directiveNote: string;
    actorName?: string;
    nowIso?: string;
  },
): Promise<SapaDefenseCardRecord> => {
  const nowIso = params.nowIso || new Date().toISOString();
  const actor = (params.actorName || '대표이사').trim();
  const isRevision = params.directiveType === 'revision_ordered';

  const nextSteps = record.approvalSteps.map(step => {
    if (isRevision) {
      return step.roleCode === 'ceo' || step.roleCode === 'cso'
        ? { ...step, status: 'revision_requested' as const, actorName: actor, actedAt: nowIso, note: params.directiveNote }
        : step;
    }
    return {
      ...step,
      status: 'approved' as const,
      actorName: step.actorName || actor,
      actedAt: step.actedAt || nowIso,
      note: step.roleCode === 'ceo' || step.stepOrder === record.approvalSteps.length ? params.directiveNote : step.note,
    };
  });

  const nextRecord: SapaDefenseCardRecord = {
    ...record,
    approvalSteps: nextSteps,
    ceoDirectiveType: params.directiveType,
    ceoDirectiveNote: params.directiveNote.trim(),
    erpBridge:
      !isRevision && record.erpBridge.erpDocNo.trim() && record.erpBridge.erpApprovalStatus === 'in_progress'
        ? {
            ...record.erpBridge,
            erpApprovalStatus: 'approved',
            erpApprovedAt: record.erpBridge.erpApprovedAt || nowIso.slice(0, 10),
          }
        : isRevision && record.erpBridge.erpDocNo.trim()
          ? { ...record.erpBridge, erpApprovalStatus: 'revision_needed' }
          : record.erpBridge,
    updatedAt: nowIso,
    sealHash: '',
    sealedAt: '',
  };

  if (!isRevision) {
    nextRecord.sealHash = await computeSapaSealHash(nextRecord);
    nextRecord.sealedAt = nowIso;
  }

  upsertSapaDefenseCardRecord(nextRecord, nowIso);
  return nextRecord;
};

/**
 * Populates realistic multi-site Korean structural engineering company SAPA defense records
 * covering completed seals, CEO pending approvals, ERP-bridged records, and overdue gaps.
 */
export const seedSapaDefensePortfolio = async (
  asOfDate = getKoreanCalendarDay(),
  nowIso = new Date().toISOString(),
): Promise<SapaDefenseCardRecord[]> => {
  const periodKey = asOfDate.slice(0, 7);
  const sites = readManagedNexusSites(false);
  const seeded: SapaDefenseCardRecord[] = [];

  for (let sIdx = 0; sIdx < sites.length; sIdx++) {
    const site = sites[sIdx];
    for (const spec of SAPA_DEFENSE_CARD_SPECS) {
      const recordKey = `${site.siteId}::${spec.cardId}::${periodKey}`;
      const steps = createStepsFromPreset(spec.defaultPresetId);
      const erp = createDefaultErpBridge(site.siteId);
      let summaryMemo = '';
      let ceoDirectiveType: SapaDefenseCardRecord['ceoDirectiveType'] = '';
      let ceoDirectiveNote = '';

      // Site 1 (지하 RC): Strong compliance + ERP bridged + 1 pending CEO final approval (CARD-05)
      if (sIdx === 0) {
        erp.erpDocNo = `ERP-${periodKey.replace('-', '')}-${spec.code}`;
        erp.erpCostCenter = 'CC-RC-B201';
        erp.erpBudgetCode = spec.cardId === 'CARD-04' ? 'SAFE-FAC-2026' : 'SAFE-OPS-2026';
        erp.erpVendorCode = spec.cardId === 'CARD-08' ? 'VND-RCFORM-07' : '';
        erp.erpCustomFields = [
          { key: 'ERP_GUBUN', label: 'ERP 안전구분코드', value: `SAPA-${spec.code}` },
          { key: 'COST_GROUP', label: '공종원가항목', value: '지하RC·합벽' },
        ];
        if (spec.cardId === 'CARD-04') erp.erpAmountKrw = 48500000;

        if (spec.cardId === 'CARD-05') {
          erp.erpApprovalStatus = 'in_progress';
          summaryMemo = '제1현장 소장·철근/형틀 반장 4명 반기 업무평가 완료 (평균 91점, 시정조치 기한준수율 100%)';
          for (let i = 0; i < steps.length - 1; i++) {
            steps[i] = { ...steps[i], status: 'approved', actorName: '본사 안전보건실장', actedAt: nowIso, note: '정량지표 검증 완료' };
          }
        } else {
          erp.erpApprovalStatus = 'approved';
          erp.erpApprovedAt = asOfDate;
          summaryMemo = `${site.shortLabel} ${spec.title} 정기 점검·증빙 편철 완료`;
          ceoDirectiveType = 'confirmed';
          ceoDirectiveNote = '법정 의무 이행 이상 없음 확인 및 무결성 봉인 완료';
          for (let i = 0; i < steps.length; i++) {
            steps[i] = { ...steps[i], status: 'approved', actorName: i === steps.length - 1 ? '대표이사' : '담당결재자', actedAt: nowIso, note: '승인' };
          }
        }
      } else if (sIdx === 1) {
        // Site 2 (갱폼 15층): Realistic mid-month state (3 sealed, 2 awaiting CEO directive, 4 in progress/missing)
        erp.erpCostCenter = 'CC-GF-103';
        erp.erpCustomFields = [{ key: 'ERP_GUBUN', label: 'ERP 안전구분코드', value: `SAPA-${spec.code}` }];
        if (spec.cardId === 'CARD-01' || spec.cardId === 'CARD-02' || spec.cardId === 'CARD-03') {
          erp.erpDocNo = `ERP-${periodKey.replace('-', '')}-2${spec.code}`;
          erp.erpApprovalStatus = 'approved';
          erp.erpApprovedAt = asOfDate;
          summaryMemo = '103동 15층 갱폼 인양 볼트체결·추락방호망 사진전후 대조 완료';
          ceoDirectiveType = 'confirmed';
          ceoDirectiveNote = '고층 갱폼 인양 전 점검 철저 지시 완료';
          for (let i = 0; i < steps.length; i++) {
            steps[i] = { ...steps[i], status: 'approved', actorName: '대표이사/소장', actedAt: nowIso, note: '승인' };
          }
        } else if (spec.cardId === 'CARD-04' || spec.cardId === 'CARD-09') {
          erp.erpDocNo = `ERP-${periodKey.replace('-', '')}-2${spec.code}`;
          erp.erpApprovalStatus = 'in_progress';
          if (spec.cardId === 'CARD-04') erp.erpAmountKrw = 16200000;
          summaryMemo = spec.cardId === 'CARD-04'
            ? '15층 외벽 갱폼 수직보호망·안전대 추가 구매 긴급예산 1,620만원 승인 요청'
            : '제2현장 11월 월간 방어카드 종합 및 추가 안전예산 대표이사 확인 요청';
          for (let i = 0; i < steps.length - 1; i++) {
            steps[i] = { ...steps[i], status: 'approved', actorName: '현장소장·본사CSO', actedAt: nowIso, note: '상신' };
          }
        } else if (spec.cardId === 'CARD-08') {
          erp.erpDocNo = `ERP-${periodKey.replace('-', '')}-208`;
          erp.erpVendorCode = 'VND-TOWER-02';
          erp.erpApprovalStatus = 'revision_needed';
          ceoDirectiveType = 'revision_ordered';
          ceoDirectiveNote = '타워크레인 신호수·인양 협력팀 반기 안전점검 서명부 첨부 보완 요망';
          steps[steps.length - 1] = {
            ...steps[steps.length - 1],
            status: 'revision_requested',
            actorName: '본사 안전실장',
            actedAt: nowIso,
            note: ceoDirectiveNote,
          };
        }
      } else {
        // Site 3 (전이층 동바리): High priority field needing attention + awaiting CEO urgent budget/directive
        erp.erpCostCenter = 'CC-SH-301';
        if (spec.cardId === 'CARD-01' || spec.cardId === 'CARD-02') {
          erp.erpDocNo = `ERP-${periodKey.replace('-', '')}-3${spec.code}`;
          erp.erpApprovalStatus = 'approved';
          erp.erpApprovedAt = asOfDate;
          summaryMemo = '착공 시 경영방침 게시 및 안전관리자 선임 완료';
          ceoDirectiveType = 'confirmed';
          ceoDirectiveNote = '초기 세팅 확인 완료';
          for (let i = 0; i < steps.length; i++) {
            steps[i] = { ...steps[i], status: 'approved', actorName: '대표이사', actedAt: nowIso, note: '승인' };
          }
        } else if (spec.cardId === 'CARD-03') {
          erp.erpDocNo = `ERP-${periodKey.replace('-', '')}-303`;
          erp.erpApprovalStatus = 'in_progress';
          summaryMemo = '전이층 고층고 시스템동바리 가새·U헤드 편심 점검 긴급 보고 (대표이사 확인 대기)';
          for (let i = 0; i < steps.length - 1; i++) {
            steps[i] = { ...steps[i], status: 'approved', actorName: '현장소장', actedAt: nowIso, note: '긴급보고' };
          }
        }
      }

      const rec: SapaDefenseCardRecord = {
        recordKey,
        siteId: site.siteId,
        siteName: site.siteName,
        cardId: spec.cardId,
        periodKey,
        dueDate: computeRoutineDueDate(spec.cycle, asOfDate),
        presetId: spec.defaultPresetId,
        approvalSteps: steps,
        erpBridge: erp,
        summaryMemo,
        ceoDirectiveNote,
        ceoDirectiveType,
        autoEvidence: {
          ocrRiskRecordCount: 0,
          pipelineCaseCount: 0,
          stopWorkCount: 0,
          equipmentPhotoCount: 0,
          trainingSignatureCount: 0,
          hqVisitCount: 0,
          investigationCount: 0,
          overdueActionCount: 0,
        },
        sealHash: '',
        sealedAt: '',
        updatedAt: nowIso,
      };

      if (steps.length > 0 && steps.every(s => s.status === 'approved')) {
        rec.sealHash = await computeSapaSealHash(rec);
        rec.sealedAt = nowIso;
      }
      seeded.push(rec);
    }
  }

  return writeSapaDefenseRecords(seeded);
};

import { getKoreanCalendarDay } from './monthlyFieldFollowup';
import type { NexusExecutiveTrainingCampaign } from './nexusExecutiveTrainingPipeline';
import {
  type NexusAiInvestigationRecord,
  type NexusHqVisitPlan,
} from './nexusHqCommandLoop';
import { findManagedSiteById, readManagedNexusSites } from './nexusSiteRegistry';
import type { NexusPipelineCase } from './nexusQuickPipeline';
import { escapeSpreadsheetCsvCell } from './spreadsheetCsv';

export const NEXUS_EQUIPMENT_PHOTO_STORAGE_KEY = 'psi_nexus_equipment_photo_reports_v1';
export const NEXUS_EQUIPMENT_PHOTO_UPDATED_EVENT = 'psi-nexus-equipment-photo-updated';

export type NexusEquipmentType =
  | 'concrete_pump_car'
  | 'tower_crane'
  | 'mobile_crane'
  | 'aerial_work_platform'
  | 'excavator_drilling'
  | 'gangform_hoist';

export type NexusEquipmentPhotoStatus =
  | 'submitted_to_hq'
  | 'hq_verified_for_ceo'
  | 'revision_requested_hq'
  | 'reported_to_ceo';

export const NEXUS_EQUIPMENT_PHOTO_STATUS_LABELS: Record<NexusEquipmentPhotoStatus, string> = {
  submitted_to_hq: '현장 전송 · 본사 검토대기',
  hq_verified_for_ceo: '본사 적합 · 경영진 보고 준비',
  revision_requested_hq: '본사 보완요청',
  reported_to_ceo: '대표이사·경영진 보고 완료',
};

export interface NexusEquipmentTypeOption {
  id: NexusEquipmentType;
  label: string;
  structuralNodeIndex: string;
  defaultChecklist: string;
}

export const NEXUS_EQUIPMENT_TYPE_OPTIONS: readonly NexusEquipmentTypeOption[] = [
  {
    id: 'concrete_pump_car',
    label: '콘크리트 타설 펌프카',
    structuralNodeIndex: '06',
    defaultChecklist: '아웃트리거 최대 확장·지반 침하 보강(깔판), 붐대 회전반경 통제, 엔드호스 요동방지 로프 체결',
  },
  {
    id: 'tower_crane',
    label: '타워크레인',
    structuralNodeIndex: '09',
    defaultChecklist: '풍속계 기준 준수, 2점 이상 균형 줄걸이·샤클 마모 확인, 전담 신호수 무전 교신 및 하부 통제',
  },
  {
    id: 'mobile_crane',
    label: '이동식 크레인·카고',
    structuralNodeIndex: '09',
    defaultChecklist: '아웃트리거 전수 인출·깔목 설치, 권과방지장치·해지장치 작동 확인, 인양 반경 신호수 배치',
  },
  {
    id: 'aerial_work_platform',
    label: '고소작업대 (시저스·붐형)',
    structuralNodeIndex: '10',
    defaultChecklist: '과상승 방지봉 정상 작동 시험, 바닥 단차·트렌치 덮개 보강, 탑승자 안전대 고리 체결',
  },
  {
    id: 'excavator_drilling',
    label: '굴삭기·천공기 (지하·기초)',
    structuralNodeIndex: '01',
    defaultChecklist: '버킷 안전핀 잠금, 후방감지 카메라·유도원 배치, 지하 흙막이·매설물 주변 선회반경 통제',
  },
  {
    id: 'gangform_hoist',
    label: '갱폼 인양·인상 장비',
    structuralNodeIndex: '03',
    defaultChecklist: '타워크레인 인양 샤클 장력 우선 확인, 고정 앵커볼트 선해체 금지, 케이지 잔류인원 퇴거 확인',
  },
];

export interface NexusEquipmentPhotoSubmission {
  submissionId: string;
  createdAt: string;
  updatedAt: string;
  siteId: string;
  siteName: string;
  equipmentType: NexusEquipmentType;
  equipmentLabel: string;
  workActivity: string;
  inspectionPointSummary: string;
  photoName: string;
  photoDataUrl: string;
  uploadedBy: string;
  structuralNodeIndex: string;
  hqReviewer?: string;
  hqReviewNote?: string;
  hqReviewedAt?: string;
  fieldSupplementNote?: string;
  resubmittedAt?: string;
  revisionHistory?: readonly {
    actor: string;
    status: NexusEquipmentPhotoStatus;
    note: string;
    timestamp: string;
  }[];
  ceoReportedAt?: string;
  executivePackId?: string;
  status: NexusEquipmentPhotoStatus;
}

export interface NexusExecutivePhotoBriefingPack {
  packId: string;
  generatedAt: string;
  reporterLabel: string;
  ceoAudienceLabel: string;
  totalPhotos: number;
  verifiedCount: number;
  siteCoverageCount: number;
  submissions: readonly NexusEquipmentPhotoSubmission[];
  summaryText: string;
  csvContent: string;
}

const escapeXml = (str: string): string =>
  String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const createSyntheticInspectionPhotoSvgDataUrl = (
  title: string,
  siteName: string,
  equipmentLabel: string,
  badge: string,
): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 380" width="640" height="380">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b1724"/>
      <stop offset="55%" stop-color="#13293d"/>
      <stop offset="100%" stop-color="#08111b"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f6c786"/>
      <stop offset="100%" stop-color="#76e5ed"/>
    </linearGradient>
  </defs>
  <rect width="640" height="380" fill="url(#bg)"/>
  <g stroke="#e8b878" stroke-opacity="0.16" stroke-width="1">
    <line x1="28" y1="68" x2="612" y2="68"/>
    <line x1="28" y1="312" x2="612" y2="312"/>
    <rect x="28" y="26" width="584" height="328" rx="14" fill="none" stroke-opacity="0.32"/>
    <path d="M40 240 L150 240 L205 140 L345 140 L425 210 L580 210" fill="none" stroke="url(#gold)" stroke-width="2.4" stroke-opacity="0.55"/>
    <circle cx="205" cy="140" r="14" fill="none" stroke="#ffd89c" stroke-width="2" stroke-opacity="0.72"/>
    <circle cx="425" cy="210" r="18" fill="none" stroke="#78e5ed" stroke-width="2" stroke-opacity="0.72"/>
  </g>
  <rect x="44" y="40" width="210" height="24" rx="12" fill="#2c2114" stroke="#f3be78" stroke-opacity="0.5"/>
  <text x="58" y="56" fill="#ffe1b0" font-family="sans-serif" font-size="11" font-weight="700">${escapeXml(badge)}</text>
  <text x="44" y="106" fill="#8de4ec" font-family="sans-serif" font-size="13" font-weight="700">${escapeXml(siteName)} · ${escapeXml(equipmentLabel)}</text>
  <text x="44" y="276" fill="#f7f9fb" font-family="sans-serif" font-size="18" font-weight="700">${escapeXml(title.slice(0, 38))}</text>
  <text x="44" y="336" fill="#a8bfd0" font-family="monospace" font-size="11">PSI FIELD VERIFICATION CAPTURE · PRE-USE SAFETY CHECK</text>
</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

export const compressImageFileToDataUrl = async (
  file: File,
  maxWidth = 640,
): Promise<string> => {
  if (typeof window === 'undefined' || typeof FileReader === 'undefined') {
    return createSyntheticInspectionPhotoSvgDataUrl(file.name || '현장 점검 사진', '현장 업로드', '건설기계', 'FIELD PHOTO');
  }
  const rawUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('사진 파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
  if (!rawUrl || typeof Image === 'undefined') return rawUrl;

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('이미지 디코딩 실패'));
      el.src = rawUrl;
    });
    const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
    const width = Math.max(1, Math.round(img.width * ratio));
    const height = Math.max(1, Math.round(img.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return rawUrl;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return rawUrl;
  }
};

let memoryEquipmentStore: NexusEquipmentPhotoSubmission[] = [];

const emitEquipmentPhotoEvent = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(NEXUS_EQUIPMENT_PHOTO_UPDATED_EVENT));
  }
};

export const readEquipmentPhotoSubmissions = (): NexusEquipmentPhotoSubmission[] => {
  if (typeof window === 'undefined' || !window.localStorage) return [...memoryEquipmentStore];
  try {
    const raw = window.localStorage.getItem(NEXUS_EQUIPMENT_PHOTO_STORAGE_KEY);
    if (!raw) return [...memoryEquipmentStore];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryEquipmentStore = parsed;
      return [...parsed];
    }
    return [...memoryEquipmentStore];
  } catch {
    return [...memoryEquipmentStore];
  }
};

export const writeEquipmentPhotoSubmissions = (
  submissions: readonly NexusEquipmentPhotoSubmission[],
): void => {
  memoryEquipmentStore = [...submissions];
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(NEXUS_EQUIPMENT_PHOTO_STORAGE_KEY, JSON.stringify(submissions));
    emitEquipmentPhotoEvent();
  } catch {
    // Ignore storage quota errors in constrained environments
  }
};

const resolveSiteNameFromId = (siteId: string): string =>
  findManagedSiteById(siteId, true)?.siteName || '제1현장 지하 2층 RC구간';

export const submitEquipmentPhotoReport = (
  input: {
    siteId?: string;
    siteName?: string;
    equipmentType: NexusEquipmentType;
    workActivity: string;
    inspectionPointSummary?: string;
    photoName?: string;
    photoDataUrl?: string;
    uploadedBy?: string;
  },
  nowIso = new Date().toISOString(),
): NexusEquipmentPhotoSubmission => {
  const equipMeta =
    NEXUS_EQUIPMENT_TYPE_OPTIONS.find(opt => opt.id === input.equipmentType) ??
    NEXUS_EQUIPMENT_TYPE_OPTIONS[0];
  const siteId = input.siteId || 'SITE-01-SUBRC';
  const siteName = String(input.siteName || '').trim() || resolveSiteNameFromId(siteId);
  const workActivity =
    String(input.workActivity || '').trim() ||
    `${equipMeta.label} 작업 투입 전 안전장치·아웃트리거·신호수 확인`;
  const inspectionPointSummary =
    String(input.inspectionPointSummary || '').trim() || equipMeta.defaultChecklist;
  const photoName =
    String(input.photoName || '').trim() ||
    `${siteId.toLowerCase()}-${equipMeta.id}-preuse.jpg`;
  const photoDataUrl =
    String(input.photoDataUrl || '').trim() ||
    createSyntheticInspectionPhotoSvgDataUrl(
      workActivity,
      siteName,
      equipMeta.label,
      `PRE-USE #${equipMeta.structuralNodeIndex}`,
    );

  const created: NexusEquipmentPhotoSubmission = {
    submissionId: `EQUIP-PHOTO-${equipMeta.structuralNodeIndex}-${Date.now().toString(36).toUpperCase()}`,
    createdAt: nowIso,
    updatedAt: nowIso,
    siteId,
    siteName,
    equipmentType: equipMeta.id,
    equipmentLabel: equipMeta.label,
    workActivity,
    inspectionPointSummary,
    photoName,
    photoDataUrl,
    uploadedBy: String(input.uploadedBy || '').trim() || '현장 안전관리자',
    structuralNodeIndex: equipMeta.structuralNodeIndex,
    status: 'submitted_to_hq',
  };

  const existing = readEquipmentPhotoSubmissions();
  writeEquipmentPhotoSubmissions([created, ...existing].slice(0, 60));
  return created;
};

export const reviewEquipmentPhotoByHq = (
  submissionId: string,
  review: {
    decision: 'hq_verified_for_ceo' | 'revision_requested_hq';
    reviewerLabel: string;
    reviewNote?: string;
  },
  nowIso = new Date().toISOString(),
): NexusEquipmentPhotoSubmission[] => {
  const existing = readEquipmentPhotoSubmissions();
  const target = existing.find(item => item.submissionId === submissionId);
  if (!target) {
    throw new Error('검토할 건설기계 사용전 점검 사진 건을 찾을 수 없습니다.');
  }
  const reviewer = String(review.reviewerLabel || '').trim() || '본사 안전보건실 검토자';
  if (reviewer.toLowerCase() === target.uploadedBy.trim().toLowerCase()) {
    throw new Error('직무 분리 원칙에 따라 사진 업로드 담당자와 본사 검토 승인자는 서로 달라야 합니다.');
  }

  const defaultNote =
    review.decision === 'hq_verified_for_ceo'
      ? '사용전 점검 기준(아웃트리거·방호장치·신호체계) 사진 증빙 적합 확인 완료 → 대표이사·경영진 보고 편입'
      : '장비 가동 전 안전장치(과상승방지봉·유도원·깔판) 근접 증빙 사진 보완 재전송 요청';

  const updated = existing.map(item => {
    if (item.submissionId !== submissionId) return item;
    const noteText = String(review.reviewNote || '').trim() || defaultNote;
    const history = Array.isArray(item.revisionHistory) ? item.revisionHistory : [];
    return {
      ...item,
      status: review.decision,
      hqReviewer: reviewer,
      hqReviewNote: noteText,
      hqReviewedAt: nowIso,
      revisionHistory: [
        ...history,
        { actor: reviewer, status: review.decision, note: noteText, timestamp: nowIso },
      ],
      updatedAt: nowIso,
    };
  });

  writeEquipmentPhotoSubmissions(updated);
  return updated;
};

export const resubmitEquipmentPhotoByField = (
  submissionId: string,
  patch: {
    photoName?: string;
    photoDataUrl?: string;
    supplementNote: string;
    resubmittedBy?: string;
  },
  nowIso = new Date().toISOString(),
): NexusEquipmentPhotoSubmission[] => {
  const existing = readEquipmentPhotoSubmissions();
  const target = existing.find(item => item.submissionId === submissionId);
  if (!target) {
    throw new Error('보완 재전송할 건설기계 점검 사진 건을 찾을 수 없습니다.');
  }
  const actor = String(patch.resubmittedBy || target.uploadedBy || '현장 안전관리자').trim();
  const note =
    String(patch.supplementNote || '').trim() ||
    '현장 보완 촬영 완료 · 안전장치 체결 및 근접 확인 사진 재전송';

  const updated = existing.map(item => {
    if (item.submissionId !== submissionId) return item;
    const history = Array.isArray(item.revisionHistory) ? item.revisionHistory : [];
    return {
      ...item,
      photoName: String(patch.photoName || '').trim() || item.photoName,
      photoDataUrl: String(patch.photoDataUrl || '').trim() || item.photoDataUrl,
      fieldSupplementNote: note,
      resubmittedAt: nowIso,
      status: 'submitted_to_hq' as const,
      revisionHistory: [
        ...history,
        { actor, status: 'submitted_to_hq' as const, note: `[현장 보완 재전송] ${note}`, timestamp: nowIso },
      ],
      updatedAt: nowIso,
    };
  });

  writeEquipmentPhotoSubmissions(updated);
  return updated;
};

export const batchVerifyPendingEquipmentPhotosByHq = (
  submissionIds: readonly string[],
  review: {
    reviewerLabel: string;
    reviewNote?: string;
  },
  nowIso = new Date().toISOString(),
): {
  updated: NexusEquipmentPhotoSubmission[];
  verifiedCount: number;
  skippedSelfCount: number;
} => {
  const existing = readEquipmentPhotoSubmissions();
  const reviewer = String(review.reviewerLabel || '').trim() || '본사 안전보건실장 (CSO 보고)';
  const reviewerLower = reviewer.toLowerCase();
  const targetSet = submissionIds.length > 0 ? new Set(submissionIds) : null;
  const note =
    String(review.reviewNote || '').trim() ||
    '본사 일괄 검토 적합 확인 → 대표이사·경영진 보고 대상 편입';

  let verifiedCount = 0;
  let skippedSelfCount = 0;

  const updated = existing.map(item => {
    if (item.status !== 'submitted_to_hq') return item;
    if (targetSet && !targetSet.has(item.submissionId)) return item;
    if (item.uploadedBy.trim().toLowerCase() === reviewerLower) {
      skippedSelfCount++;
      return item;
    }
    verifiedCount++;
    const history = Array.isArray(item.revisionHistory) ? item.revisionHistory : [];
    return {
      ...item,
      status: 'hq_verified_for_ceo' as const,
      hqReviewer: reviewer,
      hqReviewNote: note,
      hqReviewedAt: nowIso,
      revisionHistory: [
        ...history,
        { actor: reviewer, status: 'hq_verified_for_ceo' as const, note, timestamp: nowIso },
      ],
      updatedAt: nowIso,
    };
  });

  writeEquipmentPhotoSubmissions(updated);
  return { updated, verifiedCount, skippedSelfCount };
};

export interface NexusUnifiedCeoDailyBriefing {
  briefingId: string;
  asOfDate: string;
  generatedAt: string;
  reporterLabel: string;
  siteCount: number;
  stopWorkCount: number;
  openActionsCount: number;
  equipReadyCount: number;
  equipPendingCount: number;
  pendingApprovalCount: number;
  activeVisitCount: number;
  ackedVisitCount: number;
  trainingCompletionPct: number;
  verifiedPhotoThumbs: readonly {
    submissionId: string;
    siteName: string;
    equipmentLabel: string;
    workActivity: string;
    photoDataUrl: string;
    statusLabel: string;
  }[];
  summaryText: string;
  csvContent: string;
}

export const buildUnifiedCeoDailyBriefing = (params: {
  asOfDate?: string;
  reporterLabel?: string;
  pipelineCases: readonly NexusPipelineCase[];
  visitPlans: readonly NexusHqVisitPlan[];
  investigations: readonly NexusAiInvestigationRecord[];
  trainingCampaigns: readonly NexusExecutiveTrainingCampaign[];
  equipmentReports: readonly NexusEquipmentPhotoSubmission[];
}): NexusUnifiedCeoDailyBriefing => {
  const nowIso = new Date().toISOString();
  const asOfDate = params.asOfDate || getKoreanCalendarDay(new Date(nowIso));
  const reporterLabel = String(params.reporterLabel || '').trim() || '본사 안전보건실장 (CSO)';
  const briefingId = `CEO-DAILY-${asOfDate.replace(/-/g, '')}`;

  const openCases = params.pipelineCases.filter(c => c.status !== 'closed');
  const stopWorkCases = openCases.filter(c => Boolean(c.stopWorkFlag));
  const equipReady = params.equipmentReports.filter(
    e => e.status === 'hq_verified_for_ceo' || e.status === 'reported_to_ceo',
  );
  const equipPending = params.equipmentReports.filter(e => e.status === 'submitted_to_hq');
  const pendingInvs = params.investigations.filter(i => i.status === 'ai_draft_pending_hq');
  const activeVisits = params.visitPlans.filter(v => v.status !== 'action_issued_closed');
  const ackedVisits = activeVisits.filter(v => Boolean(v.fieldAcknowledgedAt));

  const totalTargets = params.trainingCampaigns.reduce((s, c) => s + Math.max(1, c.targetWorkers || 0), 0);
  const totalSignatures = params.trainingCampaigns.reduce(
    (s, c) => s + Math.max(0, c.confirmedSignatures || 0),
    0,
  );
  const activeSiteCount = readManagedNexusSites(false).length;
  const trainingCompletionPct =
    totalTargets > 0 ? Math.min(100, Math.round((totalSignatures / totalTargets) * 100)) : 0;

  const lines: string[] = [
    `[대표이사 · 경영진 일일 전사 안전 통합 브리핑] ${asOfDate} (${briefingId})`,
    `보고 책임: ${reporterLabel} · 관제 대상: 전사 ${activeSiteCount}대 현장 포트폴리오`,
    '',
    `1. ⛔ 임시통제·작업중지 & 현장 미결: 작업중지 ${stopWorkCases.length}건 / 전체 미결 ${openCases.length}건`,
    ...(stopWorkCases.length > 0
      ? stopWorkCases.slice(0, 3).map(c => `   - [${c.matchedCaseCode}] ${c.locationLabel}: ${c.actionTitle}`)
      : ['   - 금일 발령 중인 작업중지 구간 없음']),
    `2. 🏗️ 건설기계 사용전 점검 사진: 본사 적합·보고 ${equipReady.length}건 (검토대기 ${equipPending.length}건)`,
    ...(equipReady.length > 0
      ? equipReady.slice(0, 4).map(e => `   - [${e.siteName}] ${e.equipmentLabel}: ${e.workActivity}`)
      : ['   - 본사 적합 승인된 장비 점검 사진 없음']),
    `3. 🏛️ 05 사고조사 승인대기 ${pendingInvs.length}건 · 01 본사 순회점검 ${activeVisits.length}건 (현장 접수 ${ackedVisits.length}건)`,
    `4. 🌐 04 대표이사 12개국어 안전교육 이수율: ${trainingCompletionPct}% (${totalSignatures}/${totalTargets}명 서명 완료)`,
  ];

  const rows: (string | number)[][] = [
    ['브리핑ID', '기준일', '항목구분', '대상·현장', '세부내용', '상태·수치'],
    ['', asOfDate, '요약KPI', '전 현장', '작업중지 / 미결조치', `${stopWorkCases.length}건 / ${openCases.length}건`],
    ['', asOfDate, '요약KPI', '전 현장', '건설기계 사진 적합 / 대기', `${equipReady.length}건 / ${equipPending.length}건`],
    ['', asOfDate, '요약KPI', '전 현장', '05 사고조사 승인대기', `${pendingInvs.length}건`],
    ['', asOfDate, '요약KPI', '전 현장', '12개국어 교육 이수율', `${trainingCompletionPct}% (${totalSignatures}/${totalTargets})`],
    ...stopWorkCases.map(c => [briefingId, asOfDate, '작업중지', c.locationLabel, c.actionTitle, '⛔ 중지']),
    ...equipReady.map(e => [
      briefingId,
      asOfDate,
      '건설기계사진',
      e.siteName,
      `${e.equipmentLabel} · ${e.workActivity}`,
      NEXUS_EQUIPMENT_PHOTO_STATUS_LABELS[e.status],
    ]),
  ];

  const csvContent =
    '\uFEFF' + rows.map(row => row.map(cell => escapeSpreadsheetCsvCell(cell)).join(',')).join('\r\n');

  return {
    briefingId,
    asOfDate,
    generatedAt: nowIso,
    reporterLabel,
    siteCount: activeSiteCount,
    stopWorkCount: stopWorkCases.length,
    openActionsCount: openCases.length,
    equipReadyCount: equipReady.length,
    equipPendingCount: equipPending.length,
    pendingApprovalCount: pendingInvs.length,
    activeVisitCount: activeVisits.length,
    ackedVisitCount: ackedVisits.length,
    trainingCompletionPct,
    verifiedPhotoThumbs: equipReady.slice(0, 6).map(e => ({
      submissionId: e.submissionId,
      siteName: e.siteName,
      equipmentLabel: e.equipmentLabel,
      workActivity: e.workActivity,
      photoDataUrl: e.photoDataUrl,
      statusLabel: NEXUS_EQUIPMENT_PHOTO_STATUS_LABELS[e.status],
    })),
    summaryText: lines.join('\n'),
    csvContent,
  };
};

export const compileExecutivePhotoBriefingPack = (
  submissionIds: readonly string[],
  options: {
    reporterLabel?: string;
    ceoAudienceLabel?: string;
  },
  nowIso = new Date().toISOString(),
): NexusExecutivePhotoBriefingPack => {
  const existing = readEquipmentPhotoSubmissions();
  const targetSet = new Set(
    submissionIds.length > 0
      ? submissionIds
      : existing
          .filter(item => item.status === 'hq_verified_for_ceo' || item.status === 'reported_to_ceo')
          .map(item => item.submissionId),
  );

  if (targetSet.size === 0) {
    throw new Error('경영진 보고 패키지에 편입할 본사 적합 검토 완료 사진을 1건 이상 선택해 주세요.');
  }

  const today = getKoreanCalendarDay(new Date(nowIso));
  const packId = `CEO-BRIEF-${today.replace(/-/g, '')}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
  const reporterLabel = String(options.reporterLabel || '').trim() || '본사 안전보건실장 (CSO 보고)';
  const ceoAudienceLabel = String(options.ceoAudienceLabel || '').trim() || '대표이사 · 경영진 일일 안전보고';

  const updated = existing.map(item => {
    if (!targetSet.has(item.submissionId)) return item;
    return {
      ...item,
      status: 'reported_to_ceo' as const,
      ceoReportedAt: nowIso,
      executivePackId: packId,
      updatedAt: nowIso,
    };
  });

  writeEquipmentPhotoSubmissions(updated);

  const selectedSubmissions = updated.filter(item => targetSet.has(item.submissionId));
  const uniqueSites = new Set(selectedSubmissions.map(s => s.siteId));
  const verifiedCount = selectedSubmissions.filter(
    s => s.status === 'reported_to_ceo' || s.status === 'hq_verified_for_ceo',
  ).length;

  const lines: string[] = [
    `[${ceoAudienceLabel}] 건설기계 사용전 점검 사진 본사 취합 보고서`,
    `- 보고 ID: ${packId} · 보고일: ${today} · 보고 책임: ${reporterLabel}`,
    `- 보고 범위: ${uniqueSites.size}개 현장 · 총 ${selectedSubmissions.length}건 (본사 검토 적합 ${verifiedCount}건)`,
    '',
    ...selectedSubmissions.map(
      (s, idx) =>
        `${idx + 1}. [${s.siteName}] ${s.equipmentLabel} — ${s.workActivity}\n   · 점검 핵심: ${s.inspectionPointSummary}\n   · 본사 검토(${s.hqReviewer || reporterLabel}): ${s.hqReviewNote || '적합 확인 완료'}`,
    ),
  ];

  const csvRows = [
    ['보고ID', '현장명', '건설기계', '작업내용', '점검핵심', '현장업로더', '본사검토자', '상태', '보고시각'],
    ...selectedSubmissions.map(s => [
      packId,
      s.siteName,
      s.equipmentLabel,
      s.workActivity,
      s.inspectionPointSummary,
      s.uploadedBy,
      s.hqReviewer || reporterLabel,
      NEXUS_EQUIPMENT_PHOTO_STATUS_LABELS[s.status],
      s.ceoReportedAt || nowIso,
    ]),
  ];
  const csvContent =
    '\uFEFF' +
    csvRows.map(row => row.map(cell => escapeSpreadsheetCsvCell(cell)).join(',')).join('\r\n');

  return {
    packId,
    generatedAt: nowIso,
    reporterLabel,
    ceoAudienceLabel,
    totalPhotos: selectedSubmissions.length,
    verifiedCount,
    siteCoverageCount: uniqueSites.size,
    submissions: selectedSubmissions,
    summaryText: lines.join('\n'),
    csvContent,
  };
};

export const seedEquipmentPhotoSimulation = (
  nowIso = new Date().toISOString(),
): NexusEquipmentPhotoSubmission[] => {
  const s1 = submitEquipmentPhotoReport(
    {
      siteId: 'SITE-01-SUBRC',
      siteName: '제1현장 지하 2층 RC구간',
      equipmentType: 'concrete_pump_car',
      workActivity: '지하 2층 합벽 콘크리트 타설 펌프카 사용전 아웃트리거·엔드호스 점검',
      inspectionPointSummary: '펌프카 아웃트리거 최대 확장·철판 깔판 보강 및 엔드호스 유도 로프 체결 사진 확보',
      photoName: 'site1-b2-pumpcar-preuse.jpg',
      uploadedBy: '제1현장 안전관리자 김안전',
    },
    nowIso,
  );

  reviewEquipmentPhotoByHq(
    s1.submissionId,
    {
      decision: 'hq_verified_for_ceo',
      reviewerLabel: '본사 안전보건실 박실장',
      reviewNote: '지반 깔판 및 아웃트리거 잭 고정 상태 양호 · 금일 경영진 일일 보고 편입 적합',
    },
    nowIso,
  );

  submitEquipmentPhotoReport(
    {
      siteId: 'SITE-02-GANGFORM',
      siteName: '제2현장 103동 15층 갱폼',
      equipmentType: 'tower_crane',
      workActivity: '103동 15층 갱폼 인양용 타워크레인 샤클·줄걸이·신호수 사용전 점검',
      inspectionPointSummary: '2점 균형 샤클 핀 풀림방지 및 갱폼 인양 전 무전 신호수 배치 현장 사진',
      photoName: 'site2-103-towercrane-preuse.jpg',
      uploadedBy: '제2현장 안전관리자 이현장',
    },
    nowIso,
  );

  submitEquipmentPhotoReport(
    {
      siteId: 'SITE-03-SHORING',
      siteName: '제3현장 전이층 시스템동바리',
      equipmentType: 'aerial_work_platform',
      workActivity: '전이층 시스템동바리 체결 확인용 고소작업대 과상승방지봉 사용전 점검',
      inspectionPointSummary: '고소작업대 과상승 방지장치 작동 시험 및 바닥 트렌치 덮개 보강 사진 제출',
      photoName: 'site3-awp-overrise-preuse.jpg',
      uploadedBy: '제3현장 안전관리자 최현장',
    },
    nowIso,
  );

  return readEquipmentPhotoSubmissions();
};

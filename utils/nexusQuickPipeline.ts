import { getKoreanCalendarDay } from './monthlyFieldFollowup';
import type { NexusOrbitLayer } from './nexusSphereProjection';
import {
  NEXUS_STRUCTURAL_INCIDENT_SEEDS,
  type NexusHazardEquipmentAxis,
  type NexusProcessAxis,
  type NexusStructuralIncidentSeed,
  type NexusZoneAxis,
} from './nexusStructuralTaxonomy';

export const NEXUS_PIPELINE_STORAGE_KEY = 'psi_nexus_structural_pipeline_v1';
export const NEXUS_PIPELINE_UPDATED_EVENT = 'psi-nexus-pipeline-updated';

export type NexusPipelineStatus =
  | 'action_required'
  | 'handover_pending'
  | 'recheck_pending'
  | 'closed';

export const NEXUS_PIPELINE_STATUS_LABELS: Record<NexusPipelineStatus, string> = {
  action_required: '시정조치 진행',
  handover_pending: '교대·인계 대기',
  recheck_pending: '재점검 확인 대기',
  closed: '재점검 확인 종결',
};

export interface NexusAutoClassificationResult {
  zoneAxis: NexusZoneAxis;
  processAxis: NexusProcessAxis;
  hazardEquipmentAxis: NexusHazardEquipmentAxis;
  structuralNodeIndex: string; // '01'..'10'
  moduleNodeIndex: string; // '01'..'06'
  cycleNodeIndex: string; // '01'..'05'
  primarySeed: NexusStructuralIncidentSeed;
  matchedSeeds: readonly NexusStructuralIncidentSeed[];
  recommendedActionDraft: string;
  recommendedHandoverNote: string;
  confidenceLabel: '키워드·문맥 3축 매칭' | '기본 골조·형틀 표준 매칭';
}

export interface NexusPipelineAuditEntry {
  status: NexusPipelineStatus;
  note: string;
  actor: string;
  timestamp: string;
}

export interface NexusQuickFieldPreset {
  id: string;
  badge: string;
  label: string;
  siteName: string;
  locationLabel: string;
  observationNote: string;
  zoneAxis: NexusZoneAxis;
  processAxis: NexusProcessAxis;
  hazardEquipmentAxis: NexusHazardEquipmentAxis;
  structuralNodeIndex: string;
}

export const NEXUS_QUICK_FIELD_PRESETS: readonly NexusQuickFieldPreset[] = [
  {
    id: 'preset-sub-rc-01',
    badge: '#01 지하RC',
    label: 'B2 지하외벽 합벽 타이볼트·측압',
    siteName: '제1현장 지하 2층 RC구간',
    locationLabel: '제1현장 지하 2층 북측 합벽 구간',
    observationNote: '지하 2층 외벽 합벽 거푸집 타이볼트 간격 미흡 및 지하 피트 개구부 덮개 미고정 확인',
    zoneAxis: 'substructure_rc',
    processAxis: 'formwork_general',
    hazardEquipmentAxis: 'confined_earth_pressure',
    structuralNodeIndex: '01',
  },
  {
    id: 'preset-gangform-03',
    badge: '#03 갱폼',
    label: '15F 외벽 갱폼 인양고리·앵커',
    siteName: '제2현장 103동 15층 갱폼',
    locationLabel: '제2현장 103동 15층 외벽 갱폼 구간',
    observationNote: '15층 외벽 갱폼 인상 전 타워크레인 인양고리 장력 미확인 상태에서 고정 앵커볼트 선해체 위험',
    zoneAxis: 'superstructure_std',
    processAxis: 'gangform',
    hazardEquipmentAxis: 'tower_crane_rigging',
    structuralNodeIndex: '03',
  },
  {
    id: 'preset-alform-04',
    badge: '#04 AL폼',
    label: '기준층 AL폼 해체 서포트·패널',
    siteName: '제2현장 103동 기준층 골조',
    locationLabel: '제2현장 103동 12층 AL폼 해체 구간',
    observationNote: '기준층 AL폼 데크 패널 해체 중 잔류 서포트 미유지 및 하부 출입통제 미흡',
    zoneAxis: 'superstructure_std',
    processAxis: 'alform',
    hazardEquipmentAxis: 'opening_edge',
    structuralNodeIndex: '04',
  },
  {
    id: 'preset-shoring-07',
    badge: '#07 동바리',
    label: '전이층 시스템동바리 가새·U헤드',
    siteName: '제3현장 전이층 시스템동바리',
    locationLabel: '제3현장 전이층 고층고 슬래브 하부',
    observationNote: '전이층 고층고 슬래브 하부 시스템동바리 수평연결재·가새 핀 잠금 누락 및 U헤드 편심 확인',
    zoneAxis: 'rooftop_special',
    processAxis: 'formwork_general',
    hazardEquipmentAxis: 'system_shoring',
    structuralNodeIndex: '07',
  },
  {
    id: 'preset-pour-06',
    badge: '#06 타설',
    label: '슬래브 집중타설·펌프카 호스',
    siteName: '제3현장 전이층 시스템동바리',
    locationLabel: '제3현장 상부 슬래브 타설 구간',
    observationNote: '슬래브 콘크리트 집중 타설에 따른 하부 거푸집 배부름 감시 필요 및 펌프카 엔드호스 요동방지 로프 미체결',
    zoneAxis: 'superstructure_std',
    processAxis: 'concrete_pour',
    hazardEquipmentAxis: 'system_shoring',
    structuralNodeIndex: '06',
  },
  {
    id: 'preset-opening-02',
    badge: '#02 형틀·개구부',
    label: '코어·피트 개구부 덮개·난간',
    siteName: '제1현장 지하 2층 RC구간',
    locationLabel: '제1현장 코어 엘리베이터 피트·단부',
    observationNote: '형틀 자재 반입을 위해 해체한 슬래브 단부 안전난간 미복구 및 엘리베이터 피트 개구부 추락방지망 미결속',
    zoneAxis: 'superstructure_std',
    processAxis: 'formwork_general',
    hazardEquipmentAxis: 'opening_edge',
    structuralNodeIndex: '02',
  },
];

export interface NexusPipelineCase {
  caseId: string;
  siteId?: string;
  createdAt: string;
  updatedAt: string;
  locationLabel: string;
  observationNote: string;
  photoName?: string;
  zoneAxis: NexusZoneAxis;
  processAxis: NexusProcessAxis;
  hazardEquipmentAxis: NexusHazardEquipmentAxis;
  structuralNodeIndex: string;
  moduleNodeIndex: string;
  cycleNodeIndex: string;
  matchedCaseCode: string;
  matchedCaseTitle: string;
  actionTitle: string;
  assignee: string;
  dueDate: string; // YYYY-MM-DD
  handoverShift: string;
  handoverNote: string;
  recheckNote?: string;
  stopWorkFlag?: boolean;
  beforePhotoDataUrl?: string;
  afterPhotoDataUrl?: string;
  auditTrail?: readonly NexusPipelineAuditEntry[];
  status: NexusPipelineStatus;
  source: 'safety-inspector' | 'safety-nexus-quick';
}

export interface NexusPipelineCreateInput {
  siteId?: string;
  locationLabel?: string;
  observationNote: string;
  photoName?: string;
  zoneAxis?: NexusZoneAxis;
  processAxis?: NexusProcessAxis;
  hazardEquipmentAxis?: NexusHazardEquipmentAxis;
  actionTitle?: string;
  assignee?: string;
  dueDate?: string;
  handoverShift?: string;
  handoverNote?: string;
  stopWorkFlag?: boolean;
  beforePhotoDataUrl?: string;
  source?: 'safety-inspector' | 'safety-nexus-quick';
}

const ZONE_RULES: readonly { axis: NexusZoneAxis; tokens: readonly string[] }[] = [
  { axis: 'substructure_rc', tokens: ['지하', 'b1', 'b2', 'b3', 'b4', '합벽', '지하외벽', '부력', '측압', '피트', '밀폐', '환기', '방수'] },
  { axis: 'foundation', tokens: ['기초', '흙막이', '터파기', '굴착', '어스앵커', '띠장', '버팀보'] },
  { axis: 'rooftop_special', tokens: ['옥탑', '전이층', '고층고', '특수', '지붕', '파라펫'] },
  { axis: 'superstructure_std', tokens: ['지상', '기준층', '슬래브', '코어', '계단실', '외벽', '갱폼', '알폼'] },
];

const PROCESS_RULES: readonly { axis: NexusProcessAxis; tokens: readonly string[] }[] = [
  { axis: 'gangform', tokens: ['갱폼', '인상', '케이지', '인양고리', '앵커볼트'] },
  { axis: 'alform', tokens: ['알폼', 'al폼', 'al-form', '데크패널', '웨지핀', '드롭헤드'] },
  { axis: 'rebar', tokens: ['철근', '배근', '철근망', '결속', '철근캡'] },
  { axis: 'concrete_pour', tokens: ['타설', '콘크리트', '펌프카', '엔드호스', '배부름', '압송'] },
  { axis: 'stripping_curing', tokens: ['해체', '양생', '탈형', '존치', '정리'] },
  { axis: 'formwork_general', tokens: ['형틀', '거푸집', '목공', '폼타이', '단부', '슬래브'] },
];

const EQUIPMENT_RULES: readonly { axis: NexusHazardEquipmentAxis; tokens: readonly string[] }[] = [
  { axis: 'confined_earth_pressure', tokens: ['측압', '부력', '밀폐', '유해가스', '환기', '산소', '지하외벽', '합벽', '타이볼트', '누수'] },
  { axis: 'system_shoring', tokens: ['시스템동바리', '동바리', '서포트', '가새', 'u헤드', '자키베이스', '지지체'] },
  { axis: 'system_scaffold', tokens: ['시스템비계', '외부비계', '비계', '벽이음', '수직보호망', '발끝막이판'] },
  { axis: 'tower_crane_rigging', tokens: ['타워크레인', '양중', '크레인', '줄걸이', '슬링벨트', '샤클', '신호수', '인양'] },
  { axis: 'aerial_platform', tokens: ['고소작업대', '렌탈', '과상승', '시저스'] },
  { axis: 'opening_edge', tokens: ['개구부', '단부', '난간', '추락', '덮개', '피트', '통로', '발판'] },
];

const pickBestRule = <T extends string>(
  text: string,
  rules: readonly { axis: T; tokens: readonly string[] }[],
  fallback: T,
): { axis: T; score: number } => {
  let bestAxis = fallback;
  let bestScore = 0;
  for (const rule of rules) {
    let score = 0;
    for (const token of rule.tokens) {
      if (text.includes(token)) score += token.length >= 3 ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestAxis = rule.axis;
    }
  }
  return { axis: bestAxis, score: bestScore };
};

export const classifyStructuralPhotoContext = (input: {
  note?: string;
  fileName?: string;
  riskTopic?: string;
  workType?: string;
  aiFindingsText?: string;
  overrideZone?: NexusZoneAxis | '';
  overrideProcess?: NexusProcessAxis | '';
  overrideEquipment?: NexusHazardEquipmentAxis | '';
}): NexusAutoClassificationResult => {
  const combined = [
    input.note || '',
    input.fileName || '',
    input.riskTopic || '',
    input.workType || '',
    input.aiFindingsText || '',
  ]
    .join(' ')
    .toLowerCase();

  const zMatch = pickBestRule(combined, ZONE_RULES, 'superstructure_std');
  const pMatch = pickBestRule(combined, PROCESS_RULES, 'formwork_general');
  const eMatch = pickBestRule(combined, EQUIPMENT_RULES, 'opening_edge');

  const zoneAxis = input.overrideZone || zMatch.axis;
  const processAxis = input.overrideProcess || pMatch.axis;
  const hazardEquipmentAxis = input.overrideEquipment || eMatch.axis;

  // Score each seed by how many axes and trade keywords match.
  // Substructure RC ('substructure_rc') is a dedicated management domain (#01), so zone match carries primary weight.
  const scoredSeeds = NEXUS_STRUCTURAL_INCIDENT_SEEDS.map(seed => {
    let score = 0;
    if (seed.zoneAxis === zoneAxis) score += zoneAxis === 'substructure_rc' ? 8 : 4;
    if (seed.processAxis === processAxis) score += 5;
    if (seed.hazardEquipmentAxis === hazardEquipmentAxis) score += 5;
    for (const kw of seed.tradeKeywords) {
      if (combined.includes(kw.toLowerCase())) score += 2;
    }
    return { seed, score };
  }).sort((a, b) => b.score - a.score);

  const primarySeed = scoredSeeds[0]?.seed ?? NEXUS_STRUCTURAL_INCIDENT_SEEDS[0];
  const matchedSeeds = scoredSeeds.slice(0, 3).map(s => s.seed);
  const totalKeywordScore = zMatch.score + pMatch.score + eMatch.score;

  return {
    zoneAxis,
    processAxis,
    hazardEquipmentAxis,
    structuralNodeIndex: primarySeed.structuralNodeIndex,
    moduleNodeIndex: '03', // 03 AI 사진점검 -> 06 조치·재점검·인계
    cycleNodeIndex: primarySeed.cycleNodeIndex,
    primarySeed,
    matchedSeeds,
    recommendedActionDraft: primarySeed.preventiveMeasure,
    recommendedHandoverNote: `[교대·인계 확인] ${primarySeed.preVisitBriefingPoint}`,
    confidenceLabel: totalKeywordScore > 0 ? '키워드·문맥 3축 매칭' : '기본 골조·형틀 표준 매칭',
  };
};

let memoryPipelineStore: NexusPipelineCase[] = [];

export const readNexusPipelineCases = (): NexusPipelineCase[] => {
  if (typeof window === 'undefined' || !window.localStorage) return [...memoryPipelineStore];
  try {
    const raw = window.localStorage.getItem(NEXUS_PIPELINE_STORAGE_KEY);
    if (!raw) return [...memoryPipelineStore];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryPipelineStore = parsed;
      return [...parsed];
    }
    return [...memoryPipelineStore];
  } catch {
    return [...memoryPipelineStore];
  }
};

export const writeNexusPipelineCases = (cases: readonly NexusPipelineCase[]): void => {
  memoryPipelineStore = [...cases];
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(NEXUS_PIPELINE_STORAGE_KEY, JSON.stringify(cases));
    window.dispatchEvent(new Event(NEXUS_PIPELINE_UPDATED_EVENT));
  } catch {
    // Ignore storage quota errors in restricted environments
  }
};

export const createNexusPipelineCase = (
  input: NexusPipelineCreateInput,
  nowIso = new Date().toISOString(),
): NexusPipelineCase => {
  const note = String(input.observationNote || '').trim() || '현장 골조·형틀 사진점검 위험요인 확인';
  const classification = classifyStructuralPhotoContext({
    note,
    fileName: input.photoName,
    overrideZone: input.zoneAxis || '',
    overrideProcess: input.processAxis || '',
    overrideEquipment: input.hazardEquipmentAxis || '',
  });
  const seed = classification.primarySeed;
  const today = getKoreanCalendarDay(new Date(nowIso));
  const record: NexusPipelineCase = {
    caseId: `NEXUS-3AX-${seed.caseCode}-${Date.now().toString(36).toUpperCase()}`,
    siteId: input.siteId || undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
    locationLabel: String(input.locationLabel || '').trim() || '골조·형틀 점검 구간',
    observationNote: note,
    photoName: input.photoName,
    zoneAxis: classification.zoneAxis,
    processAxis: classification.processAxis,
    hazardEquipmentAxis: classification.hazardEquipmentAxis,
    structuralNodeIndex: classification.structuralNodeIndex,
    moduleNodeIndex: '06', // 조치·재점검·인계와 직결
    cycleNodeIndex: '04', // 04 안전조치와 직결
    matchedCaseCode: seed.caseCode,
    matchedCaseTitle: seed.title,
    actionTitle: String(input.actionTitle || '').trim() || classification.recommendedActionDraft,
    assignee: String(input.assignee || '').trim() || '형틀·골조 담당반장',
    dueDate:
      /^\d{4}-\d{2}-\d{2}$/.test(String(input.dueDate || ''))
        ? String(input.dueDate)
        : today,
    handoverShift: String(input.handoverShift || '').trim() || '다음 교대 작업팀·안전담당 인계',
    handoverNote: String(input.handoverNote || '').trim() || classification.recommendedHandoverNote,
    stopWorkFlag: Boolean(input.stopWorkFlag),
    beforePhotoDataUrl: input.beforePhotoDataUrl || undefined,
    auditTrail: [
      {
        status: 'action_required',
        note: `${input.stopWorkFlag ? '[임시통제·작업중지] ' : ''}${String(input.actionTitle || '').trim() || classification.recommendedActionDraft}`,
        actor: String(input.assignee || '').trim() || '형틀·골조 담당반장',
        timestamp: nowIso,
      },
    ],
    status: 'action_required',
    source: input.source || 'safety-nexus-quick',
  };

  const existing = readNexusPipelineCases();
  writeNexusPipelineCases([record, ...existing].slice(0, 100));
  return record;
};

export const advanceNexusPipelineCaseStatus = (
  caseId: string,
  nextStatus: NexusPipelineStatus,
  recheckNote?: string,
  nowIso = new Date().toISOString(),
  actor = '현장 안전관리자',
  afterPhotoDataUrl?: string,
): NexusPipelineCase[] => {
  const existing = readNexusPipelineCases();
  const updated = existing.map(item => {
    if (item.caseId !== caseId) return item;
    const stepNote =
      recheckNote !== undefined && String(recheckNote).trim()
        ? String(recheckNote).trim()
        : nextStatus === 'handover_pending'
          ? `${item.handoverShift} 대상 미종결 위험·임시통제 구간 인계 기록`
          : nextStatus === 'recheck_pending'
            ? `${item.assignee} 시정조치 이행 완료 보고 및 안전관리자 재점검 요청`
            : '현장 재점검 결과 조치 상태 및 방호 기준 충족 확인 종결';
    const priorTrail = Array.isArray(item.auditTrail) ? item.auditTrail : [];
    return {
      ...item,
      status: nextStatus,
      recheckNote: stepNote,
      afterPhotoDataUrl: afterPhotoDataUrl || item.afterPhotoDataUrl,
      auditTrail: [
        ...priorTrail,
        {
          status: nextStatus,
          note: stepNote,
          actor,
          timestamp: nowIso,
        },
      ],
      updatedAt: nowIso,
    };
  });
  writeNexusPipelineCases(updated);
  return updated;
};

export const buildShiftHandoverBriefingText = (
  cases: readonly NexusPipelineCase[],
  siteLabel = '전체 현장',
  asOfDate = getKoreanCalendarDay(),
): string => {
  const open = cases.filter(c => c.status !== 'closed');
  const stopWorks = open.filter(c => c.stopWorkFlag);
  const handover = open.filter(c => c.status === 'handover_pending' && !c.stopWorkFlag);
  const recheck = open.filter(c => c.status === 'recheck_pending' && !c.stopWorkFlag);
  const inProgress = open.filter(c => c.status === 'action_required' && !c.stopWorkFlag);

  const lines: string[] = [
    `[교대 인계 브리핑] ${siteLabel} (${asOfDate} 기준 · 미결 총 ${open.length}건)`,
  ];
  if (stopWorks.length > 0) {
    lines.push(`1) ⛔ 임시통제·작업중지 (${stopWorks.length}건): ${stopWorks.map(c => `[${c.matchedCaseCode}] ${c.locationLabel} - ${c.actionTitle}`).slice(0, 3).join(' / ')}`);
  } else {
    lines.push('1) ⛔ 임시통제·작업중지: 해당 없음');
  }
  lines.push(
    `2) 🔄 교대·인계 대기 (${handover.length}건): ${
      handover.length ? handover.map(c => `${c.locationLabel}(${c.handoverShift})`).slice(0, 3).join(' / ') : '없음'
    }`,
  );
  lines.push(
    `3) ✅ 재점검 확인 대기 (${recheck.length}건): ${
      recheck.length ? recheck.map(c => `${c.locationLabel}(${c.matchedCaseCode})`).slice(0, 3).join(' / ') : '없음'
    }`,
  );
  lines.push(
    `4) 🛠️ 조치 진행 중 (${inProgress.length}건): ${
      inProgress.length ? inProgress.map(c => `${c.locationLabel}·기한 ${c.dueDate}`).slice(0, 3).join(' / ') : '없음'
    }`,
  );
  return lines.join('\n');
};

export interface NexusPipelineNodeSummary {
  nodeIndex: string;
  totalCases: number;
  openCases: number;
  overdueCases: number;
  handoverPending: number;
  recheckPending: number;
  closedCases: number;
}

export const summarizePipelineForOrbitLayer = (
  layer: NexusOrbitLayer,
  cases: readonly NexusPipelineCase[],
  asOfDate = getKoreanCalendarDay(),
): readonly NexusPipelineNodeSummary[] => {
  const count = layer === 'cycle' ? 5 : layer === 'modules' ? 6 : 10;
  return Array.from({ length: count }, (_, idx) => {
    const nodeIndex = String(idx + 1).padStart(2, '0');
    const matched = cases.filter(c => {
      if (layer === 'structural') return c.structuralNodeIndex === nodeIndex;
      if (layer === 'modules') {
        if (nodeIndex === '03') return true; // 03 AI 사진점검에서 발원
        if (nodeIndex === '02') return Boolean(c.matchedCaseCode); // 02 사고사례 매칭
        if (nodeIndex === '06') return true; // 06 조치·재점검·인계
        return c.moduleNodeIndex === nodeIndex;
      }
      return c.cycleNodeIndex === nodeIndex;
    });

    let openCases = 0;
    let overdueCases = 0;
    let handoverPending = 0;
    let recheckPending = 0;
    let closedCases = 0;

    for (const item of matched) {
      if (item.status === 'closed') {
        closedCases++;
      } else {
        openCases++;
        if (item.status === 'handover_pending') handoverPending++;
        if (item.status === 'recheck_pending') recheckPending++;
        if (item.dueDate && item.dueDate < asOfDate) overdueCases++;
      }
    }

    return {
      nodeIndex,
      totalCases: matched.length,
      openCases,
      overdueCases,
      handoverPending,
      recheckPending,
      closedCases,
    };
  });
};

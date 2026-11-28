import type { WorkerRecord } from '../types';
import { getKoreanCalendarDay } from './monthlyFieldFollowup';
import type { NexusOrbitLayer } from './nexusSphereProjection';

/**
 * Slice 1 · 골조·지하 RC 3축(구간 × 공종 × 가설·장비) 마스터 분류체계 및
 * 표준 사고·아차사고 예방 시드 DB.
 * 실제 현장 승인 통계와 참조용 예방 시드는 엄격히 분리하여 표기한다.
 */
export type NexusZoneAxis =
  | 'foundation'
  | 'substructure_rc'
  | 'superstructure_std'
  | 'rooftop_special';

export type NexusProcessAxis =
  | 'formwork_general'
  | 'gangform'
  | 'alform'
  | 'rebar'
  | 'concrete_pour'
  | 'stripping_curing';

export type NexusHazardEquipmentAxis =
  | 'system_shoring'
  | 'system_scaffold'
  | 'tower_crane_rigging'
  | 'aerial_platform'
  | 'opening_edge'
  | 'confined_earth_pressure';

export type NexusHazardMechanism =
  | '붕괴·도괴'
  | '추락'
  | '낙하·비래'
  | '협착·끼임'
  | '질식·중독'
  | '전도';

export const NEXUS_ZONE_AXIS_OPTIONS: readonly { id: NexusZoneAxis; label: string; shortLabel: string }[] = [
  { id: 'foundation', label: '기초·흙막이 구간', shortLabel: '기초·흙막이' },
  { id: 'substructure_rc', label: '지하 RC구조물 (별도관리)', shortLabel: '지하 RC 별도' },
  { id: 'superstructure_std', label: '지상 기준층 골조', shortLabel: '지상 기준층' },
  { id: 'rooftop_special', label: '옥탑·전이층·특수구간', shortLabel: '옥탑·특수' },
];

export const NEXUS_PROCESS_AXIS_OPTIONS: readonly { id: NexusProcessAxis; label: string; shortLabel: string }[] = [
  { id: 'formwork_general', label: '형틀공정 (공통·재래식)', shortLabel: '형틀공정' },
  { id: 'gangform', label: '갱폼 인상·해체', shortLabel: '갱폼' },
  { id: 'alform', label: 'AL폼 설치·해체', shortLabel: 'AL폼' },
  { id: 'rebar', label: '철근배근', shortLabel: '철근배근' },
  { id: 'concrete_pour', label: '콘크리트 타설', shortLabel: '콘크리트 타설' },
  { id: 'stripping_curing', label: '거푸집·동바리 해체·정리', shortLabel: '해체·정리' },
];

export const NEXUS_HAZARD_EQUIPMENT_AXIS_OPTIONS: readonly {
  id: NexusHazardEquipmentAxis;
  label: string;
  shortLabel: string;
}[] = [
  { id: 'system_shoring', label: '시스템동바리·지지체', shortLabel: '시스템동바리' },
  { id: 'system_scaffold', label: '외부 시스템비계', shortLabel: '시스템비계' },
  { id: 'tower_crane_rigging', label: '타워크레인·양중', shortLabel: '타워크레인·양중' },
  { id: 'aerial_platform', label: '고소작업대', shortLabel: '고소작업대' },
  { id: 'opening_edge', label: '개구부·단부·수직통로', shortLabel: '개구부·단부' },
  { id: 'confined_earth_pressure', label: '측압·부력·밀폐환기', shortLabel: '측압·부력·밀폐' },
];

export interface NexusStructuralIncidentSeed {
  caseCode: string;
  title: string;
  zoneAxis: NexusZoneAxis;
  processAxis: NexusProcessAxis;
  hazardEquipmentAxis: NexusHazardEquipmentAxis;
  structuralNodeIndex: string; // '01'..'10' in structural layer
  moduleNodeIndex: string; // '01'..'06' in modules layer
  cycleNodeIndex: string; // '01'..'05' in cycle layer
  hazardMechanism: NexusHazardMechanism;
  directCause: string;
  contributingFactor: string;
  rootCause: string;
  preventiveMeasure: string;
  preVisitBriefingPoint: string;
  ceoTrainingPoint: string;
  tradeKeywords: readonly string[];
  sourceKind: '골조 표준 예방 시드 (실제 현장 사고 통계 아님)';
}

export const NEXUS_STRUCTURAL_INCIDENT_SEEDS: readonly NexusStructuralIncidentSeed[] = [
  {
    caseCode: 'RC-SUB-01',
    title: '지하 RC 외벽 합벽 거푸집 측압 변형 및 지하 피트 개구부 추락 위험',
    zoneAxis: 'substructure_rc',
    processAxis: 'formwork_general',
    hazardEquipmentAxis: 'confined_earth_pressure',
    structuralNodeIndex: '01',
    moduleNodeIndex: '01',
    cycleNodeIndex: '01',
    hazardMechanism: '붕괴·도괴',
    directCause: '지하 외벽 단면 거푸집 타이볼트·지지대 간격 미준수 및 타설 측압 집중',
    contributingFactor: '지하수 부력·흙막이 가시설 인접 구간 협소 작업동선 및 조도 부족',
    rootCause: '지하 RC 전용 구조검토(측압·부력·환기·수직개구부) 사전 점검 없이 상부 기준을 그대로 적용',
    preventiveMeasure: '지하 외벽 단면·층고별 지지체 체결 전수 확인, 피트·수직통로 난간·덮개 고정 및 밀폐구간 환기·산소농도 측정',
    preVisitBriefingPoint: '지하층 외벽 지지체 간격, 지하 피트 개구부 방호 및 환기 팬 가동 상태 우선 확인',
    ceoTrainingPoint: '지하 RC 구간은 측압·부력·밀폐·어두운 동선이 겹치므로 작업 전 조명·환기·개구부 덮개를 먼저 확인합니다.',
    tradeKeywords: ['지하', '형틀', '목공', '방수', '토공', '가시설'],
    sourceKind: '골조 표준 예방 시드 (실제 현장 사고 통계 아님)',
  },
  {
    caseCode: 'FW-CORE-02',
    title: '슬래브 단부·엘리베이터 코어 형틀 조립 중 개구부 추락 및 자재 낙하',
    zoneAxis: 'superstructure_std',
    processAxis: 'formwork_general',
    hazardEquipmentAxis: 'opening_edge',
    structuralNodeIndex: '02',
    moduleNodeIndex: '03',
    cycleNodeIndex: '02',
    hazardMechanism: '추락',
    directCause: '형틀 자재 반입을 위해 임시 해체한 단부 안전난간 미복구 상태에서 조립 작업 진행',
    contributingFactor: '단부 인근 형틀 패널·각재 과적치로 인한 이동동선 협소',
    rootCause: '난간 임시 해체 후 즉시 복구 책임자 미지정 및 교대 인계 누락',
    preventiveMeasure: '단부·코어 개구부 안전난간·추락방호망 상시 유지, 자재 반입구 작업 직후 난간 즉시 복구 및 안전대 걸이시설 확보',
    preVisitBriefingPoint: '엘리베이터 피트·계단실·슬래브 단부 안전난간 임의 해체 구간 및 복구 이력 대조',
    ceoTrainingPoint: '자재 반입을 위해 잠깐 연 난간과 개구부 덮개가 가장 위험합니다. 작업 직후 즉시 닫고 안전대를 체결하세요.',
    tradeKeywords: ['형틀', '목공', '거푸집', '골조'],
    sourceKind: '골조 표준 예방 시드 (실제 현장 사고 통계 아님)',
  },
  {
    caseCode: 'GF-LIFT-03',
    title: '갱폼 인양 전 타워크레인 신호 불일치 및 고정 앵커 선해체 추락·낙하',
    zoneAxis: 'superstructure_std',
    processAxis: 'gangform',
    hazardEquipmentAxis: 'tower_crane_rigging',
    structuralNodeIndex: '03',
    moduleNodeIndex: '05',
    cycleNodeIndex: '04',
    hazardMechanism: '추락',
    directCause: '타워크레인 인양 샤클 체결 완료 전 갱폼 고정 앵커볼트를 먼저 해체',
    contributingFactor: '인양 신호수와 갱폼 내부 해체 작업자 간 무전 교신 누락 및 하부 통제 미흡',
    rootCause: '선(先) 인양고리 걸기 → 후(後) 앵커볼트 해체 작업절차 미준수 및 작업 전 역할 분담·신호 협의 부재',
    preventiveMeasure: '타워크레인 인양 줄걸이 장력 확인 후 앵커볼트 해체, 갱폼 케이지 내부 잔류 인원 금지 및 하부 출입통제',
    preVisitBriefingPoint: '갱폼 인상 구간 신호수 무전 체계, 인양 고리·앵커볼트 체결 상태 및 케이지 발판 손상 점검',
    ceoTrainingPoint: '크레인 고리가 완전히 걸리기 전에는 갱폼 고정 볼트를 절대 먼저 풀지 마십시오.',
    tradeKeywords: ['갱폼', '형틀', '타워크레인', '골조'],
    sourceKind: '골조 표준 예방 시드 (실제 현장 사고 통계 아님)',
  },
  {
    caseCode: 'AL-STRIP-04',
    title: 'AL폼 슬래브 데크 패널 조기 해체 중 보조 서포트 미유지로 인한 패널 낙하·협착',
    zoneAxis: 'superstructure_std',
    processAxis: 'alform',
    hazardEquipmentAxis: 'opening_edge',
    structuralNodeIndex: '04',
    moduleNodeIndex: '02',
    cycleNodeIndex: '03',
    hazardMechanism: '낙하·비래',
    directCause: '인접 보조 서포트를 동시에 제거한 상태에서 데크 패널 핀을 빼내어 패널이 급격히 탈락',
    contributingFactor: '해체 구간 하부 정리 작업자가 동일 구역에 동시 투입(상·하부 동시작업)',
    rootCause: 'AL폼 해체 순서(드롭헤드·잔류 서포트 유지) 교육 미흡 및 해체 구역 출입통제선 미설치',
    preventiveMeasure: '해체 시 존치 서포트 유지, 패널 바닥 투하 금지, 해체 구역 하부 통제 및 보안경·안전모 턱끈 체결',
    preVisitBriefingPoint: 'AL폼 해체 층 잔류 서포트 수량·수직도 및 상·하부 동시작업 분리 상태 확인',
    ceoTrainingPoint: '알폼 해체 시 보조 서포트를 먼저 빼지 말고, 해체 구역 아래로는 절대 통행하지 마십시오.',
    tradeKeywords: ['알폼', 'AL폼', '형틀', '해체', '목공'],
    sourceKind: '골조 표준 예방 시드 (실제 현장 사고 통계 아님)',
  },
  {
    caseCode: 'RB-WALL-05',
    title: '장대 벽체·기둥 철근망 조립 중 임시 버팀대 미설치로 인한 철근망 전도·끼임',
    zoneAxis: 'superstructure_std',
    processAxis: 'rebar',
    hazardEquipmentAxis: 'opening_edge',
    structuralNodeIndex: '05',
    moduleNodeIndex: '04',
    cycleNodeIndex: '02',
    hazardMechanism: '전도',
    directCause: '높이 4m 이상 기둥·벽체 철근 배근 중 풍하중·편심에 대한 전도방지 버팀대(가새) 미설치',
    contributingFactor: '슬래브 상부 노출 철근 캡 미부착 및 이동 발판 미설치',
    rootCause: '거푸집 합벽 전 단독 자립 철근망의 전도 위험성 과소평가',
    preventiveMeasure: '장대 철근망 조립 즉시 양방향 임시 버팀대·긴결선 고정, 돌출 철근 캡 부착 및 철근 위 전용 보행발판 설치',
    preVisitBriefingPoint: '벽체·기둥 철근 자립 구간 버팀대 설치 여부 및 슬래브 돌출 철근 보호캡 체결 상태 점검',
    ceoTrainingPoint: '높은 벽체·기둥 철근은 거푸집을 닫기 전 반드시 버팀대로 고정하고, 돌출 철근에는 보호캡을 씌우세요.',
    tradeKeywords: ['철근', '배근', '골조'],
    sourceKind: '골조 표준 예방 시드 (실제 현장 사고 통계 아님)',
  },
  {
    caseCode: 'CP-POUR-06',
    title: '콘크리트 집중 타설 중 거푸집 배부름 및 펌프카 엔드호스 요동 협착',
    zoneAxis: 'superstructure_std',
    processAxis: 'concrete_pour',
    hazardEquipmentAxis: 'system_shoring',
    structuralNodeIndex: '06',
    moduleNodeIndex: '06',
    cycleNodeIndex: '04',
    hazardMechanism: '협착·끼임',
    directCause: '슬래브 한 지점에 콘크리트를 과도하게 집중 타설하여 하부 동바리 편심 및 엔드호스 급격 요동 발생',
    contributingFactor: '타설 중 하부 동바리·거푸집 변형 감시자 미배치 및 호스 유도 로프 미사용',
    rootCause: '분산 타설 속도 기준 미준수 및 펌프카 압송 재개 시 신호 미흡',
    preventiveMeasure: '콘크리트 분산 타설 준수, 하부 동바리·거푸집 변형 감시, 엔드호스 유도 로프 체결 및 아웃트리거 지반 확인',
    preVisitBriefingPoint: '타설 구간 분산 타설 이행, 하부 동바리 감시 체계 및 펌프카 아웃트리거 지반 보강 상태 확인',
    ceoTrainingPoint: '콘크리트는 한곳에 몰아 붓지 말고 골고루 분산 타설하며, 펌프카 호스 끝단 반동에 주의하세요.',
    tradeKeywords: ['타설', '콘크리트', '타설공', '펌프카', '골조'],
    sourceKind: '골조 표준 예방 시드 (실제 현장 사고 통계 아님)',
  },
  {
    caseCode: 'SS-SHORE-07',
    title: '고층고 전이층 시스템동바리 수평연결재·가새 누락에 의한 지지체 좌굴·붕괴 위험',
    zoneAxis: 'rooftop_special',
    processAxis: 'formwork_general',
    hazardEquipmentAxis: 'system_shoring',
    structuralNodeIndex: '07',
    moduleNodeIndex: '03',
    cycleNodeIndex: '01',
    hazardMechanism: '붕괴·도괴',
    directCause: '고층고 슬래브 하부 시스템동바리 대각선 가새·수평재 일부 누락 및 U헤드 편심 거치',
    contributingFactor: '작업 통행 편의를 위해 기설치된 하부 수평재를 임의 해체한 뒤 미복구',
    rootCause: '구조검토 조립도 대비 현장 시공 일치 여부 재점검 누락',
    preventiveMeasure: '조립도 기준 수직·수평재·가새·연결핀 전수 확인, 자키베이스·U헤드 스크류 노출길이 준수 및 기둥·벽체 수평지지 연결',
    preVisitBriefingPoint: '고층고·전이층 시스템동바리 가새·연결핀 체결 상태 및 하부 수평재 임의 해체 구간 점검',
    ceoTrainingPoint: '통행이 불편하다는 이유로 시스템동바리 수평재나 가새를 임의로 빼면 전체 붕괴로 이어집니다.',
    tradeKeywords: ['동바리', '시스템동바리', '가설', '형틀', '비계'],
    sourceKind: '골조 표준 예방 시드 (실제 현장 사고 통계 아님)',
  },
  {
    caseCode: 'SC-EXT-08',
    title: '외부 시스템비계 벽이음 임의 해체 및 작업발판 틈새 추락·낙하물 위험',
    zoneAxis: 'superstructure_std',
    processAxis: 'stripping_curing',
    hazardEquipmentAxis: 'system_scaffold',
    structuralNodeIndex: '08',
    moduleNodeIndex: '06',
    cycleNodeIndex: '05',
    hazardMechanism: '추락',
    directCause: '외벽 마감·형틀 해체 간섭을 이유로 외부 비계 벽이음을 대체 보강 없이 해체',
    contributingFactor: '비계 내측과 구조물 사이 방망 미설치 및 발끝막이판 탈락',
    rootCause: '벽이음 변경·해체 시 사전 보강 승인 및 교대 인계 기록 부재',
    preventiveMeasure: '벽이음 정해진 간격 유지(해체 시 선 보강 후 해체), 작업발판 고정·발끝막이판·수직보호망 결속 확인',
    preVisitBriefingPoint: '외부 시스템비계 벽이음 체결 누락 구간, 내측 추락방호망 및 하부 낙하물방지망 상태 확인',
    ceoTrainingPoint: '외부 비계의 벽이음과 난간은 생명을 지탱하는 고정점입니다. 간섭이 생겨도 임의로 풀지 말고 관리자에게 먼저 알리세요.',
    tradeKeywords: ['비계', '시스템비계', '외부비계', '가설', '해체'],
    sourceKind: '골조 표준 예방 시드 (실제 현장 사고 통계 아님)',
  },
  {
    caseCode: 'TC-RIG-09',
    title: '형틀·철근 자재 타워크레인 인양 중 한 줄 걸이 편하중으로 인한 자재 낙하',
    zoneAxis: 'superstructure_std',
    processAxis: 'formwork_general',
    hazardEquipmentAxis: 'tower_crane_rigging',
    structuralNodeIndex: '09',
    moduleNodeIndex: '02',
    cycleNodeIndex: '02',
    hazardMechanism: '낙하·비래',
    directCause: '장척 형틀·철근 다발을 1점 줄걸이로 인양하거나 손상된 슬링벨트 사용',
    contributingFactor: '인양 경로 하부에서 다른 작업팀이 동시에 작업 진행',
    rootCause: '2점 이상 균형 줄걸이 원칙 미준수 및 신호수 인양 경로 하부 통제 미이행',
    preventiveMeasure: '장척·중량 자재 2점 이상 균형 줄걸이, 슬링벨트·샤클 사전 점검, 전담 신호수 배치 및 인양 하부 출입통제',
    preVisitBriefingPoint: '타워크레인 줄걸이 용구(슬링벨트·샤클) 마모 상태, 2점 걸이 준수 및 신호수 무전 통제 확인',
    ceoTrainingPoint: '인양물은 반드시 두 지점 이상 균형 있게 묶고, 크레인이 지나가는 아래쪽에는 절대 서 있지 마십시오.',
    tradeKeywords: ['타워크레인', '양중', '크레인', '줄걸이', '신호수', '형틀', '철근'],
    sourceKind: '골조 표준 예방 시드 (실제 현장 사고 통계 아님)',
  },
  {
    caseCode: 'AWP-LIFT-10',
    title: '지하·상부 고소작업대 상승 중 상부 보·배관 협착 및 바닥 개구부 전도',
    zoneAxis: 'substructure_rc',
    processAxis: 'stripping_curing',
    hazardEquipmentAxis: 'aerial_platform',
    structuralNodeIndex: '10',
    moduleNodeIndex: '04',
    cycleNodeIndex: '05',
    hazardMechanism: '협착·끼임',
    directCause: '상부 슬래브 보·설비 배관을 확인하지 않고 작업대를 상승시켜 난간과 상부 구조물 사이에 끼임',
    contributingFactor: '과상승 방지봉 임의 결속(무력화) 및 바닥 단차·트렌치 덮개 미보강 상태에서 주행',
    rootCause: '작업 전 과상승 방지장치 작동 시험 누락 및 이동 시 작업대 하강 원칙 미준수',
    preventiveMeasure: '작업 전 과상승 방지장치 정상 작동 확인, 주행 시 작업대 완전 하강, 바닥 개구부·단차 구름방지 및 안전대 체결',
    preVisitBriefingPoint: '고소작업대 과상승 방지봉 정상 작동 여부, 바닥 트렌치·단차 보강 및 탑승자 안전대 고리 체결 확인',
    ceoTrainingPoint: '고소작업대 과상승 방지장치는 절대 묶어두지 말고, 이동할 때는 반드시 작업대를 내린 뒤 이동하세요.',
    tradeKeywords: ['고소작업대', '렌탈', '해체', '지하', '설비'],
    sourceKind: '골조 표준 예방 시드 (실제 현장 사고 통계 아님)',
  },
];

export interface NexusThreeAxisFilter {
  zoneAxis: NexusZoneAxis | '';
  processAxis: NexusProcessAxis | '';
  hazardEquipmentAxis: NexusHazardEquipmentAxis | '';
}

export interface NexusNodeLiveSignal {
  nodeIndex: string;
  matchedRecords: number;
  highSelfRisk: number;
  unresolvedActions: number;
  overdueActions: number;
  linkedSeeds: readonly NexusStructuralIncidentSeed[];
  matchesAxisFilter: boolean;
}

export const filterStructuralIncidentSeeds = (
  filter: NexusThreeAxisFilter,
  extraApprovedSeeds: readonly NexusStructuralIncidentSeed[] = [],
): readonly NexusStructuralIncidentSeed[] =>
  [...extraApprovedSeeds, ...NEXUS_STRUCTURAL_INCIDENT_SEEDS].filter(
    seed =>
      (!filter.zoneAxis || seed.zoneAxis === filter.zoneAxis) &&
      (!filter.processAxis || seed.processAxis === filter.processAxis) &&
      (!filter.hazardEquipmentAxis || seed.hazardEquipmentAxis === filter.hazardEquipmentAxis),
  );

const recordMatchesKeywords = (
  record: Pick<WorkerRecord, 'jobField' | 'handwrittenAnswers'>,
  keywords: readonly string[],
): boolean => {
  const trade = String(record.jobField || '').toLowerCase();
  const answers = (record.handwrittenAnswers || [])
    .map(a => `${a.answerText || ''} ${a.koreanTranslation || ''}`)
    .join(' ')
    .toLowerCase();
  return keywords.some(kw => {
    const token = kw.toLowerCase();
    return trade.includes(token) || answers.includes(token);
  });
};

export const buildOrbitLayerLiveSignals = (
  layer: NexusOrbitLayer,
  records: readonly WorkerRecord[],
  axisFilter: NexusThreeAxisFilter,
  asOfDate = getKoreanCalendarDay(),
  extraApprovedSeeds: readonly NexusStructuralIncidentSeed[] = [],
): readonly NexusNodeLiveSignal[] => {
  const nodeCount = layer === 'cycle' ? 5 : layer === 'modules' ? 6 : 10;
  const allSeeds = [...extraApprovedSeeds, ...NEXUS_STRUCTURAL_INCIDENT_SEEDS];
  const activeSeeds = filterStructuralIncidentSeeds(axisFilter, extraApprovedSeeds);
  const hasAxisFilter = Boolean(
    axisFilter.zoneAxis || axisFilter.processAxis || axisFilter.hazardEquipmentAxis,
  );

  return Array.from({ length: nodeCount }, (_, idx) => {
    const nodeIndex = String(idx + 1).padStart(2, '0');
    const seedsForNode = allSeeds.filter(seed =>
      layer === 'structural'
        ? seed.structuralNodeIndex === nodeIndex
        : layer === 'modules'
          ? seed.moduleNodeIndex === nodeIndex
          : seed.cycleNodeIndex === nodeIndex,
    );
    const filteredSeedsForNode = activeSeeds.filter(seed =>
      layer === 'structural'
        ? seed.structuralNodeIndex === nodeIndex
        : layer === 'modules'
          ? seed.moduleNodeIndex === nodeIndex
          : seed.cycleNodeIndex === nodeIndex,
    );
    const keywords = [...new Set(seedsForNode.flatMap(s => s.tradeKeywords))];
    const matched =
      layer === 'cycle'
        ? records
        : records.filter(r => recordMatchesKeywords(r, keywords));

    let highSelfRisk = 0;
    let unresolvedActions = 0;
    let overdueActions = 0;

    for (const row of matched) {
      if (row.selfAssessedRiskLevel === '상') highSelfRisk++;
      const events = (row.riskFollowupEvents || []).filter(e => {
        if (!e || !e.id || !e.caseId) return false;
        if (layer === 'cycle' && e.questionNumber !== idx + 1) return false;
        const d = new Date(e.timestamp);
        return Number.isFinite(d.getTime()) && getKoreanCalendarDay(d) <= asOfDate;
      });
      const byCase = new Map<string, (typeof events)[number]>();
      for (const ev of events) {
        const prev = byCase.get(ev.caseId);
        if (!prev || new Date(ev.timestamp).getTime() >= new Date(prev.timestamp).getTime()) {
          byCase.set(ev.caseId, ev);
        }
      }
      for (const latest of byCase.values()) {
        if (latest.status !== 'completed') {
          unresolvedActions++;
          if (latest.dueDate && latest.dueDate < asOfDate) {
            overdueActions++;
          }
        }
      }
    }

    return {
      nodeIndex,
      matchedRecords: matched.length,
      highSelfRisk,
      unresolvedActions,
      overdueActions,
      linkedSeeds: filteredSeedsForNode.length ? filteredSeedsForNode : seedsForNode,
      matchesAxisFilter: !hasAxisFilter || filteredSeedsForNode.length > 0,
    };
  });
};

import type { NexusOrbitLayer } from './nexusSphereProjection';

export type NexusConstellationAnimationKind =
  | 'sweep'
  | 'trace'
  | 'breathe'
  | 'lock'
  | 'flow'
  | 'weave';

export interface NexusStarPoint {
  x: number;
  y: number;
  mag: 1 | 2 | 3;
  label?: string;
}

export interface NexusNodeConstellation {
  key: string;
  layer: NexusOrbitLayer;
  index: string;
  koName: string;
  latinName: string;
  motifLabel: string;
  symbolism: string;
  animationKind: NexusConstellationAnimationKind;
  animationLabel: string;
  animModeIndex: number;
  stars: readonly NexusStarPoint[];
  edges: readonly [number, number][];
}

export const ANIMATION_MODE_INDEX_MAP: Record<NexusConstellationAnimationKind, number> = {
  sweep: 0,
  trace: 1,
  breathe: 2,
  lock: 3,
  flow: 4,
  weave: 5,
};

const makeConstellation = (
  layer: NexusOrbitLayer,
  index: string,
  config: Omit<NexusNodeConstellation, 'key' | 'layer' | 'index' | 'animModeIndex'>,
): NexusNodeConstellation => ({
  key: `${layer}-${index}`,
  layer,
  index,
  animModeIndex: ANIMATION_MODE_INDEX_MAP[config.animationKind],
  ...config,
});

const CONSTELLATION_LIST: readonly NexusNodeConstellation[] = [
  // =========================================================================
  // Viewing Layer 01: 5-Stage Safety Intelligence Cycle (cycle 01..05)
  // =========================================================================
  makeConstellation('cycle', '01', {
    koName: '오리온자리',
    latinName: 'Orion',
    motifLabel: '수호자 · 작업 전 전방 주시',
    symbolism: '작업 전 잠재 위험을 선제 탐지해 현장을 비추는 세 별의 기준선입니다.',
    animationKind: 'sweep',
    animationLabel: '레이더 스캔 파동',
    stars: [
      { x: 26, y: 12, mag: 1, label: '베텔게우스' },
      { x: 70, y: 14, mag: 2, label: '벨라트릭스' },
      { x: 40, y: 33, mag: 1 },
      { x: 50, y: 31, mag: 2 },
      { x: 60, y: 29, mag: 1 },
      { x: 28, y: 54, mag: 2 },
      { x: 74, y: 52, mag: 1, label: '리겔' },
    ],
    edges: [
      [0, 1],
      [0, 2],
      [1, 4],
      [2, 3],
      [3, 4],
      [2, 5],
      [4, 6],
      [5, 6],
    ],
  }),
  makeConstellation('cycle', '02', {
    koName: '카시오페이아자리',
    latinName: 'Cassiopeia',
    motifLabel: 'W-스캔 · 5대 핵심 위험원',
    symbolism: '추락·붕괴·낙하·협착·감전 등 다중 위험 신호를 교차 판독합니다.',
    animationKind: 'trace',
    animationLabel: '위험 맥락 트레이스',
    stars: [
      { x: 14, y: 20, mag: 2 },
      { x: 32, y: 46, mag: 1, label: '셰다르' },
      { x: 51, y: 22, mag: 1 },
      { x: 69, y: 48, mag: 2 },
      { x: 86, y: 18, mag: 1 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  }),
  makeConstellation('cycle', '03', {
    koName: '천칭자리',
    latinName: 'Libra',
    motifLabel: '균형 저울 · 체감 위험도 진단',
    symbolism: '근로자 자가평가(상·중·하)와 현장 실제 위험도의 균형 격차를 살핍니다.',
    animationKind: 'breathe',
    animationLabel: '체감 균형 호흡 파동',
    stars: [
      { x: 50, y: 12, mag: 1, label: '주벤에샤말리' },
      { x: 24, y: 30, mag: 1 },
      { x: 76, y: 30, mag: 2 },
      { x: 32, y: 52, mag: 2 },
      { x: 68, y: 52, mag: 3 },
    ],
    edges: [
      [0, 1],
      [0, 2],
      [1, 2],
      [1, 3],
      [2, 4],
    ],
  }),
  makeConstellation('cycle', '04', {
    koName: '방패자리',
    latinName: 'Scutum',
    motifLabel: '보호 방패 · 시정조치 완결',
    symbolism: '미해결·임시통제·재점검 이력을 빠짐없이 감싸는 보호 조치 결계입니다.',
    animationKind: 'lock',
    animationLabel: '보호 실드 잠금 링',
    stars: [
      { x: 50, y: 11, mag: 1 },
      { x: 74, y: 24, mag: 2 },
      { x: 64, y: 52, mag: 1 },
      { x: 36, y: 52, mag: 2 },
      { x: 26, y: 24, mag: 2 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 0],
      [0, 2],
    ],
  }),
  makeConstellation('cycle', '05', {
    koName: '작은곰자리',
    latinName: 'Ursa Minor',
    motifLabel: '북극성 · 변치 않는 실천 약속',
    symbolism: '작업자가 직접 약속한 안전 수칙을 모국어 교육과 재확인으로 이어갑니다.',
    animationKind: 'breathe',
    animationLabel: '북극성 순환 궤도',
    stars: [
      { x: 20, y: 14, mag: 1, label: '폴라리스' },
      { x: 38, y: 21, mag: 3 },
      { x: 52, y: 31, mag: 2 },
      { x: 66, y: 33, mag: 2 },
      { x: 84, y: 30, mag: 1 },
      { x: 82, y: 50, mag: 2 },
      { x: 64, y: 50, mag: 3 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 3],
    ],
  }),

  // =========================================================================
  // Viewing Layer 02: 6 Core Modules (modules 01..06)
  // =========================================================================
  makeConstellation('modules', '01', {
    koName: '나침반자리',
    latinName: 'Pyxis',
    motifLabel: '순회 방위 · 현장 사전 브리핑',
    symbolism: '방문 전 미해결·기한초과 위험을 먼저 가리켜 순회점검의 방향을 잡습니다.',
    animationKind: 'sweep',
    animationLabel: '순회 방위각 스캔',
    stars: [
      { x: 50, y: 10, mag: 1 },
      { x: 74, y: 32, mag: 2 },
      { x: 50, y: 34, mag: 2 },
      { x: 26, y: 32, mag: 3 },
      { x: 50, y: 55, mag: 1 },
    ],
    edges: [
      [0, 2],
      [2, 4],
      [3, 2],
      [2, 1],
      [0, 1],
      [0, 3],
    ],
  }),
  makeConstellation('modules', '02', {
    koName: '안드로메다 성단',
    latinName: 'Andromeda',
    motifLabel: '3축 지식 망 · 유사 사례 연결',
    symbolism: '구간·공종·가설장비 3축으로 축적된 사고 데이터를 입체적으로 직조합니다.',
    animationKind: 'weave',
    animationLabel: '3축 지식 성단 직조',
    stars: [
      { x: 18, y: 46, mag: 1, label: '알페라츠' },
      { x: 40, y: 38, mag: 2 },
      { x: 62, y: 26, mag: 1 },
      { x: 84, y: 14, mag: 2 },
      { x: 56, y: 48, mag: 2 },
      { x: 78, y: 50, mag: 3 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [1, 4],
      [4, 5],
      [2, 4],
    ],
  }),
  makeConstellation('modules', '03', {
    koName: '용골자리',
    latinName: 'Carina',
    motifLabel: '카노푸스 광학 · AI 비전 포착',
    symbolism: '현장 사진 1장에서 위험요인·근거 기준·초안을 정밀하게 잠금 포착합니다.',
    animationKind: 'lock',
    animationLabel: '광학 초점 잠금 링',
    stars: [
      { x: 22, y: 26, mag: 1, label: '카노푸스' },
      { x: 42, y: 48, mag: 2 },
      { x: 60, y: 52, mag: 2 },
      { x: 78, y: 38, mag: 1 },
      { x: 62, y: 16, mag: 2 },
      { x: 42, y: 22, mag: 3 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 0],
    ],
  }),
  makeConstellation('modules', '04', {
    koName: '거문고자리',
    latinName: 'Lyra',
    motifLabel: '12개국어 공명 · 모국어 전파',
    symbolism: '대표이사 중점 교육이 12개 언어·음성 하모니로 전 현장에 울려 퍼집니다.',
    animationKind: 'breathe',
    animationLabel: '다국어 공명 파동',
    stars: [
      { x: 24, y: 16, mag: 1, label: '베가' },
      { x: 48, y: 24, mag: 2 },
      { x: 74, y: 26, mag: 2 },
      { x: 70, y: 50, mag: 1 },
      { x: 44, y: 48, mag: 2 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 1],
    ],
  }),
  makeConstellation('modules', '05', {
    koName: '큰곰자리',
    latinName: 'Ursa Major',
    motifLabel: '북두칠성 · 6하원칙 원인 사슬',
    symbolism: '직접원인에서 기여요인·근본원인까지 7개 이정표로 사고 맥락을 추적합니다.',
    animationKind: 'trace',
    animationLabel: '원인 사슬 궤적 추적',
    stars: [
      { x: 14, y: 26, mag: 2 },
      { x: 28, y: 18, mag: 2 },
      { x: 42, y: 24, mag: 1 },
      { x: 56, y: 28, mag: 2 },
      { x: 82, y: 24, mag: 1 },
      { x: 84, y: 48, mag: 2 },
      { x: 60, y: 48, mag: 2 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 3],
    ],
  }),
  makeConstellation('modules', '06', {
    koName: '왕관자리',
    latinName: 'Corona Borealis',
    motifLabel: '폐루프 봉인 · 조치·인계 종결',
    symbolism: '시정조치·재점검·교대 인계가 빈틈없는 반원 고리로 완결됩니다.',
    animationKind: 'lock',
    animationLabel: '폐루프 완결 봉인',
    stars: [
      { x: 18, y: 24, mag: 3 },
      { x: 28, y: 42, mag: 2 },
      { x: 42, y: 50, mag: 2 },
      { x: 54, y: 50, mag: 1, label: '알페카' },
      { x: 68, y: 42, mag: 2 },
      { x: 78, y: 28, mag: 2 },
      { x: 84, y: 14, mag: 3 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
    ],
  }),

  // =========================================================================
  // Viewing Layer 03: 10 Structural & Substructure RC Processes (01..10)
  // =========================================================================
  makeConstellation('structural', '01', {
    koName: '고래자리',
    latinName: 'Cetus',
    motifLabel: '지하 심층 · 측압·부력·환기',
    symbolism: '지하 RC 외벽과 밀폐 구간의 보이지 않는 압력·가스 변위를 소나로 감시합니다.',
    animationKind: 'sweep',
    animationLabel: '지하 심층 소나 스캔',
    stars: [
      { x: 18, y: 42, mag: 2 },
      { x: 34, y: 26, mag: 1 },
      { x: 52, y: 36, mag: 2 },
      { x: 68, y: 22, mag: 2 },
      { x: 84, y: 32, mag: 1 },
      { x: 72, y: 50, mag: 2 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 2],
    ],
  }),
  makeConstellation('structural', '02', {
    koName: '페가수스 사각형',
    latinName: 'Pegasus',
    motifLabel: '거푸집 정방형 · 긴결·단부 방호',
    symbolism: '거푸집·폼타이·단부 난간으로 이뤄진 골조 전 구간 핵심 프레임을 지킵니다.',
    animationKind: 'weave',
    animationLabel: '형틀 프레임 직조',
    stars: [
      { x: 26, y: 16, mag: 1 },
      { x: 72, y: 16, mag: 1 },
      { x: 72, y: 48, mag: 1 },
      { x: 26, y: 48, mag: 2 },
      { x: 12, y: 26, mag: 3 },
      { x: 86, y: 38, mag: 3 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [0, 4],
      [2, 5],
    ],
  }),
  makeConstellation('structural', '03', {
    koName: '독수리자리',
    latinName: 'Aquila',
    motifLabel: '상승 비행 · 외벽 갱폼 인양',
    symbolism: '층을 타고 오르는 갱폼 인상 고리·앵커볼트와 케이지 안전을 수직 추적합니다.',
    animationKind: 'flow',
    animationLabel: '수직 인상 기류 흐름',
    stars: [
      { x: 50, y: 14, mag: 2 },
      { x: 50, y: 30, mag: 1, label: '알타이르' },
      { x: 22, y: 34, mag: 2 },
      { x: 78, y: 34, mag: 2 },
      { x: 42, y: 52, mag: 2 },
      { x: 60, y: 52, mag: 3 },
    ],
    edges: [
      [0, 1],
      [2, 1],
      [1, 3],
      [1, 4],
      [1, 5],
    ],
  }),
  makeConstellation('structural', '04', {
    koName: '쌍둥이자리',
    latinName: 'Gemini',
    motifLabel: '쌍둥이 기둥 · 알폼 핀·서포트',
    symbolism: '패널 양측 웨지핀 체결 균형과 하부 보조 서포트 존치를 함께 잠금 확인합니다.',
    animationKind: 'lock',
    animationLabel: '대칭 패널 핀 체결 링',
    stars: [
      { x: 32, y: 12, mag: 1, label: '카스토르' },
      { x: 68, y: 14, mag: 1, label: '폴룩스' },
      { x: 34, y: 34, mag: 2 },
      { x: 66, y: 34, mag: 2 },
      { x: 28, y: 54, mag: 2 },
      { x: 72, y: 54, mag: 2 },
    ],
    edges: [
      [0, 1],
      [0, 2],
      [2, 4],
      [1, 3],
      [3, 5],
      [2, 3],
    ],
  }),
  makeConstellation('structural', '05', {
    koName: '백조자리',
    latinName: 'Cygnus',
    motifLabel: '북십자성 · 직교 철근망 배근',
    symbolism: '주근·배력근이 직교하며 결합하듯 장대 철근망 버팀대와 전도 방지를 엮습니다.',
    animationKind: 'weave',
    animationLabel: '직교 배근 격자 파동',
    stars: [
      { x: 50, y: 10, mag: 1, label: '데네브' },
      { x: 50, y: 31, mag: 1 },
      { x: 50, y: 54, mag: 2 },
      { x: 20, y: 31, mag: 2 },
      { x: 80, y: 31, mag: 2 },
      { x: 66, y: 20, mag: 3 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [3, 1],
      [1, 4],
      [1, 5],
    ],
  }),
  makeConstellation('structural', '06', {
    koName: '물병자리',
    latinName: 'Aquarius',
    motifLabel: '분산 유선 · 균형 콘크리트 타설',
    symbolism: '한 지점 편중 타설을 막고 펌프카 배관과 엔드호스 흐름을 고르게 제어합니다.',
    animationKind: 'flow',
    animationLabel: '분산 타설 유선 흐름',
    stars: [
      { x: 36, y: 14, mag: 1 },
      { x: 58, y: 18, mag: 2 },
      { x: 46, y: 32, mag: 2 },
      { x: 30, y: 46, mag: 2 },
      { x: 52, y: 50, mag: 1 },
      { x: 74, y: 54, mag: 2 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [2, 4],
      [4, 5],
    ],
  }),
  makeConstellation('structural', '07', {
    koName: '헤르쿨레스자리',
    latinName: 'Hercules',
    motifLabel: '구조 버팀 · 시스템동바리 하중',
    symbolism: '고층고·전이층 거대 하중을 4기둥 키스톤과 수평 가새로 흔들림 없이 받칩니다.',
    animationKind: 'flow',
    animationLabel: '하중 지지 기둥 상승',
    stars: [
      { x: 36, y: 14, mag: 2 },
      { x: 64, y: 14, mag: 2 },
      { x: 62, y: 36, mag: 1 },
      { x: 38, y: 36, mag: 1 },
      { x: 26, y: 54, mag: 2 },
      { x: 74, y: 54, mag: 2 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [3, 4],
      [2, 5],
    ],
  }),
  makeConstellation('structural', '08', {
    koName: '용자리',
    latinName: 'Draco',
    motifLabel: '외벽 연속 · 시스템비계 벽이음',
    symbolism: '건물 외곽을 따라 이어지는 비계 벽이음 간격과 발판·난간 연속성을 추적합니다.',
    animationKind: 'trace',
    animationLabel: '외벽 연속 비계 트레이스',
    stars: [
      { x: 22, y: 48, mag: 2 },
      { x: 34, y: 34, mag: 2 },
      { x: 48, y: 42, mag: 2 },
      { x: 58, y: 24, mag: 1 },
      { x: 74, y: 18, mag: 1, label: '엘타닌' },
      { x: 84, y: 28, mag: 2 },
      { x: 72, y: 32, mag: 3 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 3],
    ],
  }),
  makeConstellation('structural', '09', {
    koName: '궁수자리',
    latinName: 'Sagittarius',
    motifLabel: '지브 반경 · 타워크레인 양중',
    symbolism: '양중 붐대의 선회 반경과 2점 균형 줄걸이, 하부 출입통제 구역을 스윙 감시합니다.',
    animationKind: 'sweep',
    animationLabel: '인양 붐 반경 스윙',
    stars: [
      { x: 24, y: 38, mag: 2 },
      { x: 46, y: 22, mag: 1 },
      { x: 48, y: 42, mag: 2 },
      { x: 38, y: 54, mag: 2 },
      { x: 70, y: 20, mag: 1 },
      { x: 82, y: 40, mag: 2 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [1, 4],
      [4, 5],
      [5, 2],
    ],
  }),
  makeConstellation('structural', '10', {
    koName: '기린자리',
    latinName: 'Camelopardalis',
    motifLabel: '수직 고소 · 과상승 방지 비콘',
    symbolism: '높이 뻗은 작업대의 과상승 방지봉, 아웃트리거 지반, 안전대 고리를 비춥니다.',
    animationKind: 'flow',
    animationLabel: '고소 2단 상승 비콘',
    stars: [
      { x: 50, y: 10, mag: 1 },
      { x: 44, y: 26, mag: 2 },
      { x: 56, y: 34, mag: 2 },
      { x: 42, y: 46, mag: 2 },
      { x: 58, y: 54, mag: 1 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  }),
];

export const NEXUS_CONSTELLATIONS_BY_KEY: Record<string, NexusNodeConstellation> =
  Object.fromEntries(CONSTELLATION_LIST.map((item) => [item.key, item]));

export const getNodeConstellation = (
  layer: NexusOrbitLayer,
  index: string,
): NexusNodeConstellation => {
  const normalizedIdx = String(index || '01').padStart(2, '0');
  return (
    NEXUS_CONSTELLATIONS_BY_KEY[`${layer}-${normalizedIdx}`] ||
    CONSTELLATION_LIST[0]
  );
};

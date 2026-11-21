import type { Page } from '../types';

export type NexusOrbitLayer = 'cycle' | 'modules' | 'structural';
export type NexusNodeTone = 'gold' | 'cyan' | 'violet' | 'amber';

export interface NexusSphereNode {
  index: string;
  title: string;
  en: string;
  detail: string;
  page: Page;
  action: string;
  latDeg: number;
  lonDeg: number;
  tone: NexusNodeTone;
  categoryBadge: string;
  checkpoints: readonly string[];
}

export interface NexusProjectedNode {
  leftPct: number;
  topPct: number;
  svgX: number;
  svgY: number;
  surfaceSvgX: number;
  surfaceSvgY: number;
  depthZ: number;
  scale: number;
  opacity: number;
  isFront: boolean;
}

export const NEXUS_ORBIT_LAYERS: readonly {
  id: NexusOrbitLayer;
  code: string;
  label: string;
  subtitle: string;
  tone: 'gold' | 'cyan' | 'violet';
}[] = [
    {
      id: 'cycle',
      code: 'ORBIT 01',
      label: '5단계 안전지능 순환',
      subtitle: 'Q1–Q5 자기규율 위험성평가 코어 루프',
      tone: 'gold',
    },
    {
      id: 'modules',
      code: 'ORBIT 02',
      label: '6대 핵심기능 궤도',
      subtitle: '본사 주도 · 현장 실행 · AI 분석 · 재발방지',
      tone: 'cyan',
    },
    {
      id: 'structural',
      code: 'ORBIT 03',
      label: '골조·형틀·지하RC 10대 공정',
      subtitle: '지하 RC 별도 관리 및 상부 골조·형틀 중점 포인트',
      tone: 'violet',
    },
  ];

export const NEXUS_SPHERE_NODES_BY_LAYER: Record<NexusOrbitLayer, readonly NexusSphereNode[]> = {
  cycle: [
    {
      index: '01',
      title: '위험작업',
      en: 'RISK IDENTIFICATION',
      detail: '근로자가 가장 위험하다고 느끼는 작업을 직접 기록합니다. 개인의 위험 인식과 현장에서 확정된 위험은 구별합니다.',
      page: 'ocr-analysis',
      action: '위험성평가 원본 확인',
      latDeg: 28,
      lonDeg: -52,
      tone: 'gold',
      categoryBadge: 'Q1 · 현장 위험인지',
      checkpoints: [
        '작업 전 근로자 자필 위험작업 도출 및 원문 보존',
        '개인 체감 위험과 현장 관리자 확정 위험의 분리 기록',
        '공종·구간별 반복 제출 위험작업 신호 집계',
      ],
    },
    {
      index: '02',
      title: '위험요소',
      en: 'HAZARD SIGNAL',
      detail: '추락·끼임·감전 등 위험요소를 분석합니다. AI 해석은 관리자 원본 대조와 검토를 거친 후 활용합니다.',
      page: 'ocr-analysis',
      action: '위험요소 분석 열기',
      latDeg: 30,
      lonDeg: 50,
      tone: 'cyan',
      categoryBadge: 'Q2 · AI 위험요소 구조화',
      checkpoints: [
        '추락·붕괴·낙하·협착 등 골조 핵심 위험원 분류',
        '다국어 자필 원문과 한국어 번역의 관리자 대조 확인',
        '유사 사고사례 및 공정별 중점 점검 포인트 연결',
      ],
    },
    {
      index: '03',
      title: '자가평가',
      en: 'SELF-ASSESSMENT',
      detail: '근로자가 선택한 상·중·하와 그 이유를 살핍니다. 근로자 자가평가를 현장 위험의 최종 판정으로 표시하지 않습니다.',
      page: 'predictive-analysis',
      action: '위험신호 분석 열기',
      latDeg: -2,
      lonDeg: 72,
      tone: 'amber',
      categoryBadge: 'Q3 · 체감 위험도 진단',
      checkpoints: [
        '근로자 자가평가(상·중·하) 분포와 미분류 기록 분리 확인',
        '현장 실제 위험도 대비 근로자 체감 격차(Risk Gap) 점검',
        '고위험 체감 작업팀 대상 선제적 안전교육·현장 코칭 연결',
      ],
    },
    {
      index: '04',
      title: '안전조치',
      en: 'PROTECTIVE ACTION',
      detail: '즉시 조치가 어려운 경우에도 미해결 상태를 유지합니다. 임시 보호조치·담당·목표일·재점검 등 확인이 필요합니다.',
      page: 'safety-behavior-management',
      action: '안전조치 현황 열기',
      latDeg: -32,
      lonDeg: 42,
      tone: 'gold',
      categoryBadge: 'Q4 · 보호조치·재점검',
      checkpoints: [
        '미완료·기한초과·임시통제 상태의 투명한 분리 추적',
        '담당자·목표기한 지정 및 조치 전·후 사진 증빙 대조',
        '교대·인계 시 미해결 위험요인 누락 방지',
      ],
    },
    {
      index: '05',
      title: '실천약속',
      en: 'BEHAVIOR COMMITMENT',
      detail: '근로자 스스로 작성한 실천 약속을 교육과 재확인으로 이어갑니다. 교육 실시와 실제 개선 완료는 구분합니다.',
      page: 'education-return',
      action: '교육 환류 열기',
      latDeg: -30,
      lonDeg: -48,
      tone: 'cyan',
      categoryBadge: 'Q5 · 교육 환류·실천확인',
      checkpoints: [
        '근로자 모국어 보호 안내 전달 및 본인 확인 서명',
        '교육 전달 기록과 현장 실제 실천 관찰·재점검의 분리',
        '재확인 기한초과 항목의 다음 주기 교육·점검 환류',
      ],
    },
  ],
  modules: [
    {
      index: '01',
      title: '행선지·현장점검',
      en: 'PRE-VISIT & FIELD AUDIT',
      detail: '본사 순회점검 방문 일정·목적을 등록하고, 방문 전 해당 현장의 미해결·기한초과 위험 브리핑과 현장 사진점검·이행 추적을 연결합니다.',
      page: 'safety-inspector',
      action: '현장 사진점검 열기',
      latDeg: 32,
      lonDeg: -55,
      tone: 'cyan',
      categoryBadge: '기존 확장 · 본사 순회점검',
      checkpoints: [
        '방문 일정·대상 현장·중점 점검 공종 사전 등록',
        '방문 전 미해결·기한초과 위험 및 유사 사고사례 자동 브리핑',
        '현장 점검 사진 기록 및 시정조치 이행 추적 연결',
      ],
    },
    {
      index: '02',
      title: '사고사례 데이터 DB',
      en: 'INCIDENT KNOWLEDGE BASE',
      detail: '기초·지하 RC·지상 구간과 골조·형틀 공종별 사고·아차사고를 3축(구간×공종×가설·장비)으로 표준화하여 축적하고 유사사례를 탐색합니다.',
      page: 'site-issue-management',
      action: '사고·이슈 현황 열기',
      latDeg: 34,
      lonDeg: 25,
      tone: 'amber',
      categoryBadge: '신규·고도화 · 3축 사례 DB',
      checkpoints: [
        '기초·지하 RC·지상 구간 및 골조·형틀 세부공종별 표준 축적',
        '사고 유형·직접/근본원인·재발방지대책 구조화',
        '현장 사진점검 및 교육자료 제작 시 유사사례 즉시 호출',
      ],
    },
    {
      index: '03',
      title: 'AI 사진점검',
      en: 'AI PHOTO HAZARD ANALYSIS',
      detail: '현장 사진 기반으로 골조·형틀 위험요인을 탐지하고, 관련 안전기준 참고안·시정조치 초안·유사 사고사례를 함께 제안합니다.',
      page: 'safety-inspector',
      action: 'AI 사진점검 시작',
      latDeg: 4,
      lonDeg: 68,
      tone: 'gold',
      categoryBadge: '기존 확장 · AI 비전 위험분석',
      checkpoints: [
        '사진 1장으로 골조·형틀·지하 RC 3축 태그 및 위험요인 초안 도출',
        '관련 안전기준 참고 안내 및 구체적 시정조치 문구 제안',
        '관리자 검토·확정을 통한 오판 방지 및 30초 현장 입력 구현',
      ],
    },
    {
      index: '04',
      title: '대표이사 안전교육',
      en: 'EXECUTIVE MULTILINGUAL TRAINING',
      detail: '본사·대표이사 중점 안전교육 자료를 제작하고, 사고사례·현장 위험을 반영해 12개 국어 모국어 안내·음성·서명으로 전 현장에 배포합니다.',
      page: 'admin-training',
      action: '대표이사 안전교육 관리',
      latDeg: -28,
      lonDeg: 52,
      tone: 'amber',
      categoryBadge: '신규·고도화 · 12개국어 전파',
      checkpoints: [
        '본사 표준·대표이사 중점 골조·형틀 교육자료 제작·승인',
        '외국인 작업팀 대상 12개 국어 번역·음성 안내 자동 변환',
        '현장별·팀별 교육 이수 및 본인 확인 서명 실시간 집계',
      ],
    },
    {
      index: '05',
      title: 'AI 사고조사·원인분석',
      en: 'AI ROOT-CAUSE INVESTIGATION',
      detail: '사고·아차사고 접수 시 6하원칙·시계열 분석과 직접원인·기여요인·근본원인 구조화 초안을 생성하고 본사 승인 후 전 현장에 전파합니다.',
      page: 'site-issue-management',
      action: '사고조사·이슈 분석 열기',
      latDeg: -34,
      lonDeg: -18,
      tone: 'violet',
      categoryBadge: '신규·고도화 · 본사 승인 환류',
      checkpoints: [
        '6하원칙·시계열 기반 사고 경위 정리 및 원인 트리 초안 생성',
        '직접원인 · 기여요인 · 근본원인 3단계 구조화',
        '본사 검토·승인 후 사고사례 DB 편입 및 전 현장 교육 환류',
      ],
    },
    {
      index: '06',
      title: '조치·재점검·인계',
      en: 'CLOSURE & SHIFT HANDOVER',
      detail: '시정조치부터 재점검 확인, 교대·인계 업무 기록, 변경이력 감사 추적까지 하나의 사건 흐름으로 닫아 미해결 위험 방치를 차단합니다.',
      page: 'safety-behavior-management',
      action: '안전조치·재점검 열기',
      latDeg: -4,
      lonDeg: -68,
      tone: 'cyan',
      categoryBadge: '기존 확장 · 폐루프 종결·인계',
      checkpoints: [
        '기한 초과 · 미해결 · 재점검 기한 초과 상태 실시간 분리 감시',
        '교대·인계 시 미종결 위험사항 및 임시 통제 구간 명확화',
        '변경이력 보존 및 관리용 점검·조치 보고서 자동 생성',
      ],
    },
  ],
  structural: [
    {
      index: '01',
      title: '지하 RC구조물',
      en: 'SUBSTRUCTURE RC · 전용 관리',
      detail: '지하층 형틀·지지체 안전성, 지하외벽 부력·측압 대응, 수직이동·개구부 추락, 밀폐공간 유해가스·환기, 방수·타설 안전을 별도 집중 관리합니다.',
      page: 'safety-inspector',
      action: '지하 RC 사진점검 열기',
      latDeg: -36,
      lonDeg: 0,
      tone: 'violet',
      categoryBadge: '지하 RC 별도 관리 영역',
      checkpoints: [
        '지하층 층고·슬래브 두께별 형틀·지지체(동바리) 구조 안전성',
        '지하외벽 측압·지하수 부력 대응 및 흙막이 가시설 변위 확인',
        '지하 개구부·수직이동 통로 추락 방지 및 밀폐구간 환기·가스 측정',
      ],
    },
    {
      index: '02',
      title: '형틀공정',
      en: 'FORMWORK CORE · 전 구간 핵심',
      detail: '골조 전 구간의 핵심 공정으로 형틀 설치·해체 전 구조검토, 지지체 안전, 개구부·단부 추락방지, 작업동선·자재적치를 통합 관리합니다.',
      page: 'safety-inspector',
      action: '형틀공정 사진점검 열기',
      latDeg: 14,
      lonDeg: -64,
      tone: 'cyan',
      categoryBadge: '형틀공정 · 골조 전 구간 핵심',
      checkpoints: [
        '거푸집 조립·해체 순서 준수 및 긴결재(폼타이)·지지체 고정 상태',
        '슬래브 단부·엘리베이터 피트·계단실 개구부 안전난간·덮개',
        '형틀 자재 인양·적치 하중 분산 및 작업자 이동동선 확보',
      ],
    },
    {
      index: '03',
      title: '갱폼 인상·해체',
      en: 'GANG FORM OPERATION',
      detail: '외벽 갱폼 인상·해체 시 추락·낙하물·협착 위험을 예방하기 위해 인양 고리·앵커볼트 체결 상태와 작업발판·케이지를 중점 점검합니다.',
      page: 'safety-inspector',
      action: '갱폼 점검 화면 열기',
      latDeg: 38,
      lonDeg: -32,
      tone: 'gold',
      categoryBadge: '상부 골조 · 추락·낙하·협착',
      checkpoints: [
        '타워크레인 인양 전 고정 볼트 해체 순서 및 인양 고리 사전 확인',
        '갱폼 작업발판·안전난간·수직보호망 탈락 및 개구부 방호',
        '강풍 등 악천후 시 인상 작업 중지 및 하부 출입통제',
      ],
    },
    {
      index: '04',
      title: 'AL폼 설치·해체',
      en: 'AL-FORM ASSEMBLY & STRIPPING',
      detail: '알루미늄폼 조립·해체 중 패널 낙하물·협착·붕괴 위험을 막기 위해 핀·웨지핀 체결, 서포트 존치 및 해체 순서를 집중 관리합니다.',
      page: 'safety-inspector',
      action: 'AL폼 점검 화면 열기',
      latDeg: 38,
      lonDeg: 32,
      tone: 'gold',
      categoryBadge: '상부 골조 · 낙하물·협착·붕괴',
      checkpoints: [
        '데크·월 패널 핀 체결 누락 방지 및 보조 서포트 수직도 유지',
        '해체 시 잔류 서포트 유지 및 패널 상부 투하·방치 금지',
        '해체 구간 하부 접근통제 및 안전모·안전화·보호구 착용',
      ],
    },
    {
      index: '05',
      title: '철근배근',
      en: 'REBAR PLACEMENT',
      detail: '벽체·기둥·슬래브 철근 조립 시 끼임·낙하·철근망 전도 사고를 예방하기 위해 전도방지 버팀대와 이동통로·찔림 방호를 점검합니다.',
      page: 'safety-checks',
      action: '공정 안전점검 열기',
      latDeg: 14,
      lonDeg: 64,
      tone: 'gold',
      categoryBadge: '상부 골조 · 끼임·낙하·전도',
      checkpoints: [
        '장대 기둥·벽체 철근망 전도 방지용 임시 버팀대·가새 설치',
        '철근 다발 양중·하역 시 줄걸이 결속 및 협착 방지',
        '돌출 철근 캡 씌우기 및 슬래브 상부 안전 통로 확보',
      ],
    },
    {
      index: '06',
      title: '콘크리트 타설',
      en: 'CONCRETE POURING',
      detail: '타설 중 거푸집·동바리 변형 감시와 펌프카 아웃트리거·배관·호스 요동에 의한 끼임·비산·협착 위험을 실시간 관리합니다.',
      page: 'safety-checks',
      action: '타설 안전점검 열기',
      latDeg: -12,
      lonDeg: 70,
      tone: 'gold',
      categoryBadge: '상부 골조 · 끼임·비산·협착',
      checkpoints: [
        '집중 타설 방지(분산 타설) 및 하부 동바리·거푸집 배부름 감시자 배치',
        '펌프카 지반 침하·아웃트리거 최대 확장 및 붐대 회전 반경 통제',
        '엔드호스 요동 방지 로프 및 타설 작업자 안전대·보안경 착용',
      ],
    },
    {
      index: '07',
      title: '시스템동바리',
      en: 'SYSTEM SHORING',
      detail: '고층고·전이층 슬래브 지지 시스템동바리의 붕괴·도괴·전도를 예방하기 위해 구조검토서 대비 수직·수평재·가새·U헤드 체결을 점검합니다.',
      page: 'safety-checks',
      action: '동바리 안전점검 열기',
      latDeg: -34,
      lonDeg: 44,
      tone: 'cyan',
      categoryBadge: '가설·지지체 · 붕괴·도괴·전도',
      checkpoints: [
        '조립도 기준 수직재·수평재·가새 누락 여부 및 연결핀 잠금 확인',
        '상부 U헤드·하부 자키베이스 편심 방지 및 스크류 노출 길이 준수',
        '하부 지반 침하·배수 상태 및 주변 고정 구조물과의 수평연결재 확인',
      ],
    },
    {
      index: '08',
      title: '외부 시스템비계',
      en: 'EXTERNAL SYSTEM SCAFFOLD',
      detail: '외부 비계 작업 중 추락·낙하물·도괴 위험을 막기 위해 벽이음 간격, 작업발판 틈새, 안전난간 및 수직보호망 상태를 확인합니다.',
      page: 'safety-checks',
      action: '비계 안전점검 열기',
      latDeg: -34,
      lonDeg: -44,
      tone: 'cyan',
      categoryBadge: '외부 가설 · 추락·낙하물',
      checkpoints: [
        '구조물 벽이음 정해진 간격 체결 및 임의 해체 절대 금지',
        '작업발판 고정·틈새 관리 및 발끝막이판·교차난간 설치',
        '자재 반입구 난간 복구 및 외측 수직보호망·낙하물방지망 결속',
      ],
    },
    {
      index: '09',
      title: '타워크레인·양중',
      en: 'TOWER CRANE & RIGGING',
      detail: '형틀·철근 등 중량물 양중 시 낙하·협착·충돌 사고를 예방하기 위해 줄걸이 용구, 신호수 배치, 인양 경로 하부 통제를 관리합니다.',
      page: 'safety-checks',
      action: '양중 안전점검 열기',
      latDeg: -12,
      lonDeg: -70,
      tone: 'amber',
      categoryBadge: '양중·장비 · 낙하·협착·충돌',
      checkpoints: [
        '슬링벨트·샤클·와이어로프 손상 점검 및 2점 이상 균형 줄걸이',
        '전담 신호수 배치·무전 교신 체계 및 정격하중 초과 인양 금지',
        '인양물 이동 경로 하부 작업자 출입통제 및 유도 로프 사용',
      ],
    },
    {
      index: '10',
      title: '고소작업대',
      en: 'AERIAL WORK PLATFORM',
      detail: '지하·상부 고소 작업 시 추락·전도·협착(과상승) 위험을 차단하기 위해 과상승 방지봉, 아웃트리거, 작업자 안전대 체결을 점검합니다.',
      page: 'safety-checks',
      action: '고소작업대 점검 열기',
      latDeg: 18,
      lonDeg: 0,
      tone: 'amber',
      categoryBadge: '고소 장비 · 추락·전도·충돌',
      checkpoints: [
        '상부 구조물 협착 방지용 과상승 방지장치 정상 작동 확인',
        '이동 시 작업대 하강 원칙 준수 및 바닥 개구부·단차 구름방지',
        '작업대 난간 임의 개조·탑승 금지 및 안전대 고리 상시 체결',
      ],
    },
  ],
};

const DEG_TO_RAD = Math.PI / 180;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const normalizeAngleRad = (rad: number): number => {
  if (!Number.isFinite(rad)) return 0;
  let a = ((rad + Math.PI) % (Math.PI * 2));
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};

export const shortestAngleDelta = (fromRad: number, toRad: number): number =>
  normalizeAngleRad(toRad - fromRad);

export const shortestAngleStep = (currentRad: number, targetRad: number, factor: number): number => {
  const f = clamp(factor, 0, 1);
  return normalizeAngleRad(currentRad + shortestAngleDelta(currentRad, targetRad) * f);
};

export const latLonToUnitVec3 = (latDeg: number, lonDeg: number): [number, number, number] => {
  const lat = clamp(latDeg, -85, 85) * DEG_TO_RAD;
  const lon = lonDeg * DEG_TO_RAD;
  const cosLat = Math.cos(lat);
  return [
    cosLat * Math.sin(lon),
    -Math.sin(lat),
    cosLat * Math.cos(lon),
  ];
};

export const rotateVec3YawPitch = (
  v: readonly [number, number, number],
  yawRad: number,
  pitchRad: number,
): [number, number, number] => {
  const cy = Math.cos(yawRad);
  const sy = Math.sin(yawRad);
  const x1 = v[0] * cy + v[2] * sy;
  const y1 = v[1];
  const z1 = v[2] * cy - v[0] * sy;

  const cx = Math.cos(pitchRad);
  const sx = Math.sin(pitchRad);
  const y2 = y1 * cx - z1 * sx;
  const z2 = y1 * sx + z1 * cx;
  return [x1, y2, z2];
};

/**
 * Computes target yaw and pitch so that a node at (latDeg, lonDeg) rotates
 * directly into the front focal hemisphere (z > 0.85) while keeping a
 * comfortable framing angle so its surface beacon sits on the upper-right
 * or lower-right crown of the sphere, never covering the central PSI emblem.
 */
export const computeTargetAnglesForLatLon = (
  latDeg: number,
  lonDeg: number,
): { yaw: number; pitch: number } => {
  const lat = clamp(latDeg, -80, 80) * DEG_TO_RAD;
  const lon = lonDeg * DEG_TO_RAD;
  // Partial pitch compensation (-0.58 * lat) keeps rz > 0.94 (front focal hemisphere)
  // while preserving each node's natural northern/southern hemisphere separation.
  const pitchOffset = Math.abs(latDeg) < 10 ? (latDeg >= 0 ? -0.26 : 0.26) : 0;
  return {
    yaw: normalizeAngleRad(-lon),
    pitch: clamp(-lat * 0.58 + pitchOffset, -0.56, 0.56),
  };
};

export const projectNodeToStage = (
  latDeg: number,
  lonDeg: number,
  yawRad: number,
  pitchRad: number,
  options?: { isMobile?: boolean; orbitScale?: number; nodeIndex?: number; totalNodes?: number },
): NexusProjectedNode => {
  const isMobile = Boolean(options?.isMobile);
  const orbitScale = options?.orbitScale ?? 1;
  const unit = latLonToUnitVec3(latDeg, lonDeg);
  const [rx, ry, rz] = rotateVec3YawPitch(unit, yawRad, pitchRad);
  const lens = 2.95 / (2.95 - rz * 0.43);

  // Actual 3D surface beacon position on the golden sphere (in 1000x700 SVG space)
  const surfaceSvgX = Math.round(500 + rx * 175 * (lens * 0.92));
  const surfaceSvgY = Math.round(350 + ry * 175 * (lens * 0.92));

  // Natural 3D perspective projection across the stage
  const spreadX = (isMobile ? 35.5 : 37.5) * orbitScale;
  const spreadY = (isMobile ? 35.5 : 36.5) * orbitScale;
  const rawLeft = 50 + rx * spreadX * (lens * 0.94);
  let rawTop = 50 + ry * spreadY * (lens * 0.94);

  // Central PSI Emblem Sanctuary Guard:
  // If a node pill falls within the horizontal span of the central PSI wordmark,
  // keep it vertically clear (above or below the emblem) so it never covers "PSI".
  const psiHorizSpan = isMobile ? 33.5 : 24.5;
  const psiVertClearance = isMobile ? 18.5 : 15.5;
  if (Math.abs(rawLeft - 50) < psiHorizSpan && Math.abs(rawTop - 50) < psiVertClearance) {
    const hemisphereSign = Math.abs(ry) > 0.02 ? (ry >= 0 ? 1 : -1) : latDeg >= 0 ? -1 : 1;
    rawTop = 50 + hemisphereSign * psiVertClearance;
  }

  const minLeft = isMobile ? 22 : 15;
  const maxLeft = isMobile ? 78 : 85;
  const leftPct = clamp(rawLeft, minLeft, maxLeft);
  const topPct = clamp(rawTop, 15, 83);

  const depthFactor = clamp((rz + 1) * 0.5, 0, 1);
  const scale = Number((0.86 + depthFactor * 0.22).toFixed(3));
  const opacity = Number((rz >= -0.08 ? 0.82 + depthFactor * 0.18 : 0.36 + depthFactor * 0.3).toFixed(3));

  return {
    leftPct: Number(leftPct.toFixed(2)),
    topPct: Number(topPct.toFixed(2)),
    svgX: Math.round((leftPct / 100) * 1000),
    svgY: Math.round((topPct / 100) * 700),
    surfaceSvgX,
    surfaceSvgY,
    depthZ: Number(rz.toFixed(4)),
    scale,
    opacity,
    isFront: rz >= -0.05,
  };
};

export const formatSphericalCoord = (latDeg: number, lonDeg: number): string => {
  const latAbs = Math.abs(Math.round(latDeg)).toString().padStart(2, '0');
  const lonAbs = Math.abs(Math.round(lonDeg)).toString().padStart(3, '0');
  const latDir = latDeg >= 0 ? 'N' : 'S';
  const lonDir = lonDeg >= 0 ? 'E' : 'W';
  return `${latAbs}°${latDir} · ${lonAbs}°${lonDir}`;
};

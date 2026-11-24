import type { NexusManagedSite } from './nexusSiteRegistry';
import type { NexusWorkspaceAuthority } from './nexusHqCommandLoop';

export type NexusCommandTargetKind =
  | 'hq_view'
  | 'field_view'
  | 'workbench_tab'
  | 'export_pptx'
  | 'export_compliance_zip'
  | 'select_site'
  | 'sync_queue'
  | 'toggle_immersive';

export interface NexusCommandPendingCounts {
  stopWork?: number;
  equipmentPending?: number;
  investigationPending?: number;
  unackedVisits?: number;
  fieldRevision?: number;
  incompleteTraining?: number;
  offlinePending?: number;
}

export interface NexusCommandAction {
  id: string;
  label: string;
  description: string;
  badge: string;
  keywords: string;
  targetKind: NexusCommandTargetKind;
  targetValue?: string;
}

export const buildRoleScopedCommands = (params: {
  workspaceRole: NexusWorkspaceAuthority;
  managedSites: readonly NexusManagedSite[];
  query?: string;
  pendingCounts?: NexusCommandPendingCounts;
}): NexusCommandAction[] => {
  const counts = params.pendingCounts ?? {};
  const actions: NexusCommandAction[] = [];

  if (params.workspaceRole === 'hq') {
    actions.push(
      {
        id: 'hq-view-command',
        label: '① 3D 전사 지휘 구체 열기',
        description: '3D 황금 구체 · 층별 단면 미니맵 · 3축 교차 필터',
        badge: '본사 뷰',
        keywords: '3d 구체 지휘 단면도 궤도',
        targetKind: 'hq_view',
        targetValue: 'hq_command',
      },
      {
        id: 'hq-view-bi',
        label: '② 경영 브리핑 BI · 대표이사 일일 보고서',
        description: '전사 매트릭스 · 조건부 히트맵 · 1장 통합 브리핑',
        badge: '경영 BI',
        keywords: 'bi 경영 브리핑 히트맵 매트릭스 대표이사',
        targetKind: 'hq_view',
        targetValue: 'hq_bi',
      },
      {
        id: 'hq-tab-equip',
        label: '③ 건설기계 사진 검토 · CEO 보고함',
        description: '타설 펌프카 · 크레인 · 고소작업대 일괄 적합 확인',
        badge: (counts.equipmentPending ?? 0) > 0 ? `검토대기 ${counts.equipmentPending}건` : '사진 결재',
        keywords: '건설기계 사진 펌프카 크레인 일괄 적합 보완 ceo',
        targetKind: 'workbench_tab',
        targetValue: 'equipment_photo',
      },
      {
        id: 'hq-tab-stopwork',
        label: '전 현장 작업중지(Stop-Work) · 긴급 지시 관제',
        description: '전 현장 시정조치 모니터 및 본사 긴급 지시 하달',
        badge: (counts.stopWork ?? 0) > 0 ? `작업중지 ${counts.stopWork}건` : '통제 관제',
        keywords: '작업중지 긴급 지시 stopwork 시정조치',
        targetKind: 'workbench_tab',
        targetValue: 'inspect_03_06',
      },
      {
        id: 'hq-tab-inv',
        label: '05 · 02 사고조사 승인 · 사례DB 편입',
        description: '현장 6하원칙 사고조사 결재 및 보완 요청',
        badge: (counts.investigationPending ?? 0) > 0 ? `결재대기 ${counts.investigationPending}건` : '결재함',
        keywords: '사고조사 결재 승인 아차사고 사례db',
        targetKind: 'workbench_tab',
        targetValue: 'investigate_05_02',
      },
      {
        id: 'hq-tab-visit',
        label: '01 본사 순회점검 · 행선지 브리핑',
        description: '방문 전 미결 위험 자동 브리핑 및 순회 일정 등록',
        badge: (counts.unackedVisits ?? 0) > 0 ? `미접수 ${counts.unackedVisits}건` : '순회 지휘',
        keywords: '순회점검 행선지 방문 브리핑',
        targetKind: 'workbench_tab',
        targetValue: 'visit_01',
      },
      {
        id: 'hq-export-pptx',
        label: '📽️ 대표이사 안전 브리핑 PPTX 자동 생성 저장',
        description: 'KPI · 전 현장 비교표 · 건설기계 사진 갤러리 PowerPoint 1클릭 저장',
        badge: 'PPTX',
        keywords: 'pptx 파워포인트 대표이사 보고서 다운로드',
        targetKind: 'export_pptx',
      },
      {
        id: 'hq-export-zip',
        label: '📦 중대재해처벌법 증빙 패키지 ZIP 1클릭 편철',
        description: 'CSV 대장 + 사진 원본 + 자필서명 PNG + SHA-256 매니페스트',
        badge: '법적 증빙',
        keywords: 'zip 중대재해처벌법 증빙 편철 감사 다운로드',
        targetKind: 'export_compliance_zip',
      },
      {
        id: 'hq-site-all',
        label: `전사 전체 현장 보기 (${params.managedSites.length}개 현장)`,
        description: '현장 필터를 해제하고 전사 통합 범위로 전환합니다',
        badge: '전사 범위',
        keywords: '전사 전체 현장 필터 해제',
        targetKind: 'select_site',
        targetValue: '',
      },
    );

    for (const site of params.managedSites) {
      actions.push({
        id: `hq-site-${site.siteId}`,
        label: `현장 집중 보기: ${site.shortLabel}`,
        description: `${site.siteName} 범위로 본사 지휘 필터 전환`,
        badge: '현장 필터',
        keywords: `${site.siteName} ${site.shortLabel} ${site.matchTokens.join(' ')}`,
        targetKind: 'select_site',
        targetValue: site.siteId,
      });
    }
  } else {
    // Field isolated mode: strictly ONLY single-site field actions!
    actions.push(
      {
        id: 'field-tab-inspect',
        label: '⚡ 30초 현장 점검 · 작업중지 · 교대 인계 등록',
        description: '소속 현장 원탭 프리셋 · 전후 사진 비교 · 교대 인계서 복사',
        badge: (counts.stopWork ?? 0) > 0 ? `중지 ${counts.stopWork}건` : '현장 실행',
        keywords: '30초 점검 작업중지 교대 인계 시정조치 사진',
        targetKind: 'workbench_tab',
        targetValue: 'inspect_03_06',
      },
      {
        id: 'field-tab-equip',
        label: '🏗️ 건설기계 사용전 점검 사진 본사 전송 · 보완 재상신',
        description: '펌프카 · 크레인 · 고소작업대 사진 촬영 및 보완 응답',
        badge: (counts.fieldRevision ?? 0) > 0 ? `보완 ${counts.fieldRevision}건` : '장비 점검',
        keywords: '건설기계 사진 펌프카 크레인 보완 재전송',
        targetKind: 'workbench_tab',
        targetValue: 'equipment_photo',
      },
      {
        id: 'field-tab-training',
        label: '📱 12개국어 안전교육 · 현장 QR 자필 서명 키오스크',
        description: '외국인 작업팀 모국어 음성 안내 및 자필 서명 즉시 수집',
        badge: (counts.incompleteTraining ?? 0) > 0 ? `미이수 ${counts.incompleteTraining}건` : 'QR 서명',
        keywords: '12개국어 교육 qr 자필 서명 키오스크 외국인',
        targetKind: 'workbench_tab',
        targetValue: 'training_04',
      },
      {
        id: 'field-tab-visit',
        label: '📋 본사 순회점검 지시 수신 · 사전 준비 접수 확인',
        description: '본사 방문 사전 브리핑 확인 및 현장 접수 응답',
        badge: (counts.unackedVisits ?? 0) > 0 ? `미접수 ${counts.unackedVisits}건` : '본사 수신',
        keywords: '순회점검 접수 확인 본사 지시',
        targetKind: 'workbench_tab',
        targetValue: 'visit_01',
      },
      {
        id: 'field-tab-inv',
        label: '📝 내 현장 아차사고 상신 · 본사 보완 재상신',
        description: '6하원칙 사고조사 초안 상신 및 보완 응답',
        badge: '사고조사',
        keywords: '아차사고 상신 보완 재상신',
        targetKind: 'workbench_tab',
        targetValue: 'investigate_05_02',
      },
      {
        id: 'field-view-sphere',
        label: '🌐 내 현장 3D 구체 · 골조 수직 단면 탐색',
        description: '소속 현장 미결 위험 노드 및 예방 시드 확인',
        badge: '3D 구체',
        keywords: '3d 구체 단면도 예방 시드',
        targetKind: 'field_view',
        targetValue: 'field_sphere',
      },
    );
  }

  actions.push(
    {
      id: 'common-sync-queue',
      label: '🔄 지하·오프라인 미전송 큐 지금 동기화',
      description: '무통신 상태에서 누적된 현장 기록을 즉시 동기화합니다',
      badge: (counts.offlinePending ?? 0) > 0 ? `미전송 ${counts.offlinePending}건` : '동기화',
      keywords: '동기화 오프라인 큐 지하 전송',
      targetKind: 'sync_queue',
    },
    {
      id: 'common-toggle-immersive',
      label: '⤢ 전체 화면 몰입 보기 전환',
      description: '네트워크 3D 구체 및 업무 패널을 전체 화면으로 전환',
      badge: '단축키 F',
      keywords: '전체 화면 몰입 보기 fullscreen',
      targetKind: 'toggle_immersive',
    },
  );

  const normalizedQuery = String(params.query || '').trim().toLowerCase();
  if (!normalizedQuery) return actions;
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  return actions.filter(item => {
    const haystack = `${item.label} ${item.description} ${item.badge} ${item.keywords}`.toLowerCase();
    return tokens.every(tok => haystack.includes(tok));
  });
};

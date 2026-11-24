import { beforeEach, describe, expect, it } from 'vitest';
import {
  NEXUS_QUICK_FIELD_PRESETS,
  addHqDirectiveToPipelineCase,
  advanceNexusPipelineCaseStatus,
  buildShiftHandoverBriefingText,
  classifyStructuralPhotoContext,
  createNexusPipelineCase,
  readNexusPipelineCases,
  summarizePipelineForOrbitLayer,
  writeNexusPipelineCases,
} from '../utils/nexusQuickPipeline';

describe('Slice 2 · 30s Photo Inspection -> 3-Axis Auto-Classification -> Incident Match -> Handover & Sphere Feedback', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  it('auto-classifies substructure RC, gangform, and system shoring contexts into 3 axes and matches incident seeds', () => {
    expect(NEXUS_QUICK_FIELD_PRESETS).toHaveLength(6);
    const subRc = classifyStructuralPhotoContext({
      note: '지하 2층 외벽 합벽 거푸집 측압 변형 우려 및 지하 피트 개구부 환기 확인',
    });
    expect(subRc.zoneAxis).toBe('substructure_rc');
    expect(subRc.hazardEquipmentAxis).toBe('confined_earth_pressure');
    expect(subRc.structuralNodeIndex).toBe('01');
    expect(subRc.primarySeed.caseCode).toBe('RC-SUB-01');
    expect(subRc.confidenceLabel).toBe('키워드·문맥 3축 매칭');

    const gangform = classifyStructuralPhotoContext({
      note: '104동 15층 외벽 갱폼 인상 전 타워크레인 인양고리 및 앵커볼트 점검',
    });
    expect(gangform.processAxis).toBe('gangform');
    expect(gangform.hazardEquipmentAxis).toBe('tower_crane_rigging');
    expect(gangform.structuralNodeIndex).toBe('03');
    expect(gangform.primarySeed.caseCode).toBe('GF-LIFT-03');

    const shoring = classifyStructuralPhotoContext({
      note: '전이층 고층고 슬래브 하부 시스템동바리 수평연결재 및 가새 핀 점검',
    });
    expect(shoring.zoneAxis).toBe('rooftop_special');
    expect(shoring.hazardEquipmentAxis).toBe('system_shoring');
    expect(shoring.structuralNodeIndex).toBe('07');
    expect(shoring.primarySeed.caseCode).toBe('SS-SHORE-07');
  });

  it('creates a pipeline case, progresses through handover -> recheck -> closed, and updates 3D sphere node summaries', () => {
    writeNexusPipelineCases([]);
    const created = createNexusPipelineCase(
      {
        locationLabel: '지하 2층 북측 외벽',
        observationNote: '지하 외벽 거푸집 타이볼트 간격 미흡 및 개구부 덮개 미고정',
        dueDate: '2026-11-10',
        handoverShift: '주간→야간 형틀팀 인계',
      },
      '2026-11-12T08:00:00Z',
    );

    expect(created.structuralNodeIndex).toBe('01');
    expect(created.matchedCaseCode).toBe('RC-SUB-01');
    expect(created.status).toBe('action_required');

    // Check 3D sphere structural layer summary as of 2026-11-15 (overdue!)
    const initialSummary = summarizePipelineForOrbitLayer('structural', [created], '2026-11-15');
    expect(initialSummary[0].nodeIndex).toBe('01');
    expect(initialSummary[0].openCases).toBe(1);
    expect(initialSummary[0].overdueCases).toBe(1);

    // Advance to handover_pending -> recheck_pending -> closed
    const afterHandover = advanceNexusPipelineCaseStatus(created.caseId, 'handover_pending');
    const handoverSummary = summarizePipelineForOrbitLayer('structural', afterHandover, '2026-11-15');
    expect(handoverSummary[0].handoverPending).toBe(1);

    const afterRecheck = advanceNexusPipelineCaseStatus(
      created.caseId,
      'recheck_pending',
      '타이볼트 보강 완료, 현장 재점검 요청',
    );
    const recheckSummary = summarizePipelineForOrbitLayer('structural', afterRecheck, '2026-11-15');
    expect(recheckSummary[0].recheckPending).toBe(1);

    const afterClosed = advanceNexusPipelineCaseStatus(
      created.caseId,
      'closed',
      '재점검 결과 타이볼트 및 개구부 덮개 고정 확인 완료',
    );
    const closedSummary = summarizePipelineForOrbitLayer('structural', afterClosed, '2026-11-15');
    expect(closedSummary[0].openCases).toBe(0);
    expect(closedSummary[0].closedCases).toBe(1);
    expect(readNexusPipelineCases()[0]?.status).toBe('closed');
    expect(readNexusPipelineCases()[0]?.auditTrail).toHaveLength(4);
  });

  it('tracks stopWorkFlag, before/after photo data URLs, and builds 5-line shift handover briefing text', () => {
    writeNexusPipelineCases([]);
    const stoppedCase = createNexusPipelineCase(
      {
        locationLabel: '지하 2층 펌프실 개구부',
        observationNote: '개구부 덮개 파손 및 난간 미설치로 즉각 작업중지',
        dueDate: '2026-11-22',
        handoverShift: '주간→야간 안전팀 인계',
        stopWorkFlag: true,
        beforePhotoDataUrl: 'data:image/jpeg;base64,BEFORE_MOCK',
      },
      '2026-11-22T09:00:00Z',
    );
    expect(stoppedCase.stopWorkFlag).toBe(true);
    expect(stoppedCase.beforePhotoDataUrl).toBe('data:image/jpeg;base64,BEFORE_MOCK');

    const handoverBrief = buildShiftHandoverBriefingText([stoppedCase], '제1현장 지하 2층 RC구간', '2026-11-22');
    expect(handoverBrief.split('\n')).toHaveLength(5);
    expect(handoverBrief).toContain('⛔ 임시통제·작업중지 (1건)');
    expect(handoverBrief).toContain('지하 2층 펌프실 개구부');

    const withAfterPhoto = advanceNexusPipelineCaseStatus(
      stoppedCase.caseId,
      'closed',
      '덮개 앵커볼트 고정 및 조치 후 사진 확인',
      '2026-11-22T11:30:00Z',
      '현장 안전관리자',
      'data:image/jpeg;base64,AFTER_MOCK',
    );
    expect(withAfterPhoto[0]?.afterPhotoDataUrl).toBe('data:image/jpeg;base64,AFTER_MOCK');
    expect(withAfterPhoto[0]?.status).toBe('closed');

    const withDirective = addHqDirectiveToPipelineCase(
      stoppedCase.caseId,
      { actorLabel: '본사 CSO', note: '개구부 주변 작업 즉시 중단 및 2인1조 재점검 사진 보고' },
      '2026-11-22T12:00:00Z',
    );
    expect(withDirective[0]?.hqDirectiveNote).toContain('2인1조 재점검');
    expect(withDirective[0]?.hqDirectiveActor).toBe('본사 CSO');
    expect(withDirective[0]?.auditTrail?.some(a => a.note.includes('[본사 지시]'))).toBe(true);
  });
});

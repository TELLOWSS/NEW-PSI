import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Page, WorkerRecord } from '../types';
import {
  buildConnectedPageDecisionBrief,
} from '../utils/psiPageDecisionBrief';
import { seedMultiSiteOperationalSimulation } from '../utils/nexusHqCommandLoop';
import {
  applyMotionPaused,
  applySunlightMode,
  getMotionPaused,
  getSunlightMode,
  setMotionPaused,
  setSunlightMode,
  setTheme,
} from '../utils/themeUtils';

const sampleWorkerRecords: WorkerRecord[] = [
  {
    id: 'w-1',
    name: '김안전',
    jobField: '형틀·갱폼',
    date: '2026-11-25',
    nationality: '한국',
    language: 'ko',
    handwrittenAnswers: [],
    fullText: '개구부 덮개 고정 상태 확인',
    koreanTranslation: '개구부 덮개 고정 상태 확인',
    safetyScore: 62,
    safetyLevel: '초급',
    strengths: [],
    strengths_native: [],
    weakAreas: ['추락 방호 미흡'],
    weakAreas_native: [],
    improvement: '안전고리 2중 체결',
    improvement_native: '',
    suggestions: [],
    suggestions_native: [],
    aiInsights: '개구부 덮개 확인 필요',
    aiInsights_native: '',
    selfAssessedRiskLevel: '상',
    ocrStatus: 'OCR_REQUIRED',
  },
  {
    id: 'w-2',
    name: 'NGUYEN VAN A',
    jobField: '철근·콘크리트',
    date: '2026-11-25',
    nationality: '베트남',
    language: 'vi',
    handwrittenAnswers: [],
    fullText: '타설 전 펌프카 아웃트리거 점검',
    koreanTranslation: '타설 전 펌프카 아웃트리거 점검',
    safetyScore: 88,
    safetyLevel: '고급',
    strengths: ['작업 전 점검 충실'],
    strengths_native: [],
    weakAreas: [],
    weakAreas_native: [],
    improvement: '',
    improvement_native: '',
    suggestions: [],
    suggestions_native: [],
    aiInsights: '양호',
    aiInsights_native: '',
    selfAssessedRiskLevel: '하',
    ocrStatus: 'TEXT_READY',
  },
];

describe('Connected Subpages Decision-First Brief & Global Sunlight Mode', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    const classes = new Set<string>();
    const rootElement = {
      dataset: {} as Record<string, string>,
      style: { colorScheme: '' },
      classList: {
        add: (token: string) => classes.add(token),
        remove: (token: string) => classes.delete(token),
        contains: (token: string) => classes.has(token),
      },
    };
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    });
    vi.stubGlobal('document', { documentElement: rootElement });
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });
    setTheme('light');
    setSunlightMode(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('synchronizes sunlight mode with light/dark global theme transitions cleanly', () => {
    expect(getSunlightMode()).toBe(false);
    setTheme('dark');
    expect(setSunlightMode(true)).toBe(true);
    expect(document.documentElement.dataset.psiSunlight).toBe('true');
    expect(document.documentElement.dataset.themeResolved).toBe('light');

    setTheme('dark');
    expect(getSunlightMode()).toBe(false);
    expect(document.documentElement.dataset.psiSunlight).toBe('false');

    applySunlightMode(false);
  });

  it('builds tailored 4-stage Decision-First briefs across all connected PSI subpages without developer jargon', () => {
    const seeded = seedMultiSiteOperationalSimulation('2026-11-25T09:00:00Z');
    const pages: Page[] = [
      'dashboard',
      'ocr-analysis',
      'safety-inspector',
      'education-return',
      'site-issue-management',
      'monthly-guidance-report',
      'worker-management',
      'predictive-analysis',
      'performance-analysis',
      'reports',
      'settings',
    ];
    const forbidden = [
      'harness',
      'workflow',
      'payload',
      'Supabase',
      'SLICE',
      '하네스',
      '워크플로우',
      '페이로드',
      '수파베이스',
      '미전송 큐',
      '커맨드 팔레트',
    ];

    for (const page of pages) {
      const vm = buildConnectedPageDecisionBrief({
        page,
        authority: 'hq',
        persona: 'executive',
        workerRecords: sampleWorkerRecords,
        safetyCheckRecords: [],
        pipelineCases: seeded.cases,
        equipmentReports: seeded.equipmentReports,
        trainingCampaigns: seeded.campaigns,
        visitPlans: seeded.visits,
        investigations: seeded.investigations,
        offlinePendingCount: 1,
      });

      expect(vm.soWhatHeadline.length).toBeGreaterThan(8);
      expect(vm.whyReasons.length).toBeGreaterThanOrEqual(1);
      expect(vm.howActions.length).toBe(3);
      expect(vm.outcomeMetrics).toHaveLength(3);
      expect(vm.openActionCount).toBeGreaterThanOrEqual(0);
      for (const metric of vm.outcomeMetrics) {
        expect(Number.isFinite(metric.numericValue)).toBe(true);
        expect(metric.deltaBadge.length).toBeGreaterThan(0);
        expect(metric.trendPoints).toHaveLength(6);
        for (const pt of metric.trendPoints) {
          expect(pt).toBeGreaterThanOrEqual(0);
          expect(pt).toBeLessThanOrEqual(100);
        }
      }

      const text = `${vm.soWhatHeadline} ${vm.soWhatSubline} ${vm.whyReasons.map(r => `${r.tag} ${r.summary}`).join(' ')} ${vm.howActions.map(a => a.label).join(' ')} ${vm.outcomeProofLine}`;
      for (const word of forbidden) {
        expect(text).not.toContain(word);
      }
    }
  });

  it('clamps field authority away from executive persona on connected pages', () => {
    const seeded = seedMultiSiteOperationalSimulation('2026-11-25T09:00:00Z');
    const vm = buildConnectedPageDecisionBrief({
      page: 'ocr-analysis',
      authority: 'field',
      persona: 'executive',
      siteScopeLabel: '제1현장 · 지하 2층 RC',
      workerRecords: sampleWorkerRecords,
      safetyCheckRecords: [],
      pipelineCases: seeded.cases,
      equipmentReports: seeded.equipmentReports,
      trainingCampaigns: seeded.campaigns,
      visitPlans: seeded.visits,
      investigations: seeded.investigations,
      offlinePendingCount: 0,
    });

    expect(vm.persona).toBe('field_manager');
    expect(vm.scopeLabel).toBe('제1현장 · 지하 2층 RC');
  });

  it('defaults global kinetic motion to auto-play and toggles pause state synchronously', () => {
    expect(getMotionPaused()).toBe(false);
    expect(setMotionPaused(true)).toBe(true);
    expect(getMotionPaused()).toBe(true);
    expect(document.documentElement.dataset.psiMotionPaused).toBe('true');

    expect(setMotionPaused(false)).toBe(false);
    expect(document.documentElement.dataset.psiMotionPaused).toBe('false');
    applyMotionPaused(false);
  });
});

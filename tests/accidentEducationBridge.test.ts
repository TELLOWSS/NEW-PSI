import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { AccidentBigDataRecord } from '../types';
import type { AccidentCrossLinkAlert } from '../utils/accidentBigData';
import {
  ACCIDENT_EDUCATION_HANDOFF_KEY,
  buildAccidentEducationHandoffFromAlert,
  buildAccidentEducationHandoffFromRecord,
  clearAccidentEducationHandoff,
  readAccidentEducationHandoff,
  saveAccidentEducationHandoff,
} from '../utils/accidentEducationBridge';

const sampleRecord: AccidentBigDataRecord = {
  id: 'acc-101',
  sourceContractor: '원도급A건설',
  siteName: '2공구 아파트',
  occurredDate: '2026-11-15',
  timeSlot: '오전',
  jobField: 'AL폼',
  workStage: '해체·탈형',
  workTask: 'AL폼 핀 해체 작업',
  hazardType: '추락',
  severity: '중상(장기·입원)',
  causingAgent: '작업발판·고소작업',
  summary: 'AL폼 벽체 패널 해체 중 작업발판 단부에서 추락',
  directCause: '안전대 고리 미체결',
  rootCause: '단부 안전난간 해체 후 구명줄 미설치',
  preventionMeasure: '해체 작업 전 친수구명줄 설치 및 2인 1조 안전대 체결 확인',
  preWorkCheckpoints: ['안전대 체결 상태 확인', '하부 출입통제 구역 설정'],
  educationKeywords: ['AL폼', '추락'],
  sourceAiProvider: 'gemini',
  sourceFormatNote: 'json',
  piiMasked: true,
  importedAt: '2026-11-20T09:00:00.000Z',
  fingerprint: 'fp-101',
};

describe('accidentEducationBridge', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    });
  });

  it('builds educational handoff from a single accident record with trade and risk hint', () => {
    const handoff = buildAccidentEducationHandoffFromRecord(sampleRecord);

    expect(handoff.workType).toBe('AL폼');
    expect(handoff.accidentCases).toHaveLength(1);
    expect(handoff.accidentCases[0].id).toBe('bigdata-acc-101');
    expect(handoff.accidentCases[0].lesson).toContain('친수구명줄');
    expect(handoff.evidenceSource.title).toContain('AL폼');
    expect(handoff.evidenceSource.text).toContain('AL폼 벽체 패널 해체');
    expect(handoff.riskHint).toEqual({
      risk: '추락',
      action: '해체 작업 전 친수구명줄 설치 및 2인 1조 안전대 체결 확인',
    });
  });

  it('builds educational handoff from a cross-link alert prioritizing matching severe records', () => {
    const alert: AccidentCrossLinkAlert = {
      jobField: 'AL폼',
      accidentCount: 3,
      severeCount: 1,
      workerCount: 18,
      avgSafetyScore: 76,
      beginnerCount: 4,
      topHazard: '추락',
      checkpoints: ['안전난간 확인', '작업중지 기준 숙지'],
      reasonSummary: 'AL폼 공종 추락 사례 집중',
    };

    const handoff = buildAccidentEducationHandoffFromAlert(alert, [sampleRecord]);
    expect(handoff.workType).toBe('AL폼');
    expect(handoff.accidentCases).toHaveLength(1);
    expect(handoff.evidenceSource.title).toContain('AL폼');
    expect(handoff.riskHint?.risk).toBe('추락');
  });

  it('persists, reads, and clears handoff payload via localStorage safely', () => {
    const handoff = buildAccidentEducationHandoffFromRecord(sampleRecord);
    saveAccidentEducationHandoff(handoff);

    expect(storage.has(ACCIDENT_EDUCATION_HANDOFF_KEY)).toBe(true);
    const loaded = readAccidentEducationHandoff();
    expect(loaded?.id).toBe(handoff.id);
    expect(loaded?.workType).toBe('AL폼');

    clearAccidentEducationHandoff();
    expect(readAccidentEducationHandoff()).toBeNull();
  });
});

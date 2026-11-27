import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendLocalSafetyObservations,
  extractClosureLoopCounts,
  isValidUuid,
  LOCAL_SAFETY_OBSERVATIONS_STORAGE_KEY,
  normalizeCoachingActionType,
  readLocalSafetyObservations,
  resolveServerWorkerUuid,
} from '../utils/safetyClosureLoopHelper';

describe('safetyClosureLoopHelper', () => {
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

  it('validates and resolves server worker UUIDs before falling back cleanly', () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(isValidUuid(validUuid)).toBe(true);
    expect(isValidUuid('psi-1732000-0-abc')).toBe(false);

    expect(resolveServerWorkerUuid({ id: 'psi-1', worker_uuid: validUuid })).toBe(validUuid);
    expect(resolveServerWorkerUuid({ id: 'psi-1', workerUuid: validUuid })).toBe(validUuid);
    expect(resolveServerWorkerUuid({ id: validUuid })).toBe(validUuid);
    expect(resolveServerWorkerUuid({ id: 'psi-local-only' })).toBeNull();
  });

  it('normalizes preset coaching labels into DB-allowed CHECK values with detail prefix', () => {
    expect(normalizeCoachingActionType('안전조회 특별교육', '아침 TBM 재설명')).toEqual({
      actionType: '재교육',
      actionDetail: '[안전조회 특별교육] 아침 TBM 재설명',
    });
    expect(normalizeCoachingActionType('서면경고', '')).toEqual({
      actionType: '기타',
      actionDetail: '[서면경고]',
    });
    expect(normalizeCoachingActionType('작업중지', '단부 난간 보강 후 재개')).toEqual({
      actionType: '작업중지',
      actionDetail: '단부 난간 보강 후 재개',
    });
  });

  it('unwraps nested API data counts as well as flat payloads', () => {
    expect(
      extractClosureLoopCounts({
        ok: true,
        action: 'record-safety-closure-loop',
        data: { inserted_observations: 3, inserted_coaching: 2 },
      }),
    ).toEqual({ insertedObservations: 3, insertedCoaching: 2 });

    expect(
      extractClosureLoopCounts({
        ok: true,
        inserted_observations: 1,
        inserted_coaching: 0,
      }),
    ).toEqual({ insertedObservations: 1, insertedCoaching: 0 });
  });

  it('persists local safety observations when server UUID or auth is absent', () => {
    appendLocalSafetyObservations([
      {
        worker_id: 'psi-local-1',
        worker_name: '김안전',
        assessment_month: '2026-11',
        observed_at: '2026-11-27T05:00:00.000Z',
        unsafe_behavior_flag: true,
        unsafe_behavior_type: '안전대 미체결',
        severity_level: '높음',
        action_type: '재교육',
        action_detail: '[안전조회 특별교육]',
      },
    ]);

    expect(storage.has(LOCAL_SAFETY_OBSERVATIONS_STORAGE_KEY)).toBe(true);
    const loaded = readLocalSafetyObservations();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].worker_name).toBe('김안전');
    expect(loaded[0].action_type).toBe('재교육');
  });
});

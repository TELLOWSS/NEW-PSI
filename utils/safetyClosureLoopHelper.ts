import type { WorkerRecord } from '../types';

export const LOCAL_SAFETY_OBSERVATIONS_STORAGE_KEY = 'psi_local_safety_observations_v1';

export const ALLOWED_COACHING_ACTION_TYPES = [
  '재교육',
  '현장코칭',
  '작업중지',
  '보호구개선',
  '기타',
] as const;

export type AllowedCoachingActionType = (typeof ALLOWED_COACHING_ACTION_TYPES)[number];

export interface LocalSafetyObservationRecord {
  id: string;
  worker_id: string;
  worker_name?: string;
  assessment_month: string;
  observed_at: string;
  observer_name?: string;
  unsafe_behavior_flag: boolean;
  unsafe_behavior_type: string;
  severity_level: string;
  evidence_note?: string;
  action_type?: AllowedCoachingActionType;
  action_detail?: string;
  coach_name?: string;
  followup_result?: string;
  saved_locally_at: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

export function resolveServerWorkerUuid(
  record?: Pick<WorkerRecord, 'id' | 'worker_uuid' | 'workerUuid'> | null,
): string | null {
  if (!record) return null;
  const candidates = [record.worker_uuid, record.workerUuid, record.id];
  for (const candidate of candidates) {
    if (isValidUuid(candidate)) {
      return String(candidate).trim();
    }
  }
  return null;
}

const prefixActionDetail = (tag: string, detail?: string): string => {
  const trimmed = String(detail ?? '').trim();
  if (!trimmed) return tag;
  return trimmed.startsWith(tag) ? trimmed : `${tag} ${trimmed}`;
};

export function normalizeCoachingActionType(
  raw: string | null | undefined,
  detail?: string,
): { actionType?: AllowedCoachingActionType; actionDetail?: string } {
  const trimmed = String(raw ?? '').trim();
  const trimmedDetail = String(detail ?? '').trim() || undefined;
  if (!trimmed) {
    return { actionType: undefined, actionDetail: trimmedDetail };
  }
  if (trimmed === '안전조회 특별교육') {
    return {
      actionType: '재교육',
      actionDetail: prefixActionDetail('[안전조회 특별교육]', trimmedDetail),
    };
  }
  if (trimmed === '서면경고') {
    return {
      actionType: '기타',
      actionDetail: prefixActionDetail('[서면경고]', trimmedDetail),
    };
  }
  if ((ALLOWED_COACHING_ACTION_TYPES as readonly string[]).includes(trimmed)) {
    return {
      actionType: trimmed as AllowedCoachingActionType,
      actionDetail: trimmedDetail,
    };
  }
  return {
    actionType: '기타',
    actionDetail: prefixActionDetail(`[${trimmed}]`, trimmedDetail),
  };
}

export function extractClosureLoopCounts(response: unknown): {
  insertedObservations: number;
  insertedCoaching: number;
} {
  const root =
    response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
  const nested =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : null;
  const source = nested ?? root;
  return {
    insertedObservations: Number(source.inserted_observations ?? root.inserted_observations ?? 0) || 0,
    insertedCoaching: Number(source.inserted_coaching ?? root.inserted_coaching ?? 0) || 0,
  };
}

export function readLocalSafetyObservations(): LocalSafetyObservationRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_SAFETY_OBSERVATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LocalSafetyObservationRecord[]) : [];
  } catch {
    return [];
  }
}

export function appendLocalSafetyObservations(
  records: ReadonlyArray<Omit<LocalSafetyObservationRecord, 'id' | 'saved_locally_at'>>,
): LocalSafetyObservationRecord[] {
  const now = new Date().toISOString();
  const nextEntries: LocalSafetyObservationRecord[] = records.map((item, idx) => ({
    ...item,
    id: `local-obs-${Date.now()}-${idx}`,
    saved_locally_at: now,
  }));
  const merged = [...nextEntries, ...readLocalSafetyObservations()].slice(0, 300);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LOCAL_SAFETY_OBSERVATIONS_STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // Ignore storage quota errors
    }
  }
  return nextEntries;
}

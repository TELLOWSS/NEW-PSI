export const NEXUS_OFFLINE_QUEUE_STORAGE_KEY = 'psi_nexus_offline_sync_queue_v1';
export const NEXUS_OFFLINE_QUEUE_UPDATED_EVENT = 'psi-nexus-offline-queue-updated';

export type NexusOfflineMutationKind =
  | 'pipeline_case'
  | 'equipment_photo'
  | 'visit_ack'
  | 'training_signature';

export type NexusOfflineQueueStatus = 'pending' | 'synced' | 'failed' | 'conflict';

export interface NexusOfflineMutationEntry {
  queueId: string;
  kind: NexusOfflineMutationKind;
  siteId?: string;
  recordId: string;
  summary: string;
  queuedAt: string;
  syncedAt?: string;
  status: NexusOfflineQueueStatus;
  attempts: number;
  lastError?: string;
}

export interface NexusOfflineSyncConflict {
  conflictId: string;
  queueId: string;
  kind: NexusOfflineMutationKind;
  siteId?: string;
  recordId: string;
  title: string;
  localSummary: string;
  localUpdatedAt: string;
  hqSummary: string;
  hqUpdatedAt: string;
  hqActor: string;
}

export type NexusConflictResolutionChoice = 'keep_local' | 'accept_hq' | 'merge_both';

export interface NexusSyncServerSnapshot {
  pipelineCases?: readonly {
    caseId: string;
    siteId?: string;
    locationLabel?: string;
    hqDirectiveNote?: string;
    updatedAt?: string;
    status?: string;
  }[];
  equipmentReports?: readonly {
    reportId: string;
    siteId?: string;
    workActivity?: string;
    status?: string;
    hqReviewNote?: string;
    hqReviewer?: string;
    hqReviewedAt?: string;
  }[];
}

let memoryOfflineQueue: NexusOfflineMutationEntry[] = [];

const emitOfflineQueueUpdated = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(NEXUS_OFFLINE_QUEUE_UPDATED_EVENT));
  }
};

export const isNexusOnline = (): boolean => {
  if (typeof navigator === 'undefined') return true;
  if (typeof navigator.onLine !== 'boolean') return true;
  return navigator.onLine;
};

export const readNexusOfflineQueue = (): NexusOfflineMutationEntry[] => {
  if (typeof window === 'undefined' || !window.localStorage) return [...memoryOfflineQueue];
  try {
    const raw = window.localStorage.getItem(NEXUS_OFFLINE_QUEUE_STORAGE_KEY);
    if (!raw) return [...memoryOfflineQueue];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryOfflineQueue = parsed;
      return [...parsed];
    }
    return [...memoryOfflineQueue];
  } catch {
    return [...memoryOfflineQueue];
  }
};

let flushInFlightPromise: Promise<{
  flushedCount: number;
  failedCount: number;
  remainingPendingCount: number;
  queue: NexusOfflineMutationEntry[];
}> | null = null;

export const writeNexusOfflineQueue = (entries: readonly NexusOfflineMutationEntry[]): boolean => {
  const truncated = entries.length > 200;
  memoryOfflineQueue = [...entries].slice(0, 200);
  if (truncated && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('psi-nexus-offline-queue-quota', { detail: { truncated: true, kept: 200 } }));
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(NEXUS_OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(memoryOfflineQueue));
      emitOfflineQueueUpdated();
      return true;
    } catch (error) {
      if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(
          new CustomEvent('psi-nexus-offline-queue-quota', {
            detail: { error: error instanceof Error ? error.message : 'QuotaExceededError' },
          }),
        );
      }
      return false;
    }
  }
  return true;
};

export const enqueueNexusOfflineMutation = (
  input: {
    kind: NexusOfflineMutationKind;
    siteId?: string;
    recordId: string;
    summary: string;
  },
  nowIso = new Date().toISOString(),
): { queue: NexusOfflineMutationEntry[]; entry: NexusOfflineMutationEntry } => {
  const entry: NexusOfflineMutationEntry = {
    queueId: `NXQ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    kind: input.kind,
    siteId: input.siteId,
    recordId: String(input.recordId || '').trim(),
    summary: String(input.summary || '').trim().slice(0, 140),
    queuedAt: nowIso,
    status: 'pending',
    attempts: 0,
  };
  const current = readNexusOfflineQueue().filter(
    item => !(item.kind === entry.kind && item.recordId === entry.recordId && item.status === 'pending'),
  );
  const next = [entry, ...current].slice(0, 200);
  writeNexusOfflineQueue(next);
  return { queue: next, entry };
};

export const getPendingOfflineQueueCount = (): number =>
  readNexusOfflineQueue().filter(item => item.status !== 'synced').length;

export const clearSyncedOfflineQueue = (): NexusOfflineMutationEntry[] => {
  const next = readNexusOfflineQueue().filter(item => item.status !== 'synced');
  writeNexusOfflineQueue(next);
  return next;
};

export const resetNexusOfflineQueue = (): void => {
  memoryOfflineQueue = [];
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(NEXUS_OFFLINE_QUEUE_STORAGE_KEY);
      emitOfflineQueueUpdated();
    } catch {
      // Ignore
    }
  }
};

const executeFlushNexusOfflineQueue = async (
  sender: (entry: NexusOfflineMutationEntry) => Promise<void>,
  nowIso = new Date().toISOString(),
): Promise<{
  flushedCount: number;
  failedCount: number;
  remainingPendingCount: number;
  queue: NexusOfflineMutationEntry[];
}> => {
  if (!isNexusOnline()) {
    const queue = readNexusOfflineQueue();
    return {
      flushedCount: 0,
      failedCount: 0,
      remainingPendingCount: queue.filter(i => i.status !== 'synced').length,
      queue,
    };
  }

  const candidateIds = readNexusOfflineQueue()
    .filter(item => item.status !== 'synced' && item.status !== 'conflict')
    .map(item => item.queueId);
  let flushedCount = 0;
  let failedCount = 0;

  for (const queueId of candidateIds) {
    const latestSnapshot = readNexusOfflineQueue();
    const item = latestSnapshot.find(entry => entry.queueId === queueId);
    if (!item || item.status === 'synced' || item.status === 'conflict') {
      continue;
    }

    let nextPatch: NexusOfflineMutationEntry;
    try {
      await sender(item);
      flushedCount++;
      nextPatch = {
        ...item,
        status: 'synced',
        syncedAt: nowIso,
        attempts: item.attempts + 1,
        lastError: undefined,
      };
    } catch (error) {
      failedCount++;
      nextPatch = {
        ...item,
        status: 'failed',
        attempts: item.attempts + 1,
        lastError: error instanceof Error ? error.message : '동기화 오류',
      };
    }

    // Re-read current queue after await so items enqueued concurrently are never clobbered
    const currentAfterAwait = readNexusOfflineQueue();
    const merged = currentAfterAwait.map(entry => (entry.queueId === queueId ? nextPatch : entry));
    writeNexusOfflineQueue(merged);
  }

  const finalQueue = readNexusOfflineQueue();
  return {
    flushedCount,
    failedCount,
    remainingPendingCount: finalQueue.filter(i => i.status !== 'synced').length,
    queue: finalQueue,
  };
};

export const flushNexusOfflineQueue = async (
  sender: (entry: NexusOfflineMutationEntry) => Promise<void>,
  nowIso = new Date().toISOString(),
): Promise<{
  flushedCount: number;
  failedCount: number;
  remainingPendingCount: number;
  queue: NexusOfflineMutationEntry[];
}> => {
  if (flushInFlightPromise) {
    return flushInFlightPromise;
  }
  flushInFlightPromise = executeFlushNexusOfflineQueue(sender, nowIso).finally(() => {
    flushInFlightPromise = null;
  });
  return flushInFlightPromise;
};

export const detectOfflineSyncConflicts = (
  queue: readonly NexusOfflineMutationEntry[],
  serverSnapshot?: NexusSyncServerSnapshot,
): NexusOfflineSyncConflict[] => {
  if (!serverSnapshot) return [];
  const conflicts: NexusOfflineSyncConflict[] = [];
  const cases = serverSnapshot.pipelineCases ?? [];
  const equips = serverSnapshot.equipmentReports ?? [];

  for (const item of queue) {
    if (item.status === 'synced') continue;

    if (item.kind === 'pipeline_case') {
      const exactMatch = cases.find(
        c => c.caseId === item.recordId && Boolean(c.hqDirectiveNote?.trim()),
      );
      const siteNewerDirective =
        exactMatch ??
        cases.find(
          c =>
            Boolean(item.siteId) &&
            c.siteId === item.siteId &&
            Boolean(c.hqDirectiveNote?.trim()) &&
            Boolean(c.updatedAt && c.updatedAt >= item.queuedAt),
        );
      if (siteNewerDirective?.hqDirectiveNote) {
        conflicts.push({
          conflictId: `CFL-${item.queueId}`,
          queueId: item.queueId,
          kind: item.kind,
          siteId: item.siteId ?? siteNewerDirective.siteId,
          recordId: siteNewerDirective.caseId || item.recordId,
          title: siteNewerDirective.locationLabel || '현장 시정조치·작업중지 기록',
          localSummary: item.summary,
          localUpdatedAt: item.queuedAt,
          hqSummary: siteNewerDirective.hqDirectiveNote,
          hqUpdatedAt: siteNewerDirective.updatedAt || item.queuedAt,
          hqActor: '본사 안전보건실 긴급 지시',
        });
      }
    } else if (item.kind === 'equipment_photo') {
      const eqMatch = equips.find(
        e =>
          e.reportId === item.recordId &&
          e.status === 'revision_requested_hq' &&
          Boolean(e.hqReviewNote?.trim()),
      );
      if (eqMatch?.hqReviewNote) {
        conflicts.push({
          conflictId: `CFL-${item.queueId}`,
          queueId: item.queueId,
          kind: item.kind,
          siteId: item.siteId ?? eqMatch.siteId,
          recordId: eqMatch.reportId,
          title: eqMatch.workActivity || '건설기계 사용전 점검 사진',
          localSummary: item.summary,
          localUpdatedAt: item.queuedAt,
          hqSummary: eqMatch.hqReviewNote,
          hqUpdatedAt: eqMatch.hqReviewedAt || item.queuedAt,
          hqActor: eqMatch.hqReviewer || '본사 사진 검토자 보완요청',
        });
      }
    }
  }

  return conflicts;
};

const CONFLICT_RESOLUTION_TAG: Record<NexusConflictResolutionChoice, string> = {
  keep_local: '[충돌 해결: 현장 입력 우선]',
  accept_hq: '[충돌 해결: 본사 지시 수용]',
  merge_both: '[충돌 해결: 양측 병합]',
};

export const resolveOfflineSyncConflict = (
  queueId: string,
  choice: NexusConflictResolutionChoice,
  conflict: NexusOfflineSyncConflict,
  nowIso = new Date().toISOString(),
): {
  queue: NexusOfflineMutationEntry[];
  resolvedEntry: NexusOfflineMutationEntry | null;
  remainingPendingCount: number;
  resolutionNotice: string;
} => {
  const current = readNexusOfflineQueue();
  let resolvedEntry: NexusOfflineMutationEntry | null = null;
  const tag = CONFLICT_RESOLUTION_TAG[choice];

  const next = current.map(item => {
    if (item.queueId !== queueId) return item;
    const baseText =
      choice === 'accept_hq'
        ? conflict.hqSummary
        : choice === 'merge_both'
          ? `${conflict.localSummary} / 본사지시: ${conflict.hqSummary}`
          : conflict.localSummary;
    const nextEntry: NexusOfflineMutationEntry = {
      ...item,
      status: 'synced',
      syncedAt: nowIso,
      attempts: item.attempts + 1,
      lastError: undefined,
      summary: `${tag} ${baseText}`.slice(0, 140),
    };
    resolvedEntry = nextEntry;
    return nextEntry;
  });

  writeNexusOfflineQueue(next);
  return {
    queue: next,
    resolvedEntry,
    remainingPendingCount: next.filter(i => i.status !== 'synced').length,
    resolutionNotice: `${tag} "${conflict.title}" 건이 반영되어 동기화를 완료했습니다.`,
  };
};

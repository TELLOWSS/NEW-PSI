export const NEXUS_OFFLINE_QUEUE_STORAGE_KEY = 'psi_nexus_offline_sync_queue_v1';
export const NEXUS_OFFLINE_QUEUE_UPDATED_EVENT = 'psi-nexus-offline-queue-updated';

export type NexusOfflineMutationKind =
  | 'pipeline_case'
  | 'equipment_photo'
  | 'visit_ack'
  | 'training_signature';

export type NexusOfflineQueueStatus = 'pending' | 'synced' | 'failed';

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

export const writeNexusOfflineQueue = (entries: readonly NexusOfflineMutationEntry[]): void => {
  memoryOfflineQueue = [...entries].slice(0, 200);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(NEXUS_OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(memoryOfflineQueue));
      emitOfflineQueueUpdated();
    } catch {
      // Ignore quota errors in constrained underground mobile browsers
    }
  }
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

export const flushNexusOfflineQueue = async (
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

  const current = readNexusOfflineQueue();
  let flushedCount = 0;
  let failedCount = 0;
  const updated: NexusOfflineMutationEntry[] = [];

  for (const item of current) {
    if (item.status === 'synced') {
      updated.push(item);
      continue;
    }
    try {
      await sender(item);
      flushedCount++;
      updated.push({
        ...item,
        status: 'synced',
        syncedAt: nowIso,
        attempts: item.attempts + 1,
        lastError: undefined,
      });
    } catch (error) {
      failedCount++;
      updated.push({
        ...item,
        status: 'failed',
        attempts: item.attempts + 1,
        lastError: error instanceof Error ? error.message : '동기화 오류',
      });
    }
  }

  writeNexusOfflineQueue(updated);
  return {
    flushedCount,
    failedCount,
    remainingPendingCount: updated.filter(i => i.status !== 'synced').length,
    queue: updated,
  };
};

export const TRAINING_SUBMISSION_QUEUE_TTL_MS = 25 * 60 * 1000;

export type QueuedTrainingSubmission = {
    id: string;
    sessionId: string;
    payload: Record<string, unknown>;
    createdAt: number;
    attempts: number;
    lastError: string;
};

export type TrainingQueueSendResult = 'accepted' | 'duplicate' | 'retry' | 'expired';

const DB_NAME = 'psi-offline-queue';
const STORE_NAME = 'training-submissions';
const DB_VERSION = 1;
const memoryQueue = new Map<string, QueuedTrainingSubmission>();

const createQueueId = (sessionId: string) => {
    const suffix = typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${sessionId}:${suffix}`;
};

const openQueueDb = async (): Promise<IDBDatabase | null> => {
    if (typeof indexedDB === 'undefined') return null;
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('오프라인 저장소를 열 수 없습니다.'));
    });
};

const runStoreRequest = async <T>(
    mode: IDBTransactionMode,
    requestFactory: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> => {
    try {
        const db = await openQueueDb();
        if (!db) return null;
        return await new Promise<T>((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, mode);
            const request = requestFactory(transaction.objectStore(STORE_NAME));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('오프라인 저장소 처리 실패'));
            transaction.oncomplete = () => db.close();
            transaction.onerror = () => reject(transaction.error || new Error('오프라인 저장소 처리 실패'));
        });
    } catch {
        return null;
    }
};

export const enqueueTrainingSubmission = async (
    payload: Record<string, unknown>,
    now = Date.now(),
): Promise<QueuedTrainingSubmission> => {
    const sessionId = String(payload.sessionId || '').trim();
    if (!sessionId) throw new Error('교육 세션 정보가 없어 오프라인 저장을 할 수 없습니다.');
    const queued: QueuedTrainingSubmission = {
        id: createQueueId(sessionId),
        sessionId,
        payload,
        createdAt: now,
        attempts: 0,
        lastError: '',
    };
    memoryQueue.set(queued.id, queued);
    await runStoreRequest('readwrite', (store) => store.put(queued));
    return queued;
};

export const listQueuedTrainingSubmissions = async (): Promise<QueuedTrainingSubmission[]> => {
    const stored = await runStoreRequest<QueuedTrainingSubmission[]>('readonly', (store) => store.getAll());
    const items = stored || Array.from(memoryQueue.values());
    items.forEach((item) => memoryQueue.set(item.id, item));
    return [...items].sort((left, right) => left.createdAt - right.createdAt);
};

export const removeQueuedTrainingSubmission = async (id: string): Promise<void> => {
    memoryQueue.delete(id);
    await runStoreRequest('readwrite', (store) => store.delete(id));
};

export const flushQueuedTrainingSubmissions = async (
    send: (queued: QueuedTrainingSubmission) => Promise<TrainingQueueSendResult>,
    now = Date.now(),
) => {
    const queuedItems = await listQueuedTrainingSubmissions();
    const summary = { accepted: 0, duplicate: 0, expired: 0, remaining: 0, acceptedItems: [] as QueuedTrainingSubmission[] };

    for (const queued of queuedItems) {
        if (now - queued.createdAt > TRAINING_SUBMISSION_QUEUE_TTL_MS) {
            await removeQueuedTrainingSubmission(queued.id);
            summary.expired += 1;
            continue;
        }
        let result: TrainingQueueSendResult = 'retry';
        try {
            result = await send(queued);
        } catch (error) {
            const updated = {
                ...queued,
                attempts: queued.attempts + 1,
                lastError: error instanceof Error ? error.message : '재전송 실패',
            };
            memoryQueue.set(updated.id, updated);
            await runStoreRequest('readwrite', (store) => store.put(updated));
        }
        if (result === 'accepted' || result === 'duplicate' || result === 'expired') {
            await removeQueuedTrainingSubmission(queued.id);
            if (result === 'accepted') {
                summary.accepted += 1;
                summary.acceptedItems.push(queued);
            } else if (result === 'duplicate') {
                summary.duplicate += 1;
            } else {
                summary.expired += 1;
            }
        }
    }
    summary.remaining = (await listQueuedTrainingSubmissions()).length;
    return summary;
};

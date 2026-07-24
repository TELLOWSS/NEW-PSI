import { describe, expect, it } from 'vitest';
import {
    enqueueTrainingSubmission,
    flushQueuedTrainingSubmissions,
    listQueuedTrainingSubmissions,
    removeQueuedTrainingSubmission,
    TRAINING_SUBMISSION_QUEUE_TTL_MS,
} from '../utils/trainingSubmissionQueue';

describe('training submission offline queue', () => {
    it('keeps a network-failed submission and removes it only after server acceptance', async () => {
        const queued = await enqueueTrainingSubmission({ sessionId: 'offline-session', workerName: 'Kim' }, 1_000);
        expect((await listQueuedTrainingSubmissions()).some((item) => item.id === queued.id)).toBe(true);

        const retrySummary = await flushQueuedTrainingSubmissions(async () => 'retry', 2_000);
        expect(retrySummary.remaining).toBeGreaterThan(0);

        const acceptedSummary = await flushQueuedTrainingSubmissions(
            async (item) => item.id === queued.id ? 'accepted' : 'retry',
            3_000,
        );
        expect(acceptedSummary.acceptedItems.map((item) => item.id)).toContain(queued.id);
        expect((await listQueuedTrainingSubmissions()).some((item) => item.id === queued.id)).toBe(false);
    });

    it('purges expired signature payloads instead of retaining sensitive data indefinitely', async () => {
        const queued = await enqueueTrainingSubmission({ sessionId: 'expired-session', signatureDataUrl: 'secret' }, 1_000);
        const summary = await flushQueuedTrainingSubmissions(
            async () => 'accepted',
            1_000 + TRAINING_SUBMISSION_QUEUE_TTL_MS + 1,
        );

        expect(summary.expired).toBeGreaterThanOrEqual(1);
        expect((await listQueuedTrainingSubmissions()).some((item) => item.id === queued.id)).toBe(false);
        await removeQueuedTrainingSubmission(queued.id);
    });
});

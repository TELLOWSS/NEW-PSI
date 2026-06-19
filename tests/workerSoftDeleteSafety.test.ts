import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => ({
    from: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => supabaseMock),
}));

import {
    handleDeleteWorker,
    handleDeleteWorkers,
} from '../api/admin/safety-management';

describe('worker soft delete fail-closed behavior', () => {
    beforeEach(() => {
        supabaseMock.from.mockReset();
    });

    it('stops a single delete when deleted_at is missing and never calls hard delete', async () => {
        const hardDelete = vi.fn();
        const maybeSingle = vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'column workers.deleted_at does not exist' },
        });
        const table = {
            update: vi.fn(() => ({
                eq: vi.fn(() => ({
                    is: vi.fn(() => ({
                        select: vi.fn(() => ({ maybeSingle })),
                    })),
                })),
            })),
            delete: hardDelete,
        };
        supabaseMock.from.mockReturnValue(table);

        await expect(handleDeleteWorker({ id: 'worker-1' }))
            .rejects.toThrow('workers.deleted_at');
        expect(hardDelete).not.toHaveBeenCalled();
    });

    it('stops a bulk delete when deleted_at is missing and never calls hard delete', async () => {
        const hardDelete = vi.fn();
        const table = {
            update: vi.fn(() => ({
                in: vi.fn(() => ({
                    is: vi.fn(() => ({
                        select: vi.fn().mockResolvedValue({
                            data: null,
                            error: { message: 'column workers.deleted_at does not exist' },
                        }),
                    })),
                })),
            })),
            delete: hardDelete,
        };
        supabaseMock.from.mockReturnValue(table);

        await expect(handleDeleteWorkers({ ids: ['worker-1', 'worker-2'] }))
            .rejects.toThrow('workers.deleted_at');
        expect(hardDelete).not.toHaveBeenCalled();
    });
});

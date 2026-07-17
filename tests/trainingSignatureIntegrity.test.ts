import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('training signature integrity contract', () => {
    it('commits logs and acknowledgements through one server-side transaction', () => {
        const gateway = read('../api/gateway.ts');
        const migration = read('../supabase_training_signature_integrity_migration.sql');

        expect(gateway.match(/psi_commit_training_signature/g)?.length).toBeGreaterThanOrEqual(2);
        expect(gateway).toContain("storage.from('signatures').remove([path])");
        expect(gateway).not.toContain("storage.from('signatures').getPublicUrl(path)");
        expect(migration).toContain('create or replace function public.psi_commit_training_signature');
        expect(migration).toContain("update storage.buckets\n   set public = false");
        expect(migration).toContain("'private://signatures/' || p_signature_path");
    });

    it('does not allow a weak reason to bypass critical edit or approval history', () => {
        const modal = read('../components/modals/RecordDetailModal.tsx');
        expect(modal).toContain('핵심 수정사항의 저장 사유가 필요합니다.');
        expect(modal).toContain('승인/반려 근거가 너무 짧거나 구체적이지 않습니다.');
        expect(modal).toContain('hasWeakApprovalReason');
    });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeRecordMasterAction } from '../api/admin/record-master';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('record-master server boundary', () => {
    it('removes direct browser Supabase CRUD from the OCR screen', () => {
        const source = read('pages/OcrAnalysis.tsx');
        expect(source).not.toContain("../lib/supabaseClient");
        expect(source).not.toMatch(/\.from\(['"]record_master_/);
        expect(source).toContain("from '../services/recordMasterService'");
    });

    it('requires an authenticated server handler and a service-role client', () => {
        const source = read('api/admin/record-master.ts');
        expect(source).toContain('isValidAdminAuthRequest(req)');
        expect(source).toContain('createSupabaseServerClient');
        expect(source).toContain('SUPABASE_SERVICE_ROLE_KEY');
        expect(source).not.toContain('VITE_SUPABASE_ANON_KEY');
    });

    it('locks tables and compatibility views to service_role', () => {
        const migration = read('supabase/migrations/20260901001000_record_master_server_boundary.sql');
        expect(migration).toContain('security_invoker = true');
        expect(migration).toContain('from public, anon, authenticated');
        expect(migration).toContain('to service_role');
        expect(migration).toContain('force row level security');
    });

    it('rejects malformed identifiers before accessing the database', async () => {
        await expect(executeRecordMasterAction(null, 'delete-template', {
            templateId: 'not-a-uuid',
        })).rejects.toMatchObject({
            statusCode: 400,
            code: 'INVALID_INPUT',
        });
    });

    it('rejects impossible effective dates before assignment writes', async () => {
        await expect(executeRecordMasterAction(null, 'upsert-assignment', {
            groupId: '11111111-1111-4111-8111-111111111111',
            templateId: '22222222-2222-4222-8222-222222222222',
            effectiveDate: '2026-02-31',
        })).rejects.toMatchObject({
            statusCode: 400,
            code: 'INVALID_INPUT',
        });
    });
});

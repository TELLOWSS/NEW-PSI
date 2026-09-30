import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('executes the actual signature SQL: server-only commit, duplicate protection and acknowledgement failure rollback', async () => {
    const db = new PGlite();
    try {
        await db.exec([
            'create role anon; create role authenticated; create role service_role;',
            'create schema storage;',
            'create table storage.buckets(id text primary key, public boolean);',
            "insert into storage.buckets values('signatures',true),('training_audio',true);",
            'create table storage.objects(id int);',
            'create table public.training_logs(id int generated always as identity primary key, session_id text, case_id text, worker_id uuid, worker_name text, nationality text, signature_url text, audio_url text, selected_language_code text, is_manager_proxy boolean, signature_method text, submitted_at timestamptz);',
            "create table public.training_acknowledgements(id int generated always as identity primary key, session_id text, case_id text, worker_name text, selected_language_code text, reviewed_guidance boolean, checklist jsonb, comprehension_complete boolean, submitted_at timestamptz, updated_at timestamptz default now(), check(case_id is distinct from 'force-error'));",
            'create unique index training_ack_unique_session_worker on public.training_acknowledgements(session_id,worker_name);',
        ].join('\n'));
        await db.exec(await readFile('supabase_training_signature_integrity_migration.sql', 'utf8'));
        await db.exec(await readFile('supabase_training_logs_dedup_unique_migration.sql', 'utf8'));
        const commit = (session: string, caseId = '', path = 'synthetic/evidence.png') => db.query(
            "select * from public.psi_commit_training_signature($1,$2,'00000000-0000-4000-8000-000000000001'::uuid,'Synthetic Worker','Synthetic Nationality',$3,$4,'','ko-KR',false,'worker_self',true,'{\"riskReview\":true,\"ppeConfirm\":true,\"emergencyConfirm\":true}'::jsonb,true,now())",
            [session, caseId, path, 'a'.repeat(64)]);
        for (const role of ['anon', 'authenticated']) {
            await db.exec('set role ' + role);
            await expect(commit('forbidden')).rejects.toMatchObject({ code: '42501' });
            await db.exec('reset role');
        }
        await db.exec('set role service_role');
        expect((await commit('complete')).rows).toEqual([{ training_log_id: '1', comprehension_complete: true }]);
        await expect(commit('complete', '', 'synthetic/duplicate.png')).rejects.toMatchObject({ code: '23505' });
        await expect(commit('failed', 'force-error')).rejects.toMatchObject({ code: '23514' });
        await db.exec('reset role');
        expect((await db.query('select session_id,signature_url,signature_evidence_hash from public.training_logs')).rows).toEqual([{ session_id: 'complete', signature_url: 'private://signatures/synthetic/evidence.png', signature_evidence_hash: 'a'.repeat(64) }]);
        expect((await db.query('select session_id,comprehension_complete,signature_evidence_hash from public.training_acknowledgements')).rows).toEqual([{ session_id: 'complete', comprehension_complete: true, signature_evidence_hash: 'a'.repeat(64) }]);
        expect((await db.query('select id,public from storage.buckets order by id')).rows).toEqual([{ id: 'signatures', public: false }, { id: 'training_audio', public: true }]);
    } finally { await db.close(); }
}, 30_000);

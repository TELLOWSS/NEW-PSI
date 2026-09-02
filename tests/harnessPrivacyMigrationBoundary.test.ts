import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('supabase/migrations/20260902001000_harness_privacy_server_boundary.sql');
const sql = migration.replace(/--[^\n]*/g, '');

describe('harness privacy server-boundary migration', () => {
    it('covers exactly the persistence tables and the legacy vector table', () => {
        const tableAllowlist = /c\.relname = any\(array\[([\s\S]*?)\]\)/.exec(sql)?.[1] || '';
        const protectedTables = [...tableAllowlist.matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
        const consumedTables = [...new Set([...read('lib/server/harness/persistence.ts')
            .matchAll(/\.from\('([^']+)'\)/g)].map((match) => match[1]))];
        expect(protectedTables).toEqual([...consumedTables, 'risk_best_practice_vectors'].sort());
        expect(protectedTables).toHaveLength(8);
        expect(sql).toContain("n.nspname = 'public'");
        expect(sql).not.toMatch(/all tables in schema/i);
    });

    it('removes public privileges and old policies, forces RLS, and preserves service-role CRUD', () => {
        expect(sql).toContain('revoke all on table public.%I from public, anon, authenticated');
        expect(sql).toContain('grant select, insert, update, delete on table public.%I to service_role');
        expect(sql).toContain('alter table public.%I enable row level security');
        expect(sql).toContain('alter table public.%I force row level security');
        expect(sql).toContain('from pg_policies');
        expect(sql).toContain('drop policy if exists %I on public.%I');
        expect(sql).toContain('for all to service_role using (true) with check (true)');
        expect(sql).not.toMatch(/grant[^;]*\bto\s+(?:anon|authenticated|public)\b/i);
    });

    it('closes all legacy vector RPC overloads and removes SECURITY DEFINER escalation', () => {
        const functionAllowlist = /p\.proname = any\(array\[([\s\S]*?)\]\)/.exec(sql)?.[1] || '';
        expect([...functionAllowlist.matchAll(/'([^']+)'/g)].map((match) => match[1])).toEqual([
            'match_risk_best_practice_vectors', 'set_rbpv_updated_at', 'set_harness_updated_at',
        ]);
        expect(sql).toContain('pg_get_function_identity_arguments(p.oid)');
        expect(sql).toContain('revoke all on function public.%I(%s) from public, anon, authenticated');
        expect(sql).toContain('grant execute on function public.%I(%s) to service_role');
        expect(sql).toContain('alter function public.%I(%s) security invoker');
        expect(sql).toContain('set search_path = pg_catalog, public, extensions');
        expect(sql).not.toMatch(/security definer/i);
    });

    it('is transactional and never deletes historical data or replaces function bodies', () => {
        expect(sql.trim()).toMatch(/^begin;/i);
        expect(sql.trim()).toMatch(/commit;$/i);
        expect(sql).toContain("set local lock_timeout = '5s'");
        expect(sql).toContain("notify pgrst, 'reload schema'");
        expect(sql).not.toMatch(/\b(?:delete\s+from|truncate|drop\s+(?:table|function|schema|column)|create\s+or\s+replace\s+function)\b/i);
        expect(sql).not.toMatch(/\bupdate\s+public\./i);
        expect(sql).not.toMatch(/\b(?:insert\s+into|alter\s+default\s+privileges)\b/i);
    });

    it('documents the deployment order and the browser embedding lookup prerequisite', () => {
        expect(migration).toContain('Apply AFTER deploying the service-role-only harness client');
        expect(migration).toContain("browser's match_risk_best_practice_vectors lookup");
        expect(migration).toContain('including its embedding call');
        expect(migration).toContain('NOT historical-content cleanup or tenant isolation');
    });
});

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('executes tenant RLS against PostgreSQL: isolated reads, suspension, no self-promotion and no anonymous access', async () => {
    const db = new PGlite();
    try {
        // Minimal Supabase identity primitives. This tests real SQL/RLS, not hosted Auth or PostgREST.
        await db.exec(`
            create role anon;
            create role authenticated;
            create role service_role bypassrls;
            create schema auth;
            create table auth.users(id uuid primary key);
            create function auth.uid() returns uuid language sql stable as $$
                select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
            $$;
            grant usage on schema auth to authenticated;
            grant execute on function auth.uid() to authenticated;
        `);
        await db.exec(await readFile(resolve('supabase/migrations/20260929000000_tenant_identity_foundation.sql'), 'utf8'));
        await db.exec(await readFile(resolve('supabase/tests/tenant_identity.sql'), 'utf8'));
        // SQL assertions above raise on failure. Their transaction must also leave no fixture data.
        const { rows } = await db.query<{ count: number }>('select count(*)::int as count from public.psi_tenants');
        expect(rows[0].count).toBe(0);
    } finally { await db.close(); }
}, 30_000);

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
    new URL('../supabase/migrations/20260831000000_paid_ocr_security_gate.sql', import.meta.url),
    'utf8',
).toLowerCase();

describe('paid OCR durable approval migration contract', () => {
    it('creates the quota and audit objects without unrelated table dependencies', () => {
        expect(migration).toContain('create table if not exists public.api_security_events');
        expect(migration).toContain('create table if not exists public.api_usage_events');
        expect(migration).toContain('create or replace function public.psi_consume_api_quota');
        expect(migration).toContain('pg_advisory_xact_lock');
        expect(migration).not.toMatch(/\bworkers\b/);
    });

    it('keeps the tables behind RLS and the atomic RPC service-role only', () => {
        expect(migration).toContain('alter table public.api_security_events enable row level security');
        expect(migration).toContain('alter table public.api_usage_events enable row level security');
        expect(migration).toContain('from public, anon, authenticated');
        expect(migration).toContain('to service_role');
        expect(migration).toContain('security definer');
        expect(migration).toContain('set search_path = public, pg_temp');
    });
});

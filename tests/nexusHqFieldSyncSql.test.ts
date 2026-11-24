import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const tenantA = 'c9600000-0000-4000-8000-000000000001';
const siteA1 = 'd9600000-0000-4000-8000-000000000001';
const siteA2 = 'd9600000-0000-4000-8000-000000000002';
const hqOwner = 'e9600000-0000-4000-8000-000000000001';
const fieldUserA1 = 'e9600000-0000-4000-8000-000000000002';
const fieldUserA2 = 'e9600000-0000-4000-8000-000000000003';

let db: PGlite;

async function asUser(userId: string) {
  await db.exec('set local role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
}

async function expectQueryRejected(sql: string, params: unknown[] = []) {
  await db.exec('savepoint psi_sync_expect_fail');
  await expect(db.query(sql, params)).rejects.toBeDefined();
  await db.exec('rollback to savepoint psi_sync_expect_fail; release savepoint psi_sync_expect_fail');
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(await readFile(resolve('supabase/migrations/20260929000000_tenant_identity_foundation.sql'), 'utf8'));
  await db.exec('create table public.psi_tenant_workers(tenant_id uuid not null references public.psi_tenants(id), id uuid not null, primary key(tenant_id, id));');
  await db.exec(await readFile(resolve('supabase/proposals/psi_tenant_site_memberships_staging.sql'), 'utf8'));
  await db.exec(await readFile(resolve('supabase/migrations/20261124000000_nexus_hq_field_sync_foundation.sql'), 'utf8'));
}, 30000);

beforeEach(async () => {
  await db.exec('begin');
  await db.query('insert into auth.users(id) values ($1),($2),($3)', [hqOwner, fieldUserA1, fieldUserA2]);
  await db.query("insert into public.psi_tenants(id, name) values ($1, '테스트 골조건설')", [tenantA]);
  await db.query(
    "insert into public.psi_tenant_memberships(tenant_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'viewer'), ($1, $4, 'viewer')",
    [tenantA, hqOwner, fieldUserA1, fieldUserA2],
  );
  await db.query(
    "insert into public.psi_tenant_sites(tenant_id, id, name) values ($1, $2, '제1현장'), ($1, $3, '제2현장')",
    [tenantA, siteA1, siteA2],
  );
  await db.query(
    'insert into public.psi_tenant_site_memberships(tenant_id, site_id, user_id) values ($1, $2, $4), ($1, $3, $5)',
    [tenantA, siteA1, siteA2, fieldUserA1, fieldUserA2],
  );
});

afterEach(async () => {
  await db.exec('rollback');
});

afterAll(async () => {
  await db.close();
});

describe('Phase B · Multi-Site Sync Foundation RLS & Separation of Duty', () => {
  it('enforces single-site isolation for pipeline & equipment photos while allowing HQ all-site approval with separation of duty', async () => {
    await asUser(fieldUserA1);
    const eqRes = await db.query<{ id: string }>(
      `insert into public.psi_nexus_equipment_photos (
        tenant_id, site_id, equipment_type, work_activity, storage_path, uploaded_by, uploaded_by_label
      ) values (
        $1, $2, 'concrete_pump_car', '지하2층 합벽 펌프카 아웃트리거 점검', 'site1/pump-01.jpg', $3, '제1현장 김안전'
      ) returning id`,
      [tenantA, siteA1, fieldUserA1],
    );
    const photoId = eqRes.rows[0].id;

    // Cross-site field user cannot read Site 1 photo or insert into Site 1
    await asUser(fieldUserA2);
    const a2Read = await db.query('select id from public.psi_nexus_equipment_photos');
    expect(a2Read.rows).toHaveLength(0);
    await expectQueryRejected(
      `insert into public.psi_nexus_equipment_photos (
        tenant_id, site_id, equipment_type, work_activity, storage_path, uploaded_by, uploaded_by_label
      ) values ($1, $2, 'tower_crane', '타현장 위조 삽입', 'fake/tc.jpg', $3, '침입자')`,
      [tenantA, siteA1, fieldUserA2],
    );

    // Site 1 uploader cannot self-verify (blocked both by RLS & CHECK constraint)
    await asUser(fieldUserA1);
    const selfVerify = await db.query(
      `update public.psi_nexus_equipment_photos
       set status = 'hq_verified_for_ceo', reviewed_by = $1, reviewed_by_label = '셀프승인'
       where id = $2 returning id`,
      [fieldUserA1, photoId],
    );
    expect(selfVerify.rows).toHaveLength(0);

    // HQ owner sees Site 1 photo & approves with proper separation of duty
    await asUser(hqOwner);
    const hqVisible = await db.query('select id from public.psi_nexus_equipment_photos');
    expect(hqVisible.rows).toHaveLength(1);

    const hqApproved = await db.query<{ status: string }>(
      `update public.psi_nexus_equipment_photos
       set status = 'hq_verified_for_ceo', reviewed_by = $1, reviewed_by_label = '본사 박실장', reviewed_at = now()
       where id = $2 returning status`,
      [hqOwner, photoId],
    );
    expect(hqApproved.rows[0].status).toBe('hq_verified_for_ceo');

    // Site 1 field user can record individual handwritten worker signature for Site 1 only
    await asUser(fieldUserA1);
    const sigRes = await db.query<{ id: string }>(
      `insert into public.psi_nexus_training_signatures (
        tenant_id, site_id, campaign_code, worker_name, language_code, signature_hash, recorded_by
      ) values ($1, $2, 'RC-SUB-01', 'NGUYEN VAN A', 'vi-VN', 'sha256:abc123456789', $3) returning id`,
      [tenantA, siteA1, fieldUserA1],
    );
    expect(sigRes.rows).toHaveLength(1);

    await asUser(fieldUserA2);
    expect((await db.query('select id from public.psi_nexus_training_signatures')).rows).toHaveLength(0);
  });
});

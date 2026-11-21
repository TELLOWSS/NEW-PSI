import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it } from 'vitest';

const tenantA = 'b9600000-0000-4000-8000-000000000001';
const tenantB = 'b9600000-0000-4000-8000-000000000002';
const siteA1 = 'f9600000-0000-4000-8000-000000000001';
const siteA2 = 'f9600000-0000-4000-8000-000000000002';
const siteB1 = 'f9600000-0000-4000-8000-000000000003';
const hqOwnerA = 'a9600000-0000-4000-8000-000000000001';
const siteMemberA1 = 'a9600000-0000-4000-8000-000000000002';
const siteMemberA2 = 'a9600000-0000-4000-8000-000000000003';
const tenantBOwner = 'a9600000-0000-4000-8000-000000000004';

let db: PGlite;

async function asUser(userId: string) {
  await db.exec('set local role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
}

async function expectQueryRejected(sql: string, params: unknown[] = []) {
  await db.exec('savepoint psi_expect_fail');
  await expect(db.query(sql, params)).rejects.toBeDefined();
  await db.exec('rollback to savepoint psi_expect_fail; release savepoint psi_expect_fail');
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
  await db.exec(await readFile(resolve('supabase/migrations/20261121000000_nexus_structural_3axis_foundation.sql'), 'utf8'));
}, 30000);

beforeEach(async () => {
  await db.exec('begin');
  await db.query('insert into auth.users(id) values ($1),($2),($3),($4)', [
    hqOwnerA,
    siteMemberA1,
    siteMemberA2,
    tenantBOwner,
  ]);
  await db.query("insert into public.psi_tenants(id, name) values ($1, '골조전문 A건설'), ($2, '타사 B건설')", [
    tenantA,
    tenantB,
  ]);
  await db.query(
    "insert into public.psi_tenant_memberships(tenant_id, user_id, role) values ($1, $3, 'owner'), ($1, $4, 'viewer'), ($1, $5, 'viewer'), ($2, $6, 'owner')",
    [tenantA, tenantB, hqOwnerA, siteMemberA1, siteMemberA2, tenantBOwner],
  );
  await db.query(
    "insert into public.psi_tenant_sites(tenant_id, id, name) values ($1, $3, 'A현장 (지하 RC)'), ($1, $4, 'B현장 (상부 갱폼)'), ($2, $5, '타사 현장')",
    [tenantA, tenantB, siteA1, siteA2, siteB1],
  );
  await db.query(
    'insert into public.psi_tenant_site_memberships(tenant_id, site_id, user_id) values ($1, $3, $5), ($1, $4, $6), ($2, $7, $8)',
    [tenantA, tenantB, siteA1, siteA2, siteMemberA1, siteMemberA2, siteB1, tenantBOwner],
  );
});

afterEach(async () => {
  await db.exec('rollback');
});

afterAll(async () => {
  await db.close();
});

describe('Slice 1 · Multi-Site (site_id) & 3-Axis Structural Incident DB RLS', () => {
  it('allows site member A1 to submit a 3-axis substructure RC case for site A1, isolates it from site A2, and lets HQ owner approve & distribute it', async () => {
    await asUser(siteMemberA1);
    const inserted = await db.query<{ id: string }>(
      `insert into public.psi_structural_incident_cases (
        tenant_id, site_id, case_code, title,
        zone_axis, process_axis, hazard_equipment_axis, hazard_mechanism,
        direct_cause, contributing_factor, root_cause, preventive_measure,
        approval_status, created_by
      ) values (
        $1, $2, 'RC-SUB-01', '지하 RC 외벽 거푸집 측압 변형 위험',
        'substructure_rc', 'formwork_general', 'confined_earth_pressure', '붕괴·도괴',
        '지하외벽 타이볼트 간격 미준수', '지하층 조도 부족 및 측압 집중',
        '지하 RC 별도 구조검토 누락', '지하외벽 지지체 전수 확인 및 개구부 방호',
        'pending_hq_approval', $3
      ) returning id`,
      [tenantA, siteA1, siteMemberA1],
    );
    expect(inserted.rows).toHaveLength(1);
    const caseId = inserted.rows[0].id;

    // Site A2 member cannot read site A1's unapproved or site-scoped case
    await asUser(siteMemberA2);
    const a2Read = await db.query('select id from public.psi_structural_incident_cases');
    expect(a2Read.rows).toHaveLength(0);

    // Tenant B owner cannot read Tenant A's case
    await asUser(tenantBOwner);
    const bRead = await db.query('select id from public.psi_structural_incident_cases');
    expect(bRead.rows).toHaveLength(0);

    // Creator (viewer) cannot self-approve: RLS USING blocks non-HQ roles (0 rows updated)
    await asUser(siteMemberA1);
    const viewerAttempt = await db.query(
      `update public.psi_structural_incident_cases
       set approval_status = 'hq_approved', approved_by = $1, approved_at = now()
       where id = $2 returning id`,
      [siteMemberA1, caseId],
    );
    expect(viewerAttempt.rows).toHaveLength(0);

    // HQ Owner A can see all sites in Tenant A and approve the case created by siteMemberA1
    await asUser(hqOwnerA);
    const hqRead = await db.query<{ id: string; site_id: string; zone_axis: string }>(
      'select id, site_id, zone_axis from public.psi_structural_incident_cases',
    );
    expect(hqRead.rows).toHaveLength(1);
    expect(hqRead.rows[0].zone_axis).toBe('substructure_rc');

    const approved = await db.query<{ approval_status: string }>(
      `update public.psi_structural_incident_cases
       set approval_status = 'hq_approved', approved_by = $1, approved_at = now()
       where tenant_id = $2 and id = $3
       returning approval_status`,
      [hqOwnerA, tenantA, caseId],
    );
    expect(approved.rows[0].approval_status).toBe('hq_approved');

    // Even an HQ Owner cannot self-approve a case they created themselves (author != approver rule)
    const hqDraft = await db.query<{ id: string }>(
      `insert into public.psi_structural_incident_cases (
        tenant_id, site_id, case_code, title,
        zone_axis, process_axis, hazard_equipment_axis, hazard_mechanism,
        direct_cause, contributing_factor, root_cause, preventive_measure,
        approval_status, created_by
      ) values (
        $1, null, 'HQ-STD-01', '본사 표준 갱폼 인양 사전점검 기준',
        'superstructure_std', 'gangform', 'tower_crane_rigging', '추락',
        '인양 고리 체결 전 고정 볼트 선해체', '신호수 무전 미흡',
        '선 체결 후 해체 원칙 미준수', '타워크레인 장력 확인 후 볼트 해체',
        'pending_hq_approval', $2
      ) returning id`,
      [tenantA, hqOwnerA],
    );
    await expectQueryRejected(
      `update public.psi_structural_incident_cases
       set approval_status = 'hq_approved', approved_by = $1, approved_at = now()
       where id = $2`,
      [hqOwnerA, hqDraft.rows[0].id],
    );
  });

  it('rejects invalid 3-axis values and unauthorized site inserts', async () => {
    await asUser(siteMemberA1);
    // Cannot insert into Site A2 where siteMemberA1 is not a member
    await expectQueryRejected(
      `insert into public.psi_structural_incident_cases (
        tenant_id, site_id, case_code, title,
        zone_axis, process_axis, hazard_equipment_axis, hazard_mechanism,
        direct_cause, contributing_factor, root_cause, preventive_measure,
        approval_status, created_by
      ) values (
        $1, $2, 'GF-02', '미소속 현장 입력 차단 테스트',
        'superstructure_std', 'gangform', 'tower_crane_rigging', '추락',
        '인양 고리 미체결', '신호 불일치', '절차 미준수', '선 체결 후 해체',
        'draft', $3
      )`,
      [tenantA, siteA2, siteMemberA1],
    );

    // Cannot insert non-standard 3-axis value
    await expectQueryRejected(
      `insert into public.psi_structural_incident_cases (
        tenant_id, site_id, case_code, title,
        zone_axis, process_axis, hazard_equipment_axis, hazard_mechanism,
        direct_cause, contributing_factor, root_cause, preventive_measure,
        approval_status, created_by
      ) values (
        $1, $2, 'INVALID-01', '비표준 축 차단 테스트',
        'unknown_zone', 'gangform', 'tower_crane_rigging', '추락',
        '인양 고리 미체결', '신호 불일치', '절차 미준수', '선 체결 후 해체',
        'draft', $3
      )`,
      [tenantA, siteA1, siteMemberA1],
    );
  });
});

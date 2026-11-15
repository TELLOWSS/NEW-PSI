import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll,beforeEach,afterEach,afterAll,describe,expect,it } from 'vitest';

/** Staging-only synthetic RLS tests. No live Supabase data or signed report is used. */
const tenant='b9600000-0000-4000-8000-000000000001';
const otherTenant='b9600000-0000-4000-8000-000000000002';
const siteA='f9600000-0000-4000-8000-000000000001';
const siteB='f9600000-0000-4000-8000-000000000002';
const siteForeign='f9600000-0000-4000-8000-000000000003';
const alice='a9600000-0000-4000-8000-000000000001';
const bob='a9600000-0000-4000-8000-000000000002';
const carol='a9600000-0000-4000-8000-000000000003';
const receiptA='d9600000-0000-4000-8000-000000000001';
const receiptB='d9600000-0000-4000-8000-000000000002';
const reportA='e9600000-0000-4000-8000-000000000001';
const shaA='a'.repeat(64);
const shaB='b'.repeat(64);
let db:PGlite;

async function asUser(user:string){
  await db.exec('set local role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
}
async function fails(sql:string,args:unknown[]=[]){
  await db.exec('savepoint psi_bad_statement');
  await expect(db.query(sql,args)).rejects.toBeDefined();
  await db.exec('rollback to savepoint psi_bad_statement; release savepoint psi_bad_statement');
}
async function addManifest(receipt:string,site:string){
  await db.query(`insert into public.psi_nexus_source_manifest_staging(
    receipt_id,tenant_id,site_id,assessment_month,job_field,source_cutoff_at,
    source_record_count,self_risk_high,self_risk_medium,self_risk_low,self_risk_unknown,
    source_id_set_sha256,canonical_snapshot_sha256,created_by
  ) values ($1,$2,$3,'2026-10-01','형틀','2026-11-15T07:00:00Z',
    3,1,1,0,1,$4,$5,$6)`,[receipt,tenant,site,shaA,shaB,alice]);
}
async function addReport(){
  await db.query(`insert into public.psi_nexus_external_report_receipt_staging(
    report_receipt_id,manifest_receipt_id,tenant_id,site_id,assessment_month,
    job_field,source_cutoff_at,external_original_sha256,external_document_mime,
    report_reference,source_system,document_issued_at,denominator_kind,declared_denominator,received_by
  ) values ($1,$2,$3,$4,'2026-10-01','형틀','2026-11-15T07:00:00Z',
    $5,'application/pdf','FIELD-TEST-001','external-test-repository',
    '2026-11-15T08:00:00Z','assessment_record_rows',3,$6)`,
  [reportA,receiptA,tenant,siteA,shaB,alice]);
}
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(await readFile(resolve('supabase/migrations/20260929000000_tenant_identity_foundation.sql'),'utf8'));
  await db.exec('create table public.psi_tenant_workers(tenant_id uuid not null references public.psi_tenants(id),id uuid not null,primary key(tenant_id,id));');
  await db.exec(await readFile(resolve('supabase/proposals/psi_tenant_site_memberships_staging.sql'),'utf8'));
  await db.exec(await readFile(resolve('supabase/proposals/psi_nexus_report_provenance_staging.sql'),'utf8'));
},30000);
beforeEach(async()=>{
  await db.exec('begin');
  await db.query('insert into auth.users(id) values($1),($2),($3)',[alice,bob,carol]);
  await db.query("insert into public.psi_tenants(id,name) values($1,'A'),($2,'B')",[tenant,otherTenant]);
  await db.query("insert into public.psi_tenant_memberships(tenant_id,user_id,role) values($1,$3,'owner'),($1,$4,'admin'),($2,$5,'owner')",
    [tenant,otherTenant,alice,bob,carol]);
  await db.query("insert into public.psi_tenant_sites(tenant_id,id,name) values($1,$3,'Site A'),($1,$4,'Site B'),($2,$5,'Site C')",
    [tenant,otherTenant,siteA,siteB,siteForeign]);
  await db.query('insert into public.psi_tenant_site_memberships(tenant_id,site_id,user_id) values($1,$3,$5),($1,$4,$6),($2,$7,$8)',
    [tenant,otherTenant,siteA,siteB,alice,bob,siteForeign,carol]);
  await addManifest(receiptA,siteA);
  await addManifest(receiptB,siteB);
  await addReport();
});
afterEach(async()=>await db.exec('rollback'));
afterAll(async()=>await db.close());

describe('NEXUS immutable source+official-original staging receipts',()=>{
  it('site member reads only the allowed site in both tables',async()=>{
    await asUser(alice);
    const source=await db.query<{site_id:string}>('select site_id from public.psi_nexus_source_manifest_staging');
    const reports=await db.query<{site_id:string}>('select site_id from public.psi_nexus_external_report_receipt_staging');
    expect(source.rows).toEqual([{site_id:siteA}]);
    expect(reports.rows).toEqual([{site_id:siteA}]);
    await asUser(bob);
    expect((await db.query('select * from public.psi_nexus_source_manifest_staging')).rows).toHaveLength(1);
    expect((await db.query('select * from public.psi_nexus_external_report_receipt_staging')).rows).toHaveLength(0);
    await asUser(carol);
    expect((await db.query('select * from public.psi_nexus_source_manifest_staging')).rows).toHaveLength(0);
  });
  it('suspension immediately removes source and document receipt visibility',async()=>{
    await asUser(alice);
    expect((await db.query('select * from public.psi_nexus_external_report_receipt_staging')).rows).toHaveLength(1);
    await db.exec('reset role');
    await db.query("update public.psi_tenant_site_memberships set status='suspended' where tenant_id=$1 and site_id=$2 and user_id=$3",
      [tenant,siteA,alice]);
    await asUser(alice);
    expect((await db.query('select * from public.psi_nexus_external_report_receipt_staging')).rows).toHaveLength(0);
    expect((await db.query('select * from public.psi_nexus_source_manifest_staging')).rows).toHaveLength(0);
  });
  it('client cannot insert, overwrite or delete a report receipt even when tenant owner',async()=>{
    await asUser(alice);
    await fails("insert into public.psi_nexus_source_manifest_staging(receipt_id) values($1)",['d9600000-0000-4000-8000-000000000099']);
    await fails("update public.psi_nexus_external_report_receipt_staging set independent_verification_status='pending_external_evidence_review'");
    await fails('delete from public.psi_nexus_source_manifest_staging');
    await fails('delete from public.psi_nexus_external_report_receipt_staging');
  });
  it('append-only trigger rejects overwrite even by migration writer role',async()=>{
    await fails("update public.psi_nexus_source_manifest_staging set source_record_count=3 where receipt_id=$1",[receiptA]);
    await fails("update public.psi_nexus_external_report_receipt_staging set declared_denominator=9 where report_receipt_id=$1",[reportA]);
    await fails("delete from public.psi_nexus_external_report_receipt_staging where report_receipt_id=$1",[reportA]);
  });
  it('checks source sum and rejects cross-site report association, forged approval',async()=>{
    await fails("update public.psi_nexus_source_manifest_staging set self_risk_high=99 where receipt_id=$1",[receiptA]);
    await fails(`insert into public.psi_nexus_external_report_receipt_staging(
      report_receipt_id,manifest_receipt_id,tenant_id,site_id,assessment_month,job_field,source_cutoff_at,
      external_original_sha256,external_document_mime,report_reference,source_system,
      document_issued_at,denominator_kind,declared_denominator,received_by
    ) values('e9600000-0000-4000-8000-000000000009',$1,$2,$3,'2026-10-01','형틀',
      '2026-11-15T07:00:00Z',$4,'application/pdf','X','TEST',
      '2026-11-15T08:00:00Z','assessment_record_rows',3,$5)`,
      [receiptA,tenant,siteB,shaA,alice]);
    await fails("update public.psi_nexus_external_report_receipt_staging set independent_verification_status='approved'");
  });
  it('preserves pending-only state, never claims a checksum as official acceptance',async()=>{
    const source=await db.query<{provenance_status:string}>('select provenance_status from public.psi_nexus_source_manifest_staging where receipt_id=$1',[receiptA]);
    const report=await db.query<{independent_verification_status:string;declared_denominator:number}>(
      'select independent_verification_status,declared_denominator from public.psi_nexus_external_report_receipt_staging where report_receipt_id=$1',[reportA]);
    expect(source.rows[0].provenance_status).toBe('scope_checked_not_server_attested');
    expect(report.rows[0]).toEqual({independent_verification_status:'pending_external_evidence_review',declared_denominator:3});
  });
},30000);

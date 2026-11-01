import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';

const ta='b9500000-0000-4000-8000-000000000001',tb='b9500000-0000-4000-8000-000000000002';
const owner='a9500000-0000-4000-8000-000000000001',other='a9500000-0000-4000-8000-000000000002';
const reviewer='a9500000-0000-4000-8000-000000000003',admin='a9500000-0000-4000-8000-000000000004',viewer='a9500000-0000-4000-8000-000000000005';
const key='c9500000-0000-4000-8000-000000000001',alt='c9500000-0000-4000-8000-000000000002';
const packageHash='a'.repeat(64),selectionHash='b'.repeat(64);
let db:PGlite;
async function asUser(id:string){await db.exec('set local role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);}
async function deny(sql:string,args:unknown[]=[]){await db.exec('savepoint no');await expect(db.query(sql,args)).rejects.toBeDefined();await db.exec('rollback to savepoint no;release savepoint no');}
const create=(tenant=ta,nonce=key)=>db.query<{id:string;created_by:string;created_at:string}>(
'insert into public.psi_tenant_disclosure_requests(tenant_id,client_request_id,external_record_ref,package_sha256,selection_sha256,purpose,recipient_organization,request_reference) values($1,$2,$3,$4,$5,$6,$7,$8) returning id,created_by,created_at',
[tenant,nonce,'synthetic-worker',packageHash,selectionHash,'산업안전 조사 자료 제출 전 적법성 검토','가상 감독기관','모의공문-001']);
const decide=(tenant:string,requestId:string,decision='review_plan_approved')=>db.query<{decided_by:string;decided_at:string;decision:string}>(
'insert into public.psi_tenant_disclosure_decisions(tenant_id,request_id,decision,decision_note) values($1,$2,$3,$4) returning decided_by,decided_at,decision',
[tenant,requestId,decision,'제출 목적과 공개 대상 파일을 별도로 확인한 결과']);

beforeAll(async()=>{
 db=new PGlite();
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
 await db.exec(await readFile(resolve('supabase/migrations/20260929000000_tenant_identity_foundation.sql'),'utf8'));
 await db.exec(await readFile(resolve('supabase/proposals/psi_tenant_disclosure_reviews_staging.sql'),'utf8'));
},30000);
beforeEach(async()=>{
 await db.exec('begin');
 await db.query('insert into auth.users(id) values($1),($2),($3),($4),($5)',[owner,other,reviewer,admin,viewer]);
 await db.query("insert into public.psi_tenants(id,name) values($1,'A'),($2,'B')",[ta,tb]);
 await db.query("insert into public.psi_tenant_memberships(tenant_id,user_id,role) values($1,$3,'owner'),($2,$4,'owner'),($1,$5,'reviewer'),($1,$6,'admin'),($1,$7,'viewer')",[ta,tb,owner,other,reviewer,admin,viewer]);
});
afterEach(async()=>{await db.exec('rollback');});
afterAll(async()=>{await db.close();});
describe('disclosure proposal approval: two distinct tenant actors',()=>{
 it('issues DB-clock author and reviewer identities on separate append-only rows',async()=>{
  await asUser(reviewer);const p=(await create()).rows[0];
  expect(p.created_by).toBe(reviewer);expect(Number.isFinite(Date.parse(p.created_at))).toBe(true);
  await asUser(owner);const d=(await decide(ta,p.id)).rows[0];
  expect(d.decided_by).toBe(owner);expect(d.decision).toBe('review_plan_approved');
  expect(Number.isFinite(Date.parse(d.decided_at))).toBe(true);
 });
 it('blocks owner self-approval and allows independent rejection',async()=>{
  await asUser(owner);const p=(await create()).rows[0];
  await deny('insert into public.psi_tenant_disclosure_decisions(tenant_id,request_id,decision,decision_note) values($1,$2,$3,$4)',[ta,p.id,'review_plan_approved','본인 검토 승인 조작 시도']);
  await asUser(admin);expect((await decide(ta,p.id,'review_plan_rejected')).rows[0].decision).toBe('review_plan_rejected');
 });
 it('blocks reviewer decision, viewer, cross-tenant and suspended users',async()=>{
  await asUser(reviewer);const p=(await create()).rows[0];
  await deny('insert into public.psi_tenant_disclosure_decisions(tenant_id,request_id,decision,decision_note) values($1,$2,$3,$4)',[ta,p.id,'review_plan_approved','권한 없는 신청자의 승인 시도']);
  await asUser(viewer);expect((await db.query('select id from public.psi_tenant_disclosure_requests')).rows).toHaveLength(0);
  await deny('insert into public.psi_tenant_disclosure_requests(tenant_id,client_request_id,external_record_ref,package_sha256,selection_sha256,purpose,recipient_organization,request_reference) values($1,$2,$3,$4,$5,$6,$7,$8)',
   [ta,alt,'worker',packageHash,selectionHash,'검증할 만큼 충분한 설명','기관','가상-001']);
  await asUser(other);expect((await db.query('select id from public.psi_tenant_disclosure_requests')).rows).toHaveLength(0);
  await deny('insert into public.psi_tenant_disclosure_decisions(tenant_id,request_id,decision,decision_note) values($1,$2,$3,$4)',[tb,p.id,'review_plan_approved','다른 기업의 기록을 결재하는 시도']);
  await db.exec('reset role');await db.query("update public.psi_tenant_memberships set status='suspended' where tenant_id=$1 and user_id=$2",[ta,admin]);
  await asUser(admin);expect((await db.query('select id from public.psi_tenant_disclosure_requests')).rows).toHaveLength(0);
 });
 it('prevents duplicate decisions and client-supplied time or actor values',async()=>{
  await asUser(reviewer);const p=(await create()).rows[0];await asUser(owner);await decide(ta,p.id);
  await deny('insert into public.psi_tenant_disclosure_decisions(tenant_id,request_id,decision,decision_note) values($1,$2,$3,$4)',[ta,p.id,'review_plan_rejected','두 번째로 반려하려는 시도']);
  await asUser(admin);
  await deny('insert into public.psi_tenant_disclosure_decisions(tenant_id,request_id,decision,decision_note,decided_at) values($1,$2,$3,$4,$5)',[ta,p.id,'review_plan_approved','사후 기록 시점 조작 시도','2025-01-01']);
 });
 it('rejects UPDATE and DELETE even when privileged role bypasses RLS',async()=>{
  await asUser(reviewer);const p=(await create()).rows[0];await asUser(owner);await decide(ta,p.id);
  await db.exec('reset role');
  await db.exec('grant select,update,delete on public.psi_tenant_disclosure_requests,public.psi_tenant_disclosure_decisions to service_role');
  await db.exec('set local role service_role');
  await deny('update public.psi_tenant_disclosure_requests set purpose=$1 where id=$2',['과거 자료 변경',p.id]);
  await deny('delete from public.psi_tenant_disclosure_decisions where request_id=$1',[p.id]);
 });
 it('rejects malformed hash and reused submission request id',async()=>{
  await asUser(reviewer);await create();
  await deny('insert into public.psi_tenant_disclosure_requests(tenant_id,client_request_id,external_record_ref,package_sha256,selection_sha256,purpose,recipient_organization,request_reference) values($1,$2,$3,$4,$5,$6,$7,$8)',
   [ta,alt,'worker','invalid',selectionHash,'안전관리 관련 자료 제출 검토','기관','가상-001']);
  await deny('insert into public.psi_tenant_disclosure_requests(tenant_id,client_request_id,external_record_ref,package_sha256,selection_sha256,purpose,recipient_organization,request_reference) values($1,$2,$3,$4,$5,$6,$7,$8)',
   [ta,key,'worker',packageHash,selectionHash,'안전관리 관련 자료 제출 검토','기관','가상-001']);
 });
},30000);

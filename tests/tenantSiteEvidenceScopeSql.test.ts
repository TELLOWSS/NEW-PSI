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
const siteA='f9500000-0000-4000-8000-000000000001',siteB='f9500000-0000-4000-8000-000000000002';
const workerA='d9500000-0000-4000-8000-000000000001',workerB='d9500000-0000-4000-8000-000000000002';
const create=(site=siteA,nonce=key)=>db.query<{id:string}>(
"insert into public.psi_tenant_disclosure_requests(tenant_id,site_id,client_request_id,external_record_ref,package_sha256,selection_sha256,purpose,recipient_organization,request_reference) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id",
[ta,site,nonce,'synthetic-worker',packageHash,selectionHash,'가상 산업안전 제출자료 검토 사유','가상 감독기관','가상 요청-001']);
const receipt=(site:string,worker:string,nonce:string)=>db.query(
"insert into public.psi_tenant_evidence_receipts(tenant_id,site_id,request_id,worker_id,source_kind,media_type,original_bytes) values($1,$2,$3,$4,'worker_form','image/jpeg',decode('ffd8ff01','hex')) returning id",
[ta,site,nonce,worker]);
const decide=(site:string,ref:string)=>db.query(
"insert into public.psi_tenant_disclosure_decisions(tenant_id,site_id,request_id,decision,decision_note) values($1,$2,$3,'review_plan_approved','서로 다른 관리자에 의한 제출안 검토') returning decided_by",
[ta,site,ref]);
beforeAll(async()=>{
 db=new PGlite();
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
 await db.exec(await readFile(resolve('supabase/migrations/20260929000000_tenant_identity_foundation.sql'),'utf8'));
 await db.exec('create table public.psi_tenant_workers(tenant_id uuid not null references public.psi_tenants(id),id uuid not null,primary key(tenant_id,id));');
 for(const file of ['psi_tenant_evidence_receipts_staging.sql','psi_tenant_disclosure_reviews_staging.sql','psi_tenant_site_memberships_staging.sql','psi_site_worker_read_policy_staging.sql','psi_tenant_site_evidence_scope_staging.sql'])
  await db.exec(await readFile(resolve('supabase/proposals',file),'utf8'));
},30000);
beforeEach(async()=>{
 await db.exec('begin');
 await db.query('insert into auth.users(id) values($1),($2),($3),($4),($5)',[owner,other,reviewer,admin,viewer]);
 await db.query("insert into public.psi_tenants(id,name) values($1,'A'),($2,'B')",[ta,tb]);
 await db.query("insert into public.psi_tenant_memberships(tenant_id,user_id,role) values($1,$3,'owner'),($2,$4,'owner'),($1,$5,'reviewer'),($1,$6,'admin'),($1,$7,'viewer')",[ta,tb,owner,other,reviewer,admin,viewer]);
 await db.query("insert into public.psi_tenant_sites(tenant_id,id,name) values($1,$2,'A Site'),($1,$3,'B Site')",[ta,siteA,siteB]);
 await db.query('insert into public.psi_tenant_site_memberships(tenant_id,site_id,user_id) values($1,$2,$4),($1,$2,$5),($1,$3,$6)',[ta,siteA,siteB,reviewer,owner,admin]);
 await db.query('insert into public.psi_tenant_workers(tenant_id,id) values($1,$2),($1,$3)',[ta,workerA,workerB]);
 await db.query('insert into public.psi_tenant_site_worker_assignments(tenant_id,site_id,worker_id) values($1,$2,$4),($1,$3,$5)',[ta,siteA,siteB,workerA,workerB]);
});
afterEach(async()=>{await db.exec('rollback');});
afterAll(async()=>{await db.close();});
describe('P05 site boundary in one tenant',()=>{
 it('does not give company reviewer access to another site',async()=>{
   await asUser(reviewer);await receipt(siteA,workerA,key);
   expect((await db.query('select id from public.psi_tenant_evidence_receipts')).rows).toHaveLength(1);
   await deny("insert into public.psi_tenant_evidence_receipts(tenant_id,site_id,request_id,worker_id,source_kind,media_type,original_bytes) values($1,$2,$3,$4,'worker_form','image/jpeg',decode('ffd8ff01','hex'))",[ta,siteB,alt,workerB]);
   await asUser(admin);
   expect((await db.query('select id from public.psi_tenant_evidence_receipts')).rows).toHaveLength(0);
 });
 it('refuses wrong worker-site attachment even for a site member',async()=>{
   await asUser(reviewer);
   await deny("insert into public.psi_tenant_evidence_receipts(tenant_id,site_id,request_id,worker_id,source_kind,media_type,original_bytes) values($1,$2,$3,$4,'worker_form','image/jpeg',decode('ffd8ff01','hex'))",[ta,siteA,key,workerB]);
 });
 it('requires same site for independent approval',async()=>{
   await asUser(reviewer);const p=(await create()).rows[0];
   await asUser(admin);
   expect((await db.query('select id from public.psi_tenant_disclosure_requests')).rows).toHaveLength(0);
   await deny("insert into public.psi_tenant_disclosure_decisions(tenant_id,site_id,request_id,decision,decision_note) values($1,$2,$3,'review_plan_approved','다른 현장 승인 시도')",[ta,siteB,p.id]);
   await asUser(owner);
   const d=await decide(siteA,p.id);expect((d.rows[0] as {decided_by:string}).decided_by).toBe(owner);
 });
 it('removes read permission on suspended site membership',async()=>{
   await asUser(reviewer);await receipt(siteA,workerA,key);
   await db.exec('reset role');
   await db.query("update public.psi_tenant_site_memberships set status='suspended' where tenant_id=$1 and site_id=$2 and user_id=$3",[ta,siteA,reviewer]);
   await asUser(reviewer);expect((await db.query('select id from public.psi_tenant_evidence_receipts')).rows).toHaveLength(0);
 });
},30000);

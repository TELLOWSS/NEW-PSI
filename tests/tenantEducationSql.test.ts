import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from 'vitest';
const tenant='b9300000-0000-4000-8000-000000000001', foreign='b9300000-0000-4000-8000-000000000002';
const owner='a9300000-0000-4000-8000-000000000001', workerUser='a9300000-0000-4000-8000-000000000002', outsider='a9300000-0000-4000-8000-000000000003';
const request='d9300000-0000-4000-8000-000000000001';
let db:PGlite, worker:string, draft:string;
async function user(id:string) { await db.exec('set local role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]); }
async function denied(sql:string,args:unknown[]=[]) { await db.exec('savepoint denied'); await expect(db.query(sql,args)).rejects.toBeDefined(); await db.exec('rollback to savepoint denied; release savepoint denied'); }
async function publish(hours=24) { return (await db.query<any>('select (public.psi_publish_tenant_education($1,$2,1,$3,$4)).*',[tenant,draft,request,hours])).rows[0]; }
async function read(id:string) { return db.query<any>('select public.psi_read_worker_education($1,$2) as education',[id,worker]); }
beforeAll(async()=>{
 db=new PGlite(); await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
 for(const file of ['20260929000000_tenant_identity_foundation.sql','20260930010000_tenant_training_drafts.sql','20260930020000_tenant_training_audience.sql','20260930030000_tenant_education_release.sql']) await db.exec(await readFile(resolve('supabase/migrations',file),'utf8'));
},30000);
beforeEach(async()=>{
 await db.exec('begin');
 await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.invalid',now()),($2,'worker@example.invalid',now()),($3,'other@example.invalid',now())",[owner,workerUser,outsider]);
 await db.query("insert into public.psi_tenants(id,name) values($1,'Test A'),($2,'Test B')",[tenant,foreign]);
 await db.query("insert into public.psi_tenant_memberships(tenant_id,user_id,role) values($1,$2,'owner')",[tenant,owner]);
 await user(owner);
 worker=(await db.query<any>("insert into public.psi_tenant_workers(tenant_id,name,worker_code,trade) values($1,'Worker','W1','Test') returning id",[tenant])).rows[0].id;
 draft=(await db.query<any>("insert into public.psi_tenant_training_drafts(tenant_id,title,site_name,source_text_ko,worker_ids) values($1,'Education','Site','안전 교육',array[$2::uuid]) returning id",[tenant,worker])).rows[0].id;
 await db.query("select public.psi_link_worker_account($1,$2,'worker@example.invalid',0)",[tenant,worker]);
});
afterEach(async()=>{await db.exec('rollback');}); afterAll(async()=>{await db.close();});
it('permits only the assigned personal account and returns a narrow snapshot',async()=>{
 const release=await publish(); await user(workerUser);
 const material=(await read(release.id)).rows[0].education;
 expect(material).toMatchObject({title:'Education',sourceTextKo:'안전 교육',workerName:'Worker',draftRevision:1});
 expect(Object.keys(material).sort()).toEqual(['draftRevision','expiresAt','siteName','sourceTextKo','title','workerName']);
 for(const table of ['psi_tenant_worker_accounts','psi_tenant_worker_account_events','psi_tenant_education_releases','psi_tenant_education_release_events']) expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(0);
 await user(outsider); await denied('select public.psi_read_worker_education($1,$2)',[release.id,worker]);
 await db.exec('set local role anon'); await denied('select public.psi_read_worker_education($1,$2)',[release.id,worker]);
});
it('rejects cross-company management and non-manager publication',async()=>{
 await denied("select public.psi_link_worker_account($1,$2,'worker@example.invalid',1)",[foreign,worker]);
 await denied('select public.psi_publish_tenant_education($1,$2,1,$3,24)',[foreign,draft,request]);
 await db.exec('reset role'); await db.query("update public.psi_tenant_memberships set role='reviewer' where user_id=$1",[owner]); await user(owner);
 await denied('select public.psi_publish_tenant_education($1,$2,1,$3,24)',[tenant,draft,request]);
 expect((await db.query('select * from public.psi_tenant_worker_accounts')).rows).toHaveLength(0);
});
it('replays publication without duplicate audit or extending expiry and rejects changed input',async()=>{
 const first=await publish(), second=await publish(); expect(second).toEqual(first);
 expect((await db.query('select * from public.psi_tenant_education_release_events')).rows).toHaveLength(1);
 await denied('select public.psi_publish_tenant_education($1,$2,1,$3,48)',[tenant,draft,request]);
 for(const hours of [0,169,null]) await denied('select public.psi_publish_tenant_education($1,$2,1,$3,$4)',[tenant,draft,request,hours]);
 await denied('select public.psi_publish_tenant_education($1,$2,null,$3,24)',[tenant,draft,request]);
});
it.each(['revoked','expired','draft','targets','worker','binding','publisher','email','unconfirmed','banned','deleted'])('blocks the next read after %s changes',async(condition)=>{
 const release=await publish();
 if(condition==='revoked') await db.query('select public.psi_revoke_tenant_education($1,$2,1)',[tenant,release.id]);
 else if(condition==='draft') await db.query("update public.psi_tenant_training_drafts set source_text_ko='변경' where id=$1",[draft]);
 else if(condition==='targets') await db.query("update public.psi_tenant_training_drafts set worker_ids='{}' where id=$1",[draft]);
 else if(condition==='worker') await db.query('update public.psi_tenant_workers set active=false where id=$1',[worker]);
 else if(condition==='binding') await db.query('select public.psi_suspend_worker_account($1,$2,1)',[tenant,worker]);
 else { await db.exec('reset role');
  if(condition==='expired') await db.query("update public.psi_tenant_education_releases set expires_at=now()-interval '1 hour' where id=$1",[release.id]);
  if(condition==='publisher') await db.query("update public.psi_tenant_memberships set status='suspended' where user_id=$1",[owner]);
  if(condition==='email') await db.query("update auth.users set email='changed@example.invalid' where id=$1",[workerUser]);
  if(condition==='unconfirmed') await db.query('update auth.users set email_confirmed_at=null where id=$1',[workerUser]);
  if(condition==='banned') await db.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1",[workerUser]);
  if(condition==='deleted') await db.query('update auth.users set deleted_at=now() where id=$1',[workerUser]);
 }
 await user(workerUser); await denied('select public.psi_read_worker_education($1,$2)',[release.id,worker]);
});
it('rejects unconfirmed or unavailable accounts at linking and publication',async()=>{
 await db.exec('reset role'); await db.query('update auth.users set email_confirmed_at=null where id=$1',[workerUser]); await user(owner);
 await denied("select public.psi_link_worker_account($1,$2,'worker@example.invalid',1)",[tenant,worker]);
 await denied('select public.psi_publish_tenant_education($1,$2,1,$3,24)',[tenant,draft,request]);
});
it('rejects stale account revisions and immutable snapshot/audit edits',async()=>{
 await publish(); await denied("select public.psi_link_worker_account($1,$2,'worker@example.invalid',0)",[tenant,worker]);
 for(const table of ['psi_tenant_worker_accounts','psi_tenant_worker_account_events','psi_tenant_education_releases','psi_tenant_education_release_events']) await denied(`delete from public.${table}`);
 await denied("update public.psi_tenant_education_releases set source_text_ko='forged'");
});
it('rolls back publication when audit creation fails',async()=>{
 await db.exec("reset role; alter table public.psi_tenant_education_release_events add constraint test_failure check(action<>'published')"); await user(owner);
 await denied('select public.psi_publish_tenant_education($1,$2,1,$3,24)',[tenant,draft,request]);
 expect((await db.query('select * from public.psi_tenant_education_releases')).rows).toHaveLength(0);
});
it('rolls back account changes when their audit append fails',async()=>{
 await db.exec('reset role; alter table public.psi_tenant_worker_account_events add constraint test_failure check(revision<>2)');await user(owner);
 await denied('select public.psi_suspend_worker_account($1,$2,1)',[tenant,worker]);
 expect((await db.query('select active,revision from public.psi_tenant_worker_accounts')).rows).toEqual([{active:true,revision:1}]);
});
it('does not map the same personal account to two workers within a company',async()=>{
 const second=(await db.query<any>("insert into public.psi_tenant_workers(tenant_id,name,worker_code,trade) values($1,'Second','W2','Test') returning id",[tenant])).rows[0].id;
 await denied("select public.psi_link_worker_account($1,$2,'worker@example.invalid',0)",[tenant,second]);
 expect((await db.query('select * from public.psi_tenant_worker_accounts')).rows).toHaveLength(1);
});
it('rejects an unassigned worker even when its personal account is valid',async()=>{
 const second=(await db.query<any>("insert into public.psi_tenant_workers(tenant_id,name,worker_code,trade) values($1,'Second','W2','Test') returning id",[tenant])).rows[0].id;
 await db.query("select public.psi_link_worker_account($1,$2,'other@example.invalid',0)",[tenant,second]);const release=await publish();await user(outsider);
 await denied('select public.psi_read_worker_education($1,$2)',[release.id,second]);
});
it('requires every target to have a usable account and refuses an empty audience',async()=>{
 await db.query('select public.psi_suspend_worker_account($1,$2,1)',[tenant,worker]);
 await denied('select public.psi_publish_tenant_education($1,$2,1,$3,24)',[tenant,draft,request]);
 await db.query("update public.psi_tenant_training_drafts set worker_ids='{}' where id=$1",[draft]);
 await denied('select public.psi_publish_tenant_education($1,$2,2,$3,24)',[tenant,draft,request]);
});

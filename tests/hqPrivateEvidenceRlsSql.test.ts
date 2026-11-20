import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {createPrivatePgEvidenceOutboxAdapter} from '../lib/server/hqEvidencePgOutboxAdapter';
import {expect,it} from 'vitest';

const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const site='11111111-1111-4111-8111-111111111111';
const otherSite='22222222-2222-4222-8222-222222222222';
const author='33333333-3333-4333-8333-333333333333';
const siteReviewer='44444444-4444-4444-8444-444444444444';
const hqReviewer='55555555-5555-4555-8555-555555555555';
const supervisor='66666666-6666-4666-8666-666666666666';
const outsider='77777777-7777-4777-8777-777777777777';
const caseId='88888888-8888-4888-8888-888888888888';
const fileId='99999999-9999-4999-8999-999999999999';
const quote=(v:string)=>"'"+v.replaceAll("'","''")+"'";
const manifest='hq_evidence_staging.evidence_manifest';
const events='hq_evidence_staging.access_events';

it('HQ private evidence proposal keeps sealed metadata/site scope and append-only audit isolated',async()=>{
 const db=new PGlite();
 try{
  await db.exec([
   'create role anon;','create role authenticated;','create role service_role bypassrls;',
   'create schema auth;','create table auth.users(id uuid primary key);',
   "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
   'grant usage on schema auth to authenticated;',
   'grant execute on function auth.uid() to authenticated;'
  ].join('\n'));
  await db.exec(await readFile(resolve('supabase/migrations/20260929000000_tenant_identity_foundation.sql'),'utf8'));
  await db.exec([
   'create table public.psi_tenant_sites(tenant_id uuid not null references public.psi_tenants(id),id uuid not null,name text not null,active boolean not null default true,primary key(tenant_id,id));',
   'create table public.psi_tenant_site_memberships(tenant_id uuid not null,site_id uuid not null,user_id uuid not null,status text not null,primary key(tenant_id,site_id,user_id),foreign key(tenant_id,site_id) references public.psi_tenant_sites(tenant_id,id),foreign key(tenant_id,user_id) references public.psi_tenant_memberships(tenant_id,user_id));',
   'alter table public.psi_tenant_site_memberships enable row level security;',
   'alter table public.psi_tenant_site_memberships force row level security;',
   'grant select on public.psi_tenant_site_memberships to authenticated;',
   "create policy site_self_read on public.psi_tenant_site_memberships for select to authenticated using (user_id=auth.uid() and status='active' and exists(select 1 from public.psi_tenant_memberships m where m.tenant_id=psi_tenant_site_memberships.tenant_id and m.user_id=auth.uid() and m.status='active'));",
   'alter table public.psi_tenant_sites enable row level security;',
   'alter table public.psi_tenant_sites force row level security;',
   'grant select on public.psi_tenant_sites to authenticated;',
   "create policy site_active_member_read on public.psi_tenant_sites for select to authenticated using (active=true and exists(select 1 from public.psi_tenant_site_memberships m where m.tenant_id=psi_tenant_sites.tenant_id and m.site_id=psi_tenant_sites.id and m.user_id=auth.uid() and m.status='active'));",
   'insert into auth.users(id) values ('+[author,siteReviewer,hqReviewer,supervisor,outsider].map(quote).join('),(')+');',
   'insert into public.psi_tenants(id,name) values ('+quote(tenant)+",'Synthetic tenant');",
   'insert into public.psi_tenant_memberships(tenant_id,user_id,role,status) values '+
     [[author,'reviewer'],[siteReviewer,'reviewer'],[hqReviewer,'admin'],[supervisor,'owner'],[outsider,'owner']]
     .map(([u,r])=>'('+quote(tenant)+','+quote(u)+','+quote(r)+",'active')").join(',')+';',
   'insert into public.psi_tenant_sites(tenant_id,id,name) values ('+quote(tenant)+','+quote(site)+",'Site A'),("+quote(tenant)+','+quote(otherSite)+",'Site B');",
   'insert into public.psi_tenant_site_memberships(tenant_id,site_id,user_id,status) values '+
    [[site,author],[site,siteReviewer],[site,hqReviewer],[site,supervisor],[otherSite,outsider]]
    .map(([s,u])=>'('+quote(tenant)+','+quote(s)+','+quote(u)+",'active')").join(',')+';'
  ].join('\n'));
  await db.exec(await readFile(resolve('supabase/proposals/psi_hq_incident_case_staging.sql'),'utf8'));
  await db.exec(await readFile(resolve('supabase/proposals/psi_hq_independent_review_staging.sql'),'utf8'));
  await db.exec(await readFile(resolve('supabase/proposals/psi_hq_evidence_private_staging.sql'),'utf8'));
  await db.exec(await readFile(resolve('supabase/proposals/psi_hq_transport_outbox_staging.sql'),'utf8'));
  const asUser=async(uid:string,sql:string)=>{
   await db.exec('set role authenticated;');
   await db.exec('set request.jwt.claim.sub = '+quote(uid)+';');
   try{return await db.query(sql);}finally{await db.exec('reset role; reset request.jwt.claim.sub;');}
  };
  await asUser(author,'insert into public.psi_hq_incident_cases(tenant_id,site_id,id,occurred_on,construction_zone,process_code,incident_type,summary) values ('+
   [tenant,site,caseId,'2026-11-20','지하','formwork','끼임','합성 일반형틀 사고자료 검증을 위한 테스트'].map(quote).join(',')+');');
  await db.exec('insert into hq_safe_staging.review_assignments(tenant_id,site_id,case_id,report_version,report_ref,author_id,site_reviewer_id,hq_reviewer_id,assigned_by) values ('+
   [tenant,site,caseId,'1','DEMO-REPORT01',author,siteReviewer,hqReviewer,supervisor]
   .map((v,i)=>i===3?v:quote(v)).join(',')+');');
  const key=[tenant,site,caseId,fileId].join('/')+'.pdf';
  const sha='01'.repeat(32);
  const insert=(override:{site?:string;key?:string;type?:string;digest?:string}={})=>{
   return 'insert into '+manifest+
    '(tenant_id,site_id,case_id,id,storage_key,media_type,byte_count,sha256,verified_by) values ('+
    [tenant,override.site||site,caseId,fileId,override.key||key,override.type||'application/pdf','256',override.digest||sha,supervisor]
    .map((v,i)=>i===6?v:quote(v)).join(',')+');';
  };
  await expect(asUser(author,insert())).rejects.toThrow();
  await expect(asUser(hqReviewer,insert())).rejects.toThrow();
  await expect(db.query(insert({site:otherSite}))).rejects.toThrow();
  await expect(db.query(insert({key:'other-tenant/private.pdf'}))).rejects.toThrow();
  await expect(db.query(insert({type:'text/html'}))).rejects.toThrow();
  await expect(db.query(insert({digest:'not-a-sha'}))).rejects.toThrow();
  await db.query(insert());
  for(const uid of [author,siteReviewer,hqReviewer,supervisor]){
   const result=await asUser(uid,'select count(*)::int as count from '+manifest);
   expect((result.rows[0] as {count:number}).count).toBe(1);
  }
  const hidden=await asUser(outsider,'select count(*)::int as count from '+manifest);
  expect((hidden.rows[0] as {count:number}).count).toBe(0);
  const log='insert into '+events+
   '(tenant_id,site_id,case_id,evidence_id,event_type,actor_id,event_code) values ('+
   [tenant,site,caseId,fileId,'intake_verified',supervisor,'HASH_MATCH_TEST'].map(quote).join(',')+');';
  await db.query(log);
  await expect(asUser(author,'select * from '+events)).rejects.toThrow();
  await expect(asUser(siteReviewer,log)).rejects.toThrow();
  await expect(asUser(hqReviewer,"update "+manifest+" set sha256='00'")).rejects.toThrow();
  await expect(asUser(author,"delete from "+manifest)).rejects.toThrow();
  await expect(asUser(supervisor,"update "+events+" set event_code='TAMPER'")).rejects.toThrow();
  await expect(asUser(outsider,"delete from "+events)).rejects.toThrow();

  // Phase 15: denied attempts are still auditable when case/evidence IDs
  // do not exist, because security_attempts deliberately has no manifest FK.
  const securityTable='hq_evidence_staging.security_attempts';
  const nonexistentCase='aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa';
  const nonexistentEvidence='bbbbbbbb-cccc-4bbb-8bbb-bbbbbbbbbbbb';
  const deniedSql=(action='evidence_read_denied',denialCode='manifest_unavailable')=>
   'insert into '+securityTable+
   '(tenant_id,site_id,case_id,evidence_id,actor_id,action,denial_code) values ('+
   [tenant,site,nonexistentCase,nonexistentEvidence,author,action,denialCode].map(quote).join(',')+');';
  await db.query(deniedSql());
  const recorded=await db.query('select case_id,evidence_id,denial_code from '+securityTable+';');
  expect(recorded.rows).toEqual([{
   case_id:nonexistentCase,evidence_id:nonexistentEvidence,denial_code:'manifest_unavailable'
  }]);
  await expect(db.query(deniedSql('approved'))).rejects.toThrow();
  await expect(db.query(deniedSql('evidence_read_denied','UNKNOWN_REASON'))).rejects.toThrow();
  await expect(asUser(author,deniedSql())).rejects.toThrow();
  await expect(asUser(hqReviewer,'select * from '+securityTable)).rejects.toThrow();
  await expect(asUser(supervisor,"update "+securityTable+" set denial_code='other_denied'")).rejects.toThrow();
  await expect(asUser(outsider,"delete from "+securityTable)).rejects.toThrow();

  // Phase 17: transport outbox persistence is independent of the worker process.
  const transport='hq_evidence_staging.transport_outbox';
  const receiptId='aaaaaaaa-dddd-4aaa-8aaa-aaaaaaaaaaaa';
  const addReceipt='insert into '+transport+
   '(id,tenant_id,site_id,case_id,evidence_id,actor_id) values ('+
   [receiptId,tenant,site,caseId,fileId,author].map(quote).join(',')+');';
  await db.query(addReceipt);
  const prepared=await db.query('select state,acked_at from '+transport+' where id='+quote(receiptId));
  expect(prepared.rows).toEqual([{state:'prepared',acked_at:null}]);
  await expect(asUser(author,addReceipt)).rejects.toThrow();
  await expect(asUser(hqReviewer,'select * from '+transport)).rejects.toThrow();
  await expect(asUser(supervisor,"update "+transport+" set state='response_flushed'")).rejects.toThrow();
  await expect(asUser(outsider,"delete from "+transport)).rejects.toThrow();
  // An operator may settle only after a distinct server finish/close signal.
  await db.query('update '+transport+" set state='response_flushed',settled_at=now() where id="+quote(receiptId));
  const settled=await db.query('select state,settled_at is not null as settled from '+transport+' where id='+quote(receiptId));
  expect(settled.rows).toEqual([{state:'response_flushed',settled:true}]);
  await expect(db.query('update '+transport+" set state='prepared' where id="+quote(receiptId))).rejects.toThrow();
  await db.query('update '+transport+' set delivery_attempts=1,next_attempt_at=now() where id='+quote(receiptId));
  await db.query('update '+transport+' set acked_at=now() where id='+quote(receiptId));
  const acknowledged=await db.query('select acked_at is not null as acked from '+transport+' where id='+quote(receiptId));
  expect(acknowledged.rows).toEqual([{acked:true}]);
  const neverExisted='bbbbbbbb-dddd-4bbb-8bbb-bbbbbbbbbbbb';
  await expect(db.query(
   'insert into '+transport+'(tenant_id,site_id,case_id,evidence_id,actor_id) values ('+
    [tenant,site,caseId,neverExisted,author].map(quote).join(',')+');'
  )).rejects.toThrow();

  // Phase 18: fully parameterized PostgreSQL SKIP LOCKED worker adapter.
  const auditDelivered:string[]=[],alerts:string[]=[];
  const dbPort={query:async(sql:string,params?:unknown[])=>{
   const result=await db.query(sql,params as any[]);
   return {rows:result.rows as Record<string,unknown>[]};
  }};
  const sink=async(_event:any,idempotencyKey:string)=>{auditDelivered.push(idempotencyKey);};
  const alert=async(event:any)=>{alerts.push(event.code);};
  const workerA=createPrivatePgEvidenceOutboxAdapter(dbPort,sink,alert);
  const workerB=createPrivatePgEvidenceOutboxAdapter(dbPort,sink,alert);
  const preparedScope={
   tenantId:tenant,siteId:site,caseId,evidenceId:fileId,actorId:author
  };
  const recovered=await workerA.prepare(preparedScope);
  expect(recovered.id).toMatch(/^[0-9a-f-]{36}$/);
  // An in-flight PREPARED event is invisible until its age grace elapses.
  expect(await workerA.claimDue(10)).toEqual([]);
  await db.query('update '+transport+" set created_at=clock_timestamp()-interval '3 minutes' where id=$1",
   [recovered.id]);
  const claimedA=await workerA.claimDue(10);
  expect(claimedA).toHaveLength(1);
  expect(claimedA[0]).toMatchObject({id:recovered.id,state:'prepared'});
  expect(await workerB.claimDue(10)).toEqual([]);
  await workerA.markUnconfirmed(recovered.id);
  await workerA.deliver({...claimedA[0],state:'unconfirmed'});
  await workerA.acknowledge(recovered.id);
  expect(auditDelivered).toEqual([recovered.id]);
  expect(await workerB.claimDue(10)).toEqual([]);
  const confirmed=await db.query('select state,acked_at is not null as acknowledged from '+
   transport+' where id=$1',[recovered.id]);
  expect(confirmed.rows).toEqual([{state:'unconfirmed',acknowledged:true}]);
  // A stale worker cannot write/ACK a row after another worker reclaims it.
  const stolen=await workerA.prepare(preparedScope);
  await workerA.settle(stolen.id,'response_flushed');
  const first=await workerA.claimDue(10);
  expect(first.map(x=>x.id)).toContain(stolen.id);
  await db.query('update '+transport+
   " set claim_expires_at=clock_timestamp()-interval '1 second' where id=$1",[stolen.id]);
  const second=await workerB.claimDue(10);
  expect(second.map(x=>x.id)).toContain(stolen.id);
  await expect(workerA.acknowledge(stolen.id)).rejects.toThrow('HQ_OUTBOX_STALE');
  await expect(workerA.deliver(first.find(x=>x.id===stolen.id)!))
   .rejects.toThrow('HQ_OUTBOX_STALE');
  await workerB.deliver(second.find(x=>x.id===stolen.id)!);
  await workerB.acknowledge(stolen.id);
  expect(auditDelivered).toEqual([recovered.id,stolen.id]);
  // RETRY clears the claim and delays re-acquisition until DB clock due.
  const delayed=await workerA.prepare(preparedScope);
  await workerA.settle(delayed.id,'response_aborted');
  const retryClaim=await workerA.claimDue(10);
  expect(retryClaim.map(x=>x.id)).toContain(delayed.id);
  await workerA.retry(delayed.id,30);
  expect(await workerB.claimDue(10)).toEqual([]);
  await db.query('update '+transport+
   " set next_attempt_at=clock_timestamp()-interval '1 second' where id=$1",[delayed.id]);
  const retryAgain=await workerB.claimDue(10);
  expect(retryAgain.map(x=>x.id)).toContain(delayed.id);
  await workerB.acknowledge(delayed.id);
  expect(alerts).toEqual([]);
  // Browser / unassigned users cannot claim through direct SQL either.
  await expect(asUser(author,'select * from '+transport+' for update skip locked'))
   .rejects.toThrow();

  // Revocation is effective even while a previously assigned review row remains.
  await db.exec('update public.psi_tenant_site_memberships set status='+quote('suspended')+
   ' where tenant_id='+quote(tenant)+' and site_id='+quote(site)+
   ' and user_id='+quote(siteReviewer)+';');
  const revoked=await asUser(siteReviewer,'select count(*)::int as count from '+manifest);
  expect((revoked.rows[0] as {count:number}).count).toBe(0);
 }finally{await db.close();}
},45_000);

import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {expect,it} from 'vitest';

// All identities, records and case descriptions are SYNTHETIC. No live DB calls.
const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const siteA='11111111-1111-4111-8111-111111111111';
const siteB='22222222-2222-4222-8222-222222222222';
const author='33333333-3333-4333-8333-333333333333';
const siteReviewer='44444444-4444-4444-8444-444444444444';
const hqReviewer='55555555-5555-4555-8555-555555555555';
const supervisor='66666666-6666-4666-8666-666666666666';
const outsider='77777777-7777-4777-8777-777777777777';
const viewer='88888888-8888-4888-8888-888888888888';
const incident='99999999-9999-4999-8999-999999999999';
const quote=(s:string)=>"'"+s.replaceAll("'","''")+"'";
const cols='tenant_id,site_id,case_id,report_version,report_ref,author_id,site_reviewer_id,hq_reviewer_id';
const assignmentTable='hq_safe_staging.review_assignments';
const feedbackTable='hq_safe_staging.review_feedback';

it('private HQ review proposal enforces authenticated tenant/site identity and immutable reviewer feedback',async()=>{
 const db=new PGlite();
 try{
  await db.exec([
   'create role anon;','create role authenticated;',
   'create role service_role bypassrls;',
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
   'insert into auth.users(id) values ('+[author,siteReviewer,hqReviewer,supervisor,outsider,viewer].map(quote).join('),(')+');',
   'insert into public.psi_tenants(id,name) values ('+quote(tenant)+",'Fictional HQ');",
   'insert into public.psi_tenant_memberships(tenant_id,user_id,role,status) values '+
     [[author,'reviewer'],[siteReviewer,'reviewer'],[hqReviewer,'admin'],[supervisor,'owner'],[outsider,'owner'],[viewer,'viewer']]
      .map(([user,role])=>'('+quote(tenant)+','+quote(user)+','+quote(role)+",'active')").join(',')+';',
   'insert into public.psi_tenant_sites(tenant_id,id,name) values ('+quote(tenant)+','+quote(siteA)+",'Site A'),("+quote(tenant)+','+quote(siteB)+",'Site B');",
   'insert into public.psi_tenant_site_memberships(tenant_id,site_id,user_id,status) values '+
      [[siteA,author],[siteA,siteReviewer],[siteA,hqReviewer],[siteA,supervisor],[siteA,viewer],[siteB,outsider]]
       .map(([site,user])=>'('+quote(tenant)+','+quote(site)+','+quote(user)+",'active')").join(',')+';'
  ].join('\n'));
  await db.exec(await readFile(resolve('supabase/proposals/psi_hq_incident_case_staging.sql'),'utf8'));
  await db.exec(await readFile(resolve('supabase/proposals/psi_hq_independent_review_staging.sql'),'utf8'));
  const asUser=async(user:string,query:string)=>{
   await db.exec('set role authenticated;');
   await db.exec('set request.jwt.claim.sub = '+quote(user)+';');
   try{return await db.query(query);}finally{await db.exec('reset role; reset request.jwt.claim.sub;');}
  };
  const makeCase='insert into public.psi_hq_incident_cases(tenant_id,site_id,id,occurred_on,construction_zone,process_code,incident_type,summary) values ('+
    [tenant,siteA,incident,'2026-11-20','지하','formwork','끼임','완전 가상의 일반 형틀 작업중 사고 사례'].map(quote).join(',')+');';
  await asUser(author,makeCase);
  const insertAssignment=(options:{site?:string;authorId?:string;siteReviewerId?:string;hqReviewerId?:string;operatorId?:string}={})=>{
   const columns=cols+',assigned_by';
   const values=[tenant,options.site||siteA,incident,'1','DEMO-REPORT-V1',
    options.authorId||author,options.siteReviewerId||siteReviewer,options.hqReviewerId||hqReviewer,
    options.operatorId||supervisor]
    .map((x,i)=>i===3?x:quote(x)).join(',');
   return 'insert into '+assignmentTable+'('+columns+') values ('+values+') returning id;';
  };
  // All browser accounts (including owner/admin) are denied assignment INSERT.
  await expect(asUser(author,insertAssignment())).rejects.toThrow();
  await expect(asUser(siteReviewer,insertAssignment())).rejects.toThrow();
  await expect(asUser(viewer,insertAssignment())).rejects.toThrow();
  await expect(asUser(outsider,insertAssignment())).rejects.toThrow();
  await expect(asUser(supervisor,insertAssignment())).rejects.toThrow();
  // Separate, trusted operator provisions assignments; invoker trigger validates
  // author identity, site membership, correct role and active HQ operator.
  await expect(db.query(insertAssignment({site:siteB}))).rejects.toThrow();
  await expect(db.query(insertAssignment({authorId:viewer}))).rejects.toThrow();
  await expect(db.query(insertAssignment({siteReviewerId:author}))).rejects.toThrow();
  await expect(db.query(insertAssignment({siteReviewerId:hqReviewer}))).rejects.toThrow();
  await expect(db.query(insertAssignment({hqReviewerId:viewer}))).rejects.toThrow();
  await expect(db.query(insertAssignment({operatorId:outsider}))).rejects.toThrow();
  const created=await db.query(insertAssignment());
  const assignmentId=(created.rows[0] as {id:string}).id;
  expect(assignmentId).toMatch(/^[a-f0-9-]{36}$/);

  const count=(table:string)=>'select count(*)::int as count from '+table+';';
  const visible=await asUser(author,count(assignmentTable));
  expect((visible.rows[0] as {count:number}).count).toBe(1);
  const hidden=await asUser(outsider,count(assignmentTable));
  expect((hidden.rows[0] as {count:number}).count).toBe(0);
  const feedback=(role:string,noteKind='question',extraColumn='',requestedSite=siteA)=>{
   const fields='tenant_id,site_id,case_id,assignment_id,reviewer_role,topic,note_kind,note,evidence_ref'+(extraColumn?',reviewed_by':'');
   const values=[tenant,requestedSite,incident,assignmentId,role,'chronology',noteKind,
    '이동 중 데크 걸림 경위와 진술 자료 대조 확인 요청', 'DEMO-REP-001']
    .map(quote).join(',')+(extraColumn?','+quote(extraColumn):'');
   return 'insert into '+feedbackTable+'('+fields+') values ('+values+');';
  };
  await expect(asUser(author,feedback('site'))).rejects.toThrow();
  await expect(asUser(supervisor,feedback('hq'))).rejects.toThrow();
  await expect(asUser(outsider,feedback('hq'))).rejects.toThrow();
  await expect(asUser(siteReviewer,feedback('hq'))).rejects.toThrow();
  await expect(asUser(siteReviewer,feedback('site','approved'))).rejects.toThrow();
  await expect(asUser(siteReviewer,feedback('site','question',author))).rejects.toThrow(); // cannot spoof reviewer identity
  await expect(asUser(siteReviewer,feedback('site','question','',siteB))).rejects.toThrow();
  await asUser(siteReviewer,feedback('site','revision_suggested'));
  await asUser(hqReviewer,feedback('hq','question'));
  const full=await asUser(author,count(feedbackTable));
  expect((full.rows[0] as {count:number}).count).toBe(2);
  expect((await asUser(outsider,count(feedbackTable))).rows[0]).toEqual({count:0});
  await expect(asUser(siteReviewer,"update "+feedbackTable+" set note='위조'")).rejects.toThrow();
  await expect(asUser(hqReviewer,"delete from "+feedbackTable)).rejects.toThrow();
  await expect(asUser(supervisor,"update "+assignmentTable+" set report_version=2")).rejects.toThrow();

  // Revoking site membership immediately prevents new feedback and read access.
  await db.exec('update public.psi_tenant_site_memberships set status='+quote('inactive')+
   ' where tenant_id='+quote(tenant)+' and site_id='+quote(siteA)+' and user_id='+quote(siteReviewer)+';');
  await expect(asUser(siteReviewer,feedback('site'))).rejects.toThrow();
  const afterRevocation=await asUser(siteReviewer,count(assignmentTable));
  expect((afterRevocation.rows[0] as {count:number}).count).toBe(0);
  expect((await asUser(siteReviewer,count(feedbackTable))).rows[0]).toEqual({count:0});
 }finally{await db.close();}
},45_000);

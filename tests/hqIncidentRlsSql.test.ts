import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const siteA='11111111-1111-4111-8111-111111111111';
const siteB='22222222-2222-4222-8222-222222222222';
const author='33333333-3333-4333-8333-333333333333';
const reviewer='44444444-4444-4444-8444-444444444444';
const outsider='55555555-5555-4555-8555-555555555555';
const incident='77777777-7777-4777-8777-777777777777';

it('staging incident SQL enforces per-site RLS and independent reviewer without live writes',async()=>{
  const db=new PGlite();
  try{
    await db.exec([
      'create role anon;',
      'create role authenticated;',
      'create role service_role bypassrls;',
      'create schema auth;',
      'create table auth.users(id uuid primary key);',
      "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
      'grant usage on schema auth to authenticated;',
      'grant execute on function auth.uid() to authenticated;'
    ].join('\n'));
    await db.exec(await readFile(resolve('supabase/migrations/20260929000000_tenant_identity_foundation.sql'),'utf8'));
    // Synthetic site tables use the same self-read RLS contract as the existing staging proposal.
    await db.exec([
      'create table public.psi_tenant_sites(tenant_id uuid not null references public.psi_tenants(id),id uuid not null,name text not null,active boolean not null default true,primary key(tenant_id,id));',
      'create table public.psi_tenant_site_memberships(tenant_id uuid not null,site_id uuid not null,user_id uuid not null,status text not null,primary key(tenant_id,site_id,user_id),foreign key(tenant_id,site_id) references public.psi_tenant_sites(tenant_id,id),foreign key(tenant_id,user_id) references public.psi_tenant_memberships(tenant_id,user_id));',
      'alter table public.psi_tenant_site_memberships enable row level security;',
      'alter table public.psi_tenant_site_memberships force row level security;',
      'grant select on public.psi_tenant_site_memberships to authenticated;',
      "create policy site_self_read on public.psi_tenant_site_memberships for select to authenticated using (user_id=auth.uid() and status='active' and exists(select 1 from public.psi_tenant_memberships m where m.tenant_id=psi_tenant_site_memberships.tenant_id and m.user_id=auth.uid() and m.status='active'));"
    ].join('\n'));
    const q=(v:string)=>"'"+v+"'";
    await db.exec([
      'insert into auth.users(id) values ('+[author,reviewer,outsider].map(q).join('),(')+');',
      'insert into public.psi_tenants(id,name) values ('+q(tenant)+",'Synthetic HQ');",
      'insert into public.psi_tenant_memberships(tenant_id,user_id,role,status) values '+
        [[author,'owner'],[reviewer,'reviewer'],[outsider,'admin']].map(([u,role])=>'('+q(tenant)+','+q(u)+','+q(role)+",'active')").join(',')+';',
      'insert into public.psi_tenant_sites(tenant_id,id,name) values ('+q(tenant)+','+q(siteA)+",'Site A'),("+q(tenant)+','+q(siteB)+",'Site B');",
      'insert into public.psi_tenant_site_memberships(tenant_id,site_id,user_id,status) values '+
        [[siteA,author],[siteA,reviewer],[siteB,outsider]].map(([site,u])=>'('+q(tenant)+','+q(site)+','+q(u)+",'active')").join(',')+';'
    ].join('\n'));
    await db.exec(await readFile(resolve('supabase/proposals/psi_hq_incident_case_staging.sql'),'utf8'));
    const asUser=async(u:string,statement:string)=>{
      await db.exec('set role authenticated');
      await db.exec("set request.jwt.claim.sub = '"+u+"'");
      try{return await db.query(statement);}finally{await db.exec('reset role; reset request.jwt.claim.sub');}
    };
    const createCase=(site:string)=>'insert into public.psi_hq_incident_cases (tenant_id,site_id,id,occurred_on,construction_zone,process_code,incident_type,summary) values ('+
      [tenant,site,incident,'2026-11-20','지하','formwork','절단','비식별 합성 조사 사건 개요'].map(q).join(',')+');';
    await asUser(author,createCase(siteA));
    const count=(table:string)=>'select count(*)::int as count from public.'+table+';';
    const visible=await asUser(author,count('psi_hq_incident_cases'));
    expect((visible.rows[0] as {count:number}).count).toBe(1);
    const hidden=await asUser(outsider,count('psi_hq_incident_cases'));
    expect((hidden.rows[0] as {count:number}).count).toBe(0);
    await expect(asUser(author,createCase(siteB))).rejects.toThrow();
    await expect(asUser(outsider,createCase(siteA))).rejects.toThrow();
    await expect(asUser(author,"update public.psi_hq_incident_cases set summary='변경'")).rejects.toThrow();
    const claim=(ref:string)=>'insert into public.psi_hq_incident_claims (tenant_id,site_id,case_id,classification,description,evidence_kind,evidence_ref) values ('+
      [tenant,siteA,incident,'fact','합성 사실 주장 항목 설명','document',ref].map(q).join(',')+');';
    await expect(asUser(author,claim(''))).rejects.toThrow();
    await asUser(author,claim('DOC-001'));
    const review='insert into public.psi_hq_incident_review_events (tenant_id,site_id,case_id,event_type,reason) values ('+
      [tenant,siteA,incident,'review_observed','합성 시연 검토 결과'].map(q).join(',')+');';
    await expect(asUser(author,review)).rejects.toThrow();
    await asUser(reviewer,review);
    await expect(asUser(reviewer,review.replace('review_observed','review_completed'))).rejects.toThrow();
    const approvals=await asUser(reviewer,count('psi_hq_incident_review_events'));
    expect((approvals.rows[0] as {count:number}).count).toBe(1);
    const hiddenReview=await asUser(outsider,count('psi_hq_incident_review_events'));
    expect((hiddenReview.rows[0] as {count:number}).count).toBe(0);
  } finally { await db.close(); }
},30_000);

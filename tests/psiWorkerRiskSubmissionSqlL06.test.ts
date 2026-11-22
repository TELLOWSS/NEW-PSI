import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Every value here is synthetic. No production credentials or worker data.
const TENANT_A='26060000-0000-4000-8000-000000000001';
const TENANT_B='26060000-0000-4000-8000-000000000002';
const SITE_A='26061000-0000-4000-8000-000000000001';
const SITE_B='26061000-0000-4000-8000-000000000002';
const SITE_A2='26061000-0000-4000-8000-000000000003';
const CYCLE_A='26062000-0000-4000-8000-000000000001';
const CYCLE_B='26062000-0000-4000-8000-000000000002';
const CYCLE_A2='26062000-0000-4000-8000-000000000003';
const WORKER_A='26063000-0000-4000-8000-000000000001';
const WORKER_B='26063000-0000-4000-8000-000000000002';
const USER_A='26064000-0000-4000-8000-000000000001';
const USER_B='26064000-0000-4000-8000-000000000002';
const OWNER_A='26064000-0000-4000-8000-000000000003';
const REVIEWER_A='26064000-0000-4000-8000-000000000005';
const OUTSIDER='26064000-0000-4000-8000-000000000004';
const NONCE_A='26065000-0000-4000-8000-000000000001';
const NONCE_B='26065000-0000-4000-8000-000000000002';
const REVIEW_NONCE_1='26066000-0000-4000-8000-000000000001';
const REVIEW_NONCE_2='26066000-0000-4000-8000-000000000002';
const REVIEW_NONCE_3='26066000-0000-4000-8000-000000000003';
const REVIEW_NOTE='검토한 위험원인과 감소대책을 확인함';
const APPROVAL_NOTE='작업허가와 분리하여 평가자료만 검토 승인';
const VERSION='psi-form-master-2026-11-22-v2-legacy-compatible';
const ANSWERS={Q1:'슬라브 철근 조립',Q2:'단부 개구부 추락 위험',Q3:'상',Q4:'안전난간 설치 후 작업',Q5:'관리자와 확인하고 작업'};
let db:PGlite;
const sql='select public.psi_submit_worker_risk_l06($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) as receipt';
const params=(tenant=TENANT_A,site=SITE_A,cycle=CYCLE_A,nonce=NONCE_A,answers:unknown=ANSWERS,
  language='ko',grade='상',reason='개구부') =>
  [tenant,site,cycle,nonce,VERSION,language,JSON.stringify(answers),grade,reason];
async function user(id:string) {
  await db.exec('set local role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
}
async function deny(query:string,args:unknown[]=[]){
  await db.exec('savepoint l06_deny');
  await expect(db.query(query,args)).rejects.toBeDefined();
  await db.exec('rollback to savepoint l06_deny; release savepoint l06_deny');
}
const submit=(...args:unknown[])=>db.query<{receipt:Record<string,unknown>}>(sql,args.length?args:params());
const reviewSql='select public.psi_review_worker_risk_l06($1,$2,$3,$4,$5,$6,$7) as receipt';
const reviewParams=(submission:string,nonce=REVIEW_NONCE_1,action='reviewed',
  note=REVIEW_NOTE,expected=0,tenant=TENANT_A,site=SITE_A) =>
  [tenant,site,submission,nonce,action,note,expected];
const review=(args:unknown[])=>db.query<{receipt:Record<string,unknown>}>(reviewSql,args);
const readReviewSql='select public.psi_read_worker_risk_review_l06($1,$2,$3) as snapshot';
const revisionSql='select public.psi_submit_worker_risk_revision_l06($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) as receipt';
const revisionParams=(parent:string,nonce=NONCE_B,answers:unknown={...ANSWERS,Q4:'안전난간을 설치하고 관리자 확인 후 작업'}) =>
  [TENANT_A,SITE_A,CYCLE_A,parent,nonce,VERSION,'ko',JSON.stringify(answers),'상','개구부'];
const readChainSql='select public.psi_read_worker_risk_revision_chain_l06($1,$2,$3) as chain';
async function submitA(){await user(USER_A);return (await submit(...params())).rows[0].receipt.receiptId as string;}

beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,
      deleted_at timestamptz,banned_until timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;`);
  for(const file of ['20260929000000_tenant_identity_foundation.sql',
    '20260930010000_tenant_training_drafts.sql','20260930020000_tenant_training_audience.sql',
    '20260930030000_tenant_education_release.sql'])
    await db.exec(await readFile(resolve('supabase/migrations',file),'utf8'));
  await db.exec(await readFile(resolve('supabase/proposals/psi_tenant_site_memberships_staging.sql'),'utf8'));
  await db.exec(await readFile(resolve('supabase/proposals/psi_site_worker_read_policy_staging.sql'),'utf8'));
  try {
    await db.exec(await readFile(resolve('supabase/proposals/psi_worker_risk_submission_l06_staging.sql'),'utf8'));
    await db.exec(await readFile(resolve('supabase/proposals/psi_worker_risk_manager_review_l06_staging.sql'),'utf8'));
    await db.exec(await readFile(resolve('supabase/proposals/psi_worker_risk_resubmission_l06_staging.sql'),'utf8'));
  } catch (error) {
    // The staging SQL runs only in PGlite. This marker identifies the exact
    // failed stage without printing source data or credentials.
    throw new Error('L06_PGLITE_STAGING_SQL_INITIALIZATION_FAILED', { cause: error });
  }
},40000);

beforeEach(async()=>{
  await db.exec('begin');
  await db.query(`insert into auth.users(id,email,email_confirmed_at)
    values($1,'l06-a@example.invalid',now()),($2,'l06-b@example.invalid',now()),
    ($3,'l06-owner@example.invalid',now()),($4,'l06-outsider@example.invalid',now()),
    ($5,'l06-reviewer@example.invalid',now())`,
    [USER_A,USER_B,OWNER_A,OUTSIDER,REVIEWER_A]);
  await db.query("insert into public.psi_tenants(id,name) values($1,'Tenant A'),($2,'Tenant B')",[TENANT_A,TENANT_B]);
  await db.query("insert into public.psi_tenant_memberships(tenant_id,user_id,role) values($1,$2,'owner'),($3,$4,'owner'),($1,$5,'reviewer')",
    [TENANT_A,OWNER_A,TENANT_B,OUTSIDER,REVIEWER_A]);
  // Fixture-only deterministic IDs require the setup owner (ordinary
  // authenticated users lack INSERT privilege on the ID column). Preserve
  // the REAL worker-integrity trigger by setting each active manager identity.
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[OWNER_A]);
  await db.query(`insert into public.psi_tenant_workers(tenant_id,id,name,worker_code,trade)
    values($1,$2,'가상 근로자 A','A-1','형틀')`,[TENANT_A,WORKER_A]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[OUTSIDER]);
  await db.query(`insert into public.psi_tenant_workers(tenant_id,id,name,worker_code,trade)
    values($1,$2,'가상 근로자 B','B-1','철근')`,[TENANT_B,WORKER_B]);
  // Use the actual existing audited account-binding RPC, not privileged
  // direct inserts that could seed cross-tenant test data unrealistically.
  await user(OWNER_A);
  await db.query("select public.psi_link_worker_account($1,$2,'l06-a@example.invalid',0)",[TENANT_A,WORKER_A]);
  await user(OUTSIDER);
  await db.query("select public.psi_link_worker_account($1,$2,'l06-b@example.invalid',0)",[TENANT_B,WORKER_B]);
  await db.exec('reset role');
  await db.query(`insert into public.psi_tenant_sites(tenant_id,id,name)
    values($1,$2,'Site A'),($3,$4,'Site B'),($1,$5,'Site A2')`,
    [TENANT_A,SITE_A,TENANT_B,SITE_B,SITE_A2]);
  await db.query(`insert into public.psi_tenant_site_worker_assignments(tenant_id,site_id,worker_id)
    values($1,$2,$3),($4,$5,$6)`,
    [TENANT_A,SITE_A,WORKER_A,TENANT_B,SITE_B,WORKER_B]);
  await db.query(`insert into public.psi_tenant_site_memberships(tenant_id,site_id,user_id,status)
    values($1,$2,$3,'active'),($1,$2,$4,'active'),($5,$6,$7,'active')`,
    [TENANT_A,SITE_A,REVIEWER_A,OWNER_A,TENANT_B,SITE_B,OUTSIDER]);
  await db.query(`insert into public.psi_tenant_risk_cycles(tenant_id,site_id,id,label,status,opens_at,closes_at)
    values($1,$2,$3,'이번 주 안전점검','open',now()-interval '1 hour',now()+interval '1 hour'),
    ($4,$5,$6,'이번 주 안전점검','open',now()-interval '1 hour',now()+interval '1 hour'),
    ($1,$7,$8,'미배정 현장','open',now()-interval '1 hour',now()+interval '1 hour')`,
    [TENANT_A,SITE_A,CYCLE_A,TENANT_B,SITE_B,CYCLE_B,SITE_A2,CYCLE_A2]);
});
afterEach(async()=>{await db.exec('rollback');});
afterAll(async()=>{await db.close();});
describe('L06 staged PostgreSQL atomic worker self-entry (NOT a live migration)',()=>{
  it('gives A→A and B→B distinct server receipts while preserving Q1–Q5 originals',async()=>{
    await user(USER_A);
    const a=(await submit(...params())).rows[0].receipt;
    expect(a).toMatchObject({schema:'psi-worker-self-risk-receipt-v1',tenantId:TENANT_A,
      siteId:SITE_A,workerId:WORKER_A,requestId:NONCE_A,state:'received-pending-manager-review'});
    expect(Object.keys(a).sort()).toEqual(['receiptId','receivedAt','requestId','schema','siteId','state','tenantId','workerId']);
    expect(typeof a.receivedAt).toBe('string');
    await user(USER_B);
    const b=(await submit(...params(TENANT_B,SITE_B,CYCLE_B,NONCE_B))).rows[0].receipt;
    expect(b).toMatchObject({tenantId:TENANT_B,siteId:SITE_B,workerId:WORKER_B});
    expect(a.receiptId).not.toBe(b.receiptId);
    await db.exec('reset role');
    const original=await db.query<{answers:Record<string,string>;state:string}>(
      'select answers,state from public.psi_worker_risk_submissions where tenant_id=$1',[TENANT_A]);
    expect(original.rows).toEqual([{answers:ANSWERS,state:'received-pending-manager-review'}]);
    const audit=await db.query('select * from public.psi_worker_risk_receipt_events');
    expect(audit.rows).toHaveLength(2);
  });
  it('denies A→B and B→A, same-tenant other site and unlinked account',async()=>{
    await user(USER_A);
    await deny(sql,params(TENANT_B,SITE_B,CYCLE_B));
    await deny(sql,params(TENANT_A,SITE_A2,CYCLE_A2));
    await user(USER_B);
    await deny(sql,params(TENANT_A,SITE_A,CYCLE_A));
    await user(OUTSIDER);
    await deny(sql,params());
  });
  it('replays identical request without new audit/time, rejects a changed retry',async()=>{
    await user(USER_A);
    const first=(await submit(...params())).rows[0].receipt;
    const second=(await submit(...params())).rows[0].receipt;
    expect(second).toEqual(first);
    await deny(sql,params(TENANT_A,SITE_A,CYCLE_A,NONCE_A,{...ANSWERS,Q2:'변조된 위험 원인'}));
    await deny(sql,params(TENANT_A,SITE_A2,CYCLE_A2,NONCE_A));
    await db.exec('reset role');
    expect((await db.query('select * from public.psi_worker_risk_submissions')).rows).toHaveLength(1);
    expect((await db.query('select * from public.psi_worker_risk_receipt_events')).rows).toHaveLength(1);
  });
  it('validates exactly Q1–Q5, no injected identity/translation, source language and risk grade',async()=>{
    await user(USER_A);
    for(const answers of [{...ANSWERS,Q6:'위험'}, {...ANSWERS,workerId:WORKER_B},
      {...ANSWERS,Q4:''},{...ANSWERS,Q1:'A'},{...ANSWERS,Q2:1},
      {...ANSWERS,Q5:'x'.repeat(501)},{...ANSWERS,Q3:'중'}])
      await deny(sql,params(TENANT_A,SITE_A,CYCLE_A,NONCE_A,answers));
    await deny(sql,params(TENANT_A,SITE_A,CYCLE_A,NONCE_A,ANSWERS,'xx'));
    await deny(sql,params(TENANT_A,SITE_A,CYCLE_A,NONCE_A,ANSWERS,'ko','최상'));
    await deny(sql,[...params().slice(0,4),'legacy',...params().slice(5)]);
    await db.exec('reset role');
    expect((await db.query('select * from public.psi_worker_risk_submissions')).rows).toHaveLength(0);
  });
  it('rejects disabled account/worker/assignment/site, unconfirmed and banned users',async()=>{
    for(const [table,update] of [
      ['psi_tenant_worker_accounts',"set active=false where tenant_id=$1"],
      ['psi_tenant_workers',"set active=false where tenant_id=$1"],
      ['psi_tenant_site_worker_assignments',"set active=false where tenant_id=$1"],
      ['psi_tenant_sites',"set active=false where tenant_id=$1"],
    ]){
      if(table==='psi_tenant_workers')
        await db.query("select set_config('request.jwt.claim.sub',$1,true)",[OWNER_A]);
      await db.query(`update public.${table} ${update}`,[TENANT_A]);
      await user(USER_A);await deny(sql,params());
      await db.exec('reset role');
      if(table==='psi_tenant_workers')
        await db.query("select set_config('request.jwt.claim.sub',$1,true)",[OWNER_A]);
      await db.query(`update public.${table} set active=true where tenant_id=$1`,[TENANT_A]);
    }
    for(const [field,value] of [['email_confirmed_at',null],['banned_until','infinity']]){
      await db.query(`update auth.users set ${field}=$1 where id=$2`,[value,USER_A]);
      await user(USER_A); await deny(sql,params()); await db.exec('reset role');
      await db.query(`update auth.users set ${field}=${field==='email_confirmed_at'?'now()':'null'} where id=$1`,[USER_A]);
    }
  });
  it('rejects closed, expired and not-yet-open cycles',async()=>{
    for(const change of ["status='closed'","opens_at=now()+interval '2 hours',closes_at=now()+interval '3 hours'","closes_at=now()-interval '1 minute'"]){
      await db.query(`update public.psi_tenant_risk_cycles set ${change} where tenant_id=$1`,[TENANT_A]);
      await user(USER_A);await deny(sql,params());await db.exec('reset role');
      await db.query(`update public.psi_tenant_risk_cycles set status='open',
        opens_at=now()-interval '1 hour',closes_at=now()+interval '1 hour' where tenant_id=$1`,[TENANT_A]);
    }
  });
  it('blocks direct table operations by anon, worker and manager even with a user session',async()=>{
    for(const role of ['anon','authenticated']){
      await db.exec(`set local role ${role}`);
      for(const table of ['psi_tenant_risk_cycles','psi_worker_risk_submissions','psi_worker_risk_receipt_events']){
        await deny(`select * from public.${table}`);
        await deny(`delete from public.${table}`);
      }
    }
    await db.exec('set local role anon');
    await deny(sql,params());
  });
  it('rolls back receipt when appending the immutable audit event fails',async()=>{
    await db.exec("alter table public.psi_worker_risk_receipt_events add constraint l06_synthetic_audit_failure check(kind<>'received')");
    await user(USER_A);
    await deny(sql,params());
    await db.exec('reset role');
    expect((await db.query('select id from public.psi_worker_risk_submissions')).rows).toHaveLength(0);
    expect((await db.query('select * from public.psi_worker_risk_receipt_events')).rows).toHaveLength(0);
  });
  it('proves RLS is enabled/forced and no direct grants are present',async()=>{
    const settings=await db.query<{relname:string;relrowsecurity:boolean;relforcerowsecurity:boolean}>(
      `select relname,relrowsecurity,relforcerowsecurity from pg_class
       where relname in ('psi_tenant_risk_cycles','psi_worker_risk_submissions','psi_worker_risk_receipt_events')`);
    expect(settings.rows).toHaveLength(3);
    for(const r of settings.rows){
      expect(r.relrowsecurity).toBe(true);
      expect(r.relforcerowsecurity).toBe(true);
    }
    for(const table of ['psi_tenant_risk_cycles','psi_worker_risk_submissions','psi_worker_risk_receipt_events']){
      const access=await db.query<{allowed:boolean}>(
        "select has_table_privilege('authenticated',$1,'INSERT') as allowed",['public.'+table]);
      expect(access.rows[0].allowed).toBe(false);
    }
  });

  it('records a two-person site-manager review and approval but never grants work clearance',async()=>{
    const id=await submitA();
    await user(REVIEWER_A);
    const first=(await review(reviewParams(id))).rows[0].receipt;
    expect(first).toMatchObject({schema:'psi-worker-risk-review-receipt-v1',
      tenantId:TENANT_A,siteId:SITE_A,submissionId:id,revision:1,
      action:'reviewed',scope:'record-review-only-no-work-clearance'});
    await user(OWNER_A);
    const second=(await review(reviewParams(id,REVIEW_NONCE_2,'approved',APPROVAL_NOTE,1))).rows[0].receipt;
    expect(second).toMatchObject({revision:2,action:'approved',scope:'record-review-only-no-work-clearance'});
    const snapshot=(await db.query<{snapshot:Record<string,unknown>}>(readReviewSql,[TENANT_A,SITE_A,id])).rows[0].snapshot;
    expect(snapshot).toMatchObject({workerId:WORKER_A,answers:ANSWERS,sourceLanguage:'ko',
      workClearanceGranted:false,events:[
        {revision:1,action:'reviewed',reviewerId:REVIEWER_A},
        {revision:2,action:'approved',reviewerId:OWNER_A}
      ]});
    expect(Object.keys(snapshot).sort()).toEqual(['answers','events','formVersion','gradeReason','receivedAt',
      'schema','selfRiskGrade','siteId','sourceLanguage','submissionId','tenantId','workClearanceGranted','workerId']);
    await db.exec('reset role');
    const originals=await db.query('select answers,state from public.psi_worker_risk_submissions');
    expect(originals.rows).toEqual([{answers:ANSWERS,state:'received-pending-manager-review'}]);
    const events=await db.query('select action,revision from public.psi_worker_risk_review_events order by revision');
    expect(events.rows).toEqual([{action:'reviewed',revision:1},{action:'approved',revision:2}]);
  });
  it('requires initial review before approval and an independent site manager',async()=>{
    const id=await submitA();
    await user(OWNER_A);
    await deny(reviewSql,reviewParams(id,REVIEW_NONCE_2,'approved',APPROVAL_NOTE,0));
    await review(reviewParams(id));
    await deny(reviewSql,reviewParams(id,REVIEW_NONCE_2,'approved',APPROVAL_NOTE,1));
    await user(REVIEWER_A);
    await deny(reviewSql,reviewParams(id,REVIEW_NONCE_2,'approved',APPROVAL_NOTE,1));
    await db.exec('reset role');
    expect((await db.query('select * from public.psi_worker_risk_review_events')).rows).toHaveLength(1);
  });
  it('rejects reviewer from another tenant, another site, or a worker without manager role',async()=>{
    const id=await submitA();
    await user(OUTSIDER);
    await deny(reviewSql,reviewParams(id));
    await deny(readReviewSql,[TENANT_A,SITE_A,id]);
    await user(REVIEWER_A);
    await deny(reviewSql,reviewParams(id,REVIEW_NONCE_2,'reviewed',REVIEW_NOTE,0,TENANT_A,SITE_A2));
    await deny(reviewSql,reviewParams(id,REVIEW_NONCE_2,'reviewed',REVIEW_NOTE,0,TENANT_B,SITE_B));
    await deny(readReviewSql,[TENANT_A,SITE_A2,id]);
    await user(USER_A);
    await deny(reviewSql,reviewParams(id));
    await deny(readReviewSql,[TENANT_A,SITE_A,id]);
    await db.exec('set local role anon');
    await deny(reviewSql,reviewParams(id));
    await deny(readReviewSql,[TENANT_A,SITE_A,id]);
  });
  it('rejects a worker reviewing their own record even if the worker also has a reviewer membership',async()=>{
    const id=await submitA();
    await db.exec('reset role');
    await db.query("insert into public.psi_tenant_memberships(tenant_id,user_id,role) values($1,$2,'reviewer')",[TENANT_A,USER_A]);
    await db.query("insert into public.psi_tenant_site_memberships(tenant_id,site_id,user_id,status) values($1,$2,$3,'active')",
      [TENANT_A,SITE_A,USER_A]);
    await user(USER_A);
    await deny(reviewSql,reviewParams(id));
    await db.exec('reset role');
    expect((await db.query('select * from public.psi_worker_risk_review_events')).rows).toHaveLength(0);
  });
  it('replays exact review request without duplicate revision, rejecting changed replay and stale revision',async()=>{
    const id=await submitA();
    await user(REVIEWER_A);
    const first=(await review(reviewParams(id))).rows[0].receipt;
    const again=(await review(reviewParams(id))).rows[0].receipt;
    expect(again).toEqual(first);
    await deny(reviewSql,reviewParams(id,REVIEW_NONCE_1,'request_changes',REVIEW_NOTE,0));
    await deny(reviewSql,reviewParams(id,REVIEW_NONCE_1,'reviewed','변경된 검토 기록의 내용을 제출함',0));
    await user(OWNER_A);
    await deny(reviewSql,reviewParams(id,REVIEW_NONCE_2,'approved',APPROVAL_NOTE,0));
    const approved=(await review(reviewParams(id,REVIEW_NONCE_2,'approved',APPROVAL_NOTE,1))).rows[0].receipt;
    const duplicate=(await review(reviewParams(id,REVIEW_NONCE_2,'approved',APPROVAL_NOTE,1))).rows[0].receipt;
    expect(duplicate).toEqual(approved);
    await deny(reviewSql,reviewParams(id,REVIEW_NONCE_3,'approved',APPROVAL_NOTE,1));
    await db.exec('reset role');
    expect((await db.query('select revision from public.psi_worker_risk_review_events')).rows).toHaveLength(2);
  });
  it('request_changes is terminal on the old original: a replacement requires a new worker submission',async()=>{
    const id=await submitA();
    await user(REVIEWER_A);
    const event=(await review(reviewParams(id,REVIEW_NONCE_1,'request_changes',REVIEW_NOTE,0))).rows[0].receipt;
    expect(event).toMatchObject({action:'request_changes',revision:1});
    await user(OWNER_A);
    await deny(reviewSql,reviewParams(id,REVIEW_NONCE_2,'approved',APPROVAL_NOTE,1));
    await deny(reviewSql,reviewParams(id,REVIEW_NONCE_2,'reviewed',REVIEW_NOTE,1));
    await db.exec('reset role');
    expect((await db.query('select * from public.psi_worker_risk_review_events')).rows).toHaveLength(1);
  });
  it('requires meaningful notes and declines forged actions, revisions and keys',async()=>{
    const id=await submitA();
    await user(REVIEWER_A);
    for(const args of [
      reviewParams(id,REVIEW_NONCE_1,'approve',REVIEW_NOTE,0),
      reviewParams(id,REVIEW_NONCE_1,'reviewed','짧음',0),
      reviewParams(id,REVIEW_NONCE_1,'reviewed','x'.repeat(801),0),
      reviewParams(id,REVIEW_NONCE_1,'reviewed',REVIEW_NOTE,2),
      reviewParams(id,REVIEW_NONCE_1,'reviewed',REVIEW_NOTE,-1),
      reviewParams(id,REVIEW_NONCE_1,'reviewed',REVIEW_NOTE,0,TENANT_A,SITE_B),
    ]) await deny(reviewSql,args);
  });
  it('revoked tenant/site membership or disabled site prevents review and read',async()=>{
    const id=await submitA();
    await db.exec('reset role');
    await db.query("update public.psi_tenant_site_memberships set status='suspended' where tenant_id=$1 and site_id=$2 and user_id=$3",
      [TENANT_A,SITE_A,REVIEWER_A]);
    await user(REVIEWER_A);
    await deny(reviewSql,reviewParams(id));
    await deny(readReviewSql,[TENANT_A,SITE_A,id]);
    await db.exec('reset role');
    await db.query("update public.psi_tenant_site_memberships set status='active' where tenant_id=$1 and site_id=$2 and user_id=$3",
      [TENANT_A,SITE_A,REVIEWER_A]);
    await db.query("update public.psi_tenant_memberships set status='suspended' where tenant_id=$1 and user_id=$2",
      [TENANT_A,REVIEWER_A]);
    await user(REVIEWER_A);
    await deny(reviewSql,reviewParams(id));
    await deny(readReviewSql,[TENANT_A,SITE_A,id]);
    await db.exec('reset role');
    await db.query("update public.psi_tenant_memberships set status='active' where tenant_id=$1 and user_id=$2",
      [TENANT_A,REVIEWER_A]);
    await db.query("update public.psi_tenant_sites set active=false where tenant_id=$1 and id=$2",
      [TENANT_A,SITE_A]);
    await user(REVIEWER_A);
    await deny(reviewSql,reviewParams(id));
    await deny(readReviewSql,[TENANT_A,SITE_A,id]);
  });
  it('forbids direct SELECT/INSERT/DELETE and privileged mutation of source and review events',async()=>{
    const id=await submitA();
    await user(REVIEWER_A);
    await review(reviewParams(id));
    for(const table of ['psi_worker_risk_submissions','psi_worker_risk_receipt_events','psi_worker_risk_review_events']){
      await deny('select * from public.'+table);
      await deny('delete from public.'+table);
    }
    await db.exec('reset role');
    await deny("update public.psi_worker_risk_submissions set answers='{}'::jsonb where id=$1",[id]);
    await deny("delete from public.psi_worker_risk_receipt_events where submission_id=$1",[id]);
    await deny("update public.psi_worker_risk_review_events set note='변조된 관리자 검토 기록' where submission_id=$1",[id]);
    expect((await db.query('select * from public.psi_worker_risk_review_events')).rows).toHaveLength(1);
    const check=await db.query<{relname:string;relrowsecurity:boolean;relforcerowsecurity:boolean}>(
      "select relname,relrowsecurity,relforcerowsecurity from pg_class where relname='psi_worker_risk_review_events'");
    expect(check.rows).toEqual([{relname:'psi_worker_risk_review_events',relrowsecurity:true,relforcerowsecurity:true}]);
    const allowed=await db.query<{allowed:boolean}>(
      "select has_table_privilege('authenticated','public.psi_worker_risk_review_events','SELECT') as allowed");
    expect(allowed.rows[0].allowed).toBe(false);
  });
  it('rolls back failed review insert without affecting the original worker submission',async()=>{
    const id=await submitA();
    await db.exec('reset role');
    await db.exec("alter table public.psi_worker_risk_review_events add constraint l06_synthetic_review_fail check(action<>'reviewed')");
    await user(REVIEWER_A);
    await deny(reviewSql,reviewParams(id));
    await db.exec('reset role');
    expect((await db.query('select * from public.psi_worker_risk_review_events')).rows).toHaveLength(0);
    expect((await db.query('select answers from public.psi_worker_risk_submissions where id=$1',[id])).rows)
      .toEqual([{answers:ANSWERS}]);
  });
  it('permits historical manager review after cycle is closed without changing worker self-assessment',async()=>{
    const id=await submitA();
    await db.exec('reset role');
    await db.query("update public.psi_tenant_risk_cycles set status='closed' where tenant_id=$1",[TENANT_A]);
    await user(REVIEWER_A);
    const event=(await review(reviewParams(id))).rows[0].receipt;
    expect(event).toMatchObject({action:'reviewed',revision:1});
    const snapshot=(await db.query<{snapshot:Record<string,unknown>}>(readReviewSql,[TENANT_A,SITE_A,id])).rows[0].snapshot;
    expect(snapshot).toMatchObject({selfRiskGrade:'상',answers:ANSWERS,workClearanceGranted:false});
  });

  it('links a new worker Q1-Q5 source only after a terminal manager change request',async()=>{
    const parent=await submitA();
    await user(REVIEWER_A);
    await review(reviewParams(parent,REVIEW_NONCE_1,'request_changes',REVIEW_NOTE,0));
    await user(USER_A);
    const response=(await db.query<{receipt:Record<string,unknown>}>(
      revisionSql,revisionParams(parent))).rows[0].receipt;
    expect(response).toMatchObject({schema:'psi-worker-risk-resubmission-receipt-v1',
      originalSubmissionId:parent,relation:'immutable-replacement-link',workClearanceGranted:false});
    const child=response.replacementSubmissionId as string;
    expect(child).not.toBe(parent);
    await user(OWNER_A);
    const chain=(await db.query<{chain:Record<string,any>}>(
      readChainSql,[TENANT_A,SITE_A,parent])).rows[0].chain;
    expect(chain).toMatchObject({schema:'psi-worker-risk-revision-chain-v1',workClearanceGranted:false});
    expect(chain.original).toMatchObject({submissionId:parent,answers:ANSWERS,workClearanceGranted:false,
      events:[{action:'request_changes',note:REVIEW_NOTE}]});
    expect(chain.replacement).toMatchObject({submissionId:child,
      answers:{...ANSWERS,Q4:'안전난간을 설치하고 관리자 확인 후 작업'},events:[],workClearanceGranted:false});
    await db.exec('reset role');
    expect((await db.query('select * from public.psi_worker_risk_resubmission_links')).rows).toHaveLength(1);
    expect((await db.query('select * from public.psi_worker_risk_receipt_events')).rows).toHaveLength(2);
  });

  it('does not let a worker revise a record without request_changes or after approval',async()=>{
    const parent=await submitA();
    await user(USER_A);
    await deny(revisionSql,revisionParams(parent));
    await user(REVIEWER_A);
    await review(reviewParams(parent));
    await user(USER_A);
    await deny(revisionSql,revisionParams(parent));
    await user(OWNER_A);
    await review(reviewParams(parent,REVIEW_NONCE_2,'approved',APPROVAL_NOTE,1));
    await user(USER_A);
    await deny(revisionSql,revisionParams(parent));
    await db.exec('reset role');
    expect((await db.query('select * from public.psi_worker_risk_submissions')).rows).toHaveLength(1);
  });

  it('rejects cross-tenant, cross-site, wrong-cycle and other-user replacement attempts',async()=>{
    const parent=await submitA();
    await user(REVIEWER_A);
    await review(reviewParams(parent,REVIEW_NONCE_1,'request_changes',REVIEW_NOTE,0));
    await user(USER_B);
    await deny(revisionSql,revisionParams(parent));
    await user(USER_A);
    await deny(revisionSql,[...revisionParams(parent).slice(0,1),SITE_A2,CYCLE_A2,...revisionParams(parent).slice(3)]);
    await deny(revisionSql,[TENANT_B,SITE_B,CYCLE_B,...revisionParams(parent).slice(3)]);
    await user(OUTSIDER);
    await deny(readChainSql,[TENANT_A,SITE_A,parent]);
    await user(USER_A);
    await deny(readChainSql,[TENANT_A,SITE_A,parent]);
    await db.exec('reset role');
    expect((await db.query('select * from public.psi_worker_risk_resubmission_links')).rows).toHaveLength(0);
  });

  it('retries the same request exactly once, never creates competing child records',async()=>{
    const parent=await submitA();
    await user(REVIEWER_A);
    await review(reviewParams(parent,REVIEW_NONCE_1,'request_changes',REVIEW_NOTE,0));
    await user(USER_A);
    const first=(await db.query<{receipt:Record<string,unknown>}>(
      revisionSql,revisionParams(parent))).rows[0].receipt;
    const second=(await db.query<{receipt:Record<string,unknown>}>(
      revisionSql,revisionParams(parent))).rows[0].receipt;
    expect(second).toEqual(first);
    await deny(revisionSql,revisionParams(parent,NONCE_B,{...ANSWERS,Q4:'원래와 다른 재전송 값'}));
    await deny(revisionSql,revisionParams(parent,REVIEW_NONCE_3));
    await db.exec('reset role');
    expect((await db.query('select id from public.psi_worker_risk_submissions')).rows).toHaveLength(2);
    expect((await db.query('select * from public.psi_worker_risk_resubmission_links')).rows).toHaveLength(1);
  });

  it('rejects a submission already received before the manager requested changes',async()=>{
    const parent=await submitA();
    await user(USER_A);
    const earlier=(await submit(...params(TENANT_A,SITE_A,CYCLE_A,NONCE_B,
      {...ANSWERS,Q4:'안전난간을 설치하고 관리자 확인 후 작업'}))).rows[0].receipt;
    expect(earlier.receiptId).not.toBe(parent);
    await user(REVIEWER_A);
    await review(reviewParams(parent,REVIEW_NONCE_1,'request_changes',REVIEW_NOTE,0));
    await user(USER_A);
    await deny(revisionSql,revisionParams(parent,NONCE_B));
    await db.exec('reset role');
    expect((await db.query('select * from public.psi_worker_risk_submissions')).rows).toHaveLength(2);
    expect((await db.query('select * from public.psi_worker_risk_resubmission_links')).rows).toHaveLength(0);
    expect((await db.query('select * from public.psi_worker_risk_receipt_events')).rows).toHaveLength(2);
  });
  it('keeps parent/child/link immutable and fails closed if link insert fails',async()=>{
    const parent=await submitA();
    await user(REVIEWER_A);
    await review(reviewParams(parent,REVIEW_NONCE_1,'request_changes',REVIEW_NOTE,0));
    await db.exec('reset role');
    await db.exec("alter table public.psi_worker_risk_resubmission_links add constraint l06_synthetic_link_failure check(false)");
    await user(USER_A);
    await deny(revisionSql,revisionParams(parent));
    await db.exec('reset role');
    expect((await db.query('select id from public.psi_worker_risk_submissions')).rows).toHaveLength(1);
    expect((await db.query('select * from public.psi_worker_risk_receipt_events')).rows).toHaveLength(1);
    await db.exec('alter table public.psi_worker_risk_resubmission_links drop constraint l06_synthetic_link_failure');
    await user(USER_A);
    await db.query(revisionSql,revisionParams(parent));
    await deny('select * from public.psi_worker_risk_resubmission_links');
    await deny('delete from public.psi_worker_risk_resubmission_links');
    await db.exec('reset role');
    await deny('delete from public.psi_worker_risk_resubmission_links');
    await deny("update public.psi_worker_risk_resubmission_links set worker_id=$1",[WORKER_B]);
    const policy=(await db.query<{relrowsecurity:boolean;relforcerowsecurity:boolean}>(
      "select relrowsecurity,relforcerowsecurity from pg_class where relname='psi_worker_risk_resubmission_links'")).rows[0];
    expect(policy).toEqual({relrowsecurity:true,relforcerowsecurity:true});
    const grants=(await db.query<{allowed:boolean}>(
      "select has_table_privilege('authenticated','public.psi_worker_risk_resubmission_links','SELECT') as allowed")).rows[0];
    expect(grants.allowed).toBe(false);
  });
},60000);

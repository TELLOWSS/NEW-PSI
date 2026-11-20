/**
 * HQ-SAFE Phase 20: REAL PostgreSQL independent-session QA.
 * EPHEMERAL Docker container only, synthetic UUIDs and data, NO production URL.
 * Requires docker CLI (runner only); no Node package dependencies.
 */
import assert from 'node:assert/strict';
import {execFile,execFileSync,spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {promisify} from 'node:util';
const execAsync=promisify(execFile);
const container='hq-safe-pg-concurrency';
const db='hq_safe_concurrency';
const table='hq_evidence_staging.transport_outbox';
const actor='11111111-1111-4111-8111-111111111111';
const tenant='22222222-2222-4222-8222-222222222222';
const site='33333333-3333-4333-8333-333333333333';
const accident='44444444-4444-4444-8444-444444444444';
const evidence='55555555-5555-4555-8555-555555555555';
const uuid=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const q=(s)=>"'"+s+"'";
const args=(command)=>['exec',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1',
  '-U','postgres','-d',db,'-c',command];
const sql=(command)=>execFileSync('docker',args(command),{
 encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}).trim();
const sqlAsync=async(command)=>{
 const value=await execAsync('docker',args(command),{
  encoding:'utf8',timeout:30000,maxBuffer:100000});
 return value.stdout.trim();
};
const idOf=(result)=>result.match(uuid)?.[0]?.toLowerCase()??null;
const seed=()=>idOf(sql('insert into '+table+
 '(tenant_id,site_id,case_id,evidence_id,actor_id,state,settled_at) values ('+
 [tenant,site,accident,evidence,actor,'response_flushed'].map(q).join(',')+
 ',clock_timestamp()) returning id'));
async function waitForReady(label,check){
 for(let i=0;i<75;i++){
  if(check())return;
  await new Promise(done=>setTimeout(done,120));
 }
 throw Error('Timed out waiting for '+label);
}
function assertDenied(statement){
 let rejected=false;
 try{sql(statement);}catch{rejected=true;}
 assert.ok(rejected,'expected direct user access to be blocked');
}
function spawnSession(command){
 const child=spawn('docker',args(command),{stdio:['ignore','pipe','pipe']});
 let stderr='';
 child.stderr.on('data',x=>stderr+=x.toString());
 const done=new Promise((resolve,reject)=>child.once('close',code=>
  code===0?resolve():reject(Error('worker failed '+code+': '+stderr.slice(0,120)))));
 return {child,done};
}
const code=readFileSync('lib/server/hqEvidencePgOutboxAdapter.ts','utf8');
const backtick=String.fromCharCode(96);
const marker='export const CLAIM_DUE_SQL=String.raw'+backtick;
const start=code.indexOf(marker);
const end=code.indexOf(backtick+';',start+marker.length);
assert.ok(start>=0&&end>start,'extract actual adapter SQL from source');
const claim=code.slice(start+marker.length,end).replace(/\$1\b/g,'1');
assert.ok(claim.includes('for update skip locked'));

const bootstrap=[
 'create role anon nologin',
 'create role authenticated nologin',
 'create role service_role nologin',
 'create schema auth',
 'create table auth.users(id uuid primary key)',
 'insert into auth.users(id) values ('+q(actor)+')',
 'create schema hq_evidence_staging',
 'create table hq_evidence_staging.evidence_manifest ('+
 'tenant_id uuid not null, site_id uuid not null,case_id uuid not null,'+
 'id uuid not null,primary key(tenant_id,site_id,case_id,id))',
 'insert into hq_evidence_staging.evidence_manifest'+
 '(tenant_id,site_id,case_id,id) values ('+
 [tenant,site,accident,evidence].map(q).join(',')+')'
].join(';')+';';
sql(bootstrap);
sql(readFileSync('supabase/proposals/psi_hq_transport_outbox_staging.sql','utf8'));
sql(readFileSync('supabase/proposals/psi_hq_outbox_least_privilege_staging.sql','utf8'));
assert.equal(sql("select rolcanlogin from pg_roles where rolname='hq_safe_outbox_operator'"),'f');
assert.equal(sql("select count(*) from pg_policies where schemaname='hq_evidence_staging' and tablename='transport_outbox' and 'hq_safe_outbox_operator'=any(roles)"),'3');
assertDenied('set role authenticated;select count(*) from '+table);
assertDenied('set role hq_safe_outbox_operator;delete from '+table);
assertDenied('set role hq_safe_outbox_operator;update '+table+' set evidence_id='+q(evidence));
assert.ok(sql('set role hq_safe_outbox_operator;select count(*) from '+table).endsWith('0'));
console.log('PASS private schema, NOLOGIN operator, restricted UPDATE/DELETE grants');
assertDenied('set role service_role; select count(*) from '+table);
const roleRecord=seed();
assert.equal(idOf(sql('set role hq_safe_outbox_operator;'+claim)),roleRecord,
 'worker role must be able to claim with actual RLS + limited UPDATE grants');
sql('truncate '+table);
console.log('PASS non-login operator can claim, public/service roles cannot access');

const original=seed();
const claims=await Promise.all([sqlAsync(claim),sqlAsync(claim)]);
const winners=claims.map(idOf).filter(Boolean);
assert.deepEqual(winners,[original],'independent sessions: exactly one claim');
assert.equal(sql('select delivery_attempts from '+table+' where id='+q(original)),'1');
console.log('PASS two independent PostgreSQL sessions race: only one claim');

sql('truncate '+table);
const crashId=seed();
const label='hq_safe_crash_worker_20';
const transaction=['set application_name='+q(label),'begin',claim,
 'select pg_sleep(20)','commit'].join(';')+';';
const crashed=spawnSession(transaction);
try{
 await waitForReady('locked worker session in pg_sleep',()=>
  sql('select count(*) from pg_stat_activity where application_name='+q(label)+
  " and wait_event='PgSleep'")==='1');
 assert.equal(idOf(await sqlAsync(claim)),null,'SKIP LOCKED must not block or double-claim');
 const killed=sql('select pg_terminate_backend(pid) from pg_stat_activity where application_name='+
  q(label)+' and pid<>pg_backend_pid()');
 assert.ok(killed.includes('t'));
 await crashed.done.catch(()=>{});
 assert.equal(idOf(sql(claim)),crashId,'PostgreSQL rollback makes crashed claim recoverable');
 console.log('PASS terminated backend rolls back claim; independent worker recovers');
}catch(error){
 try{sql('select pg_terminate_backend(pid) from pg_stat_activity where application_name='+q(label));}catch{}
 await crashed.done.catch(()=>{});
 throw error;
}
const oldToken=sql('select claim_token from '+table+' where id='+q(crashId));
sql('update '+table+" set claim_expires_at=clock_timestamp()-interval '1 second' where id="+q(crashId));
assert.equal(idOf(sql(claim)),crashId);
const freshToken=sql('select claim_token from '+table+' where id='+q(crashId));
assert.notEqual(oldToken,freshToken,'new worker rotates fencing token');
const attempt=sql('update '+table+' set acked_at=clock_timestamp() where id='+q(crashId)+
 ' and claim_token='+q(oldToken)+
 ' and claim_expires_at>clock_timestamp() returning id');
assert.equal(idOf(attempt),null,'expired worker cannot ACK new owner');
const ack=sql('update '+table+
 ' set acked_at=clock_timestamp(),claim_token=null,claim_expires_at=null where id='+
 q(crashId)+' and claim_token='+q(freshToken)+
 ' and claim_expires_at>clock_timestamp() returning id');
assert.equal(idOf(ack),crashId);
console.log('PASS expired fencing token denied; current lease can ACK');
console.log('EPHEMERAL REAL POSTGRESQL CONCURRENCY QA PASS');

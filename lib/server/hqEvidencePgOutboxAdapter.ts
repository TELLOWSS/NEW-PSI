import type {
  EvidenceTransportScope,EvidenceOutboxReceipt,EvidenceTransportOutboxPorts,
  EvidenceOutboxReconcilePorts,EvidenceOutboxAlert,PendingTransportEvent,TransportResult
} from './hqEvidenceTransportOutbox.js';

/**
 * PHASE 18: PostgreSQL adapter for the PRIVATE, UNMERGED staging schema.
 *
 * This is not wired to any runtime route, Supabase credentials, service_role,
 * public schema, cron or live database. A deployment composition root must
 * supply a dedicated private-operator PostgreSQL connection with least privileges.
 *
 * A single UPDATE...SKIP LOCKED statement acquires each due row exactly once
 * per lease. A per-row random fencing token guards every follow-up mutation.
 * Leases are based on DB clock (never browser / server clocks).
 */
export interface PrivatePgQuery {
  query:(sql:string,parameters?:unknown[])=>Promise<{rows:Record<string,unknown>[]}>;
}
export type IdempotentEvidenceAuditSink =
 (event:PendingTransportEvent,idempotencyKey:string)=>Promise<void>;
export type IndependentEvidenceSecurityAlert = (alert:EvidenceOutboxAlert)=>Promise<void>;

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const table='hq_evidence_staging.transport_outbox';
const maxBatch=100;
const uuidOk=(v:unknown):v is string=>typeof v==='string'&&uuid.test(v);
function requireUuid(v:unknown):asserts v is string{
 if(!uuidOk(v))throw new Error('HQ_OUTBOX_INVALID_UUID');
}
function expectChanged(rows:Record<string,unknown>[],action:string){
 if(rows.length!==1)throw new Error('HQ_OUTBOX_STALE_OR_UNAUTHORIZED_'+action);
}
/** SELECT+UPDATE is ONE atomic statement, not a distributed in-memory counter. */
export const CLAIM_DUE_SQL=String.raw`
with due as (
 select id from hq_evidence_staging.transport_outbox
 where acked_at is null and next_attempt_at <= clock_timestamp()
   and (claim_expires_at is null or claim_expires_at <= clock_timestamp())
   and (state <> 'prepared' or created_at <= clock_timestamp() - interval '120 seconds')
   and delivery_attempts < 1000
 order by next_attempt_at,created_at,id
 for update skip locked
 limit $1
)
update hq_evidence_staging.transport_outbox o
 set claim_token=gen_random_uuid(),
     claim_expires_at=clock_timestamp()+interval '90 seconds',
     delivery_attempts=o.delivery_attempts+1
 from due where o.id=due.id
 returning o.id,o.state,o.created_at,o.delivery_attempts,o.claim_token
`;
/**
 * Returns both ports. The in-process map contains *only claim fencing tokens*,
 * not security records; no authorization or concurrency counters rely on it.
 * Create a fresh adapter per worker invocation; never share claim state
 * between unrelated workers or persist its token map across runs.
 */
export function createPrivatePgEvidenceOutboxAdapter(
 db:PrivatePgQuery,
 sink:IdempotentEvidenceAuditSink,
 securityAlert:IndependentEvidenceSecurityAlert
):EvidenceTransportOutboxPorts & EvidenceOutboxReconcilePorts{
 const leases=new Map<string,string>();
 const fail=(reason:string):never=>{throw new Error('HQ_OUTBOX_'+reason);};
 const guarded=async(sql:string,id:string,params:unknown[]=[])=>{
  requireUuid(id);
  const token=leases.get(id);
  if(!token)fail('NO_OWNED_LEASE');
  const result=await db.query(sql,[id,token,...params]);
  expectChanged(result.rows,'LEASE');
 };
 const ports:EvidenceTransportOutboxPorts & EvidenceOutboxReconcilePorts={
  prepare:async(scope:EvidenceTransportScope):Promise<EvidenceOutboxReceipt>=>{
   for(const v of Object.values(scope))requireUuid(v);
   const result=await db.query(
    `insert into ${table}(tenant_id,site_id,case_id,evidence_id,actor_id)
      values($1,$2,$3,$4,$5) returning id`,
    [scope.tenantId,scope.siteId,scope.caseId,scope.evidenceId,scope.actorId]);
   if(result.rows.length!==1||!uuidOk(result.rows[0].id))fail('PREPARE_NOT_COMMITTED');
   return {id:result.rows[0].id};
  },
  settle:async(id:string,outcome:TransportResult)=>{
   requireUuid(id);
   if(outcome!=='response_flushed'&&outcome!=='response_aborted')fail('INVALID_TERMINAL');
   const result=await db.query(
    `update ${table} set state=$2,settled_at=clock_timestamp()
     where id=$1 and acked_at is null and claim_token is null
       and state='prepared'
     returning id`,[id,outcome]);
   if(result.rows.length===1)return;
   // A repeat terminal callback with the SAME state is harmless, but an
   // aborted->flushed or unconfirmed->flushed rewrite is NOT allowed.
   const row=await db.query(`select state from ${table} where id=$1`,[id]);
   if(row.rows.length===1&&row.rows[0].state===outcome)return;
   fail('CONFLICTING_TERMINAL');
  },
  claimDue:async(max:number)=>{
   if(!Number.isSafeInteger(max)||max<1||max>maxBatch)fail('INVALID_BATCH');
   const result=await db.query(CLAIM_DUE_SQL,[max]);
   const output:PendingTransportEvent[]=[];
   for(const row of result.rows){
    if(!uuidOk(row.id)||!uuidOk(row.claim_token)||
      typeof row.state!=='string'||!['prepared','response_flushed','response_aborted','unconfirmed'].includes(row.state)
      ||!Number.isSafeInteger(Number(row.delivery_attempts)))fail('INVALID_CLAIM');
    leases.set(row.id,row.claim_token);
    output.push({
     id:row.id,
     createdAt:row.created_at instanceof Date?row.created_at.toISOString():String(row.created_at),
     state:row.state as PendingTransportEvent['state'],
     attempts:Number(row.delivery_attempts)-1
    });
   }
   return output;
  },
  markUnconfirmed:async(id:string)=>{
   await guarded(`update ${table}
     set state='unconfirmed',settled_at=clock_timestamp()
     where id=$1 and claim_token=$2 and claim_expires_at>clock_timestamp()
       and state='prepared' and acked_at is null
     returning id`,id);
  },
  deliver:async(event:PendingTransportEvent)=>{
   requireUuid(event.id);
   if(!leases.has(event.id))fail('NO_OWNED_LEASE');
   // Never deliver the actual evidence bytes, names, PII or a signed URL.
   await sink(event,event.id);
  },
  acknowledge:async(id:string)=>{
   await guarded(`update ${table}
     set acked_at=clock_timestamp(),claim_token=null,claim_expires_at=null,
         last_failure_code=null
     where id=$1 and claim_token=$2 and claim_expires_at>clock_timestamp()
       and state<>'prepared' and acked_at is null
     returning id`,id);
   leases.delete(id);
  },
  retry:async(id:string,afterSeconds:number)=>{
   if(!Number.isSafeInteger(afterSeconds)||afterSeconds<1||afterSeconds>3600)
    fail('INVALID_BACKOFF');
   await guarded(`update ${table}
     set next_attempt_at=clock_timestamp()+($3::integer * interval '1 second'),
       claim_token=null,claim_expires_at=null,
       last_failure_code='SINK_UNAVAILABLE'
     where id=$1 and claim_token=$2 and claim_expires_at>clock_timestamp()
       and acked_at is null
     returning id`,id,[afterSeconds]);
   leases.delete(id);
  },
  alert:securityAlert
 };
 return ports;
}

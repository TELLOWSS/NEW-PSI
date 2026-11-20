import type {PrivatePgQuery} from './hqEvidencePgOutboxAdapter.js';

/**
 * Phase 19: read-only health monitor for PRIVATE staged audit outbox.
 * No production scheduler, secrets, client endpoint, notification provider,
 * live Storage integration or bypass of row security is installed here.
 */
export const OUTBOX_HEALTH_SQL=String.raw`
select
 (count(*) filter (where acked_at is null))::int as unacked,
 (count(*) filter (where acked_at is null and state='prepared'
    and created_at <= clock_timestamp() - interval '10 minutes'))::int as stale_prepared,
 (count(*) filter (where acked_at is null and delivery_attempts >= 1000))::int as exhausted,
 (count(*) filter (where acked_at is null and claim_token is not null
    and claim_expires_at <= clock_timestamp()))::int as expired_leases,
 (count(*) filter (where acked_at is null and delivery_attempts < 1000
    and next_attempt_at < clock_timestamp() - interval '5 minutes'
    and (claim_expires_at is null or claim_expires_at <= clock_timestamp())
    and (state <> 'prepared'
      or created_at < clock_timestamp() - interval '120 seconds')))::int as overdue,
 (count(*) filter (where acked_at is null and state='unconfirmed'))::int as unconfirmed
from hq_evidence_staging.transport_outbox
`;
export type OutboxHealthSeverity='healthy'|'warning'|'critical';
export type OutboxHealthCounts=Readonly<{
 unacked:number;stalePrepared:number;exhausted:number;
 expiredLeases:number;overdue:number;unconfirmed:number;
}>;
export type OutboxHealthResult=Readonly<{
 severity:OutboxHealthSeverity;counts:OutboxHealthCounts;
 /** Alert is not delivery confirmation: the operator's sink must be durable. */
 requiresOperatorAction:boolean;reasons:readonly string[];
}>;
export type OutboxHealthAlert=Readonly<{
 code:'HQ_OUTBOX_BACKLOG_WARNING'|'HQ_OUTBOX_BACKLOG_CRITICAL'|'HQ_OUTBOX_MONITOR_UNAVAILABLE';
 severity:'warning'|'critical';
 /** Aggregate counts only: never worker names, evidence IDs or file bytes. */
 counts:OutboxHealthCounts|null;
}>;
export interface OutboxHealthAlertSink{
 send:(event:OutboxHealthAlert)=>Promise<void>;
}
export class OutboxHealthError extends Error{
 constructor(){super('HQ_OUTBOX_HEALTH_UNAVAILABLE');}
}
const fields=[
 ['unacked','unacked'],['stale_prepared','stalePrepared'],['exhausted','exhausted'],
 ['expired_leases','expiredLeases'],['overdue','overdue'],['unconfirmed','unconfirmed']
] as const;
const decode=(raw:Record<string,unknown>):OutboxHealthCounts=>{
 const parsed:Record<string,number>={};
 for(const [column,key] of fields){
  const value=raw[column];
  if(typeof value!=='number'&&!((typeof value==='string')&&/^\d+$/.test(value)))throw new OutboxHealthError();
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<0)throw new OutboxHealthError();
  parsed[key]=n;
 }
 return parsed as unknown as OutboxHealthCounts;
};
export function classifyOutboxHealth(counts:OutboxHealthCounts):OutboxHealthResult{
 const reasons:string[]=[];
 if(counts.exhausted>0)reasons.push('RETRY_LIMIT_EXHAUSTED');
 if(counts.stalePrepared>0)reasons.push('STALE_PREPARED');
 if(counts.overdue>0)reasons.push('OVERDUE_DELIVERY');
 const critical=reasons.length>0;
 if(counts.expiredLeases>0)reasons.push('EXPIRED_LEASES');
 if(counts.unacked>=100)reasons.push('UNACKED_BACKLOG');
 if(counts.unconfirmed>=20)reasons.push('UNCONFIRMED_BACKLOG');
 const severity:OutboxHealthSeverity=critical?'critical':reasons.length?'warning':'healthy';
 return {counts,severity,requiresOperatorAction:severity!=='healthy',reasons};
}
/**
 * Call only from a trusted, explicitly enabled worker with a least-privilege
 * private DB connection. If DB or alert delivery fails, return an error:
 * absence of alert MUST NOT be interpreted as evidence of healthy backlog.
 */
export async function inspectPrivateOutboxHealth(
 db:PrivatePgQuery,sink:OutboxHealthAlertSink
):Promise<OutboxHealthResult>{
 let counts:OutboxHealthCounts|null=null;
 try{
  const result=await db.query(OUTBOX_HEALTH_SQL);
  if(result.rows.length!==1)throw new OutboxHealthError();
  counts=decode(result.rows[0]);
  const health=classifyOutboxHealth(counts);
  if(health.severity!=='healthy'){
   await sink.send({
    code:health.severity==='critical'?'HQ_OUTBOX_BACKLOG_CRITICAL':'HQ_OUTBOX_BACKLOG_WARNING',
    severity:health.severity,counts
   });
  }
  return health;
 }catch{
  try{await sink.send({
   code:'HQ_OUTBOX_MONITOR_UNAVAILABLE',severity:'critical',counts
  });}catch{/* The independent monitor/scheduler must surface failures. */}
  throw new OutboxHealthError();
 }
}

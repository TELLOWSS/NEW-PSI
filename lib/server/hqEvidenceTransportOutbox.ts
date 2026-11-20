import type {EvidenceAuditEvent} from './hqEvidenceAccessGate.js';

/**
 * Phase 17: transport audit durable-outbox contract. This code does NOT
 * configure Supabase, private Storage, an external log sink or a cron worker.
 *
 * A trusted server adapter must commit prepare/settle/claim/ack/retry atomically
 * in a private, persistent DB. No successful response may be sent without a
 * persisted PREPARED receipt. 'finish' is not evidence of client receipt.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type TransportResult='response_flushed'|'response_aborted';
export type EvidenceTransportScope=Readonly<Pick<EvidenceAuditEvent,
  'tenantId'|'siteId'|'caseId'|'evidenceId'|'actorId'>>;
export type EvidenceOutboxReceipt=Readonly<{id:string}>;
export type EvidenceOutboxFailureStage='prepare'|'settle'|'audit_event'|'delivery'|'reconcile';
export type EvidenceOutboxAlert=Readonly<{
  eventId:string|null;stage:EvidenceOutboxFailureStage;code:'PERSISTENCE_FAILED'|'SINK_UNAVAILABLE';
}>;
export interface EvidenceTransportOutboxPorts{
  /** Persist PREPARED in a DB before sending bytes; never return before commit. */
  prepare:(scope:EvidenceTransportScope)=>Promise<EvidenceOutboxReceipt>;
  /** Idempotently settle a single terminal signal; DB stores only server signal. */
  settle:(eventId:string,outcome:TransportResult)=>Promise<void>;
  /** Independent, best-effort operational notification, no sensitive payloads. */
  alert:(alert:EvidenceOutboxAlert)=>Promise<void>;
}
export class EvidenceOutboxUnavailable extends Error{
 constructor(){super('HQ_EVIDENCE_OUTBOX_UNAVAILABLE');}
}
export async function prepareTransportOutbox(
 scope:EvidenceTransportScope,ports:EvidenceTransportOutboxPorts
):Promise<EvidenceOutboxReceipt>{
 if(Object.values(scope).some(value=>!uuid.test(value)))throw new EvidenceOutboxUnavailable();
 try{
  const receipt=await ports.prepare(scope);
  if(!receipt||!uuid.test(receipt.id))throw new Error('invalid persistence receipt');
  return {id:receipt.id};
 }catch{
  try{await ports.alert({eventId:null,stage:'prepare',code:'PERSISTENCE_FAILED'});}
  catch{/* fail closed; the request has not sent bytes */}
  throw new EvidenceOutboxUnavailable();
 }
}
/** A post-send failure cannot retract bytes; alert and retain PREPARED row for reconciliation. */
export async function settleTransportOutbox(
 receipt:EvidenceOutboxReceipt,outcome:TransportResult,ports:EvidenceTransportOutboxPorts
):Promise<boolean>{
 try{
  if(!uuid.test(receipt.id))throw new Error('invalid receipt');
  await ports.settle(receipt.id,outcome);
  return true;
 }catch{
  try{await ports.alert({eventId:uuid.test(receipt.id)?receipt.id:null,
    stage:'settle',code:'PERSISTENCE_FAILED'});}
  catch{/* independently monitored persistent outbox remains authoritative */}
  return false;
 }
}
export async function alertTransportAuditFailure(
 receipt:EvidenceOutboxReceipt,ports:EvidenceTransportOutboxPorts
):Promise<void>{
 try{await ports.alert({eventId:receipt.id,stage:'audit_event',code:'PERSISTENCE_FAILED'});}
 catch{/* do not reveal internal errors or modify an already sent response */}
}
export type PendingTransportEvent=Readonly<{
 id:string;createdAt:string;state:'prepared'|'response_flushed'|'response_aborted'|'unconfirmed';
 attempts:number;
}>;
export interface EvidenceOutboxReconcilePorts{
 /** Atomically claim due rows using a short expiry, across ALL workers. */
 claimDue:(max:number)=>Promise<readonly PendingTransportEvent[]>;
 /** Atomically mark a stale PREPARED entry as UNKNOWN, never as delivered. */
 markUnconfirmed:(id:string)=>Promise<void>;
 /** Idempotent external log sink. Idempotency key MUST equal event.id. */
 deliver:(event:PendingTransportEvent)=>Promise<void>;
 /** Ack a successfully delivered id using the original claim token. */
 acknowledge:(id:string)=>Promise<void>;
 /** Persist retries with bounded exponential backoff, never silently drop. */
 retry:(id:string,afterSeconds:number)=>Promise<void>;
 alert:(alert:EvidenceOutboxAlert)=>Promise<void>;
}
export type EvidenceReconcileSummary=Readonly<{
 claimed:number;acknowledged:number;retried:number;unconfirmed:number;
}>;
/**
 * Explicit invocation only (e.g. future approved authenticated worker).
 * A missing final callback means UNKNOWN, not a completed browser download.
 * Production implementation must enforce claim ownership/lease, age checks,
 * idempotent ack, stable retries, sink retention and independent alerting.
 */
export async function reconcileTransportOutbox(
 ports:EvidenceOutboxReconcilePorts,max=20
):Promise<EvidenceReconcileSummary>{
 if(!Number.isSafeInteger(max)||max<1||max>100)throw new EvidenceOutboxUnavailable();
 let items:readonly PendingTransportEvent[];
 try{items=await ports.claimDue(max);}
 catch{throw new EvidenceOutboxUnavailable();}
 if(!Array.isArray(items)||items.length>max||
  items.some(i=>!uuid.test(i.id)||!Number.isSafeInteger(i.attempts)||i.attempts<0||
    !['prepared','response_flushed','response_aborted','unconfirmed'].includes(i.state))){
  throw new EvidenceOutboxUnavailable();
 }
 let acknowledged=0,retried=0,unconfirmed=0;
 for(const event of items){
  try{
   if(event.state==='prepared'){
    await ports.markUnconfirmed(event.id);
    unconfirmed++;
   }
   await ports.deliver({...event,state:event.state==='prepared'?'unconfirmed':event.state});
   await ports.acknowledge(event.id);
   acknowledged++;
  }catch{
   const delay=Math.min(3600,15*Math.pow(2,Math.min(event.attempts,7)));
   try{await ports.retry(event.id,delay);retried++;}
   catch{/* must alert, never claim a successful delivery */}
   try{await ports.alert({eventId:event.id,stage:'delivery',code:'SINK_UNAVAILABLE'});}
   catch{/* operations should monitor unacknowledged rows independently */}
  }
 }
 return {claimed:items.length,acknowledged,retried,unconfirmed};
}

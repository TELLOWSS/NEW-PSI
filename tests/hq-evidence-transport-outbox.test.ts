import {describe,expect,it,vi} from 'vitest';
import {
 prepareTransportOutbox,settleTransportOutbox,reconcileTransportOutbox,
 type EvidenceTransportOutboxPorts,type PendingTransportEvent
} from '../lib/server/hqEvidenceTransportOutbox';
const scope={
 tenantId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 siteId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 caseId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 evidenceId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 actorId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
};
const id='ffffffff-ffff-4fff-8fff-ffffffffffff';
const entry=(state:PendingTransportEvent['state'],attempts=0):PendingTransportEvent=>({
 id,createdAt:'2026-11-21T00:00:00Z',state,attempts
});
describe('HQ durable evidence transport outbox contract (no live database)',()=>{
 it('requires a valid persisted receipt before bytes may be sent',async()=>{
  const valid:EvidenceTransportOutboxPorts={
   prepare:async()=>({id}),settle:async()=>{},alert:async()=>{}
  };
  expect(await prepareTransportOutbox(scope,valid)).toEqual({id});
  const alert=vi.fn(async()=>{});
  await expect(prepareTransportOutbox(scope,{
   ...valid,prepare:async()=>({id:'INVALID'}),alert
  })).rejects.toThrow('HQ_EVIDENCE_OUTBOX_UNAVAILABLE');
  expect(alert).toHaveBeenCalledWith({
   eventId:null,stage:'prepare',code:'PERSISTENCE_FAILED'
  });
  await expect(prepareTransportOutbox({...scope,tenantId:'../other'},valid))
   .rejects.toThrow('HQ_EVIDENCE_OUTBOX_UNAVAILABLE');
 });
 it('settles an outcome without inferring actual client receipt; failures trigger alerts',async()=>{
  const settle=vi.fn(async()=>{}),alert=vi.fn(async()=>{});
  const ports:EvidenceTransportOutboxPorts={prepare:async()=>({id}),settle,alert};
  expect(await settleTransportOutbox({id},'response_flushed',ports)).toBe(true);
  expect(settle).toHaveBeenCalledWith(id,'response_flushed');
  expect(await settleTransportOutbox({id},'response_aborted',{
   ...ports,settle:async()=>{throw new Error('PRIVATE_DB_PASSWORD');}
  })).toBe(false);
  expect(alert).toHaveBeenCalledWith({
   eventId:id,stage:'settle',code:'PERSISTENCE_FAILED'
  });
 });
 it('marks a stale PREPARED event unconfirmed rather than fabricating a completed download',async()=>{
  const changed:string[]=[],sink=vi.fn(async()=>{});
  const result=await reconcileTransportOutbox({
   claimDue:async()=>[entry('prepared'),{...entry('response_aborted'),id:scope.actorId}],
   markUnconfirmed:async key=>{changed.push('unknown:'+key);},
   deliver:async ev=>{changed.push('sent:'+ev.state);await sink(ev);},
   acknowledge:async key=>{changed.push('ack:'+key);},
   retry:async()=>{throw new Error('unexpected retry');},
   alert:async()=>{}
  });
  expect(result).toEqual({claimed:2,acknowledged:2,retried:0,unconfirmed:1});
  expect(changed[0]).toBe('unknown:'+id);
  expect(changed).toContain('sent:unconfirmed');
  expect(changed).not.toContain('sent:download_completed');
  expect(sink).toHaveBeenCalledTimes(2);
 });
 it('persists a bounded retry request and an alert when external log delivery fails',async()=>{
  const delays:number[]=[],alert=vi.fn(async()=>{});
  const result=await reconcileTransportOutbox({
   claimDue:async()=>[entry('response_flushed',20)],
   markUnconfirmed:async()=>{},
   deliver:async()=>{throw new Error('EXTERNAL_AUDIT_SINK_SECRET');},
   acknowledge:async()=>{throw new Error('must not acknowledge');},
   retry:async(_id,afterSeconds)=>{delays.push(afterSeconds);},
   alert
  });
  expect(result).toMatchObject({claimed:1,acknowledged:0,retried:1});
  expect(delays).toEqual([1920]);
  expect(alert).toHaveBeenCalledWith({
   eventId:id,stage:'delivery',code:'SINK_UNAVAILABLE'
  });
 });
 it('fails closed for invalid claim decisions, bounds and database outages',async()=>{
  const empty={
   claimDue:async()=>[],markUnconfirmed:async()=>{},deliver:async()=>{},
   acknowledge:async()=>{},retry:async()=>{},alert:async()=>{}
  };
  await expect(reconcileTransportOutbox(empty,0)).rejects.toThrow('HQ_EVIDENCE_OUTBOX_UNAVAILABLE');
  await expect(reconcileTransportOutbox({...empty,claimDue:async()=>[entry('prepared',-1)]}))
   .rejects.toThrow('HQ_EVIDENCE_OUTBOX_UNAVAILABLE');
  await expect(reconcileTransportOutbox({...empty,claimDue:async()=>{throw new Error('PRIVATE_DB');}}))
   .rejects.toThrow('HQ_EVIDENCE_OUTBOX_UNAVAILABLE');
 });
});

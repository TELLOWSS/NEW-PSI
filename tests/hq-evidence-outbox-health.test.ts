import {describe,expect,it,vi} from 'vitest';
import {
 classifyOutboxHealth,inspectPrivateOutboxHealth,OutboxHealthError,OUTBOX_HEALTH_SQL,
 type OutboxHealthCounts
} from '../lib/server/hqEvidenceOutboxHealth';

const empty:OutboxHealthCounts={
 unacked:0,stalePrepared:0,exhausted:0,
 expiredLeases:0,overdue:0,unconfirmed:0
};
const queryRow={
 unacked:0,stale_prepared:0,exhausted:0,
 expired_leases:0,overdue:0,unconfirmed:0
};
describe('HQ outbox backlog health monitor - server-only contract',()=>{
 it('does not raise false alerts for an empty, healthy ledger',async()=>{
  const send=vi.fn(async()=>{});
  const health=await inspectPrivateOutboxHealth({
   query:async(sql:string)=>{expect(sql).toBe(OUTBOX_HEALTH_SQL);return {rows:[queryRow]};}
  },{send});
  expect(health).toMatchObject({severity:'healthy',requiresOperatorAction:false,reasons:[]});
  expect(health.counts).toEqual(empty);
  expect(send).not.toHaveBeenCalled();
 });
 it('marks stale prepared, exhausted retries and overdue work critical without any personal data',async()=>{
  const send=vi.fn(async()=>{});
  const counts={...empty,unacked:6,stalePrepared:1,exhausted:2,overdue:3};
  const db={query:async()=>({rows:[{
   unacked:6,stale_prepared:1,exhausted:2,
   expired_leases:0,overdue:3,unconfirmed:0
  }]})};
  const health=await inspectPrivateOutboxHealth(db,{send});
  expect(health).toMatchObject({severity:'critical',requiresOperatorAction:true,counts});
  expect(health.reasons).toEqual([
   'RETRY_LIMIT_EXHAUSTED','STALE_PREPARED','OVERDUE_DELIVERY'
  ]);
  expect(send).toHaveBeenCalledWith({
   code:'HQ_OUTBOX_BACKLOG_CRITICAL',severity:'critical',counts
  });
  expect(JSON.stringify(send.mock.calls)).not.toContain('evidenceId');
 });
 it('raises warning for expired leases or large unacknowledged counts',()=>{
  const health=classifyOutboxHealth({...empty,expiredLeases:1,unacked:100,unconfirmed:20});
  expect(health.severity).toBe('warning');
  expect(health.reasons).toEqual(['EXPIRED_LEASES','UNACKED_BACKLOG','UNCONFIRMED_BACKLOG']);
 });
 it('does not accept provider failures or malformed counters as healthy',async()=>{
  const send=vi.fn(async()=>{});
  await expect(inspectPrivateOutboxHealth({query:async()=>{throw Error('DB_SECRET');}},{send}))
   .rejects.toBeInstanceOf(OutboxHealthError);
  expect(send).toHaveBeenCalledWith({
   code:'HQ_OUTBOX_MONITOR_UNAVAILABLE',severity:'critical',counts:null
  });
  await expect(inspectPrivateOutboxHealth({query:async()=>({rows:[{...queryRow,exhausted:-1}]})},{send}))
   .rejects.toBeInstanceOf(OutboxHealthError);
  await expect(inspectPrivateOutboxHealth({query:async()=>({rows:[{...queryRow,unacked:'NaN'}]})},{send}))
   .rejects.toBeInstanceOf(OutboxHealthError);
 });
 it('treats unavailable independent alert persistence as an error, not success',async()=>{
  const sink={send:async()=>{throw Error('ALERT_CHANNEL_OFFLINE');}};
  await expect(inspectPrivateOutboxHealth({query:async()=>({rows:[{...queryRow,stale_prepared:1}]})},sink))
   .rejects.toBeInstanceOf(OutboxHealthError);
 });
});

import {describe,expect,it,vi} from 'vitest';
import {
 HQ_EVIDENCE_CAPACITY_POLICY,EvidenceCapacityFailure,
 reserveEvidenceRead,releaseEvidenceRead,type EvidenceCapacityPorts
} from '../lib/server/hqEvidenceReadAdmission';

const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const user='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const scope={tenantId:tenant,userId:user};
const token='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('HQ sensitive evidence read requires durable capacity reservation',()=>{
 it('checks the exact fixed policy and enforces an idempotent release contract',async()=>{
  const acquire=vi.fn(async()=>({granted:true as const,leaseId:token}));
  const release=vi.fn(async()=>{});
  const ports:EvidenceCapacityPorts={acquire,release};
  const lease=await reserveEvidenceRead(scope,ports);
  expect(lease).toEqual({scope,leaseId:token});
  expect(acquire).toHaveBeenCalledWith(scope,HQ_EVIDENCE_CAPACITY_POLICY);
  expect(HQ_EVIDENCE_CAPACITY_POLICY).toEqual({
   windowSeconds:60,maxRequestsPerWindow:6,maxConcurrentPerUser:2,
   maxConcurrentPerTenant:8,leaseSeconds:120
  });
  expect(await releaseEvidenceRead(lease,ports)).toBe(true);
  expect(release).toHaveBeenCalledWith(scope,token);
 });
 it('rejects attempts exceeding the window and never falls back to an in-memory bypass',async()=>{
  const ports:EvidenceCapacityPorts={
   acquire:async()=>({granted:false,retryAfterSeconds:15}),
   release:async()=>{throw Error('unexpected release');}
  };
  await expect(reserveEvidenceRead(scope,ports)).rejects.toMatchObject({
   status:429,code:'HQ_EVIDENCE_RATE_LIMITED',retryAfterSeconds:15
  });
 });
 it('fails closed for forged identities, malformed store decisions and exceptions',async()=>{
  const good={acquire:async()=>({granted:true as const,leaseId:token}),release:async()=>{}};
  await expect(reserveEvidenceRead({...scope,userId:'../etc'},good))
   .rejects.toMatchObject({status:503,code:'HQ_EVIDENCE_CAPACITY_UNAVAILABLE'});
  for(const decision of [
   {granted:true,leaseId:'../key'}, {granted:false,retryAfterSeconds:0},
   {granted:false,retryAfterSeconds:999}, {granted:'true'}, null
  ]){
   const ports={acquire:async()=>decision,release:async()=>{} } as unknown as EvidenceCapacityPorts;
   await expect(reserveEvidenceRead(scope,ports))
    .rejects.toMatchObject({status:503,code:'HQ_EVIDENCE_CAPACITY_UNAVAILABLE'});
  }
  const broken:EvidenceCapacityPorts={
   acquire:async()=>{throw Error('PRIVATE_REDIS_PASSWORD_SHOULD_NOT_LEAK');},
   release:async()=>{}
  };
  try{await reserveEvidenceRead(scope,broken);throw Error('unexpected success');}
  catch(error){expect(error).toBeInstanceOf(EvidenceCapacityFailure);
   expect(String(error)).not.toContain('PRIVATE_REDIS_PASSWORD');}
 });
 it('never converts a failed release into a permission grant',async()=>{
  const broken:EvidenceCapacityPorts={
   acquire:async()=>({granted:true,leaseId:token}),
   release:async()=>{throw Error('PRIVATE_CAPACITY_STORE_FAILURE');}
  };
  const lease=await reserveEvidenceRead(scope,broken);
  expect(await releaseEvidenceRead(lease,broken)).toBe(false);
 });
});

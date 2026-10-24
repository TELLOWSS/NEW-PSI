import {describe,it,expect} from 'vitest';
import {aiCostDeadline,displayAiCostDate,normalizeAiCost,type InspectorAiCost} from '../lib/inspector/aiCost';
const now=Date.parse('2026-10-24T10:00:00Z');
const value:InspectorAiCost={policy:'free-only',state:'operator-confirmed',allowed:true,message:'fixture',registrationScope:'server',remainingRequests:null,registrationChallenge:'old-challenge',expiresAt:'2026-10-25T10:00:00Z',pricingExpiresAt:'2026-11-23T15:00:00Z'};
describe('display eligibility follows actual expiry without extending server verification',()=>{
 it('keeps a valid registration available while showing the earliest effective deadline',()=>{expect(normalizeAiCost(value,now)).toMatchObject({allowed:true,state:'operator-confirmed'});expect(aiCostDeadline(value)).toBe(value.expiresAt);expect(aiCostDeadline({...value,expiresAt:'2026-12-01T00:00:00Z'})).toBe(value.pricingExpiresAt);});
 it('blocks exactly at the registration deadline and discards the stale registration challenge',()=>{const result=normalizeAiCost(value,Date.parse(value.expiresAt!));expect(result).toMatchObject({allowed:false,state:'unverified',registrationScope:'server'});expect(result.registrationChallenge).toBeUndefined();expect(result.expiresAt).toBe(value.expiresAt);expect(value.allowed).toBe(true);});
 it.each([undefined,'not-a-date','2020-01-01T00:00:00Z'])('does not present an uncheckable operator deadline as valid: %s',expiresAt=>{expect(normalizeAiCost({...value,expiresAt},now).allowed).toBe(false);});
 it('blocks a stale pricing review even for directly verified billing',()=>{expect(normalizeAiCost({...value,state:'free-project',pricingExpiresAt:'2026-10-24T10:00:00Z'},now)).toMatchObject({allowed:false,state:'unsupported-model'});});
 it('retains a known linked billing block rather than replacing it with an expiry message',()=>{expect(normalizeAiCost({...value,state:'billing-linked',allowed:false,message:'known paid'},now+60*86400000)).toMatchObject({state:'billing-linked',allowed:false,message:'known paid'});});
 it('formats the actual Korean date and handles malformed display metadata safely',()=>{expect(displayAiCostDate('2026-11-23T15:00:00Z')).toContain('24');expect(displayAiCostDate('invalid')).toBe('기한 확인 필요');});
 it('does not invent remaining free requests or a missing legacy live pricing deadline',()=>{expect(normalizeAiCost({...value,state:'free-project',pricingExpiresAt:undefined,remainingRequests:99} as unknown,now)).toMatchObject({allowed:true,remainingRequests:null});});
});

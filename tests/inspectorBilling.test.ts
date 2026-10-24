import {afterEach,describe,it,expect,vi} from 'vitest';
import {generateKeyPairSync} from 'node:crypto';
import {inspectorBillingStatus} from '../lib/server/admin/inspectorBilling';
import {normalizeAiCost} from '../lib/inspector/aiCost';
const config={provider:'gemini',model:'gemini-3.5-flash-lite',key:'synthetic-api-key',ready:true};
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
function setup(billing:any={name:'projects/123/billingInfo',billingEnabled:false}){
 vi.stubEnv('PSI_INSPECTOR_GOOGLE_BILLING_READER_JSON',JSON.stringify({client_email:'reader@test-project.iam.gserviceaccount.com',private_key:privateKey}));
 const replies=[{access_token:'synthetic-oauth-token'},{parent:'projects/123/locations/global',name:'projects/123/locations/global/keys/fixture-key'},billing];
 const fetch=vi.fn(async(_url:string,_init:RequestInit)=>({ok:true,json:async()=>replies.shift()}));vi.stubGlobal('fetch',fetch);return {fetch,replies};
}
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();});
describe('free-only inference billing gate',()=>{
 it('fails closed without reader credentials and makes no external request',async()=>{vi.stubEnv('PSI_INSPECTOR_GOOGLE_BILLING_READER_JSON','');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);expect(await inspectorBillingStatus(config)).toMatchObject({state:'unverified',allowed:false,remainingRequests:null});expect(fetch).not.toHaveBeenCalled();expect(normalizeAiCost({ready:true})).toMatchObject({allowed:false});});
 it('binds the actual API key to its authoritative project and checks billing on every invocation',async()=>{const {fetch}=setup();const result=await inspectorBillingStatus(config);expect(result).toMatchObject({state:'free-project',allowed:true,remainingRequests:null});expect(fetch.mock.calls[1][0]).toContain('keyString=synthetic-api-key');expect(fetch.mock.calls[2][0]).toBe('https://cloudbilling.googleapis.com/v1/projects/123/billingInfo');expect(fetch.mock.calls[0][1].body).toContain('assertion=');expect(JSON.stringify(result)).not.toMatch(/synthetic-api-key|synthetic-oauth-token|private_key/);setup({name:'projects/123/billingInfo',billingEnabled:true,billingAccountName:'billingAccounts/synthetic'});expect(await inspectorBillingStatus(config)).toMatchObject({state:'billing-linked',allowed:false});});
 it.each([{billingEnabled:true},{billingEnabled:false,billingAccountName:'billingAccounts/paused'},{}])('does not treat a linked, paused or unknown account as free: %j',async billing=>{setup({name:'projects/123/billingInfo',...billing});expect((await inspectorBillingStatus(config)).allowed).toBe(false);});
 it('does not support arbitrary models, OpenAI or stale price reviews',async()=>{const {fetch}=setup();expect((await inspectorBillingStatus({...config,provider:'openai'})).allowed).toBe(false);expect((await inspectorBillingStatus({...config,model:'paid-model'})).allowed).toBe(false);vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-24T00:00:00+09:00'));expect((await inspectorBillingStatus(config)).allowed).toBe(false);expect(fetch).not.toHaveBeenCalled();});
 it('rejects failed/malformed lookup and never leaks provider exceptions or secrets',async()=>{const {fetch,replies}=setup();replies[1]={parent:'projects/other/locations/global',name:'https://evil.invalid'};expect((await inspectorBillingStatus(config)).allowed).toBe(false);expect(fetch).toHaveBeenCalledTimes(2);fetch.mockRejectedValue(new Error('synthetic-api-key synthetic-oauth-token'));const status=await inspectorBillingStatus(config);expect(status).toMatchObject({state:'unverified',allowed:false});expect(JSON.stringify(status)).not.toContain('synthetic');});
});

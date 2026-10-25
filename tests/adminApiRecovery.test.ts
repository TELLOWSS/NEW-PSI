import {describe,it,expect,beforeEach} from 'vitest';
import {AdminApiError,parseAdminJsonResponse,parseRetryAfterSeconds} from '../utils/adminApiClient';
import {classifyRequestOutcome,recordClientRequestOutcome,getClientRequestDiagnostics,subscribeClientRequestDiagnostics,resetClientRequestDiagnosticsForTest} from '../utils/clientRequestDiagnostics';
import {inspectionErrorMessage} from '../lib/inspector/inspectionGuidance';
const options={fallbackMessage:'점검 요청을 처리하지 못했습니다.'};
const json=(code:number,body:unknown,extra:Record<string,string>={})=>new Response(JSON.stringify(body),{status:code,headers:{'content-type':'application/json',...extra}});
describe('Hobby-safe client failures',()=>{
 it('429 forwards bounded retry-after and never auto retries',async()=>{
    const error=await parseAdminJsonResponse(json(429,{ok:false,message:'너무 많은 요청입니다.'},{'retry-after':'12'}),options).catch(x=>x);
    expect(error).toBeInstanceOf(AdminApiError);
    expect(error).toMatchObject({status:429,retryAfterSeconds:12});
    expect(inspectionErrorMessage(error)).toContain('12초');
    expect(parseRetryAfterSeconds('86400')).toBeNull();
 });
 it('provider HTML and sensitive diagnostics never surface',async()=>{
    const html=new Response('<html>API token secret</html>',{status:503,headers:{'content-type':'text/html'}});
    const error=await parseAdminJsonResponse(html,options).catch(x=>x);
    expect(error.message).not.toContain('token');
    expect(error.message).toContain('저장 기록');
    const other=await parseAdminJsonResponse(json(400,{ok:false,message:'API key private-token https://example.com'}),options).catch(x=>x);
    expect(other.message).toBe(options.fallbackMessage);
 });
 it('distinguishes photo size, auth, unexpected server completion and safe version conflicts',async()=>{
    const auth=await parseAdminJsonResponse(json(401,{ok:false}),options).catch(x=>x);
    const size=await parseAdminJsonResponse(json(413,{ok:false}),options).catch(x=>x);
    const server=await parseAdminJsonResponse(json(504,{ok:false}),options).catch(x=>x);
    const revision=await parseAdminJsonResponse(json(409,{ok:false,message:'다른 변경사항이 있습니다. 저장한 기록을 다시 열어 주세요.'}),options).catch(x=>x);
    expect(auth.message).toContain('로그인');
    expect(size.message).toContain('크기');
    expect(server.outcomeUnknown).toBe(true);
    expect(revision.message).toContain('다른 변경사항');
 });
});
describe('privacy-limited current-tab request counters',()=>{
 beforeEach(resetClientRequestDiagnosticsForTest);
 it('counts five classes without network or personal data',()=>{
    const seen:number[]=[];const end=subscribeClientRequestDiagnostics(x=>seen.push(x.total));
    recordClientRequestOutcome(classifyRequestOutcome(200,true),1);
    recordClientRequestOutcome(classifyRequestOutcome(429,false),1);
    recordClientRequestOutcome(classifyRequestOutcome(503,false),1);
    recordClientRequestOutcome('timeout',3);recordClientRequestOutcome('network',3);
    end();
    expect(getClientRequestDiagnostics()).toEqual({success:1,rateLimited:1,httpError:1,timeout:1,network:1,total:5});
    expect(seen).toEqual([1,2,3,4,5]);
 });
 it('ignores invalid timings and can unsubscribe',()=>{
    let called=0;const end=subscribeClientRequestDiagnostics(()=>called++);
    recordClientRequestOutcome('network',NaN);end();recordClientRequestOutcome('network',10);
    expect(called).toBe(0);expect(getClientRequestDiagnostics().network).toBe(1);
 });
});

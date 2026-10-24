import {describe,expect,it} from 'vitest';
import {analysisHelp,analysisAvailability,analysisSupportText} from '../lib/inspector/analysisHelp';
import {normalizeAiCost} from '../lib/inspector/aiCost';
describe('novice recovery guidance',()=>{
 it('checks stored results before retrying an unknown transport outcome',()=>{expect(analysisHelp({outcomeUnknown:true,retryable:true})).toMatchObject({kind:'stored',canRetry:false});});
 it.each(['AI_REQUEST_BLOCKED','AI_CONTEXT_CHANGED'])('never retries an ambiguous request: %s',code=>{expect(analysisHelp({code,retryable:true})).toMatchObject({kind:'stored',canRetry:false});});
 it('allows manual work after the matching saved record was checked without a result',()=>{expect(analysisHelp({code:'AI_RESULT_NOT_SAVED'})).toMatchObject({kind:'stored',canRetry:false,manualAllowed:true});});
 it('does not promise a daily reset or encourage immediate retry at a provider limit',()=>{const help=analysisHelp({code:'AI_QUOTA_REACHED',retryable:true});expect(help).toMatchObject({kind:'limit',canRetry:false});expect(help.description).toContain('시각은 확인되지 않았습니다');});
 it.each(['AI_AUTH_REJECTED','AI_PERMISSION_REJECTED','AI_MODEL_UNAVAILABLE','AI_COST_BLOCKED'])('assigns configuration work to the operator: %s',code=>{const help=analysisHelp({code});expect(help.kind).toBe('operator');expect(help.description).toContain('사용자가 설정을 바꿀 필요는 없습니다');});
 it('offers user-initiated retry for a confirmed temporary failure',()=>{expect(analysisHelp({code:'AI_CONNECTION_FAILED',retryable:true})).toMatchObject({kind:'connection',canRetry:true});});
 it('keeps a failed billing check blocked while offering manual inspection',()=>{expect(analysisAvailability(normalizeAiCost({policy:'free-only',state:'unavailable',allowed:false,billingCheck:'failed'}))).toMatchObject({kind:'operator',canRetry:false});});
 it('does not reveal server messages or unknown diagnostic fields in a support copy',()=>{const cost={policy:'free-only',state:'unverified',allowed:false,message:'secret-provider-body',billingCheck:'private-token',projectLabel:'private-project',registrationChallenge:'signed-token'};const text=analysisSupportText('https://secret.invalid/key',cost as any);expect(text).toContain('STATUS_CHECK');expect(text).not.toMatch(/secret|private|signed-token/);});
 it('does not include an unknown provider-created code in a support request',()=>{expect(analysisSupportText('AI_PRIVATE_SECRET')).not.toContain('AI_PRIVATE_SECRET');});
 it('does not show an expired registration as usable',()=>{const help=analysisAvailability({policy:'free-only',state:'operator-confirmed',allowed:true,message:'',remainingRequests:null,expiresAt:'2020-01-01T00:00:00Z'});expect(help.kind).toBe('operator');});
});

import {afterEach,describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {serverFreeRegistration,inspectorKeyDiagnostics} from '../lib/server/admin/inspectorServerRegistration';
import {inspectorAiConfig} from '../lib/server/admin/inspectorAi';
import {inspectorBillingStatus} from '../lib/server/admin/inspectorBilling';
const c={provider:'gemini',model:'gemini-3.5-flash-lite',key:'synthetic-free-key',ready:true};
const profile=()=>({version:1,provider:c.provider,model:c.model,keySha256:createHash('sha256').update(c.key).digest('hex'),projectId:'synthetic-free-project',verifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()});
afterEach(()=>vi.unstubAllEnvs());
describe('server verified free project binding',()=>{
 it('prefers an existing free key for the inspector and never selects paid key fallback',()=>{vi.stubEnv('PSI_INSPECTOR_AI_PROVIDER','gemini');vi.stubEnv('GEMINI_API_KEY_FREE',c.key);vi.stubEnv('GEMINI_API_KEY','synthetic-generic-key');vi.stubEnv('GEMINI_API_KEY_PAID','synthetic-paid-key');expect(inspectorAiConfig().key).toBe(c.key);expect(JSON.stringify(inspectorKeyDiagnostics(c))).not.toContain(c.key);});
 it('enables all devices only with exact key, model and valid dated operator verification',async()=>{vi.stubEnv('PSI_INSPECTOR_FREE_PROJECT_REGISTRATION',JSON.stringify(profile()));vi.stubEnv('PSI_INSPECTOR_GOOGLE_BILLING_READER_JSON','');expect(serverFreeRegistration(c)?.project).toBe('synthetic-free-project');expect(await inspectorBillingStatus(c)).toMatchObject({state:'operator-confirmed',allowed:true,registrationScope:'server'});expect(serverFreeRegistration({...c,key:'different'})).toBeNull();expect(serverFreeRegistration({...c,model:'different'})).toBeNull();});
 it.each([{keySha256:'fake'},{expiresAt:'2020-01-01'},{verifiedAt:'2100-01-01'},{expiresAt:'2100-01-01'},{projectId:'invalid project'}])('rejects stale or mismatched registration %j',patch=>{vi.stubEnv('PSI_INSPECTOR_FREE_PROJECT_REGISTRATION',JSON.stringify({...profile(),...patch}));expect(serverFreeRegistration(c)).toBeNull();});
});

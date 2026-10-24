import {serverFreeRegistration} from './inspectorServerRegistration.js';
import {readFreeProfile} from './inspectorFreeRegistration.js';
import {sign} from 'node:crypto';
import type {InspectorAiCost} from '../../inspector/aiCost.js';

// Pinned official pricing review, expires closed. No aliases, tools, fallback models or paid opt-in.
const FREE_MODELS=new Set(['gemini-3.5-flash-lite']);
const PRICING_REVIEWED_AT='2026-10-24',PRICING_EXPIRES_AT=Date.parse('2026-11-24T00:00:00+09:00');
type Config={provider:string;model:string;key:string;ready:boolean};
const status=(state:InspectorAiCost['state'],message:string,checkedAt?:string):InspectorAiCost=>({policy:'free-only',state,allowed:state==='free-project',message,checkedAt,pricingReviewedAt:PRICING_REVIEWED_AT,remainingRequests:null,billingCheck:'not-run',pricingExpiresAt:new Date(PRICING_EXPIRES_AT).toISOString()});
async function json(url:string,init:RequestInit,signal:AbortSignal){
    const response=await fetch(url,{...init,signal,cache:'no-store',redirect:'error'});
    if(!response.ok)throw new Error('Billing verification unavailable');
    return response.json();
}
/** No caching of billing eligibility. Every explicit inference rechecks the exact key's project.
 * Credentials have read-only cloud scope; this code cannot link billing, upgrade tiers or enable payment.
 */
export async function inspectorBillingStatus(config:Config,profileToken?:string):Promise<InspectorAiCost>{
    if(!config.ready)return status('unavailable','API 연결 없음 · 외부 AI 호출 안 함');
    if(config.provider!=='gemini'||!FREE_MODELS.has(config.model)||Date.now()>=PRICING_EXPIRES_AT)return status('unsupported-model','무료 지원 모델·요금 검토가 필요합니다. 외부 AI 호출을 차단했습니다.');
    const fallback=()=>{const server=serverFreeRegistration(config),p=server||readFreeProfile(config,profileToken);return p?{...status('unverified',''),state:'operator-confirmed' as const,allowed:true,message:'운영자가 무료 프로젝트로 확인 · 실시간 청구 검증 아님. 외부 청구 설정 변경은 즉시 감지하지 못할 수 있습니다.',billingCheck:'not-configured' as const,registrationScope:server?'server' as const:'browser' as const,projectLabel:p.project,checkedAt:new Date(p.iat).toISOString(),expiresAt:new Date(p.exp).toISOString()}:{...status('unverified','무료 프로젝트 최초 등록 필요 · 청구 조회 권한 없이 운영자 확인으로 등록할 수 있습니다.'),billingCheck:'not-configured' as const};};
    const raw=process.env.PSI_INSPECTOR_GOOGLE_BILLING_READER_JSON;
    if(!raw)return fallback();
    try{
        const credentials=JSON.parse(raw);
        if(typeof credentials.client_email!=='string'||!/^[-a-zA-Z0-9._]+@[-a-zA-Z0-9.]+\.iam\.gserviceaccount\.com$/.test(credentials.client_email)||typeof credentials.private_key!=='string')throw new Error('Invalid reader');
        const now=Math.floor(Date.now()/1000),encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
        const assertion=[encode({alg:'RS256',typ:'JWT'}),encode({iss:credentials.client_email,scope:'https://www.googleapis.com/auth/cloud-platform.read-only https://www.googleapis.com/auth/cloud-billing.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+300})].join('.');
        const jwt=assertion+'.'+sign('RSA-SHA256',Buffer.from(assertion),credentials.private_key).toString('base64url');
        const signal=AbortSignal.timeout(6000);
        const token=await json('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt}).toString()},signal);
        if(typeof token.access_token!=='string'||!token.access_token)throw new Error('No access token');
        const headers={Authorization:`Bearer ${token.access_token}`};
        const lookup=await json('https://apikeys.googleapis.com/v2/keys:lookupKey?'+new URLSearchParams({keyString:config.key}),{headers},signal);
        // Bind verification to the actual inference key, not an operator-entered project label.
        const project=/^projects\/(\d+)\/locations\/global$/.exec(lookup.parent||'')?.[1];
        if(!project||!new RegExp(`^projects/${project}/locations/global/keys/[-a-zA-Z0-9]+$`).test(lookup.name||''))throw new Error('No matching project');
        const billing=await json(`https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`,{headers},signal);
        const checkedAt=new Date().toISOString();
        if(billing.billingEnabled===true||typeof billing.billingAccountName==='string'&&billing.billingAccountName.length>0)return {...status('billing-linked','청구 계정 연결 감지 · 유료 가능성이 있어 분석 차단. 무료 전용 정책은 유지됩니다.',checkedAt),billingCheck:'verified'};
        if(billing.billingEnabled!==false||typeof billing.name!=='string'||!/^projects\/[-a-zA-Z0-9]+\/billingInfo$/.test(billing.name))throw new Error('Unknown billing state');
        return {...status('free-project','청구 미연결 확인 · 무료 지원 모델만 사용. 잔여 무료 횟수는 공급자에서 확인하세요.',checkedAt),billingCheck:'verified'};
    }catch{
        // Never surface raw provider bodies, URLs containing API keys, JWTs or credentials.
        return {...status('unavailable','실시간 청구 조회 실패 · 이전 운영자 등록으로 우회하지 않고 분석을 차단했습니다. 조회 연결을 복구한 뒤 다시 확인하세요.'),billingCheck:'failed'};
    }
}

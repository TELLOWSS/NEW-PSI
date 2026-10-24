/** Public, credential-free status. A photo API key never proves a free billing tier. */
export type InspectorAiCost={policy:'free-only';state:'free-project'|'operator-confirmed'|'billing-linked'|'unverified'|'unsupported-model'|'unavailable';allowed:boolean;message:string;checkedAt?:string;pricingReviewedAt?:string;remainingRequests:null;billingCheck?:'not-configured'|'verified'|'failed'|'not-run';pricingExpiresAt?:string;registrationChallenge?:string;projectLabel?:string;registrationScope?:'browser'|'server';expiresAt?:string};
export const unknownAiCost=():InspectorAiCost=>({policy:'free-only',state:'unverified',allowed:false,message:'무료 여부 미확인 · 외부 AI 호출 차단',remainingRequests:null});
export function normalizeAiCost(value:unknown,now=Date.now()):InspectorAiCost {
    const v=value as InspectorAiCost|undefined;
    if(!v||v.policy!=='free-only'||!['free-project','operator-confirmed','billing-linked','unverified','unsupported-model','unavailable'].includes(v.state))return {...unknownAiCost(),message:'무료 여부 미확인 · 외부 AI 호출 차단'};
    const result={...v,allowed:['free-project','operator-confirmed'].includes(v.state)&&v.allowed===true,remainingRequests:null};
    if(!result.allowed)return result;
    if(v.pricingExpiresAt!==undefined&&(!validDate(v.pricingExpiresAt)||Date.parse(v.pricingExpiresAt)<=now))return {...result,state:'unsupported-model',allowed:false,registrationChallenge:undefined,message:'무료 모델 요금 검토 기한이 지났거나 확인되지 않습니다. 무료 상태를 다시 확인해 주세요.'};
    if(v.state==='operator-confirmed'&&(!validDate(v.expiresAt)||Date.parse(v.expiresAt!)<=now))return {...result,state:'unverified',allowed:false,registrationChallenge:undefined,message:'무료 프로젝트 등록 기한이 지났거나 확인되지 않습니다. 무료 상태를 다시 확인한 뒤 진행해 주세요. 자동 연장하지 않습니다.'};
    return result;
}

const validDate=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));
export function aiCostDeadline(value:InspectorAiCost|undefined){
    if(!value)return null;
    const dates=[...(value.state==='operator-confirmed'&&validDate(value.expiresAt)?[value.expiresAt]:[]),...(validDate(value.pricingExpiresAt)?[value.pricingExpiresAt]:[])];
    return dates.sort((a,b)=>Date.parse(a)-Date.parse(b))[0]||null;
}
export const displayAiCostDate=(value:unknown)=>validDate(value)?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'기한 확인 필요';

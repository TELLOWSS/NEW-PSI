/** Public, credential-free status. A photo API key never proves a free billing tier. */
export type InspectorAiCost={policy:'free-only';state:'free-project'|'billing-linked'|'unverified'|'unsupported-model'|'unavailable';allowed:boolean;message:string;checkedAt?:string;pricingReviewedAt?:string;remainingRequests:null};
export const unknownAiCost=():InspectorAiCost=>({policy:'free-only',state:'unverified',allowed:false,message:'무료 여부 미확인 · 외부 AI 호출 차단',remainingRequests:null});
export function normalizeAiCost(value:unknown):InspectorAiCost {
    const v=value as InspectorAiCost|undefined;
    if(!v||v.policy!=='free-only'||!['free-project','billing-linked','unverified','unsupported-model','unavailable'].includes(v.state))return {...unknownAiCost(),message:'무료 여부 미확인 · 외부 AI 호출 차단'};
    return {...v,allowed:v.state==='free-project'&&v.allowed===true,remainingRequests:null};
}

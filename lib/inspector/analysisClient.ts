import {postAdminJson} from '../../utils/adminApiClient';

type AnalysisInput={id:string;photoId:string;expectedRevision:number};
const send=(body:unknown)=>postAdminJson<any>('/api/admin/inspector',body,{requireOk:false,timeoutMs:70000,fallbackMessage:'사진 분석을 완료하지 못했습니다.'});
/** No automatic paid retry. Unknown transport outcomes retain the same idempotency ID. */
export function createInspectorAnalysisClient(transport:typeof send=send){
    const attempts=new Map<string,{id:string;flight?:Promise<any>}>();
    return (input:AnalysisInput):Promise<any>=>{
        const key=`${input.id}:${input.photoId}:${input.expectedRevision}`;
        let attempt=attempts.get(key);
        if(!attempt){attempt={id:crypto.randomUUID()};attempts.set(key,attempt);}
        if(attempt.flight)return attempt.flight;
        const active=attempt;
        active.flight=Promise.resolve().then(()=>transport({op:'analyze-photo',...input,externalConfirmed:true,requestId:active.id})).then(result=>{
            if(!result?.ok){
                // Acknowledged failures permit a fresh ID only on a later explicit action; transport uncertainty never does.
                if(result?.retryable===true||['AI_AUTH_REJECTED','AI_PERMISSION_REJECTED','AI_MODEL_UNAVAILABLE'].includes(result?.code))attempts.delete(key);
                throw Object.assign(new Error(result?.message||'사진 분석을 완료하지 못했습니다. 저장 기록을 확인해 주세요.'),{code:result?.code,cost:result?.cost,retryable:result?.retryable===true,outcomeUnknown:false});
            }
            return result;
        },cause=>{throw Object.assign(new Error(cause instanceof Error?cause.message:'분석 응답을 받지 못했습니다. 저장 결과부터 확인해 주세요.'),{outcomeUnknown:true});}).finally(()=>{active.flight=undefined;});
        return active.flight;
    };
}

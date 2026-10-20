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
                // A terminal provider failure can be retried only by the user's next click.
                if(result?.retryable===true)attempts.delete(key);
                throw new Error(result?.message||'사진 분석을 완료하지 못했습니다. 저장 기록을 확인해 주세요.');
            }
            return result;
        }).finally(()=>{active.flight=undefined;});
        return active.flight;
    };
}

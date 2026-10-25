export type Outcome='success'|'rate-limit'|'http-error'|'timeout'|'network';
export type ClientDiagnostics={success:number;rateLimited:number;httpError:number;timeout:number;network:number;total:number};
let counts:ClientDiagnostics={success:0,rateLimited:0,httpError:0,timeout:0,network:0,total:0};
const subscribers=new Set<(x:ClientDiagnostics)=>void>();
export const classifyRequestOutcome=(status:number,ok:boolean):Outcome=>(status===429||status===402)?'rate-limit':ok?'success':'http-error';
export function getClientRequestDiagnostics():ClientDiagnostics{return {...counts};}
export function subscribeClientRequestDiagnostics(listener:(x:ClientDiagnostics)=>void):()=>void{subscribers.add(listener);return()=>{subscribers.delete(listener);};}
export function recordClientRequestOutcome(outcome:Outcome,elapsedMs:number):void{
    if(!Number.isFinite(elapsedMs)||elapsedMs<0)return;
    const key=outcome==='rate-limit'?'rateLimited':outcome==='http-error'?'httpError':outcome;
    counts={...counts,[key]:counts[key]+1,total:counts.total+1};
    const snap=getClientRequestDiagnostics();subscribers.forEach(listener=>listener(snap));
}
export function resetClientRequestDiagnosticsForTest():void{counts={success:0,rateLimited:0,httpError:0,timeout:0,network:0,total:0};}

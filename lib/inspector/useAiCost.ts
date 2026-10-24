import {useEffect,useReducer} from 'react';
import {aiCostDeadline,normalizeAiCost,type InspectorAiCost} from './aiCost';
const WARNING_MS=3*86400000;
/** Local deadline display only: no polling, inference, registration renewal or server writes. */
export function useAiCost(value:InspectorAiCost|undefined){
    const [,refresh]=useReducer(n=>n+1,0);
    useEffect(()=>{
        if(!value?.allowed)return;
        let timer:ReturnType<typeof setTimeout>|undefined;
        const arm=()=>{
            if(timer)clearTimeout(timer);
            const current=normalizeAiCost(value),deadline=aiCostDeadline(current);if(!current.allowed||!deadline)return;
            const now=Date.now(),end=Date.parse(deadline),next=[end-WARNING_MS,end].filter(at=>at>now).sort((a,b)=>a-b)[0];
            if(next)timer=setTimeout(wake,Math.min(next-now+10,2_147_000_000));
        };
        const wake=()=>{refresh();arm();};
        const visible=()=>{if(document.visibilityState==='visible')wake();};
        arm();window.addEventListener('focus',wake);document.addEventListener('visibilitychange',visible);
        return()=>{if(timer)clearTimeout(timer);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',visible);};
    },[value]);
    return normalizeAiCost(value);
}

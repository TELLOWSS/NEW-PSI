import {useEffect,useState} from 'react';
import {koreanDay} from '../../lib/inspector/workQueue';
/** Refresh the displayed client calendar, without polling any business API. */
export function useInspectionDay(frozen=false) {
    const [day,setDay]=useState(koreanDay);
    useEffect(()=>{
        if(frozen)return;
        const update=()=>setDay(koreanDay()),timer=window.setInterval(update,60000);
        update();
        document.addEventListener('visibilitychange',update);
        return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',update);};
    },[frozen]);
    return day;
}

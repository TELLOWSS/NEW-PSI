import type {WorkerRecord} from '../types';
import {hasValidSafetyScore,selectLatestCoreMetricRecords} from './coreMetrics';

export type ValidFieldScore={field:string;avg:number;sampleCount:number};
export type ReliableTeamScore={teamLabel:string;avg:number;stdDev:number;recordCount:number;workerCount:number;safetyHabitIndex:number};

/** Align performance reports with PSI core latest-identity and strictly numeric score rules. */
export function getValidPerformanceScores(records:WorkerRecord[]):WorkerRecord[]{
    return selectLatestCoreMetricRecords(records).filter(hasValidSafetyScore);
}
export function calculateValidScoreDeviation(scores:readonly number[]):number{
    if(scores.length<2)return 0;
    const mean=scores.reduce((a,b)=>a+b,0)/scores.length;
    return Math.sqrt(scores.reduce((sum,score)=>sum+(score-mean)**2,0)/scores.length);
}
/** Avoid inferring a leading trade from invalid or duplicate scores. */
export function getBestPerformanceTrade(records:WorkerRecord[]):ValidFieldScore|null{
    const grouped=new Map<string,{sum:number;count:number}>();
    for(const r of getValidPerformanceScores(records)){
        const field=String(r.jobField||'').trim()||'미분류';
        const stat=grouped.get(field)||{sum:0,count:0};
        stat.sum+=r.safetyScore;stat.count++;
        grouped.set(field,stat);
    }
    const ranked=[...grouped.entries()].map(([field,v])=>({field,avg:v.sum/v.count,sampleCount:v.count}));
    return ranked.sort((a,b)=>b.avg-a.avg||a.field.localeCompare(b.field))[0]||null;
}
/** Team trends use at least three distinct current *valid* worker records; not a disciplinary ranking. */
export function getReliablePerformanceTeamSignals(records:WorkerRecord[]):ReliableTeamScore[]{
    const groups=new Map<string,WorkerRecord[]>();
    for(const r of getValidPerformanceScores(records)){
        const key=String(r.teamLeader||r.jobField||'미분류 팀').trim()||'미분류 팀';
        const arr=groups.get(key)||[];arr.push(r);groups.set(key,arr);
    }
    return [...groups.entries()].filter(([,records])=>records.length>=3).map(([name,rows])=>{
        const values=rows.map(r=>r.safetyScore);
        const avg=values.reduce((sum,value)=>sum+value,0)/values.length;
        const stdDev=calculateValidScoreDeviation(values);
        const teamLabel=rows[0]?.teamLeader?`${name} 팀`:`${rows[0]?.jobField||'미분류'} 공종`;
        return {teamLabel,avg,stdDev,recordCount:rows.length,workerCount:rows.length,safetyHabitIndex:avg/(1+stdDev)};
    }).sort((a,b)=>b.safetyHabitIndex-a.safetyHabitIndex).slice(0,5);
}

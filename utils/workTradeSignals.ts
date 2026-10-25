import type {WorkerRecord} from '../types';
import {hasValidSafetyScore,isOperationalWorkerRecord,selectLatestCoreMetricRecords} from './coreMetrics';
export type WeakestTrade={name:string;score:number;sampleCount:number};
/** Same valid-score/latest-identity definition as PSI core. Missing score is NOT zero. */
export function getWeakestWorkTrade(records:WorkerRecord[]):WeakestTrade{
 const grouped=new Map<string,{sum:number;count:number}>();
 for(const r of selectLatestCoreMetricRecords(records.filter(isOperationalWorkerRecord))){
  if(!hasValidSafetyScore(r))continue;
  const trade=String(r.jobField||'').trim();if(!trade)continue;
  const row=grouped.get(trade)||{sum:0,count:0};row.sum+=r.safetyScore;row.count++;grouped.set(trade,row);
 }
 let best:WeakestTrade={name:'대기 중',score:0,sampleCount:0},minimum=Infinity;
 for(const [name,row] of grouped){const avg=row.sum/row.count;if(avg<minimum){minimum=avg;best={name,score:Math.round(avg*10)/10,sampleCount:row.count};}}
 return best;
}

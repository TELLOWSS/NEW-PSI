import {describe,it,expect} from 'vitest';
import type {WorkerRecord} from '../types';
import {getWeakestWorkTrade} from '../utils/workTradeSignals';
import {readSiteIssueList,persistSiteIssueList} from '../utils/siteIssueStorage';
import boundaries from '../config/psi-product-boundaries.json';
const rec=(id:string,score:unknown,jobField='형틀',date='2026-10-20'):WorkerRecord=>({id,worker_uuid:id,name:id,jobField,date,safetyScore:score} as WorkerRecord);
describe('work-trade signal shares formal metric validation',()=>{
 it('excludes missing and nonnumeric rather than inventing 0',()=>{expect(getWeakestWorkTrade([rec('a',null),rec('b',''),rec('c',100,'철근')])).toMatchObject({name:'철근',score:100,sampleCount:1});});
 it('does not resurrect old score when latest is missing',()=>{expect(getWeakestWorkTrade([rec('a',9,'형틀','2026-10-01'),rec('a',null,'형틀','2026-10-22'),rec('b',72,'철근')])).toMatchObject({name:'철근',score:72});});
 it('keeps genuine zero and all-missing as no-data',()=>{expect(getWeakestWorkTrade([rec('a',0),rec('b',88,'철근')]).score).toBe(0);expect(getWeakestWorkTrade([rec('a',undefined),rec('b',101)])).toMatchObject({name:'대기 중',sampleCount:0});});
});
describe('site issue local persistence without unverified completion',()=>{
 it('does not overwrite a corrupt or inaccessible record',()=>{expect(readSiteIssueList(()=>'{broken')).toMatchObject({safe:false,items:[]});expect(readSiteIssueList(()=>{throw Error('blocked');}).safe).toBe(false);expect(readSiteIssueList(()=>null).safe).toBe(true);});
 it('reports quota failure and preserves valid legacy entries',()=>{
  expect(persistSiteIssueList([{id:'1'}],()=>{throw Error('quota');}).ok).toBe(false);
  let saved='';expect(persistSiteIssueList([{id:'1'}],x=>{saved=x;}).ok).toBe(true);
  expect(JSON.parse(saved)).toEqual([{id:'1'}]);
  expect(readSiteIssueList(()=>saved).items).toEqual([{id:'1'}]);
 });
 it('does not connect contractor expense ledger',()=>{expect(boundaries.rules['partner-safety-expense'].autoMergeAllowed).toBe(false);expect(boundaries.rules['psi-inspector'].authRequired).toBe(true);});
});

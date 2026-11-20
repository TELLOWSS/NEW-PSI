import {describe,expect,it} from 'vitest';
import {
  appendIndependentReviewFeedback,checkIndependentReviewCycle,
  planIndependentReview,reviewSimulationSummary,type IndependentReviewCycle
} from '../components/hq/independentReviewCycleModel';
import type {IncidentReportVersion} from '../components/hq/incidentReportRevisionModel';
const report:IncidentReportVersion={
 incidentId:55,version:2,id:'REPORT-02',createdAt:'2026-11-20T05:00:00Z',
 reason:'가상 재확인 초안',sixW:{who:'시연작성역할',when:'가상시간',where:'가상현장',what:'형틀작업',how:'가상동작',why:'추가확인'},
 causes:[],openQuestions:'시연 미확인',preventionSummary:'가상 대책',
 evidenceRefs:['DEMO-REP-001'],sequenceDiscrepancies:1,
 sourceStateStamp:'SYNTHETIC-STATE-2',status:'unverified_review_draft'
};
const plan=(overrides:Record<string,unknown>={}):IndependentReviewCycle=>planIndependentReview({
 incidentId:55,report,authorCode:'DEMO-AUTHOR01',
 siteReviewerCode:'DEMO-SITE02',hqReviewerCode:'DEMO-HQ03',
 cycleId:'CYCLE-01',createdAt:'2026-11-20T05:20:00Z',...overrides
});
const feedback=(cycle:IndependentReviewCycle,actorCode='DEMO-SITE02',extra:Record<string,unknown>={})=>
 appendIndependentReviewFeedback(cycle,{
  id:'FEEDBACK-1',at:'2026-11-20T05:22:00Z',actorCode,
  kind:'revision_suggested',topic:'chronology',
  note:'기립 직후 이동 과정과 실제 걸림 위치를 대조해야 합니다.',
  evidenceRef:'DEMO-REP-001',report,reportIsFresh:true,requestMarked:true,
  ...extra
 });

describe('HQ independent review pre-auth demo prevents false approval semantics',()=>{
 it('demands 3 distinct DEMO roles and matching accident and report',()=>{
  expect(()=>plan({siteReviewerCode:'DEMO-AUTHOR01'})).toThrow('서로 달라야');
  expect(()=>plan({hqReviewerCode:'홍길동'})).toThrow('DEMO-');
  expect(()=>plan({incidentId:100})).toThrow('사고');
  expect(()=>plan({report:{...report,status:'approved'}})).toThrow('미승인');
  expect(plan().status).toBe('demo_planned');
 });
 it('requires review request mark and exact current version/source state before any feedback',()=>{
  const cycle=plan();
  expect(checkIndependentReviewCycle(cycle,report,true,true).ready).toBe(true);
  expect(checkIndependentReviewCycle(cycle,report,false,true).ready).toBe(false);
  expect(checkIndependentReviewCycle(cycle,report,true,false).ready).toBe(false);
  expect(checkIndependentReviewCycle(cycle,{...report,id:'REPORT-03'},true,true).ready).toBe(false);
  expect(checkIndependentReviewCycle(cycle,{...report,sourceStateStamp:'CHANGED'},true,true).ready).toBe(false);
  expect(()=>feedback(cycle,'DEMO-SITE02',{reportIsFresh:false})).toThrow('일치');
 });
 it('rejects the report author, unassigned actor and invalid source references',()=>{
  const cycle=plan();
  expect(()=>feedback(cycle,'DEMO-AUTHOR01')).toThrow('작성자');
  expect(()=>feedback(cycle,'DEMO-RANDOM99')).toThrow('미배정');
  expect(()=>feedback(cycle,'DEMO-SITE02',{evidenceRef:'DEMO-FOREIGN01'})).toThrow('연결되지 않은');
  expect(()=>feedback(cycle,'DEMO-SITE02',{note:'짧음'})).toThrow('8자');
 });
 it('keeps separate site/HQ feedback as an append-only in-memory history, never approval',()=>{
  const original=plan();
  const site=feedback(original);
  const hq=feedback(site,'DEMO-HQ03',{id:'FEEDBACK-2',kind:'question',topic:'controls',
   note:'기술적 조치에 필요한 근거를 추가 확인해야 합니다.'});
  expect(original.feedback).toHaveLength(0);
  expect(site.feedback).toHaveLength(1);
  expect(hq.feedback).toHaveLength(2);
  expect(hq.feedback.map(x=>x.role)).toEqual(['site','hq']);
  expect(()=>feedback(hq)).toThrow('중복');
  const summary=reviewSimulationSummary(hq);
  expect(summary).toMatchObject({siteNotes:1,hqNotes:1,revisionSuggestions:1,
   formalApprovalAvailable:false,realIdentityVerified:false});
  expect(Object.keys(hq)).not.toContain('approvedAt');
 });
 it('disallows cross-incident report substitution and mismatch after a revision',()=>{
  const cycle=plan();
  expect(()=>feedback(cycle,'DEMO-SITE02',{report:{...report,incidentId:77}})).toThrow('변경');
  expect(()=>feedback(cycle,'DEMO-SITE02',{report:{...report,id:'REPORT-NEW'}})).toThrow('변경');
 });
});

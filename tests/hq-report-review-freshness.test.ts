import {describe,expect,it} from 'vitest';
import {
 recordReportVersion,checkReportVersionFreshness,reportSourceStateStamp,
 type IncidentReportInput
} from '../components/hq/incidentReportRevisionModel';
import type {ReviewEntry} from '../components/hq/investigationReviewModel';
import type {EvidenceManifestRecord} from '../components/hq/evidenceManifestModel';
import type {InvestigationSequence} from '../components/hq/accidentSequenceModel';

const incidentId=100;
const time='2026-11-20T06:00:00.000Z';
const evidence:EvidenceManifestRecord[]=[
 {incidentId,ref:'DEMO-REP-001',kind:'report',note:'비식별 사고경위 시연 자료',sha256:null,byteCount:null,recordedAt:time,status:'metadata_only'},
 {incidentId,ref:'DEMO-PIC-001',kind:'photo',note:'비식별 통로 상태 시연자료',sha256:null,byteCount:null,recordedAt:time,status:'metadata_only'},
 {incidentId,ref:'DEMO-STMT-01',kind:'statement',note:'가상 사고행동 진술 자료',sha256:null,byteCount:null,recordedAt:time,status:'metadata_only'}
];
const sequence:InvestigationSequence={incidentId,claims:[{
 id:'timeline-1',incidentId,phase:'during',order:1,
 description:'작업자가 이동 중 걸림 위험을 확인하지 못한 상황 조사',action:'moving',
 source:'statement',sourceRef:'DEMO-STMT-01',confidence:'needs_confirmation'
}]};
const entry:ReviewEntry={
 id:'review-fact-1',incidentId,kind:'fact',
 description:'통로 상태를 보고서와 현장 진술에 맞춰 조사',
 source:'사고보고서',sourceRef:'DEMO-REP-001',registeredAt:time
};
const input:IncidentReportInput={
 incidentId,
 sixW:{
  who:'가상 지하 RC 형틀작업 담당자 역할',when:'2026-11-20 오전 작업시간',
  where:'지하층 데크 및 통행구역 가상 위치',what:'거푸집 주변 와이어와 이동동선',
  how:'기립 이후 이동 중 중심 상실 가능성 확인',why:'돌출부 와이어 걸림 여부 추가 조사 중'
 },
 causes:[
  {kind:'direct',description:'통행 중 와이어 접촉 여부 확인 필요',sourceRefs:['DEMO-PIC-001']},
  {kind:'contributing',description:'작업 동선의 위험요인 점검상태 확인 필요',sourceRefs:['DEMO-REP-001']},
  {kind:'root',description:'통로 관리체계의 사전확인 미흡 여부 조사',sourceRefs:['DEMO-STMT-01']}
 ],
 openQuestions:'실제 이동 단계와 사고자료의 동작차이를 조사',
 preventionSummary:'와이어 고정 및 동선 위험원 제거 상태 확인',
 revisionReason:'최초 사고조사 검토용 초안'
};
const save=()=>recordReportVersion([],input,evidence,sequence,'REPORT-V1',time,[entry]);
describe('HQ review package source freshness and per-case segregation',()=>{
 it('allows a current review draft only for exactly the same source state',()=>{
  const versions=save();
  const result=checkReportVersionFreshness(incidentId,versions,evidence,sequence,[entry]);
  expect(result.ready).toBe(true);
  expect(versions[0].sourceStateStamp).toBe(reportSourceStateStamp(incidentId,evidence,sequence,[entry]));
 });
 it('invalidates an existing report when evidence manifest changes or a new source is attached',()=>{
  const versions=save();
  const modified=evidence.map(x=>x.ref==='DEMO-PIC-001'?{...x,note:'시연 사진 설명을 보완 기록함'}:x);
  expect(checkReportVersionFreshness(incidentId,versions,modified,sequence,[entry]).ready).toBe(false);
  const added=[...evidence,{...evidence[0],ref:'DEMO-REP-NEW'}];
  expect(checkReportVersionFreshness(incidentId,versions,added,sequence,[entry]).messages.join(' ')).toContain('새 보고서 버전');
 });
 it('invalidates an existing report when chronology or factual investigation entry changes',()=>{
  const versions=save();
  const movement={...sequence,claims:[{...sequence.claims[0],action:'standing' as const}]};
  expect(checkReportVersionFreshness(incidentId,versions,evidence,movement,[entry]).ready).toBe(false);
  expect(checkReportVersionFreshness(incidentId,versions,evidence,sequence,[{...entry,description:'상충하는 진술을 새로 기록하고 경위 조사 진행'}]).ready).toBe(false);
 });
 it('prevents mixing records from different incidents and rejects an empty report list',()=>{
  const versions=save();
  expect(checkReportVersionFreshness(incidentId,[],evidence,sequence,[entry]).ready).toBe(false);
  expect(checkReportVersionFreshness(incidentId,versions,[{...evidence[0],incidentId:900}],sequence,[entry]).ready).toBe(false);
  expect(checkReportVersionFreshness(900,versions,evidence,sequence,[entry]).ready).toBe(false);
  expect(()=>reportSourceStateStamp(incidentId,evidence,{...sequence,incidentId:900},[entry])).toThrow('다른 사고');
 });
 it('accepts a new explicitly saved version after an evidence change without rewriting old one',()=>{
  const originals=save();
  const supplemented=[...evidence,{...evidence[0],ref:'DEMO-EXTRA-01'}];
  const next=recordReportVersion(originals,{...input,revisionReason:'조사자료 추가에 따른 새 개정 검토본'},
   supplemented,sequence,'REPORT-V2','2026-11-20T06:10:00Z',[entry]);
  expect(next[0]).toEqual(originals[0]);
  expect(next[1].version).toBe(2);
  expect(checkReportVersionFreshness(incidentId,next,supplemented,sequence,[entry]).ready).toBe(true);
  expect(checkReportVersionFreshness(incidentId,originals,supplemented,sequence,[entry]).ready).toBe(false);
 });
});

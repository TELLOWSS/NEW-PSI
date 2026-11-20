import {describe,expect,it} from 'vitest';
import {
  checkReportReadiness,diffReportVersions,emptySixW,recordReportVersion,reportAsText,
  type IncidentReportInput,type IncidentReportVersion
} from '../components/hq/incidentReportRevisionModel';
import type {EvidenceManifestRecord} from '../components/hq/evidenceManifestModel';
import type {InvestigationSequence} from '../components/hq/accidentSequenceModel';

const id=61;
const when='2026-11-20T00:30:00.000Z';
const evidence:EvidenceManifestRecord[]=[
 {incidentId:id,ref:'DEMO-REP-001',kind:'report',note:'비식별 시연 사고보고서 내용',sha256:null,byteCount:null,recordedAt:when,status:'metadata_only'},
 {incidentId:id,ref:'DEMO-PIC-001',kind:'photo',note:'비식별 작업통로 사진 시연',sha256:null,byteCount:null,recordedAt:when,status:'metadata_only'},
 {incidentId:id,ref:'DEMO-STMT-01',kind:'statement',note:'가상 작업 동작 진술 자료',sha256:null,byteCount:null,recordedAt:when,status:'metadata_only'}
];
const seq:InvestigationSequence={incidentId:id,claims:[{
 id:'C1',incidentId:id,phase:'during',order:1,action:'moving',description:'이동 중 장애물 접촉 가능성을 조사함',
 source:'statement',sourceRef:'DEMO-STMT-01',confidence:'needs_confirmation'
}]};
const draft=():IncidentReportInput=>({
 incidentId:id,
 sixW:{
  who:'가상 형틀 작업 공종 작업자 역할',
  when:'2026년 11월 20일 오전 작업중',
  where:'지하층 RC 구조물 거푸집 작업구역',
  what:'일반 형틀 부재 작업 및 이동 실시',
  how:'데크 통로를 따라 이동 중 걸림 여부 조사',
  why:'와이어 정리 및 통행 동선 관리가 미흡했을 가능성'
 },
 causes:[
  {kind:'direct',description:'이동 동선에서 와이어 접촉 여부 조사',sourceRefs:['DEMO-PIC-001']},
  {kind:'contributing',description:'작업통로 정리상태와 점검기록 확인 필요',sourceRefs:['DEMO-REP-001']},
  {kind:'root',description:'통로 정리 및 위험요인 확인 체계 미흡 가능성',sourceRefs:['DEMO-STMT-01']}
 ],
 openQuestions:'실제 발생 순서와 현장 사진을 대조할 필요가 있음',
 preventionSummary:'와이어 고정과 통로 관리체계 개선 사항 확인 필요',
 revisionReason:'첫 번째 조사 보고서 초안'
});
describe('HQ six-W case-isolated report revision and source linkage',()=>{
 it('requires all six W fields and three separately evidenced causal layers',()=>{
  const input=draft();
  expect(checkReportReadiness(input,evidence,seq).ready).toBe(true);
  expect(checkReportReadiness({...input,sixW:{...input.sixW,how:''}},evidence,seq).messages.join(' ')).toContain('어떻게');
  expect(checkReportReadiness({...input,causes:input.causes.slice(0,2)},evidence,seq).messages.join(' ')).toContain('근본원인');
  expect(checkReportReadiness({...input,openQuestions:''},evidence,seq).messages.join(' ')).toContain('미확인');
  expect(checkReportReadiness(input,evidence,null).ready).toBe(false);
 });
 it('rejects another case references, missing source and invalid reference format',()=>{
  const input=draft();
  expect(checkReportReadiness({...input,causes:[...input.causes.slice(0,2),{
   ...input.causes[2],sourceRefs:['DEMO-NO-REF']
  }]},evidence,seq).messages.join(' ')).toContain('일치하지');
  expect(checkReportReadiness(input,evidence.map(e=>({...e,incidentId:777})),seq).ready).toBe(false);
  expect(checkReportReadiness({...input,causes:[...input.causes.slice(0,2),{
   ...input.causes[2],sourceRefs:['RAW-UNKNOWN']
  }]},evidence,seq).ready).toBe(false);
 });
 it('retains version 1, creates version 2, and compares six-W and root cause without mutating history',()=>{
  const input=draft();
  const v1=recordReportVersion([],input,evidence,seq,'REPORT-1',when);
  const changed:IncidentReportInput={...input,sixW:{...input.sixW,how:'이동 후 장애물과 발 사이 접촉 상태를 재확인 필요'},
   causes:input.causes.map(c=>c.kind==='root'?{...c,description:'작업통로 점검·확인 절차에 미흡 가능성 검토'}:c),
   revisionReason:'진술과 현장설명의 행동 순서를 재확인함'};
  const v2=recordReportVersion(v1,changed,evidence,seq,'REPORT-2','2026-11-20T01:00:00Z');
  expect(v2[0]).toEqual(v1[0]);
  expect(v2[1].version).toBe(2);
  expect(v2.every(v=>v.status==='unverified_review_draft')).toBe(true);
  const changes=diffReportVersions(v2[0],v2[1]);
  expect(changes.map(c=>c.label)).toContain('어떻게');
  expect(changes.map(c=>c.label)).toContain('근본원인(가설)');
  expect(reportAsText(v2[1])).toContain('실제');
  expect(reportAsText(v2[1])).toContain('확정하지');
  expect(()=>recordReportVersion(v2,changed,evidence,seq,'REPORT-2','2026-11-20T01:00:00Z')).toThrow('같은 버전');
 });
 it('blocks report mixing across incidents and version comparison of distinct cases',()=>{
  const first=recordReportVersion([],draft(),evidence,seq,'R-A',when);
  const other={...first[0],incidentId:62,id:'R-B'} as IncidentReportVersion;
  expect(()=>recordReportVersion([other],draft(),evidence,seq,'R-C',when)).toThrow('다른 사고');
  expect(()=>diffReportVersions(first[0],other)).toThrow('서로 다른 사고');
  expect(emptySixW().who).toBe('');
 });
});

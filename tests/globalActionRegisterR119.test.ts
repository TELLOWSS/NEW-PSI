import {describe,it,expect} from 'vitest';
import {buildGlobalActionRegisterCsv,filterGlobalActionsWithCriteria,globalActionCounts,globalActionDimensions,globalActionNextStep,type GlobalActionRow} from '../lib/inspector/globalActionRegister';

const base:GlobalActionRow={
 inspectionId:'synthetic-inspection',inspectionRevision:1,inspectionTitle:'합성 월간점검',
 siteName:'합성 A현장',location:'2층',workType:'형틀',urgent:false,
 inspectionCreatedAt:'2026-11-01T00:00:00Z',inspectionUpdatedAt:'2026-11-05T00:00:00Z',
 actionId:'default',title:'합성 작업발판 점검',owner:'현장 반장',dueDate:'2026-11-09',
 status:'open',scheduleContext:'',verifiedAt:'',
};
const rows:GlobalActionRow[]=[
 {...base,actionId:'unassigned',owner:'   '},
 {...base,actionId:'no-deadline',dueDate:''},
 {...base,actionId:'bad-date-and-owner',owner:'',dueDate:'2026-02-30'},
 {...base,actionId:'verified-gap',owner:'',dueDate:'',status:'verified'},
 {...base,actionId:'scheduled'},
 {...base,actionId:'review-missing',status:'review-requested',owner:'',dueDate:'2026-11-09',siteName:'합성 B현장'},
];
const criteria={site:'',owner:'',dueFrom:'',dueTo:''};
const today='2026-11-06';
describe('R119 owner and agreed-deadline gap queue',()=>{
 it('flags only saved unresolved actions with missing owner and/or invalid due date',()=>{
  const flags=rows.map(row=>globalActionDimensions(row,today));
  expect(flags[0]).toMatchObject({assignmentNeeded:true,ownerMissing:true,dueDateNeedsReview:false});
  expect(flags[1]).toMatchObject({assignmentNeeded:true,ownerMissing:false,dueDateNeedsReview:true});
  expect(flags[2]).toMatchObject({assignmentNeeded:true,ownerMissing:true,dueDateNeedsReview:true});
  expect(flags[3]).toMatchObject({verified:true,assignmentNeeded:false,ownerMissing:true,dueDateNeedsReview:true});
  expect(flags[4].assignmentNeeded).toBe(false);
  expect(flags[5]).toMatchObject({reinspection:true,assignmentNeeded:true});
  expect(globalActionCounts(rows,today).assignment).toBe(4);
 });
 it('offers precise owner/date corrections without claiming verified action or inventing dates',()=>{
  const selected=filterGlobalActionsWithCriteria(rows,'assignment','',today,criteria);
  expect(new Set(selected.map(row=>row.actionId))).toEqual(new Set(['unassigned','no-deadline','bad-date-and-owner','review-missing']));
  expect(globalActionNextStep(rows[5],today)).toContain('완료 검토 요청');
  expect(globalActionNextStep(rows[2],today)).toContain('기한을 임의로 지정하지 않습니다');
  expect(filterGlobalActionsWithCriteria(rows,'assignment','',today,{...criteria,site:'합성 B현장'}).map(row=>row.actionId)).toEqual(['review-missing']);
 });
 it('exports only the selected scope with independent evidence columns and never modifies source',()=>{
  const original=JSON.stringify(rows);
  const selected=filterGlobalActionsWithCriteria(rows,'assignment','',today,criteria);
  const csv=buildGlobalActionRegisterCsv(selected,today);
  expect(csv.startsWith('\uFEFF')).toBe(true);
  expect(csv).toContain('담당자 미지정 여부');
  expect(csv).toContain('약정기한 확인 필요 여부');
  expect(csv.split('\r\n').filter(Boolean)).toHaveLength(5);
  expect(csv).not.toContain('verified-gap');
  const historical=buildGlobalActionRegisterCsv([rows[3]],today);
  expect(historical).toContain('"예","예"'); // historical metadata remains truthful, but the verified action is not in the gap queue
  expect(csv).not.toContain('"scheduled","합성 작업발판 점검"'); // action ID exclusion, not the legitimate deadline phase
  expect(JSON.stringify(rows)).toBe(original);
 });
});

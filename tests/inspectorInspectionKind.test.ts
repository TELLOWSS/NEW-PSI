import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {
 newInspectionDocument,inspectionKindText,type InspectionKind,
 type Inspection,type InspectionReport,type InspectorAction,
} from '../lib/inspector/types';
import {validateDocument} from '../lib/inspector/validation';
import {projectGlobalActionRows,filterGlobalActions,buildGlobalActionRegisterCsv} from '../lib/inspector/globalActionRegister';
import {actionDeadlinePhase,actionDeadlineText} from '../lib/inspector/workQueue';
import {buildInspectionBrief} from '../lib/inspector/journey';
import {buildReportActionRequests} from '../lib/inspector/expertReview';

const siteId='eeadbbcc-1000-4000-8000-000000000005';
const task:InspectorAction={id:'bbadccdd-1000-4000-8000-000000000006',title:'발판 보강',owner:'형틀반장',dueDate:'2026-10-29',status:'open',completionPhotoId:'',note:'임시통제 별도 확인',scheduleContext:'자재 반입 후 이틀 내 조치'};
const inspection=(kind?:InspectionKind,urgent=false):Inspection=>({
 id:siteId,revision:2,created_at:'2026-10-26T00:00:00.000Z',updated_at:'2026-10-27T00:00:00.000Z',
 document:{...newInspectionDocument(),title:'시설물 현장점검',urgent,inspectionKind:kind,actions:[{...task}]},
});
const report=(item:Inspection):InspectionReport=>({
 id:'report',inspection_id:item.id,inspection_revision:item.revision,snapshot_sha256:'test',
 created_at:item.updated_at,snapshot:{inspection:item,evidence:[],legalStatus:'UNVERIFIED',reportStatus:'DRAFT',generatedAt:item.updated_at},
});
const file=(path:string)=>readFileSync(path,'utf8');

describe('Inspector regular/consulting deadline-based inspections',()=>{
 it('keeps legacy saved inspections unclassified; never guesses kind from a title',()=>{
  const doc=newInspectionDocument();
  expect(doc.inspectionKind).toBeUndefined();
  expect(inspectionKindText(doc.inspectionKind)).toBe('유형 미지정(기존 기록)');
  expect(()=>validateDocument(doc,siteId,[])).not.toThrow();
  expect(projectGlobalActionRows([inspection()])[0].inspectionKind).toBeUndefined();
 });
 it('supports explicit regular, consulting, spot and other kinds in the existing JSON document',()=>{
  const cases:[InspectionKind,string][]=[['regular','정기점검'],['consulting','컨설팅점검'],['spot','수시점검'],['other','기타 점검']];
  for(const [kind,label] of cases){
    expect(inspectionKindText(kind)).toBe(label);
    const item=inspection(kind);
    expect(validateDocument(item.document,item.id,[]).inspectionKind).toBe(kind);
    expect(projectGlobalActionRows([item])[0].inspectionKind).toBe(kind);
  }
 });
 it('rejects forged inspection kinds and unexpected document fields',()=>{
  const doc=newInspectionDocument();
  expect(()=>validateDocument({...doc,inspectionKind:'IMMEDIATE_STOP'},siteId,[])).toThrow();
  expect(()=>validateDocument({...doc,inspectionKind:null},siteId,[])).toThrow();
  expect(()=>validateDocument({...doc,inspectionKind:55},siteId,[])).toThrow();
  expect(()=>validateDocument({...doc,unsafeAutoApprove:true},siteId,[])).toThrow();
 });
 it('regular and consulting kinds do not force immediate action or automatically change saved status',()=>{
  for(const kind of ['regular','consulting','spot','other'] as InspectionKind[]){
    const doc=inspection(kind).document;
    expect(doc.urgent).toBe(false);
    expect(doc.actions[0].status).toBe('open');
    expect(actionDeadlinePhase(doc.actions[0],'2026-10-27')).toBe('scheduled');
    expect(actionDeadlineText(doc.actions[0],'2026-10-27')).toContain('D-2');
    expect(doc.actions[0].scheduleContext).toContain('자재');
  }
 });
 it('urgent field remains independent of scheduled dates and inspection category',()=>{
  for(const kind of ['regular','consulting'] as InspectionKind[]){
    const doc=inspection(kind,true).document;
    expect(doc.urgent).toBe(true);
    expect(actionDeadlinePhase(doc.actions[0],'2026-10-27')).toBe('scheduled');
    const row=projectGlobalActionRows([inspection(kind,true)])[0];
    expect(row.urgent).toBe(true);
  }
 });
 it('future, today, overdue, reinspection and verified still depend on action status/date only',()=>{
  const item=inspection('consulting');
  for(const [date,status,expected] of [
    ['2026-10-29','open','scheduled'],['2026-10-27','open','today'],
    ['2026-10-26','open','overdue'],['2026-10-26','review-requested','reinspection'],
    ['2026-10-26','verified','verified'],
  ] as const){
    const a={...item.document.actions[0],dueDate:date,status};
    expect(actionDeadlinePhase(a,'2026-10-27')).toBe(expected);
  }
 });
 it('all inspection kinds appear consistently in projected register/search/CSV but not as AI guesses',()=>{
  const rows=projectGlobalActionRows([
    inspection('consulting'),{...inspection('regular'),id:'reg-2'},
    {...inspection(),id:'old-3'},
  ]);
  expect(rows.map(row=>inspectionKindText(row.inspectionKind))).toEqual([
    '컨설팅점검','정기점검','유형 미지정(기존 기록)',
  ]);
  expect(filterGlobalActions(rows,'all','컨설팅점검','2026-10-27')).toHaveLength(1);
  expect(filterGlobalActions(rows,'all','유형 미지정','2026-10-27')).toHaveLength(1);
  const csv=buildGlobalActionRegisterCsv(rows,'2026-10-27');
  expect(csv).toContain('점검 유형');
  expect(csv).toContain('컨설팅점검');
  expect(csv).toContain('유형 미지정(기존 기록)');
 });
 it('human-facing report and copied summaries preserve explicit kind without awarding legal approval',()=>{
  for(const kind of ['consulting','regular','spot'] as InspectionKind[]){
   const item=inspection(kind);
   const text=buildInspectionBrief(report(item));
   const request=buildReportActionRequests(report(item));
   expect(text).toContain('점검 유형: '+inspectionKindText(kind));
   expect(request).toContain('점검 유형: '+inspectionKindText(kind));
   expect(text).toContain('검토');
  }
 });
 it('1000 deterministic fixture revisions preserve kind, owner, due date, urgency and evidence context',()=>{
   let seed=0x20261027;
   for(let i=0;i<1000;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const kinds:InspectionKind[]=['spot','regular','consulting','other'];
    const kind=kinds[seed%4];
    const before=inspection(kind,Boolean(seed&4));
    const frozen=JSON.stringify(before);
    const [projected]=projectGlobalActionRows([before]);
    expect(projected.inspectionKind).toBe(kind);
    expect(projected.dueDate).toBe(task.dueDate);
    expect(projected.scheduleContext).toBe(task.scheduleContext);
    expect(projected.urgent).toBe(before.document.urgent);
    expect(JSON.stringify(before)).toBe(frozen);
   }
 });
 it('includes a visible beginner inspection-kind choice, without using it to approve work resumption',()=>{
    const ui=file('components/inspector/InspectorQuickWorkspace.tsx');
    const reportUi=file('components/inspector/InspectorReport.tsx');
    const registerUi=file('components/inspector/InspectorGlobalActionRegister.tsx');
    expect(ui).toContain('si-quick-inspection-kind');
    expect(ui).toContain('정기·컨설팅점검');
    expect(ui).toContain('setInspectionKind(r.item.document.inspectionKind');
    expect(ui).toContain('expectedRevision:current.revision,document');
    expect(reportUi).toContain('점검 유형');
    expect(registerUi).toContain('inspectionKindText(row.inspectionKind)');
    expect(ui).not.toContain('inspectionKind === "consulting" ? "verified"');
 });
 it('does not add paid runtime dependencies, Vercel functions, database migrations or scheduled cron',()=>{
   const config=JSON.parse(file('vercel.json')) as {fluid:boolean;functions:Record<string,{maxDuration:number}>;crons?:unknown[]};
   expect(config.fluid).toBe(true);
   expect(config.crons||[]).toEqual([]);
   expect(Object.keys(config.functions).sort()).toEqual(['api/admin.ts','api/gateway.ts','api/inspection-share.ts'].sort());
   const sources=['lib/inspector/types.ts','lib/inspector/validation.ts','lib/inspector/globalActionRegister.ts'];
   for(const path of sources)expect(file(path)).not.toMatch(/onnxruntime|@huggingface|fetch\s*\(/);
 });
});

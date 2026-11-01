import {describe,it,expect} from 'vitest';
import {buildLocalRecheckQueue} from '../lib/inspector/localRecheckQueue.mjs';
import {
 buildLocalHandoffPlan,selectLocalHandoffTargets,
 formatLocalHandoffMessage,formatLocalHandoffHtml,
 handoffSourceSnapshot,F10_HANDOFF_MAX_ITEMS,
} from '../lib/inspector/localRecheckHandoff.mjs';

const NOW=new Date(2026,10,1,13,0);
const follow=(status='pending',dueDate='',assignee='',temporaryMeasure='')=>({
 status,assignee,dueDate,temporaryMeasure,history:[],
});
const record=(id:string,extra:Record<string,unknown>={})=>({
 id,note:'<b>자료</b> 민감한 관찰 내용',
 siteContext:{site:'=SUM(1,1)',building:'2001동',level:'15층',trade:'형틀'},
 photo:new Blob(['SYNTHETIC IMAGE PLACEHOLDER'],{type:'image/png'}),
 ...extra,
});
const recheck=(result:string,nextCheckDate:string,at='2026-11-01T03:00:00Z')=>({
 id:'123e4567-e89b-12d3-a456-426614174001',result,nextCheckDate,at,
 reason:'개인정보가 있는 지연 사유',note:'상세 통제 사진 포함',
 photoSha256:'a'.repeat(64),followupStatus:'in_progress',
});
const records=[
 record('conflict',{followup:follow('verified','2026-11-09','숨겨진 담당자',''),
  rechecks:[recheck('needs_more','2026-11-02')]}),
 record('overdue',{followup:follow('in_progress','2026-10-30','근무자A','출입 통제')}),
 record('today',{followup:follow('pending','2026-11-01','근무자B','')}),
 record('soon',{followup:follow('pending','2026-11-04','근무자C','안전 표지')}),
 record('unscheduled',{followup:follow('pending','','근무자D','')}),
 record('scheduled-unassigned',{followup:follow('pending','2026-12-01','','')}),
 record('scheduled-assigned',{followup:follow('pending','2026-12-01','근무자E','안전 표지')}),
 record('verified',{followup:follow('verified','2026-10-30','','')}),
];

describe('F10 local-only safety handover',()=>{
 it('selects due, undetermined, conflicting and later unassigned without verified targets',()=>{
  const queue=buildLocalRecheckQueue(records,NOW);
  const selected=selectLocalHandoffTargets(queue);
  expect(selected).toHaveLength(6);
  expect(selected.map((e:any)=>e.recordId)).toEqual([
    'conflict','overdue','today','soon','unscheduled','scheduled-unassigned',
  ]);
  expect(selected.find((e:any)=>e.recordId==='verified')).toBeUndefined();
 });
 it('keeps earliest overdue deadline first within the same priority group',()=>{
  const queue=buildLocalRecheckQueue([
   record('recent',{followup:follow('pending','2026-10-31','','')}),
   record('oldest',{followup:follow('pending','2026-10-11','','')}),
  ],NOW);
  expect(selectLocalHandoffTargets(queue).map((item:any)=>item.recordId))
   .toEqual(['oldest','recent']);
 });
 it('summarizes work without copying names, detail notes, photos or full hashes',()=>{
  const plan=buildLocalHandoffPlan(records,NOW);
  expect(plan.summary).toMatchObject({
   total:6,conflict:1,overdue:1,today:1,soon:1,unscheduled:1,
   scheduledUnassigned:1,missingAssignee:1,missingTemporary:4,
  });
  const message=formatLocalHandoffMessage(plan);
  const html=formatLocalHandoffHtml(plan);
  for(const output of [message,html]){
   expect(output).toContain('2001동');
   expect(output).not.toContain('근무자A');
   expect(output).not.toContain('숨겨진 담당자');
   expect(output).not.toContain('개인정보가 있는');
   expect(output).not.toContain('SYNTHETIC IMAGE PLACEHOLDER');
   expect(output).not.toContain('a'.repeat(64));
   expect(output).not.toContain('민감한 관찰 내용');
   expect(output).toContain('작업 재개');
  }
  expect(message).toContain('담당자 미기록');
  expect(message).toContain('임시 통제 기록 확인');
  expect(html).toContain("default-src 'none'");
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img');
 });
 it('protects copyable text from formula prefixes and escapes printable HTML',()=>{
  const plan=buildLocalHandoffPlan([record('strange',{
   siteContext:{site:'<b>테스트 현장</b>',building:'',level:'',trade:''},
   followup:follow('pending','2026-11-01','',''),
   additionalActions:[{id:'a1',title:'=1+1',
    followup:follow('pending','2026-11-01','','')}],
  })],NOW);
  const html=formatLocalHandoffHtml(plan),text=formatLocalHandoffMessage(plan);
  expect(html).toContain('&lt;b&gt;테스트 현장&lt;/b&gt;');
  expect(html).not.toContain('<b>테스트 현장</b>');
  expect(text).toContain("조치: '=1+1");
 });
 it('honors visible bucket scope and distinguishes it from all',()=>{
  const plan=buildLocalHandoffPlan(records,NOW,'recheck:today','visible');
  expect(plan.entries).toHaveLength(1);
  expect(plan.entries[0]).toMatchObject({bucket:'today',nextDate:'2026-11-01'});
  expect(plan.scope).toContain('현재');
  expect(buildLocalHandoffPlan(records,NOW,'recheck:today','all').entries).toHaveLength(6);
 });
 it('fails rather than silently omit excess or absent targets',()=>{
  expect(()=>buildLocalHandoffPlan([record('complete',{followup:follow('verified')})],NOW))
   .toThrow('인계 대상이 없습니다');
  const massive=Array.from({length:F10_HANDOFF_MAX_ITEMS+1},(_,i)=>record('x'+i,{
   followup:follow('pending','2026-10-31'),
  }));
  expect(()=>buildLocalHandoffPlan(massive,NOW)).toThrow('40건');
 });
 it('preserves source and snapshots all relevant follow-up fields',()=>{
  const before=handoffSourceSnapshot(records);
  buildLocalHandoffPlan(records,NOW);
  expect(handoffSourceSnapshot(records)).toBe(before);
  const changed=records.map(r=>({...r}));
  changed[0].note='new text from second tab';
  expect(handoffSourceSnapshot(changed)).not.toBe(before);
 });
});

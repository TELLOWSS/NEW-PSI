import {describe,it,expect} from 'vitest';
import {buildLocalRecheckQueue} from '../lib/inspector/localRecheckQueue.mjs';
import {prepareFollowupChange} from '../lib/inspector/localFollowupChangeTrace.mjs';
import {
 buildLocalRecheckReport,formatLocalRecheckCsv,formatLocalRecheckPrintHtml,
} from '../lib/inspector/localRecheckReport.mjs';

const first=new Date('2026-10-28T09:00:00.000Z');
const second=new Date('2026-11-01T09:00:00.000Z');
const followup=prepareFollowupChange(prepareFollowupChange(undefined,{
 status:'pending',assignee:'비공개 A',dueDate:'2026-11-02',
 temporaryMeasure:'출입 통제선 설치',note:'최종 보수는 아직 완료 전',
 controlReview:'unchecked',
},first),{
 status:'in_progress',assignee:'비공개 A',dueDate:'2026-11-05',
 temporaryMeasure:'통제선 확대',
 dueChangeReason:'=HYPERLINK("https://example.invalid")',
 temporaryChangeReason:'설치할 자재를 이동하는 구간이 넓어짐',
 note:'임시 통제 상태 점검자 기록',
 controlReview:'site_checked',
},second);
const record={
 id:'synthetic-30',note:'개인 인적사항 기록 없음',
 siteContext:{site:'<img src=x onerror=alert(1)>',building:'2001동',level:'16F',trade:'형틀'},
 followup,
 rechecks:[{
  id:'123e4567-e89b-12d3-a456-426614174000',result:'needs_more',
  reason:'개인 연락처 추가메모',note:'통제선 유지 확인',
  nextCheckDate:'',at:'2026-11-01T10:00:00.000Z',photoSha256:'b'.repeat(64),
  followupStatus:'in_progress',
 }],
 photo:new Blob(['SYNTHETIC PHOTO BYTES'],{type:'image/png'}),
};
const queue=buildLocalRecheckQueue([record],new Date(2026,10,1));

describe('F10 30th opt-in report timeline',()=>{
 const make=(opts:Record<string,unknown>={})=>buildLocalRecheckReport(queue,[record],{
  generatedAt:new Date(2026,10,1),...opts,
 });
 it('preserves prior report output by default',()=>{
  const report=make();
  expect(report.progress).toBeNull();
  expect(report.includeProgress).toBe(false);
  const csv=formatLocalRecheckCsv(report),html=formatLocalRecheckPrintHtml(report);
  expect(csv).not.toContain('F10 경과 연계 이력');
  expect(html).not.toContain('F10 경과 연계 이력');
  expect(csv).not.toContain('비공개 A');
  expect(csv).not.toContain('HYPERLINK');
 });
 it('includes structured history with blank latest recheck date without private reasons',()=>{
  const report=make({includeProgress:true});
  expect(report.progress?.totalEvents).toBe(3);
  const csv=formatLocalRecheckCsv(report),html=formatLocalRecheckPrintHtml(report);
  expect(csv).toContain('F10 경과 연계 이력');
  expect(csv).toContain('2026-11-02');
  expect(csv).toContain('2026-11-05');
  expect(csv).toContain('목표 기한 변경');
  expect(csv).toContain('재점검');
  expect(html).toContain('최신 재점검 예정일 미정');
  expect(html).toContain('기한 변경');
  for(const output of [csv,html]){
   expect(output).not.toContain('비공개 A');
   expect(output).not.toContain('HYPERLINK');
   expect(output).not.toContain('개인 연락처 추가메모');
   expect(output).not.toContain('SYNTHETIC PHOTO BYTES');
   expect(output).not.toContain('b'.repeat(64));
  }
  expect(html).not.toContain('<img');
  expect(html).toContain('default-src');
 });
 it('adds old change reasons only when detailed records were explicitly opted in',()=>{
  const report=make({includeProgress:true,includeDetails:true});
  const csv=formatLocalRecheckCsv(report);
  const html=formatLocalRecheckPrintHtml(report);
  expect(csv).toContain("'=HYPERLINK");
  expect(csv).toContain('설치할 자재를 이동');
  expect(csv).toContain('개인 연락처 추가메모');
  expect(html).toContain('&quot;https://example.invalid');
  expect(html).not.toContain('<img');
  expect(html).not.toContain('<script');
  expect(csv).not.toContain('SYNTHETIC PHOTO BYTES');
 });
 it('uses target record contents without mutating evidence or historical snapshots',()=>{
  const orig=JSON.stringify(record);
  make({includeProgress:true,includeDetails:true});
  expect(JSON.stringify(record)).toBe(orig);
  expect(queue[0].date).toBe('');
 });
});

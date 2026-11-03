import {describe,it,expect} from 'vitest';
import {buildLocalHandoffFollowthrough,formatLocalReceiptRequest,summarizeLocalHandoffItems} from '../lib/inspector/localHandoffFollowthrough.mjs';
describe('F10-58 manual handoff and receipt triage without invented delivery',()=>{
 it('untouched device cannot report a prepared, delivered or received handoff',()=>{
  const x=buildLocalHandoffFollowthrough();
  expect(x.stages.map(v=>v.status)).toEqual(['not-prepared','unconfirmed','unconfirmed','requires-local-record']);
  expect(x.next).toBe('인계 초안 준비');
  expect(x.persisted).toBe(false);expect(x.externallyVerified).toBe(false);expect(x.actionVerified).toBe(false);
 });
 it('a prepared plan and clipboard copy do not imply transmission or acknowledgement',()=>{
  const x=buildLocalHandoffFollowthrough({prepared:true});
  expect(x.stages.map(v=>v.status)).toEqual(['prepared','unconfirmed','unconfirmed','requires-local-record']);
  expect(x.next).toBe('별도 전달 사실 확인');
  expect(x.selfReportedDelivery).toBe(false);
  expect(x.selfReportedReceipt).toBe(false);
 });
 it('rejects logically impossible receive-without-send and old checks without current draft',()=>{
  const withoutDelivery=buildLocalHandoffFollowthrough({prepared:true,receiptReported:true});
  const noDraft=buildLocalHandoffFollowthrough({prepared:false,deliveryReported:true,receiptReported:true});
  expect(withoutDelivery.selfReportedReceipt).toBe(false);
  expect(noDraft.selfReportedDelivery).toBe(false);
  expect(noDraft.selfReportedReceipt).toBe(false);
 });
 it('clearly labels every human-entered step as self-reported, not a confirmed action',()=>{
  const x=buildLocalHandoffFollowthrough({prepared:true,deliveryReported:true,receiptReported:true});
  expect(x.selfReportedDelivery).toBe(true);expect(x.selfReportedReceipt).toBe(true);
  expect(x.next).toBe('점검 항목별 재점검·조치 이력 기록');
  expect(x.stages[1].status).toBe('operator-reported');
  expect(x.stages[2].status).toBe('operator-reported');
  expect(x.stages[3].status).toBe('requires-local-record');
  expect(x.externallyVerified).toBe(false);expect(x.actionVerified).toBe(false);expect(x.persisted).toBe(false);
 });
 it('F10-59 supports partial handoff without marking all targets delivered or received',()=>{
  const entries=[{order:1},{order:2},{order:3}];
  const check=summarizeLocalHandoffItems(entries,{1:{delivered:true,received:true},2:{delivered:true,received:false}});
  expect(check.total).toBe(3);
  expect(check.deliveredCount).toBe(2);
  expect(check.receivedCount).toBe(1);
  expect(check.allDelivered).toBe(false);
  expect(check.allReceived).toBe(false);
  expect(check.items.map(item=>item.next)).toEqual([
   '개별 재점검 이력 기록','담당자 수신 회신 직접 확인','외부 전달 직접 확인',
  ]);
  expect(check.persisted).toBe(false);
  expect(check.externallyVerified).toBe(false);
  expect(check.actionVerified).toBe(false);
 });
 it('F10-59 never accepts receive-only or invalid external acknowledgements',()=>{
  const x=summarizeLocalHandoffItems([{order:1},{order:2}],{
   1:{received:true},2:{delivered:'true',received:true},999:{delivered:true,received:true},
  });
  expect(x.deliveredCount).toBe(0);
  expect(x.receivedCount).toBe(0);
  expect(x.allReceived).toBe(false);
  const completed=summarizeLocalHandoffItems([{order:1},{order:2}],{
   1:{delivered:true,received:true},2:{delivered:true,received:true},
  });
  expect(completed.allDelivered).toBe(true);
  expect(completed.allReceived).toBe(true);
  expect(completed.actionVerified).toBe(false);
 });
 it('F10-59 has no carried-over confirmations without current prepared items',()=>{
  expect(summarizeLocalHandoffItems([],{1:{delivered:true,received:true}})).toMatchObject({
   total:0,allDelivered:false,allReceived:false,receivedCount:0,
  });
  expect(summarizeLocalHandoffItems(undefined,{1:{delivered:true}}).total).toBe(0);
 });

 it('generates a request for HUMAN replies with no invented recipient, status or actual contact',()=>{
  const t=formatLocalReceiptRequest();
  expect(t).toContain('수신 여부를 회신해 주세요');
  expect(t).toContain('담당 가능 여부');
  expect(t).toContain('다음 확인 예정일');
  expect(t).toContain('발송·수신·현장 확인·조치 완료를 증명하지 않습니다');
  expect(t).not.toMatch(/수신 완료|인계 완료|확인 완료함/);
 });
});

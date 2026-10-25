import {describe,it,expect} from 'vitest';
import {decodePendingReceipt,encodePendingReceipt,receiptMarkerKey,RECEIPT_MARKER_TTL_MS} from '../lib/inspector/replyReceiptRecovery';

const requestId='a0190000-0000-4000-8000-000000000001';
describe('recipient reload receipt marker',()=>{
 it('stores only UUID and time, not names, photos, notes or share tokens',()=>{
  const raw=encodePendingReceipt({requestId,startedAt:1_000_000});
  expect(JSON.parse(raw)).toEqual({requestId,startedAt:1_000_000});
  expect(raw).not.toMatch(/사진|설명|token|base64/);
  expect(decodePendingReceipt(raw,1_000_100)).toEqual({requestId,startedAt:1_000_000});
 });
 it('ignores expired, malformed, or future-dated attempts rather than claiming receipt',()=>{
  expect(decodePendingReceipt('not json')).toBeNull();
  expect(decodePendingReceipt(JSON.stringify({requestId:'not-uuid',startedAt:1_000}))).toBeNull();
  expect(decodePendingReceipt(encodePendingReceipt({requestId,startedAt:1_000}),1_000+RECEIPT_MARKER_TTL_MS+1)).toBeNull();
  expect(decodePendingReceipt(encodePendingReceipt({requestId,startedAt:80_000}),1_000)).toBeNull();
 });
 it('uses an opaque per-link key, not the share token itself',async()=>{
  const token='Q'.repeat(43);
  const first=await receiptMarkerKey(token),next=await receiptMarkerKey('R'.repeat(43));
  expect(first).toMatch(/^psi\.inspector\.reply\.receipt\.v1\.[a-f0-9]{64}$/);
  expect(first).not.toContain(token);
  expect(first).not.toBe(next);
 });
});

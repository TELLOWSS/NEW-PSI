import {describe,it,expect} from 'vitest';
import {localRecordMayDelete,localRecordDeletionSnapshot} from '../lib/inspector/localRecordDeletionGuard.mjs';

const record=()=>({
 id:'synthetic-id',createdAt:'2026-11-02T00:00:00.000Z',
 note:'합성 점검 기록',action:'접근통제 유지',sha256:'a'.repeat(64),
 followup:{status:'in_progress',assignee:'테스트',dueDate:'2026-11-05',
  history:[{status:'in_progress',at:'2026-11-02T00:00:00.000Z',note:'임시통제'}]},
 rechecks:[{result:'delayed',reason:'보수 자재 대기'}],
 photo:new Blob(['photo'],{type:'image/jpeg'}),
});
describe('F08 stale destructive action guard',()=>{
 it('accepts unchanged persisted metadata without performing a deletion',()=>{
  const old=record(),current=record();
  expect(localRecordMayDelete(old,current)).toBe(true);
  expect(localRecordDeletionSnapshot(old)).toBe(localRecordDeletionSnapshot(current));
 });
 it('blocks a different tab changing any meaningful fields',()=>{
  const old=record();
  const changed=[
   {...record(),note:'다른 탭에서 수정한 메모'},
   {...record(),action:'보수 조치 완료 여부 재확인'},
   {...record(),sha256:'b'.repeat(64)},
   {...record(),photo:new Blob(['longer photo'],{type:'image/jpeg'})},
   {...record(),photo:new Blob(['photo'],{type:'image/png'})},
   {...record(),followup:{...record().followup,status:'verified'}},
   {...record(),rechecks:[...record().rechecks,{result:'needs_more',reason:'다시 확인'}]},
  ];
  for(const change of changed)expect(localRecordMayDelete(old,change)).toBe(false);
  expect(localRecordMayDelete(old,record())).toBe(true);
 });
 it('blocks missing or unreadable snapshots rather than deleting by ID',()=>{
  for(const value of [null,undefined,{id:'synthetic-id'},42,[]])
   expect(localRecordMayDelete(record(),value)).toBe(false);
  expect(localRecordMayDelete(null,record())).toBe(false);
  const cyclic=record() as ReturnType<typeof record>&{extra?:unknown};
  cyclic.extra=cyclic;
  expect(localRecordMayDelete(cyclic,record())).toBe(false);
 });
});

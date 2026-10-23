import {describe,it,expect} from 'vitest';
import {parseDeletionPointers,sortInspectionRecords} from '../lib/inspector/recordHistory';
import type {InspectionSummary} from '../lib/inspector/types';
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
const record=(id:string,patch:Partial<InspectionSummary>={}):InspectionSummary=>({id,revision:1,title:'점검',work_type:'',location:'',urgent:false,open_actions:0,needs_review:false,created_at:'2026-10-20T00:00:00Z',updated_at:'2026-10-20T00:00:00Z',...patch});
describe('inspection history recovery and ordering',()=>{
 it('orders an isolated loaded subset deterministically without changing pagination source order',()=>{
  const items=[record(a,{updated_at:'2026-10-23T00:00:00Z'}),record(b,{created_at:'2026-10-22T00:00:00Z'})];
  expect(sortInspectionRecords(items,'created').map(x=>x.id)).toEqual([b,a]);
  expect(sortInspectionRecords(items,'updated').map(x=>x.id)).toEqual([a,b]);
  expect(items.map(x=>x.id)).toEqual([a,b]);
 });
 it('prioritizes urgent, unresolved actions, then human review and handles invalid times',()=>{
  const items=[record('a',{needs_review:true}),record('b',{open_actions:2}),record('c',{urgent:true}),record('d',{created_at:'invalid'})];
  expect(sortInspectionRecords(items,'attention').map(x=>x.id)).toEqual(['c','b','a','d']);
 });
 it('restores only unique valid identifiers and revisions, stripping record contents',()=>{
  expect(parseDeletionPointers(JSON.stringify([{id:a,revision:2,title:'private',photo:'bytes'},{id:a,revision:3},{id:b,revision:0}]))).toEqual([{id:a,revision:2},{id:b,revision:0}]);
 });
 it.each([null,'{','{}','null','[null,0,{}, {"id":"invalid","revision":1}]',JSON.stringify([{id:a,revision:-1},{id:b,revision:1.5}])])('ignores malformed recovery data %s',raw=>{expect(parseDeletionPointers(raw)).toEqual([]);});
});

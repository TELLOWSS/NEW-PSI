import {describe,it,expect} from 'vitest';
import {changeActionAssignment,recoveredAssignment,type AssignmentChange} from '../lib/inspector/actionAssignment';
import {newInspectionDocument,type Inspection,type InspectorAction} from '../lib/inspector/types';
import {assertSafeEdit} from '../lib/inspector/validation';
const old:InspectorAction={id:'work',title:'통로 방호 보완',owner:'형틀반장',dueDate:'2026-10-24',status:'open',sourcePhotoIds:['a'],completionPhotoId:'',note:'기존 사진 범위 기록'};
const fixture=():Inspection=>({id:'inspection',revision:8,created_at:'',updated_at:'',document:{...newInspectionDocument(),photoIds:['a','b'],actions:[structuredClone(old)],materialCompletion:{revision:7,completedAt:'2026-10-23T01:00:00Z',photoIds:['a']}}});
const change=(before=old):AssignmentChange=>({before,owner:' 철근반장 ',dueDate:'2026-10-25',reason:' 공정 변경으로 담당자와 완료기한 조정 '});
describe('registered action assignment change',()=>{
    it('preserves action identity, scope, status and old note, records reason and clears material closing without mutating source',()=>{
        const item=fixture(),before=JSON.stringify(item),next=changeActionAssignment(item.document,change());
        expect(next.actions).toHaveLength(1);expect(next.actions[0]).toMatchObject({...old,owner:'철근반장',dueDate:'2026-10-25',note:expect.stringContaining('기존 사진 범위 기록\n[담당·기한 변경] 형틀반장 / 2026-10-24 → 철근반장 / 2026-10-25\n이유: 공정 변경')});
        expect(next.materialCompletion).toBeUndefined();expect(()=>assertSafeEdit(next,item.document)).not.toThrow();expect(JSON.stringify(item)).toBe(before);
    });
    it('supports review-requested and legacy unscoped actions without manufacturing approval or evidence',()=>{
        for(const action of [{...old,status:'review-requested' as const,completionPhotoId:'b'},{...old,sourcePhotoIds:undefined}]){
            const item=fixture();item.document.actions=[action];const next=changeActionAssignment(item.document,change(action));
            expect(next.actions[0].status).toBe(action.status);expect(next.actions[0].completionPhotoId).toBe(action.completionPhotoId);expect(next.actions[0].sourcePhotoIds).toEqual(action.sourcePhotoIds);expect(next.actions[0].verifiedAt).toBeUndefined();
        }
    });
    it('rejects verified, removed or concurrently changed actions',()=>{
        for(const action of [{...old,status:'verified' as const},{...old,title:'다른 범위'},{...old,dueDate:'2026-10-26'},{...old,note:'변경된 개선 내용'}]){
            const item=fixture();item.document.actions=[action];expect(()=>changeActionAssignment(item.document,change())).toThrow('조치 상태가 바뀌');
        }
        const item=fixture();item.document.actions=[];expect(()=>changeActionAssignment(item.document,change())).toThrow();
    });
    it('requires a real changed value, owner, valid date and bounded meaningful reason',()=>{
        for(const override of [{owner:''},{owner:'x'.repeat(101)},{reason:'짧음'},{reason:'x'.repeat(201)},{dueDate:'2026-02-30'},{dueDate:'invalid'},{owner:old.owner,dueDate:old.dueDate}])expect(()=>changeActionAssignment(fixture().document,{...change(),...override})).toThrow();
    });
    it('never truncates full existing records and does not drop other actions',()=>{
        const item=fixture();item.document.actions=[{...old,note:'가'.repeat(1990)},{...old,id:'other'}];
        expect(()=>changeActionAssignment(item.document,change(item.document.actions[0]))).toThrow('2,000자');
        item.document.actions[0]=structuredClone(old);expect(changeActionAssignment(item.document,change()).actions[1]).toEqual(item.document.actions[1]);
    });
    it('recovers only a newer active exact full saved document, with object key order ignored',()=>{
        const before=fixture(),expected=changeActionAssignment(before.document,change()),after={...before,revision:9,document:JSON.parse(JSON.stringify(expected))};
        after.document.actions[0]=Object.fromEntries(Object.entries(after.document.actions[0]).reverse()) as InspectorAction;
        expect(recoveredAssignment(before,expected,after,{state:'active'})).toBe(true);
        for(const bad of [{...after,id:'other'},{...after,revision:8},{...after,document:{...after.document,title:'다른 기기 수정'}},{...after,document:{...after.document,actions:[...after.document.actions,{...old,id:'another'}]}}])expect(recoveredAssignment(before,expected,bad)).toBe(false);
        expect(recoveredAssignment(before,expected,after,{state:'deleting'})).toBe(false);
    });
});

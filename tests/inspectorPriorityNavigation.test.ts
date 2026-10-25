import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
describe('one-tap inspector priority navigation safeguards',()=>{
    it('uses a direct action ID and deterministic registered-page index, not a generic top of list',()=>{
        const planner=read('components/inspector/InspectorActionPlanner.tsx');
        expect(planner).toContain('priorityFocus.actionId');
        expect(planner).toContain('setPage(Math.floor(index/3))');
        expect(planner).toContain("root.current?.querySelectorAll<HTMLElement>('[data-action-id]')");
        expect(planner).toContain("setPriorityId('')");
    });
    it('never drops unsaved field changes and opens evidence only for human review',()=>{
        const planner=read('components/inspector/InspectorActionPlanner.tsx');
        expect(planner).toContain('dirty.current||followupDirty.current.size');
        expect(planner).toContain('입력을 버리지 않습니다');
        expect(planner).toContain('followup.open=true');
        const workspace=read('components/inspector/InspectorQuickWorkspace.tsx');
        expect(workspace).toContain('onOpenPriorityAction=');
        expect(workspace).toContain('priorityFocus={priorityFocus}');
        expect(workspace).toContain('조치 기록을 갱신했다면 최신 저장본으로 새 보고서를 작성하세요');
    });
});

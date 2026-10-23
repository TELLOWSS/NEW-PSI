import {it,expect} from 'vitest';
import {actionDraftChanged} from '../lib/inspector/actionPlan';
it('does not mistake the automatically selected original photo and suggested title for an unsaved edit',()=>{
 expect(actionDraftChanged('사진 속 조치','사진 속 조치','','',['photo-a'],['photo-a'])).toBe(false);
 expect(actionDraftChanged('','','','',[],[])).toBe(false);
});
it('protects typed text, owner, due date and changes to the source-photo scope',()=>{
 for(const [title,owner,due,selected] of [['변경한 조치','','',['a']],['원래 제안','담당자','',['a']],['원래 제안','','2026-10-30',['a']],['원래 제안','','',[]],['원래 제안','','',['b']],['원래 제안','','',['a','b']]] as [string,string,string,string[]][]){expect(actionDraftChanged('원래 제안',title,owner,due,selected,['a'])).toBe(true);}
 expect(actionDraftChanged('원래 제안','원래 제안','','',['b','a'],['a','b'])).toBe(false);
});

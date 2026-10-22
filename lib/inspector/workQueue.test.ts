import {describe,it,expect} from 'vitest';
import {actionQueue,koreanDay,overdueAction,photoQueue} from './workQueue';
import {newInspectionDocument,type InspectorAction,type VisionImport} from './types';

const action=(id:string,status:InspectorAction['status']='open',dueDate='2026-10-23'):InspectorAction=>({id,title:`${id} 개구부 보강`,owner:id==='a'?'형틀반장':'비계반장',status,dueDate,completionPhotoId:'',note:''});
describe('inspection work queue boundaries',()=>{
    it('uses the Korean calendar across the UTC day boundary',()=>{expect(koreanDay(new Date('2026-10-22T15:00:00Z'))).toBe('2026-10-23');});
    it('keeps due today, invalid dates and verified work out of overdue',()=>{
        expect(overdueAction(action('a','open','2026-10-22'),'2026-10-23')).toBe(true);
        expect(overdueAction(action('a','review-requested','2026-10-22'),'2026-10-23')).toBe(true);
        for(const a of [action('a'),action('a','verified','2026-10-21'),action('a','open','2026-02-30'),action('a','open','unknown')])expect(overdueAction(a,'2026-10-23')).toBe(false);
    });
    it('does not turn improvement evidence or manual photos into missing AI work',()=>{
        const doc=newInspectionDocument();doc.photoIds=['pending','manual','after','accepted','rejected'];doc.analyses.pending={} as VisionImport;
        doc.reviews.accepted={decision:'accepted',note:''};doc.reviews.rejected={decision:'rejected',note:'현장 의견'};
        doc.actions=[{...action('a'),completionPhotoId:'after'}];
        const before=JSON.stringify(doc);
        expect(photoQueue(doc).map(p=>p.kind)).toEqual(['pending','manual','improvement','reviewed','expert']);expect(JSON.stringify(doc)).toBe(before);
        doc.analyses.after={} as VisionImport;expect(photoQueue(doc)[2].kind).toBe('pending');
    });
    it('filters title/owner and preserves original order and objects',()=>{
        const actions=[action('a'),action('b','review-requested','2026-10-21'),action('c','verified','2026-10-20')];
        expect(actionQueue(actions,'overdue',' 비계 ','2026-10-23').map(a=>a.id)).toEqual(['b']);
        expect(actionQueue(actions,'verified','','2026-10-23').map(a=>a.id)).toEqual(['c']);
        expect(actionQueue(actions,'all','','2026-10-23','due').map(a=>a.id)).toEqual(['b','a','c']);expect(actions.map(a=>a.id)).toEqual(['a','b','c']);
    });
});

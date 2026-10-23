import {describe,it,expect} from 'vitest';
import {actionCsvCell,buildActionRegisterCsv} from '../lib/inspector/actionRegister';
import {newInspectionDocument,type Inspection,type InspectorAction,type VisionImport} from '../lib/inspector/types';

const fixture=():Inspection=>({id:'synthetic-inspection',revision:9,created_at:'',updated_at:'',document:newInspectionDocument()});
const action=(id:string):InspectorAction=>({id,title:'개구부 보강',owner:'형틀반장',dueDate:'2026-10-24',status:'open',completionPhotoId:'',note:'',sourcePhotoIds:['a']});
function parse(csv:string):string[][]{
    const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
    for(let i=1;i<csv.length;i++){
        const c=csv[i];
        if(c==='"'){if(quoted&&csv[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
        else if(!quoted&&c===','){row.push(cell);cell='';}
        else if(!quoted&&c==='\r'&&csv[i+1]==='\n'){row.push(cell);rows.push(row);row=[];cell='';i++;}
        else cell+=c;
    }
    return rows;
}
describe('saved action register export',()=>{
    it('exports every registered action and stored version without modifying source or leaking AI proposals',()=>{
        const item=fixture(),d=item.document;d.title='합성 현장';d.photoIds=['a','b'];
        d.actions=Array.from({length:30},(_,i)=>({...action(String(i)),title:`등록 조치 ${i+1}`}));
        d.analyses.a={recommended_controls:[{action:'UNREVIEWED AI'}]} as VisionImport;
        const before=JSON.stringify(item),csv=buildActionRegisterCsv(item),rows=parse(csv);
        expect(rows).toHaveLength(31);expect(rows[30][9]).toBe('등록 조치 30');expect(rows[1].slice(0,3)).toEqual([item.id,'9','합성 현장']);
        expect(csv).not.toContain('UNREVIEWED AI');expect(csv).not.toContain('https:');expect(JSON.stringify(item)).toBe(before);
    });
    it('preserves Korean, commas, quotes and multiline notes as a single cell with BOM and CRLF',()=>{
        const item=fixture();item.document.actions=[{...action('one'),title:'철근, "단부" 보강',note:'1층 확인\r\n2층 보완\n담당자 전달'}];
        const csv=buildActionRegisterCsv(item),rows=parse(csv);expect(csv.charCodeAt(0)).toBe(0xfeff);expect(csv.endsWith('\r\n')).toBe(true);
        expect(rows).toHaveLength(2);expect(rows[0]).toHaveLength(18);expect(rows[1]).toHaveLength(18);
        expect(rows[1][9]).toBe(item.document.actions[0].title);expect(rows[1][16]).toBe(item.document.actions[0].note);
    });
    it('neutralizes spreadsheet formulas including whitespace/control prefixes in every free text cell',()=>{
        for(const text of ['=HYPERLINK("https://invalid")','+1','-2','@SUM(A1)',' \t=1','\u0000=1','\uFEFF=1','\ttext','\rtext','\ntext'])expect(actionCsvCell(text).startsWith('"\'')).toBe(true);
        const item=fixture();item.document.title=' =1';item.document.actions=[{...action('one'),owner:'@owner',note:'=danger'}];
        const row=parse(buildActionRegisterCsv(item))[1];expect(row[2]).toBe("' =1");expect(row[10]).toBe("'@owner");expect(row[16]).toBe("'=danger");
    });
    it('keeps review requests distinct from verified field checks and exposes missing legacy evidence',()=>{
        const item=fixture();item.document.photoIds=['a','b'];item.document.actions=[
            {...action('one'),sourcePhotoIds:undefined},
            {...action('two'),status:'review-requested',completionPhotoId:'b',verifiedAt:'SHOULD NOT APPEAR'},
            {...action('three'),status:'verified',completionPhotoId:'b',verifiedAt:'2026-10-23T02:00:00Z'},
            {...action('four'),status:'verified',sourcePhotoIds:['missing'],completionPhotoId:'missing'},
        ];
        const rows=parse(buildActionRegisterCsv(item));expect(rows[1][13]).toContain('미지정');expect(rows[1][14]).toBe('미등록');
        expect(rows[2].slice(12,16)).toEqual(['완료 검토 요청','사진 1','사진 2','']);
        expect(rows[3][12]).toBe('현장 재점검 확인');expect(rows[3][15]).toBe('2026-10-23T02:00:00Z');
        expect(rows[4].slice(13,16)).toEqual(['사진 연결 확인 필요','사진 연결 확인 필요','기존 기록 · 확인시각 없음']);
    });
    it('returns only headers for an empty register rather than inventing a completed action',()=>{
        const rows=parse(buildActionRegisterCsv(fixture()));expect(rows).toHaveLength(1);expect(rows[0][9]).toBe('등록 조치');
    });
});

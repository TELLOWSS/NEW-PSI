import {describe,expect,it} from 'vitest';
import {inspectorVisionContentSchema,parseInspectorApiContent} from '../lib/inspector/visionContent';
const photo={id:'photo',sha256:'a'.repeat(64)},content={risk_findings:[],observed_facts:[],ai_hypotheses:[],requires_confirmation:[],recommended_controls:[],law_candidate_keywords:[],limitations:['사진 밖은 확인 불가']};
describe('content-only structured provider contract',()=>{
 it('keeps every object closed, every property required, and every enum explicitly typed',()=>{
    const visit=(schema:any)=>{if(schema.type==='object'){expect(schema.additionalProperties).toBe(false);expect(schema.required).toEqual(Object.keys(schema.properties));Object.values(schema.properties).forEach(visit);}if(schema.type==='array'){expect(schema.maxItems).toBeGreaterThan(0);visit(schema.items);}if(schema.enum)expect(schema.type).toBe('string');expect(schema).not.toHaveProperty('const');expect(schema).not.toHaveProperty('minLength');};
    visit(inspectorVisionContentSchema);
 });
 it('binds the trusted inspection, asset and processing mode without asking the model to reproduce them',()=>{const result=parseInspectorApiContent(JSON.stringify(content),'inspection',photo);expect(result).toMatchObject({inspection_id:'inspection',photo_id:'photo',source_photo_sha256:photo.sha256,processing_mode:'PAID_API_APPROVED',schema_version:'1.1'});});
 it.each([
    {...content,limitations:null},
    {...content,law_candidate_keywords:[] ,limitations:['']},
    {...content,fine:5_000_000},
    {...content,inspection_id:'foreign-inspection'},
    {...content,limitations:Array(4).fill('too many')},
    {...content,recommended_controls:[{action:'조치',priority:'urgent'}]},
 ])('rejects malformed/extra/over-limit fields rather than repairing or dropping them',value=>{expect(()=>parseInspectorApiContent(JSON.stringify(value),'inspection',photo)).toThrow();});
 it('rejects findings without their stated observation and accepts a valid linked interpretation',()=>{const finding={observation_index:'0',problem:'통로에 자재',risk:'걸려 넘어질 가능성',action:'통로 확보',priority:'soon'};expect(()=>parseInspectorApiContent(JSON.stringify({...content,risk_findings:[finding]}),'inspection',photo)).toThrow('관찰 근거');const result=parseInspectorApiContent(JSON.stringify({...content,observed_facts:[{text:'통로 자재',visual_basis:'오른쪽',confidence:'high'}],risk_findings:[finding]}),'inspection',photo);expect(result.risk_findings?.[0].risk).toContain('넘어질');});
 it('rejects prototype-named fields as extra model output',()=>{const value=JSON.stringify(content).replace(/}$/,',"constructor":"forged"}');expect(()=>parseInspectorApiContent(value,'inspection',photo)).toThrow();});
});

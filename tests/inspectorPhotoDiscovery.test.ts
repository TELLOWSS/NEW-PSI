import {describe,it,expect} from 'vitest';
import {findingLegalTopic} from '../lib/inspector/photoDiscovery';
import {legalForText} from '../lib/inspector/legal';
import {buildInspectorApiPrompt,buildInspectorPrompt} from '../lib/inspector/prompt';
import {parseVisionImport} from '../lib/inspector/validation';
import {newInspectionDocument,type VisionImport} from '../lib/inspector/types';

const analysis=():VisionImport=>({schema_version:'1.1',inspection_id:'inspection',photo_id:'photo',source_photo_sha256:'a'.repeat(64),processing_mode:'CHATGPT_MANUAL',observed_facts:[{text:'전선 피복의 벌어진 부분이 보임',visual_basis:'오른쪽 아래',confidence:'low'},{text:'검은 얼룩이 보임',visual_basis:'왼쪽',confidence:'medium'}],risk_findings:[{observation_index:'0',problem:'전선 피복 상태 확인 필요',risk:'접촉 가능성',action:'담당자에게 확인 요청',priority:'soon'},{observation_index:'1',problem:'얼룩의 성상 미확인',risk:'상태 확인 필요',action:'안전한 위치에서 대조',priority:'routine'}],ai_hypotheses:[],requires_confirmation:[],recommended_controls:[],law_candidate_keywords:[],limitations:[]});
describe('photo-first discovery boundaries',()=>{
    it('maps each finding from its own linked observation without inheriting an unrelated topic',()=>{
        const a=analysis(),r=legalForText('개구부 덮개 난간 미설치 전선'),before=JSON.stringify(a);
        expect(r.cards[0].id).toBe('opening');expect(findingLegalTopic(a,r,0)).toBe('electric');expect(findingLegalTopic(a,r,1)).toBe('');expect(JSON.stringify(a)).toBe(before);
    });
    it('does not manufacture a legal match for missing findings or missing observations, while resolving outside prior candidates',()=>{
        const a=analysis();expect(findingLegalTopic(a,legalForText('개구부'),0)).toBe('electric');expect(findingLegalTopic({...a,risk_findings:[]},legalForText('전선'),0)).toBe('');a.risk_findings![0].observation_index='5';expect(findingLegalTopic(a,legalForText('전선'),0)).toBe('');
    });
    it('supports empty hints without inserting a guessed problem and keeps manual imports compatible',()=>{
        const doc=newInspectionDocument(),before=JSON.stringify(doc),photo={id:'photo',sha256:'a'.repeat(64),inspection_id:'inspection',mime_type:'image/jpeg',byte_size:1,created_at:'2026-10-23T00:00:00Z'};
        const api=buildInspectorApiPrompt(doc,photo.id),manual=buildInspectorPrompt('inspection',photo,doc);
        expect(JSON.parse(api.split('\n').find(line=>line.startsWith('{"inspector_notes"'))!).photo_notes).toBe('');
        for(const prompt of [api,manual]){expect(prompt).toContain('설명이 없어도 사진 자체에서');expect(prompt).toContain('안전하거나 문제가 없다고 결론 내리지');expect(prompt).toContain('추가 정보 한 가지만');expect(prompt).toContain('확정 사실이 아닙니다');}
        const example=JSON.parse(manual.split('\n').find(line=>line.startsWith('{"schema_version"'))!);expect(parseVisionImport(example,'inspection',photo).risk_findings).toEqual([]);expect(JSON.stringify(doc)).toBe(before);
    });
});

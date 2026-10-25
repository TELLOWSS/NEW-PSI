import {describe,it,expect} from 'vitest';
import type {Evidence,InspectorAction,InspectionDocument} from '../lib/inspector/types';
import {newInspectionDocument} from '../lib/inspector/types';
import {auditActionPhotoPair} from '../lib/inspector/actionEvidenceAudit';
import {buildNextCycleHandoffDraft} from '../lib/inspector/educationHandoff';
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const evidence=(n:number,sha:string):Evidence=>({id:id(n),inspection_id:id(50),sha256:sha,mime_type:'image/jpeg',byte_size:100,created_at:'2026-10-24T00:00:00Z'});
const a=(status:InspectorAction['status'],dueDate='2026-10-24'):InspectorAction=>({
  id:id(30),title:'발판 이격 및 개구부 방호 확인',owner:'형틀담당',dueDate,status,
  sourcePhotoIds:[id(1)],completionPhotoId:status==='open'?'':id(2),note:'현장 안전시설 고정 및 접근통제 점검',
  ...(status==='verified'?{verifiedAt:'2026-10-25T01:00:00Z'}:{}),
});
const files=[evidence(1,'a'.repeat(64)),evidence(2,'b'.repeat(64))];
const args={beforeIds:[id(1)],afterId:id(2),registeredIds:[id(1),id(2)],evidence:files};
describe('saved inspection photo pairing is not an automatic safety approval',()=>{
  it('accepts distinct registered photo hashes but requires human scope review',()=>{
    expect(auditActionPhotoPair(args)).toMatchObject({code:'linked',canSubmit:true});
    expect(auditActionPhotoPair(args).description).toContain('현장 대조');
  });
  it('fails closed for missing source, absent after, same ID and duplicate byte hashes',()=>{
    expect(auditActionPhotoPair({...args,beforeIds:[]})).toMatchObject({code:'missing-before',canSubmit:false});
    expect(auditActionPhotoPair({...args,afterId:''})).toMatchObject({code:'missing-after',canSubmit:false});
    expect(auditActionPhotoPair({...args,afterId:id(1)})).toMatchObject({code:'same-evidence',canSubmit:false});
    expect(auditActionPhotoPair({...args,evidence:[files[0],{...files[1],sha256:files[0].sha256}]})).toMatchObject({code:'same-evidence',canSubmit:false});
    expect(auditActionPhotoPair({...args,evidence:[files[0]]})).toMatchObject({code:'missing-file',canSubmit:false});
    expect(auditActionPhotoPair({...args,registeredIds:[id(2)]})).toMatchObject({code:'missing-file',canSubmit:false});
  });
  it('permits a distinct optimized unsaved photo as a submission candidate, not verified evidence',()=>{
    expect(auditActionPhotoPair({...args,afterId:id(3),preparedSha:'c'.repeat(64)}))
      .toMatchObject({code:'prepared',canSubmit:true});
    expect(auditActionPhotoPair({...args,afterId:id(3),preparedSha:files[0].sha256}))
      .toMatchObject({code:'same-evidence',canSubmit:false});
  });
});
describe('manual education and next assessment handoff',()=>{
    const make=(actions:InspectorAction[]):InspectionDocument=>({...newInspectionDocument(),title:'가상 현장 위험성평가',workType:'형틀',actions});
    it('keeps open and overdue items prominent and never claims dispatch or education completion',()=>{
        const text=buildNextCycleHandoffDraft(make([a('verified','2026-09-01'),a('open'),a('review-requested','2026-10-30')]),'2026-10-25');
        expect(text.indexOf('기한 경과 · 미결')).toBeLessThan(text.indexOf('현장 재점검 확인 기록'));
        expect(text).toContain('자동 전송하지 않습니다');
        expect(text).toContain('별도 SMART TBM 프로그램');
        expect(text).toContain('신원은 이 기록으로 증명되지 않음');
        expect(text).toContain('개선사진 접수 · 재점검 대기');
    });
    it('does not invent risk-free claims or worker competency if no actions exist',()=>{
        const text=buildNextCycleHandoffDraft(make([]),'2026-10-25');
        expect(text).toContain('없음을 의미하지 않습니다');
        expect(text).not.toContain('모두 완료');
    });
    it('limits large drafts to twelve records and discloses exclusions',()=>{
        const actions=Array.from({length:15},(_,i)=>({...a('open'),id:id(40+i),title:'조치 내용 '+i}));
        const text=buildNextCycleHandoffDraft(make(actions),'2026-10-25');
        expect(text).toContain('초안 포함 12건');
        expect(text).toContain('나머지 3건');
    });
});

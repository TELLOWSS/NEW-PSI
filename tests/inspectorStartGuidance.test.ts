import {describe,expect,it} from 'vitest';
import {inspectionStartGuidance,inspectionErrorMessage} from '../lib/inspector/inspectionGuidance';
const ready={hasPhoto:true,consent:true,automatic:true,ready:true,allowed:true};
describe('one next step for first-time inspectors',()=>{
 it('asks for a photo before requiring consent or technical status',()=>{expect(inspectionStartGuidance({...ready,hasPhoto:false,consent:false,ready:null})).toContain('사진을 먼저');});
 it('explains a disabled consent button',()=>{expect(inspectionStartGuidance({...ready,consent:false})).toContain('보관 허용을 체크');});
 it('offers manual work while status checking is pending',()=>{expect(inspectionStartGuidance({...ready,ready:null})).toContain('직접 점검');});
 it('can save in manual mode even if status checking is still pending',()=>{const text=inspectionStartGuidance({...ready,automatic:false,ready:null,allowed:false});expect(text).toContain('사진과 설명을 저장');expect(text).not.toContain('기다리');});
 it('explains blocked automatic mode without asking the user to change settings',()=>{expect(inspectionStartGuidance({...ready,allowed:false})).toContain('직접 점검');});
 it('does not describe a manual result as a photo analysis',()=>{expect(inspectionStartGuidance({...ready,automatic:false})).toContain('자동 판독한 결과는 만들지 않습니다');});
});
describe('safe work-area errors',()=>{
 it('keeps useful Korean validation and removes the HTTP prefix',()=>{expect(inspectionErrorMessage(new Error('409 - 저장된 사진 설명이 변경됐습니다.'))).toBe('저장된 사진 설명이 변경됐습니다.');});
 it.each(['503 - <html>서버 오류</html>','JSON 파싱 실패','401 - key rejected','API key 인증 실패: private-token','서버 응답 https://private.invalid/key'])('does not display raw server diagnostics: %s',message=>{const result=inspectionErrorMessage(new Error(message));expect(result).not.toContain(message);expect(result).toContain('입력은 유지');});
});

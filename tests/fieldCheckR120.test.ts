import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {fieldCheckInputError,makeFieldCheck,effectiveFieldCheckDate,latestFieldCheck,fieldCheckLabels} from '../lib/inspector/fieldCheck';
import {actionAttentionBoard} from '../lib/inspector/actionAttention';
import {projectGlobalActionRows,globalActionDimensions,buildGlobalActionRegisterCsv} from '../lib/inspector/globalActionRegister';
import {newInspectionDocument,type InspectorAction,type Inspection,type InspectorFieldCheck} from '../lib/inspector/types';
import {validateDocument,assertSafeEdit} from '../lib/inspector/validation';
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const plan='즉시 조치 곤란(미조치 유지): 자재 수급 지연\n임시 보호조치 계획(시행 미확인): 출입통제 검토\n다음 현장 확인 예정: 2026-11-06';
const base:InspectorAction={id:id(1),title:'합성 발판 이격 관리',owner:'합성 형틀반장',dueDate:'2026-11-08',status:'open',completionPhotoId:'',note:'',scheduleContext:plan};
const now=new Date('2026-11-06T03:00:00.000Z');
const check=(result:InspectorFieldCheck['result']='not-implemented',nextCheckDate='2026-11-07')=>
 makeFieldCheck({id:id(2),result,note:'점검자가 해당 구역 임시 방호 상태를 직접 확인한 결과를 기록',nextCheckDate},now);
const doc=(actions:InspectorAction[])=>({...newInspectionDocument(),actions,eventAt:'2026-11-06T00:00:00.000Z'});
describe('R120 human-only follow-up journal, not automated final verification',()=>{
 it('requires verified human input and future follow-up if interim protection absent or unknown',()=>{
  const common={result:'not-implemented',note:'현장에 임시 출입통제 설비가 마련되지 않았음을 확인',nextCheckDate:'2026-11-07'};
  expect(fieldCheckInputError(common,'2026-11-06')).toBe('');
  expect(fieldCheckInputError({...common,nextCheckDate:''},'2026-11-06')).toContain('필수');
  expect(fieldCheckInputError({...common,nextCheckDate:'2026-11-05'},'2026-11-06')).toContain('과거');
  expect(fieldCheckInputError({...common,nextCheckDate:'2026-02-30'},'2026-11-06')).toContain('올바르지');
  expect(fieldCheckInputError({...common,note:'단문'},'2026-11-06')).toContain('10~600');
  expect(fieldCheckInputError({...common,result:'unknown'},'2026-11-06')).toBe('');
  expect(fieldCheckInputError({...common,result:'implemented',nextCheckDate:''},'2026-11-06')).toBe('');
  expect(fieldCheckInputError({...common,result:'verified'},'2026-11-06')).toContain('선택');
 });
 it('retains original plan but updates only the next field visit without advancing completion',()=>{
  const old=structuredClone(base),entry=check(),action={...base,fieldChecks:[entry]};
  expect(latestFieldCheck(action)).toEqual(entry);
  expect(effectiveFieldCheckDate(old)).toBe('2026-11-06');
  expect(effectiveFieldCheckDate(action)).toBe('2026-11-07');
  expect(effectiveFieldCheckDate({...base,fieldChecks:[check('implemented','')]})).toBe('');
  expect(action.status).toBe('open');
  expect(action.scheduleContext).toBe(plan);
  expect(JSON.stringify(old)).toBe(JSON.stringify(base));
  expect(fieldCheckLabels[entry.result]).toContain('미시행');
 });
 it('attention and global register use follow-up date, never double-count original visit',()=>{
  const saved={...base,fieldChecks:[check()]};
  const board=actionAttentionBoard([saved],'2026-11-06');
  expect(board.groups.check).toHaveLength(0);
  expect(actionAttentionBoard([saved],'2026-11-07').groups.check).toHaveLength(1);
  const item:Inspection={id:id(9),revision:2,created_at:now.toISOString(),updated_at:now.toISOString(),document:doc([saved])};
  const rows=projectGlobalActionRows([item]),dim=globalActionDimensions(rows[0],'2026-11-06');
  expect(dim.nextCheckDate).toBe('2026-11-07');
  expect(dim.check).toBe(false);
  expect(rows[0].lastFieldCheck).toEqual(saved.fieldChecks![0]);
  expect(buildGlobalActionRegisterCsv(rows,'2026-11-06')).toContain('최근 현장 확인 결과');
 });
 it('original field checks survive validation and generic saves cannot forge or rewrite them',()=>{
  const entry=check(),original=doc([{...base,fieldChecks:[entry]}]);
  expect(validateDocument(original,id(9),[]).actions[0].status).toBe('open');
  expect(()=>assertSafeEdit({...original,actions:[{...base,fieldChecks:[check('implemented','')]}]},original)).toThrow('전용 확인');
  expect(()=>assertSafeEdit({...original,actions:[{...base,fieldChecks:[]}]},original)).toThrow('전용 확인');
  expect(()=>assertSafeEdit(doc([{...base,fieldChecks:[entry]}]),doc([base]))).toThrow('전용 확인');
  expect(()=>validateDocument(doc([{...base,fieldChecks:[{...entry,recordedAt:'not-a-date'}]}]),id(9),[])).toThrow('현장 확인');
  expect(()=>validateDocument(doc([{...base,fieldChecks:Array.from({length:13},(_,i)=>({...entry,id:id(20+i)}))}]),id(9),[])).toThrow('12건');
 });
 it('server uses dedicated authorization, immutable UUID and server time, no AI or automated verification',()=>{
  const server=readFileSync(new URL('../lib/server/admin/inspector.ts',import.meta.url),'utf8');
  expect(server).toContain("if(body.op==='field-check')");
  expect(server).toContain('isValidAdminAuthRequest(req)');
  expect(server).toContain("body.expectedRevision!==current.revision");
  expect(server).toContain('makeFieldCheck(input)');
  expect(server).toContain('action.fieldChecks=[...(action.fieldChecks||[])');
  expect(server).toContain("action.status==='verified'");
  expect(server).toContain('replayed:true');
 });
});

import {describe,it,expect} from 'vitest';
import {classifyLocalRestoreError,verifyLocalRestoreReadback} from '../lib/inspector/localRestoreRecovery.mjs';

describe('F08 local restore failure recovery remains read-only',()=>{
 it('classifies browser failures without exposing internal error text',()=>{
  const syntheticSecret='secret path /private/inspection.jpg';
  for(const [name,kind,text] of [
   ['ConstraintError','duplicate','동일한 점검 ID'],
   ['QuotaExceededError','capacity','저장공간'],
   ['AbortError','interrupted','트랜잭션'],
   ['InvalidStateError','unavailable','브라우저 저장소'],
   ['NotFoundError','unavailable','저장소'],
   ['SecurityError','blocked','보안'],
  ]) {
   const error=new DOMException(syntheticSecret,name);
   const result=classifyLocalRestoreError(error);
   expect(result.kind).toBe(kind);
   expect(result.message).toContain(text);
   expect(result.message).not.toContain(syntheticSecret);
   expect(result.message).toContain('백업');
  }
 });
 it('fails closed for unknown, tampered or missing error types',()=>{
  for(const error of [null,undefined,'failure',{name:'OtherError',message:'TOKEN=secret'},{name:44,message:'secret'}]){
   const result=classifyLocalRestoreError(error);
   expect(result).toMatchObject({kind:'unknown',mayRetry:false});
   expect(result.message).not.toMatch(/TOKEN|secret/);
  }
 });
 it('readback checks ID and primary photo metadata, without asserting photo authenticity',()=>{
  const original={
   id:'synthetic-id',sha256:'a'.repeat(64),
   photo:{size:12345,type:'image/png',name:'synthetic.png'},
  };
  expect(verifyLocalRestoreReadback(original,{...original,photo:{...original.photo}})).toBe(true);
  for(const change of [
   {...original,id:'another-record'},
   {...original,sha256:'b'.repeat(64)},
   {...original,photo:{...original.photo,size:12344}},
   {...original,photo:{...original.photo,type:'image/jpeg'}},
   {...original,photo:{...original.photo,name:'replaced.png'}},
   {...original,photo:undefined},
   undefined,null,
  ])expect(verifyLocalRestoreReadback(original,change)).toBe(false);
 });
 it('no storage mutation, automatic reimport or deletion is performed by the classifier',()=>{
  const before=Object.freeze({name:'QuotaExceededError',message:'private original'});
  const first=classifyLocalRestoreError(before);
  const second=classifyLocalRestoreError(before);
  expect(first).toEqual(second);
  expect(before.name).toBe('QuotaExceededError');
  expect(first).toMatchObject({mayRetry:true});
  expect(first.message).toContain('기존 기록을 삭제하지 말고');
 });
});

import {describe,expect,it} from 'vitest';
import {noviceStep,photoProgressStage} from '../lib/inspector/noviceExperience';

describe('novice photo guidance is display-only',()=>{
 it('starts with the photo, without pretending the photo has been analyzed',()=>{
  expect(noviceStep({hasPhoto:false,hasResult:false,reviewSaved:false,hasReport:false})).toBe(0);
  expect(noviceStep({hasPhoto:true,hasResult:false,reviewSaved:false,hasReport:false})).toBe(1);
 });
 it('does not mistake an AI result for a saved human review',()=>{
  expect(noviceStep({hasPhoto:true,hasResult:true,reviewSaved:false,hasReport:false})).toBe(2);
  expect(noviceStep({hasPhoto:true,hasResult:true,reviewSaved:true,hasReport:false})).toBe(3);
 });
 it('uses real activity text and avoids invented percentages for unrelated tasks',()=>{
  expect(photoProgressStage('기기에서 사진 최적화 중')).toBe(0);
  expect(photoProgressStage('최적화 사본 보관 중')).toBe(0);
  expect(photoProgressStage('사진 분석 중 · 법령과 조치 함께 준비')).toBe(2);
  expect(photoProgressStage('사진·전문가 의견·근거를 보고서에 저장 중')).toBeNull();
 });
});

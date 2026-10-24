import {describe,expect,it} from 'vitest';
import {replyKindGuide,replyMissing,reinspectionStage,reportPrintState} from '../lib/inspector/noviceFollowThrough';

describe('inspection follow-through for first-time users',()=>{
 it('explains all three replies while never treating photos as field approval',()=>{
  expect(replyKindGuide('photo')).toMatchObject({requiresPhoto:true});
  expect(replyKindGuide('photo').help).toContain('완료 승인');
  expect(replyKindGuide('planned')).toMatchObject({requiresPhoto:false});
  expect(replyKindGuide('difficult')).toMatchObject({requiresPhoto:false});
 });
 it('explains the missing step rather than leaving a disabled submit unexplained',()=>{
  expect(replyMissing({kind:'photo',name:'',note:'',consent:false,photo:false})).toHaveLength(4);
  expect(replyMissing({kind:'planned',name:'기계팀',note:'화요일에 조치',consent:true,photo:false})).toEqual([]);
  expect(replyMissing({kind:'photo',name:'형틀팀',note:'개선 작업을 마쳤습니다',consent:true,photo:false})).toContain('개선한 모습이 보이는 사진 첨부');
 });
 it('distinguishes improvement request from verified completion',()=>{
  expect(reinspectionStage({status:'open'})).toBe(0);
  expect(reinspectionStage({status:'review-requested'})).toBe(1);
  expect(reinspectionStage({status:'verified'})).toBe(2);
 });
 it('blocks printing while any report image is loading, and flags missing photos',()=>{
  expect(reportPrintState(2,['ready'])).toBe('loading');
  expect(reportPrintState(2,['ready','loading'])).toBe('loading');
  expect(reportPrintState(2,['ready','failed'])).toBe('failed');
  expect(reportPrintState(2,['ready','ready'])).toBe('ready');
  expect(reportPrintState(0,[])).toBe('loading');
 });
});

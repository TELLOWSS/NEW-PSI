import {describe,expect,it} from 'vitest';
import {
 addSequenceClaim,checkSequence,checkControlCoverage,createSequence,WIRE_EXAMPLE,
 type SequenceClaim,type CorrectiveCoverage
} from '../components/hq/accidentSequenceModel';

const incidentId=144;
function claim(id:string,phase:SequenceClaim['phase'],order:number,action:SequenceClaim['action'],
 source:SequenceClaim['source'],sourceRef:string):SequenceClaim{
 return {id,incidentId,phase,order,action,source,sourceRef,description:'작업 당시 동작과 이동경로 관련 시연 진술',confidence:'needs_confirmation'};
}

describe('HQ accident chronology source matching and prevention control',()=>{
 it('keeps each claim in a single incident, requires source references, rejects duplicate IDs',()=>{
  const empty=createSequence(incidentId);
  expect(()=>addSequenceClaim(empty,{...claim('A','during',1,'moving','report','DOC-001'),incidentId:999})).toThrow('다른 사고');
  expect(()=>addSequenceClaim(empty,claim('A','during',1,'moving','report','x'))).toThrow('참조번호');
  const one=addSequenceClaim(empty,claim('A','during',1,'moving','report','DOC-001'));
  expect(()=>addSequenceClaim(one,claim('A','during',2,'falling','photo','PIC-001'))).toThrow('중복');
  expect(empty.claims).toHaveLength(0);
 });
 it('finds a disputed action at the SAME phase+order, not by guessing cause from different stages',()=>{
  let draft=createSequence(incidentId);
  draft=addSequenceClaim(draft,claim('A','during',2,'standing','report','REP-001'));
  draft=addSequenceClaim(draft,claim('B','during',2,'moving','statement','STMT-001'));
  draft=addSequenceClaim(draft,claim('C','after',1,'falling','photo','PHOTO-001'));
  const issues=checkSequence(draft);
  const actionIssue=issues.find(i=>i.code==='DIFFERENT_ACTION');
  expect(actionIssue?.claimIds).toEqual(['A','B']);
  expect(issues.filter(i=>i.code==='MISSING_PHASE')).toHaveLength(1);
  expect(issues.filter(i=>i.code==='MISSING_SOURCE').length).toBeGreaterThan(0);
  expect(WIRE_EXAMPLE.reported).toContain('일어나');
  expect(WIRE_EXAMPLE.alternative).toContain('이동 중');
 });
 it('does not treat adjacent timing descriptions as automatically contradictory',()=>{
  let draft=createSequence(incidentId);
  draft=addSequenceClaim(draft,claim('A','before',1,'standing','report','REP-001'));
  draft=addSequenceClaim(draft,claim('B','during',1,'moving','statement','STAT-001'));
  draft=addSequenceClaim(draft,claim('C','after',1,'falling','photo','PIC-001'));
  expect(checkSequence(draft).some(i=>i.code==='DIFFERENT_ACTION')).toBe(false);
 });
 it('flags education-only controls and requires explicit hazard and source references',()=>{
  const education:CorrectiveCoverage={category:'education',issue:'작업자가 주변 걸림 요소를 인지하지 못함',measure:'일어나기 전 이동통로 주변 장애물 확인 교육',reference:'EDU-01'};
  expect(checkControlCoverage('바닥 와이어에 걸려 이동 중 균형을 잃을 위험',[education]).join(' ')).toContain('기술적');
  const actions:CorrectiveCoverage[]=[education,
   {category:'engineering',issue:'와이어가 데크 돌출부에 걸려있음',measure:'와이어 고정 및 걸림 위험 요소 제거',reference:'ENG-01'},
   {category:'management',issue:'통로 작업 전 정리상태 확인 미흡',measure:'시작 전 순회점검과 출입 통제',reference:'MGT-01'}];
  expect(checkControlCoverage('데크 작업 통로의 와이어 걸림 위험',actions)).toEqual([]);
  expect(checkControlCoverage('짧음',[]).length).toBeGreaterThan(0);
 });
});

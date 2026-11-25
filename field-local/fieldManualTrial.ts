/**
 * L40 P3 field manual test register. Decisions are user-supplied observations
 * on this page only. They are NOT verified device evidence or release approvals.
 * Never collect worker IDs, location, user agent, device IDs or photos.
 */
export const FIELD_TRIAL_CASES=[
 {id:'android-chrome',label:'Android Chrome 설치·재실행',instruction:'Chrome에서 홈 화면 추가 후 종료·재진입을 직접 확인'},
 {id:'samsung-internet',label:'삼성 인터넷 설치·재실행',instruction:'삼성 인터넷에서 실제 설치·홈화면 재진입을 직접 확인'},
 {id:'airplane-offline',label:'비행기 모드에서 다시 열기',instruction:'온라인 준비 후 통신 차단·앱 종료·재실행을 직접 확인'},
 {id:'photo-memo-recovery',label:'실사진·메모 저장과 복원',instruction:'사진 1장과 메모를 저장하고 앱 종료 후 원본과 내용을 다시 확인'},
 {id:'backup-recovery',label:'백업·복원/저장공간',instruction:'기기 저장 한계 안내와 백업 파일의 수동 복원을 직접 확인'},
 {id:'accessibility',label:'200% 확대·TalkBack·조작',instruction:'실제 확대와 스크린리더에서 메뉴·버튼·출력이 읽히는지 직접 확인'},
 {id:'field-resilience',label:'통신 음영·배터리·발열',instruction:'실제 현장 통신 음영과 충분한 시험시간 동안의 오류·발열·배터리를 별도 관찰'}
] as const;
export type FieldTrialId=typeof FIELD_TRIAL_CASES[number]['id'];
export type FieldTrialOutcome='not-run'|'observed'|'issue'|'blocked';
export type FieldTrialAnswers=Record<FieldTrialId,FieldTrialOutcome>;
export const FIELD_TRIAL_OUTCOMES=[
 {value:'not-run',label:'미실시'},
 {value:'observed',label:'직접 확인함(자기보고)'},
 {value:'issue',label:'문제 발견'},
 {value:'blocked',label:'시험 불가'}
] as const;
export const initialFieldTrialAnswers=():FieldTrialAnswers=>
 Object.fromEntries(FIELD_TRIAL_CASES.map(step=>[step.id,'not-run'])) as FieldTrialAnswers;
export type FieldTrialSummary={
 schema:'psi-field-manual-trial-v1';
 status:'SELF_REPORTED_UNVERIFIED';
 scope:'/field-local/';
 humanReleaseAuthorized:false;
 total:number;
 notRun:number;
 observed:number;
 issues:number;
 blocked:number;
 entries:Array<{id:FieldTrialId;label:string;outcome:FieldTrialOutcome}>;
};
const isOutcome=(v:unknown):v is FieldTrialOutcome=>
 v==='not-run'||v==='observed'||v==='issue'||v==='blocked';

export function buildFieldTrialSummary(input:Partial<Record<FieldTrialId,FieldTrialOutcome>>):FieldTrialSummary{
 const entries=FIELD_TRIAL_CASES.map(step=>({
  id:step.id,label:step.label,
  outcome:isOutcome(input[step.id])?input[step.id]!:'not-run' as FieldTrialOutcome
 }));
 return {
  schema:'psi-field-manual-trial-v1',
  status:'SELF_REPORTED_UNVERIFIED',
  scope:'/field-local/',
  humanReleaseAuthorized:false,
  total:entries.length,
  notRun:entries.filter(x=>x.outcome==='not-run').length,
  observed:entries.filter(x=>x.outcome==='observed').length,
  issues:entries.filter(x=>x.outcome==='issue').length,
  blocked:entries.filter(x=>x.outcome==='blocked').length,
  entries
 };
}
export function formatFieldTrialSummary(summary:FieldTrialSummary):string{
 const label=(value:FieldTrialOutcome)=>FIELD_TRIAL_OUTCOMES.find(o=>o.value===value)?.label||'미실시';
 return [
  'PSI 현장 기기 수동 검수 · 자기보고 (승인 증빙 아님)',
  '범위: '+summary.scope,
  '직접 확인(자기보고) '+summary.observed+' / 문제 '+summary.issues+' / 시험 불가 '+summary.blocked+' / 미실시 '+summary.notRun+' (총 '+summary.total+')',
  ...summary.entries.map(entry=>entry.label+': '+label(entry.outcome)),
  '브라우저 자동검증과 별개 · 담당자/기기/시험조건별 근거 및 독립 승인 필요',
  '실제 Android·서버 수신·현장 안전·출시 승인 아님 / RELEASE=BLOCKED',
  '사진·작업자 개인정보·장치 식별값 미포함 / 자동 전송 없음'
 ].join('\n');
}

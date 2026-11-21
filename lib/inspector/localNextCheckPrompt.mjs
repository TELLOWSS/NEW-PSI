/**
 * Living UI L09: one-screen next-confirmation guidance for saved local work.
 * Reuses the existing F10 queue and handoff selection; never reprioritizes by
 * inferred risk severity, changes status, contacts assignees or approves work.
 */
import {selectLocalHandoffTargets} from './localRecheckHandoff.mjs';
import {LOCAL_RECHECK_LABELS} from './localRecheckQueue.mjs';
import {FOLLOWUP_LABELS} from './localFollowup.mjs';

const steps={
 conflict:{
  headline:'완료 입력과 재점검 기록이 서로 다릅니다',
  action:'기록 충돌·현장 상태 재확인',
  guidance:'최신 재점검의 미완료 내용과 확인 완료 입력 시각을 대조하고, 현장 담당자에게 실제 조치·통제 상태를 직접 확인하세요.',
 },
 overdue:{
  headline:'예정일이 지난 조치가 있습니다',
  action:'지연 사유와 현장 통제 확인',
  guidance:'담당·지연 사유·현재 임시 통제 유지 여부를 확인하고 다음 재점검일을 기록하세요. 기한 초과는 자동으로 위험등급을 뜻하지 않습니다.',
 },
 today:{
  headline:'오늘 확인 예정인 조치가 있습니다',
  action:'오늘 현장 재점검 기록',
  guidance:'담당자와 조치 진행·임시 통제 상태를 대조한 후 재점검 결과를 남기세요. 등록만으로 담당자에게 통보되지 않습니다.',
 },
 soon:{
  headline:'3일 이내 확인 예정인 조치가 있습니다',
  action:'담당자·현장 확인 일정 점검',
  guidance:'담당자와 조치 기한 및 재점검 가능 일정을 확인하세요. 계획된 임시 보호조치가 실제 유지되는지는 별도 현장 확인이 필요합니다.',
 },
 unscheduled:{
  headline:'다음 확인 날짜가 미정인 조치가 있습니다',
  action:'조치 기한·재점검 일정 구분',
  guidance:'후속 조치 목표일과 재점검 예정일은 별개입니다. 미정 사유를 확인하고 현장 조건에 따라 다음 확인 일정을 기록하세요.',
 },
 scheduled:{
  headline:'추후 확인이 예정된 조치가 있습니다',
  action:'담당자·임시조치 기록 점검',
  guidance:'계획한 날짜까지 기다려도 되는 현장 상태인지 사람이 직접 판단해야 합니다. 급박한 위험은 기한에 관계없이 우선 조치하세요.',
 },
};

export function buildLocalNextCheckPrompt(queue){
 const records=Array.isArray(queue)?queue:[];
 const open=records.filter(item=>item?.bucket!=='verified');
 const recordedVerified=records.filter(item=>item?.bucket==='verified').length;
 const candidates=selectLocalHandoffTargets(records);
 const first=candidates[0]||open[0]||null;
 if(!first){
  return {
   target:null,headline:records.length?'확인 완료로 입력된 항목만 있습니다':'기록된 후속 조치 대상이 없습니다',
   action:'새 기록 또는 현장 상황 확인',
   guidance:'기기 기록만으로 현장에 위험이 없거나 모든 조치가 끝났다고 판단할 수 없습니다. 현재 작업구간과 실제 현장 상태를 별도로 확인하세요.',
   category:'조회 범위 확인',dateLabel:'확인 예정일 미기록',checklist:[],
   openCount:0,recordedVerified,
   isSafetyApproved:false,notified:false,
  };
 }
 const known=steps[first.bucket]||steps.scheduled;
 const date=typeof first.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(first.date)?first.date:'';
 const dateSource=first.dateSource==='재점검 예정일'?'재점검 예정일':'조치 목표일';
 const checklist=[
  ...(first.hasAssignee!==true?['담당자 지정 기록 확인 · 연락 여부 별도 확인']:[]),
  ...(first.hasTemporaryMeasure!==true?['임시 보호조치 기록 확인 · 실제 시행 여부 별도 확인']:[]),
  ...(!date?['다음 확인 날짜 확인']:[]),
 ];
 return {
  target:{
   recordId:typeof first.recordId==='string'?first.recordId:'',
   actionId:typeof first.actionId==='string'?first.actionId:'',
  },
  headline:known.headline,action:known.action,guidance:known.guidance,
  category:LOCAL_RECHECK_LABELS[first.bucket]||'기록 확인 필요',
  statusLabel:FOLLOWUP_LABELS[first.followupStatus]||'후속 상태 미기록',
  targetLabel:typeof first.label==='string'?first.label.slice(0,140):'조치 항목',
  dateLabel:date?dateSource+' '+date:dateSource+' 미정',
  checklist,openCount:open.length,recordedVerified,
  isSafetyApproved:false,notified:false,
 };
}

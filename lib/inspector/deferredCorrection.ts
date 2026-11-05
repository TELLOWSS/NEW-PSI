/**
 * Plan a delayed corrective action without changing its actual saved status.
 * No automatic approval, completed interim controls, or notification is inferred.
 * Uses the existing 300-character scheduleContext field (no schema migration).
 */
export type DeferredCorrectionInput={
 enabled:boolean;
 reason:string;
 temporaryPlan:string;
 nextCheckDate:string;
 today:string;
 dueDate:string;
 deadlineRationale:string;
};
const validDate=(date:string)=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
 const value=new Date(date+'T00:00:00.000Z');
 return Number.isFinite(value.getTime())&&value.toISOString().slice(0,10)===date;
};
export function deferredCorrectionContext(input:DeferredCorrectionInput):{ready:boolean;text:string;error:string}{
 const rationale=input.deadlineRationale.trim();
 if(!input.enabled)return {ready:rationale.length<=300,text:rationale,error:rationale.length>300?'현장 여건은 300자 이내로 작성해 주세요.':''};
 const reason=input.reason.trim(),plan=input.temporaryPlan.trim(),next=input.nextCheckDate;
 let error='';
 if(reason.length<5)error='즉시 조치가 어려운 이유를 5자 이상 적어 주세요.';
 else if(plan.length<5)error='임시 보호조치 계획을 5자 이상 적어 주세요. 실제 시행한 것으로 간주하지 않습니다.';
 else if(!validDate(next))error='다음 현장 확인 예정일을 선택해 주세요.';
 else if(validDate(input.today)&&next<input.today)error='다음 현장 확인일은 현재 날짜보다 이전일 수 없습니다.';
 else if(validDate(input.dueDate)&&next>input.dueDate)error='다음 현장 확인일은 약정 완료기한 이전 또는 같은 날짜로 정해 주세요.';
 const lines=[rationale,
  '즉시 조치 곤란(미조치 유지): '+reason,
  '임시 보호조치 계획(시행 미확인): '+plan,
  '다음 현장 확인 예정: '+next].filter(Boolean);
 const text=lines.join('\n');
 if(!error&&text.length>300)error='현장 여건과 미조치 관리 내용을 합쳐 300자를 넘었습니다. 내용을 짧게 정리해 주세요.';
 return {ready:!error,text,error};
}
export function deferredCheckDate(scheduleContext?:string):string{
 const match=scheduleContext?.match(/(?:^|\n)다음 현장 확인 예정: (\d{4}-\d{2}-\d{2})(?:$|\n)/);
 return match&&validDate(match[1])?match[1]:'';
}

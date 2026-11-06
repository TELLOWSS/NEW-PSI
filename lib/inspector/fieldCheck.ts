import type {InspectorAction,InspectorFieldCheck} from './types.js';
import {deferredCheckDate} from './deferredCorrection.js';
import {koreanDay} from './workQueue.js';

export const fieldCheckLabels:Record<InspectorFieldCheck['result'],string>={
 implemented:'임시 보호조치 시행 확인(점검자 기록)',
 'not-implemented':'임시 보호조치 미시행 확인(점검자 기록)',
 unknown:'임시 보호조치 이행 여부 확인 불가',
};
const validDay=(day:string)=>/^\d{4}-\d{2}-\d{2}$/.test(day)
 &&Number.isFinite(Date.parse(day+'T00:00:00Z'))
 &&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;

export function fieldCheckInputError(input:{result:string;note:string;nextCheckDate:string},today:string):string{
 if(!Object.hasOwn(fieldCheckLabels,input.result))return '현장 확인 결과를 선택해 주세요.';
 if(typeof input.note!=='string'||input.note.trim().length<10||input.note.length>600||input.note.includes('\u0000'))return '현장 확인 상황과 근거를 10~600자 이내로 작성해 주세요.';
 if(typeof input.nextCheckDate!=='string'||input.nextCheckDate.length>10)return '다음 현장 확인 날짜를 다시 선택해 주세요.';
 if(input.nextCheckDate&&!validDay(input.nextCheckDate))return '다음 현장 확인 날짜가 올바르지 않습니다.';
 if(input.result!=='implemented'&&!input.nextCheckDate)return '미시행·확인 불가 상태는 다음 현장 확인 예정일을 지정해 주세요.';
 if(input.nextCheckDate&&validDay(today)&&input.nextCheckDate<today)return '다음 현장 확인 날짜는 과거일 수 없습니다.';
 return '';
}
export function makeFieldCheck(input:{id:string;result:InspectorFieldCheck['result'];note:string;nextCheckDate:string},now=new Date()):InspectorFieldCheck{
 const error=fieldCheckInputError(input,koreanDay(now));
 if(error)throw new Error(error);
 return {id:input.id,recordedAt:now.toISOString(),result:input.result,note:input.note.trim(),nextCheckDate:input.nextCheckDate};
}
export function latestFieldCheck(action:Pick<InspectorAction,'fieldChecks'>):InspectorFieldCheck|undefined{
 return action.fieldChecks?.at(-1);
}
/** An explicitly recorded new visit replaces the old plan's next-check date for reminders,
 * but NEVER changes agreed dueDate, 'open' status, or the preserved original plan.
 */
export function effectiveFieldCheckDate(action:Pick<InspectorAction,'fieldChecks'|'scheduleContext'>):string{
 const latest=latestFieldCheck(action);
 return latest?latest.nextCheckDate:deferredCheckDate(action.scheduleContext);
}
export function fieldCheckDue(action:Pick<InspectorAction,'fieldChecks'|'scheduleContext'>,today:string):boolean{
 const date=effectiveFieldCheckDate(action);
 return !!date&&validDay(today)&&date<=today;
}

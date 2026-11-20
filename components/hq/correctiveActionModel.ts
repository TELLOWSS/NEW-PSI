/**
 * HQ-SAFE corrective action prototype — pure, session-only workflow.
 * No server persistence, authenticated reviewer, actual verification or work-resumption decision.
 */
export type ControlClass = 'engineering' | 'management' | 'education' | 'ppe';
export type ActionState = 'open' | 'interim_control' | 'evidence_submitted' | 'reinspection_requested' | 'revision_required';
export type ActionEventType = 'created' | 'interim_recorded' | 'implementation_submitted' | 'reinspection_requested' | 'revision_required';
export interface ActionEvent {
  id: string;
  actionId: string;
  type: ActionEventType;
  at: string;
  note: string;
}
export interface CorrectiveAction {
  id: string;
  incidentId: number;
  title: string;
  controlClass: ControlClass;
  ownerRole: '현장 담당자' | '현장 안전관리자' | '본사 안전담당자';
  dueOn: string;
  interimDescription: string;
  implementationEvidence: string;
  implementationNote: string;
  state: ActionState;
  events: readonly ActionEvent[];
}
export const ACTION_STATE_LABELS: Record<ActionState, string> = {
  open: '개선조치 예정',
  interim_control: '임시통제 내용 기록',
  evidence_submitted: '이행자료 제출',
  reinspection_requested: '재점검 요청 표시',
  revision_required: '보완 요청'
};
export const CONTROL_CLASS_LABELS: Record<ControlClass, string> = {
  engineering: '기술적 조치',
  management: '관리적 조치',
  education: '교육적 조치',
  ppe: '보호구 등 보조대책'
};

const validDate = (d: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d + 'T00:00:00.000Z').toISOString().startsWith(d);
const event = (actionId: string, type: ActionEventType, note: string, id: string, at: string): ActionEvent => {
  if (!id.trim() || !Number.isFinite(Date.parse(at))) throw new Error('이력 식별정보를 확인하세요.');
  return {id, actionId, type, at, note};
};
const update = (action: CorrectiveAction, state: ActionState, type: ActionEventType, note: string, eventId: string, at: string): CorrectiveAction => {
  if (action.events.some(x => x.id === eventId)) throw new Error('중복 이력입니다.');
  return {...action, state, events:[...action.events, event(action.id,type,note,eventId,at)]};
};
export const createCorrectiveAction = (
  args: Pick<CorrectiveAction,'id'|'incidentId'|'title'|'controlClass'|'ownerRole'|'dueOn'>,
  eventId: string,
  at: string
): CorrectiveAction => {
  const title=args.title.trim().slice(0,280);
  if (!args.id.trim() || !Number.isInteger(args.incidentId) || args.incidentId <= 0 || title.length < 8 || !validDate(args.dueOn)) {
    throw new Error('사고, 조치내용(8자 이상), 이행기한을 확인하세요.');
  }
  return {
    ...args,title,interimDescription:'',implementationEvidence:'',implementationNote:'',state:'open',
    events:[event(args.id,'created','조치계획 등록(시연)',eventId,at)]
  };
};
export const recordInterimControl = (action:CorrectiveAction, detail:string, eventId:string, at:string):CorrectiveAction => {
  if (!['open','interim_control','revision_required'].includes(action.state)) throw new Error('현재 상태에서는 임시통제 내용을 변경할 수 없습니다.');
  const value=detail.trim().slice(0,500);
  if (value.length<8) throw new Error('실제 확인이 필요한 임시통제 내용을 8자 이상 입력하세요.');
  return {...update(action,'interim_control','interim_recorded','임시통제 기록(실제 확인 아님)',eventId,at),interimDescription:value};
};
export const submitActionEvidence = (action:CorrectiveAction, ref:string, note:string, eventId:string, at:string):CorrectiveAction => {
  if (!['open','interim_control','revision_required'].includes(action.state)) throw new Error('먼저 보완/임시통제 상태를 확인하세요.');
  const evidence=ref.trim().slice(0,180), summary=note.trim().slice(0,500);
  if (evidence.length<4 || summary.length<8) throw new Error('이행자료 번호와 설명이 필요합니다.');
  return {...update(action,'evidence_submitted','implementation_submitted','이행자료 제출(시연)',eventId,at),implementationEvidence:evidence,implementationNote:summary};
};
export const requestActionReinspection = (action:CorrectiveAction,eventId:string,at:string):CorrectiveAction => {
  if (action.state !== 'evidence_submitted' || action.implementationEvidence.length < 4) {
    throw new Error('이행자료 제출 후 재점검을 요청할 수 있습니다.');
  }
  return update(action,'reinspection_requested','reinspection_requested','재점검 요청 표시(실제 통지 아님)',eventId,at);
};
export const requestActionRevision = (action:CorrectiveAction,reason:string,eventId:string,at:string):CorrectiveAction => {
  if (!['evidence_submitted','reinspection_requested'].includes(action.state)) throw new Error('자료 제출 또는 재점검 요청 단계에서만 보완할 수 있습니다.');
  const text=reason.trim().slice(0,300);
  if (text.length<4) throw new Error('보완 사유를 4자 이상 입력하세요.');
  return update(action,'revision_required','revision_required',text,eventId,at);
};
export const overdueActions = (actions:readonly CorrectiveAction[],asOf:string):number => {
  if (!validDate(asOf)) throw new Error('기준일을 확인하세요.');
  // No verified state exists in the prototype: submitted work is NOT completion.
  return actions.filter(x => x.dueOn<asOf).length;
};

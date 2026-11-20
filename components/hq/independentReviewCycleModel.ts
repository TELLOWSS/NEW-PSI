/**
 * HQ-SAFE independent reviewer planning, in-memory demonstration only.
 * User-entered DEMO actor codes are NOT identities or authenticated accounts.
 * A note never signifies approval, verification, work resumption or compliance.
 */
import type {IncidentReportVersion} from './incidentReportRevisionModel';

export type ReviewerRole = 'site' | 'hq';
export type ReviewTopic = 'chronology' | 'evidence' | 'causation' | 'controls' | 'sixw';
export type FeedbackKind = 'question' | 'revision_suggested';
export type ReviewFeedback = {
  id:string; at:string; reviewerCode:string; role:ReviewerRole;
  kind:FeedbackKind; topic:ReviewTopic; note:string; evidenceRef:string|null;
};
export type IndependentReviewCycle = {
  id:string; incidentId:number; reportVersionId:string;
  reportVersion:number; sourceStateStamp:string;
  authorCode:string;
  siteReviewerCode:string; hqReviewerCode:string;
  createdAt:string; status:'demo_planned';
  feedback:readonly ReviewFeedback[];
};
export const REVIEW_TOPIC_LABELS:Record<ReviewTopic,string>={
  chronology:'사고 전·당시·직후 시퀀스',evidence:'증빙자료·근거',
  causation:'직접·기여·근본원인',controls:'원인과 개선대책',sixw:'6하원칙 보고내용'
};
export const FEEDBACK_KIND_LABELS:Record<FeedbackKind,string>={
  question:'추가 확인 질문',revision_suggested:'보완 요청 의견(시연)'
};
const actorCode=/^DEMO-[A-Z0-9]{3,18}$/;
const evidenceCode=/^DEMO-[A-Z0-9][A-Z0-9_-]{3,35}$/;
const validAt=(at:string)=>Boolean(at)&&Number.isFinite(Date.parse(at));
const requireDistinctActors=(author:string,site:string,hq:string)=>{
  if(![author,site,hq].every(v=>actorCode.test(v)))throw new Error('비식별 DEMO- 형식의 작성·검토자 코드를 입력하세요.');
  if(new Set([author,site,hq]).size!==3)throw new Error('작성자, 현장 검토자, 본사 검토자는 서로 달라야 합니다.');
};
export function planIndependentReview(args:{
 incidentId:number;report:IncidentReportVersion;authorCode:string;
 siteReviewerCode:string;hqReviewerCode:string;cycleId:string;createdAt:string
}):IndependentReviewCycle{
 const {incidentId,report,authorCode,siteReviewerCode,hqReviewerCode,cycleId,createdAt}=args;
 if(!Number.isSafeInteger(incidentId)||incidentId<1||report.incidentId!==incidentId)
   throw new Error('검토 대상 사고가 일치하지 않습니다.');
 if(report.status!=='unverified_review_draft'||!report.sourceStateStamp)
   throw new Error('미승인 조사보고서 최신 자료가 필요합니다.');
 requireDistinctActors(authorCode,siteReviewerCode,hqReviewerCode);
 if(!cycleId.trim()||!validAt(createdAt))throw new Error('검토 시연기록 식별정보를 확인하세요.');
 return {
  id:cycleId,incidentId,reportVersionId:report.id,reportVersion:report.version,
  sourceStateStamp:report.sourceStateStamp,
  authorCode,siteReviewerCode,hqReviewerCode,createdAt,
  status:'demo_planned',feedback:[]
 };
}
export function checkIndependentReviewCycle(cycle:IndependentReviewCycle,
 report:IncidentReportVersion | null,reportIsFresh:boolean,requestMarked:boolean
):{ready:boolean;messages:readonly string[]}{
 const messages:string[]=[];
 try{requireDistinctActors(cycle.authorCode,cycle.siteReviewerCode,cycle.hqReviewerCode)}
 catch(error){messages.push(error instanceof Error?error.message:'검토자 배정을 확인하세요.');}
 if(!requestMarked)messages.push('사고조사 검토 요청 표시 상태가 아닙니다.');
 if(!report||cycle.incidentId!==report.incidentId||cycle.reportVersionId!==report.id
   ||cycle.reportVersion!==report.version)
   messages.push('검토 계획 이후 보고서 버전이 변경됐습니다. 새 시연 검토계획이 필요합니다.');
 if(!reportIsFresh||!report||cycle.sourceStateStamp!==report.sourceStateStamp)
   messages.push('보고서가 최신 근거와 일치하지 않습니다. 조사자료 변경을 확인하세요.');
 if(cycle.feedback.some(f=>!f.id.trim()||!validAt(f.at)||
  (f.role==='site'&&f.reviewerCode!==cycle.siteReviewerCode)||
  (f.role==='hq'&&f.reviewerCode!==cycle.hqReviewerCode)))
   messages.push('검토 의견 작성자 정보가 계획과 맞지 않습니다.');
 return {ready:messages.length===0,messages};
}
export function appendIndependentReviewFeedback(
 cycle:IndependentReviewCycle,options:{
 id:string;at:string;actorCode:string;kind:FeedbackKind;topic:ReviewTopic;
 note:string;evidenceRef:string|null;report:IncidentReportVersion;
 reportIsFresh:boolean;requestMarked:boolean
 }):IndependentReviewCycle{
 const state=checkIndependentReviewCycle(cycle,options.report,options.reportIsFresh,options.requestMarked);
 if(!state.ready)throw new Error(state.messages.join(' '));
 if(!options.id.trim()||!validAt(options.at)||cycle.feedback.some(f=>f.id===options.id))
   throw new Error('검토 의견 이력 식별자가 중복되거나 유효하지 않습니다.');
 const role:ReviewerRole=options.actorCode===cycle.siteReviewerCode?'site':
  options.actorCode===cycle.hqReviewerCode?'hq':(()=>{
   throw new Error('작성자 또는 미배정 역할은 독립 검토 의견을 기록할 수 없습니다.');
  })();
 const note=options.note.trim().slice(0,500);
 if(note.length<8)throw new Error('현장 확인이 필요한 검토 의견을 8자 이상 기록하세요.');
 const evidenceRef=options.evidenceRef?.trim()||null;
 if(evidenceRef!==null&&!evidenceCode.test(evidenceRef))
   throw new Error('근거번호는 비식별 DEMO- 형식이어야 합니다.');
 if(evidenceRef!==null&&!options.report.evidenceRefs.includes(evidenceRef))
   throw new Error('보고서에 연결되지 않은 근거번호는 검토 의견에 사용할 수 없습니다.');
 return {...cycle,feedback:[...cycle.feedback,{
  id:options.id,at:options.at,reviewerCode:options.actorCode,role,
  kind:options.kind,topic:options.topic,note,evidenceRef
 }]};
}
export function reviewSimulationSummary(cycle:IndependentReviewCycle){
 return {
  siteNotes:cycle.feedback.filter(f=>f.role==='site').length,
  hqNotes:cycle.feedback.filter(f=>f.role==='hq').length,
  revisionSuggestions:cycle.feedback.filter(f=>f.kind==='revision_suggested').length,
  formalApprovalAvailable:false as const,
  realIdentityVerified:false as const
 };
}

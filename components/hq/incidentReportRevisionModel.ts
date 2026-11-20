/**
 * HQ-SAFE incident report revision model (synthetic session only).
 *
 * An audit-ready *structure* is not an audited record. A reference number
 * does NOT verify source authenticity, facts, causes or legal compliance.
 * Every version is an immutable-by-convention snapshot created by an explicit
 * user action. The browser holds no persistent original.
 */
import {checkEvidenceLinks, type EvidenceManifestRecord, type EvidenceLink} from './evidenceManifestModel';
import {checkSequence, type InvestigationSequence} from './accidentSequenceModel';

export const SIX_W_FIELDS = [
  {key:'who',label:'누가',hint:'개인 실명 대신 작업 역할·담당 공종'},
  {key:'when',label:'언제',hint:'발생 일시·시간대 (미확인 시 확인필요)'},
  {key:'where',label:'어디서',hint:'공사구간·층/위치 (실주소·개인정보 제외)'},
  {key:'what',label:'무엇을',hint:'수행하던 작업·장비·자재'},
  {key:'how',label:'어떻게',hint:'사고 전→당시→직후 실제 동작 순서'},
  {key:'why',label:'왜',hint:'원인 가설과 확인되지 않은 쟁점을 명시'}
] as const;
export type SixWKey = typeof SIX_W_FIELDS[number]['key'];
export type CauseKind = 'direct'|'contributing'|'root';
export const CAUSE_LABELS:Record<CauseKind,string>={
  direct:'직접원인(주장)',contributing:'기여요인(주장)',root:'근본원인(가설)'
};
export type SixWFields=Record<SixWKey,string>;
export interface CauseClaim {kind:CauseKind; description:string; sourceRefs:readonly string[]}
export interface IncidentReportInput {
  incidentId:number;
  sixW:SixWFields;
  causes:readonly CauseClaim[];
  openQuestions:string;
  preventionSummary:string;
  revisionReason:string;
}
export interface IncidentReportVersion {
  incidentId:number;
  version:number;
  id:string;
  createdAt:string;
  reason:string;
  sixW:SixWFields;
  causes:readonly CauseClaim[];
  openQuestions:string;
  preventionSummary:string;
  evidenceRefs:readonly string[];
  sequenceDiscrepancies:number;
  status:'unverified_review_draft';
}
export type ReportChange={label:string;before:string;after:string};

export function emptySixW():SixWFields{
  return {who:'',when:'',where:'',what:'',how:'',why:''};
}
const clean=(s:string,limit:number)=>s.trim().slice(0,limit);
const demoRef=/^DEMO-[A-Z0-9][A-Z0-9_-]{3,35}$/;
const validTime=(v:string)=>v.length>0&&Number.isFinite(Date.parse(v));
export function checkReportReadiness(
  input:IncidentReportInput,
  records:readonly EvidenceManifestRecord[],
  timeline:InvestigationSequence | null
):{ready:boolean;messages:readonly string[];linkedRefs:readonly string[];sequenceDiscrepancies:number}{
 const messages:string[]=[];
 if(!Number.isSafeInteger(input.incidentId)||input.incidentId<1)messages.push('사고 식별정보가 유효하지 않습니다.');
 for(const field of SIX_W_FIELDS){
   if(clean(input.sixW[field.key],600).length<8)
     messages.push(field.label+' 항목은 역할·작업상황을 8자 이상 기록하세요.');
 }
 for(const kind of ['direct','contributing','root'] as CauseKind[]){
   const causes=input.causes.filter(c=>c.kind===kind);
   if(causes.length!==1)messages.push(CAUSE_LABELS[kind]+'을 한 항목으로 구분해서 작성해야 합니다.');
   for(const cause of causes){
     if(clean(cause.description,500).length<8)messages.push(CAUSE_LABELS[kind]+' 내용을 8자 이상 작성하세요.');
     if(cause.sourceRefs.length===0)messages.push(CAUSE_LABELS[kind]+'의 근거 참조번호가 없습니다.');
     if(cause.sourceRefs.some(ref=>!demoRef.test(ref)))messages.push(CAUSE_LABELS[kind]+'의 시연 참조번호 형식이 올바르지 않습니다.');
   }
 }
 if(clean(input.openQuestions,500).length<8)messages.push('미확인 사항·추가 조사 내용이 필요합니다.');
 if(clean(input.preventionSummary,500).length<8)messages.push('재발방지대책의 핵심을 입력해야 합니다.');
 if(clean(input.revisionReason,200).length<4)messages.push('버전 저장 이유를 4자 이상 기록하세요.');
 if(!timeline||timeline.incidentId!==input.incidentId||timeline.claims.length===0)
    messages.push('사고 전·당시·직후 시퀀스의 근거 기록이 하나 이상 필요합니다.');
 const references=[...new Set(input.causes.flatMap(c=>c.sourceRefs))];
 const evidenceLinks:EvidenceLink[]=references.map((sourceRef,i)=>({
   id:'report-ref-'+i,sourceRef,expectedKind:null,context:'fact'
 }));
 let sequenceDiscrepancies=0;
 if(timeline&&timeline.incidentId===input.incidentId){
   sequenceDiscrepancies=checkSequence(timeline).filter(x=>x.code==='DIFFERENT_ACTION').length;
 }
 if(references.length){
   try{
     const audit=checkEvidenceLinks(input.incidentId,records,evidenceLinks);
     if(!audit.readyToRequestDemoReview||audit.metadataOnly>0){
       // Metadata-only is allowed for a draft, with a transparent caution.
       if(!audit.readyToRequestDemoReview)messages.push('원인별 자료번호가 사고 증빙대장과 일치하지 않습니다.');
     }
   }catch{messages.push('사고 증빙 참조대장에 문제가 있습니다.');}
 }
 return {ready:messages.length===0,messages,linkedRefs:references,sequenceDiscrepancies};
}

export function recordReportVersion(
  versions:readonly IncidentReportVersion[],input:IncidentReportInput,
  records:readonly EvidenceManifestRecord[],timeline:InvestigationSequence|null,
  id:string,createdAt:string
):IncidentReportVersion[]{
 if(!id.trim()||!validTime(createdAt))throw new Error('보고서 버전 등록 정보를 확인하세요.');
 if(versions.some(v=>v.id===id))throw new Error('같은 버전 식별자를 다시 사용할 수 없습니다.');
 if(versions.some(v=>v.incidentId!==input.incidentId))throw new Error('다른 사고 조사보고서를 혼합할 수 없습니다.');
 const check=checkReportReadiness(input,records,timeline);
 if(!check.ready)throw new Error(check.messages.join(' '));
 const sixW=Object.fromEntries(SIX_W_FIELDS.map(f=>[f.key,clean(input.sixW[f.key],600)])) as SixWFields;
 const causes=input.causes.map(c=>({
  kind:c.kind,description:clean(c.description,500),
  sourceRefs:[...new Set(c.sourceRefs)]
 }));
 const next:IncidentReportVersion={
  incidentId:input.incidentId,version:versions.length+1,id,createdAt,
  reason:clean(input.revisionReason,200),sixW,causes,
  openQuestions:clean(input.openQuestions,500),
  preventionSummary:clean(input.preventionSummary,500),
  evidenceRefs:check.linkedRefs,
  sequenceDiscrepancies:check.sequenceDiscrepancies,status:'unverified_review_draft'
 };
 return [...versions,next];
}

export function diffReportVersions(a:IncidentReportVersion,b:IncidentReportVersion):ReportChange[]{
 if(a.incidentId!==b.incidentId)throw new Error('서로 다른 사고의 버전을 비교할 수 없습니다.');
 const changes:ReportChange[]=[];
 const append=(label:string,before:string,after:string)=>{
   if(before!==after)changes.push({label,before,after});
 };
 for(const field of SIX_W_FIELDS)append(field.label,a.sixW[field.key],b.sixW[field.key]);
 for(const kind of ['direct','contributing','root'] as const){
   const format=(v:IncidentReportVersion)=>{
     const c=v.causes.find(x=>x.kind===kind);
     return c ? c.description+' [근거: '+c.sourceRefs.join(', ')+']':'없음';
   };
   append(CAUSE_LABELS[kind],format(a),format(b));
 }
 append('미확인 사항',a.openQuestions,b.openQuestions);
 append('재발방지 핵심',a.preventionSummary,b.preventionSummary);
 append('사고경위 불일치 검토 건수',String(a.sequenceDiscrepancies),String(b.sequenceDiscrepancies));
 return changes;
}

export function reportAsText(report:IncidentReportVersion):string{
 const blocks=[
  'HQ-SAFE 사고조사 검토 초안 — 비식별 세션 자료',
  '사건 구분번호: '+report.incidentId+' / 버전: '+report.version,
  '기록 이유: '+report.reason,
  '※ 작성자가 입력한 주장과 참조번호만 정리한 것이며 원인·책임·원본 진위·법적 보고를 확정하지 않습니다.',
  ...SIX_W_FIELDS.map(f=>f.label+': '+report.sixW[f.key]),
  ...report.causes.map(c=>CAUSE_LABELS[c.kind]+': '+c.description+' / 자료번호 '+c.sourceRefs.join(', ')),
  '미확인 사항: '+report.openQuestions,
  '예방대책(검증 전): '+report.preventionSummary,
  '사고경위 불일치 검토 필요: '+report.sequenceDiscrepancies+'건',
  '사실 확인·서명·책임자 승인·원본 보존은 별도 절차가 필요합니다.'
 ];
 return blocks.join('\n');
}

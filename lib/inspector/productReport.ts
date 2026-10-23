import type {PRODUCT_EXAMPLES} from './productExperience.js';
export type ProductReportInput={sample:typeof PRODUCT_EXAMPLES[number];reviewSaved:boolean;decision:'accepted'|'rejected';note:string;assignment:{owner:string;due:string};assignmentApplied:boolean};
export type ProductReportSnapshot={scene:string;title:string;proof:string;hint:string;proposal:string;review:string;expert:string;owner:string;due:string;assignmentLabel:string;createdAt:string;rejected:boolean};
/** Copy only committed local sample fields. No DOM, draft fields, API or Storage. */
export function productReportSnapshot(input:ProductReportInput,now=new Date()):ProductReportSnapshot{
 const rejected=input.reviewSaved&&input.decision==='rejected';
 return {scene:input.sample.id,title:input.sample.name,proof:input.sample.proof,hint:input.sample.hint,
 proposal:rejected?input.note.trim():input.sample.action,
 review:input.reviewSaved?(rejected?'샘플 AI 해석 미수용':'샘플 해석 참고 · 검토 저장됨'):'샘플 검토 저장 전 · 미검토 예시',
 expert:input.reviewSaved?input.note.trim():'',owner:input.assignment.owner,due:input.assignment.due,
 assignmentLabel:input.assignmentApplied?'이 체험에서 적용한 가상 담당·기한':'체험용 기본 가상 담당·기한',createdAt:now.toISOString(),rejected};
}
export function validSampleDue(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}

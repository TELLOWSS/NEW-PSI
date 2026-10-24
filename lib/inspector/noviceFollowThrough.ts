import type {ShareReply} from './actionShare';
import type {InspectorAction} from './types';

export type ReplyGuide={choiceLabel:string;heading:string;help:string;noteLabel:string;placeholder:string;submitLabel:string;requiresPhoto:boolean};
const guides:Record<ShareReply['kind'],ReplyGuide>={
 photo:{choiceLabel:'개선사진 보내기',heading:'개선한 내용을 사진으로 알리기',help:'작업이 실제로 끝나고 개선된 모습이 확인될 때 선택하세요. 사진만 제출하면 완료 승인은 아닙니다.',noteLabel:'어떤 부분을 개선했나요? (5자 이상)',placeholder:'예: 작업발판 틈새를 보완하고 주변 접근을 통제했습니다.',submitLabel:'개선사진과 내용 회신하기',requiresPhoto:true},
 planned:{choiceLabel:'조치 일정 알리기',heading:'언제 개선할 수 있는지 알리기',help:'아직 작업 전이라면 예정일과 필요한 준비 사항을 남기세요. 사진이 없어도 됩니다.',noteLabel:'언제, 어떻게 조치할 예정인가요? (5자 이상)',placeholder:'예: 10월 27일 오전 자재 반입 후 작업발판을 보완하겠습니다.',submitLabel:'조치 예정 회신하기',requiresPhoto:false},
 difficult:{choiceLabel:'어려움 알리기',heading:'바로 조치하기 어려운 이유 알리기',help:'작업을 임의로 완료 처리하지 않습니다. 장애 사유와 필요한 지원을 설명하세요.',noteLabel:'어떤 이유로 어렵고 무엇이 필요한가요? (5자 이상)',placeholder:'예: 자재가 부족해 즉시 조치가 어렵습니다. 담당자 지원이 필요합니다.',submitLabel:'조치 어려움 회신하기',requiresPhoto:false},
};
export function replyKindGuide(kind:ShareReply['kind']):ReplyGuide{return guides[kind];}
export function replyMissing({name,note,consent,photo,kind}:{name:string;note:string;consent:boolean;photo:boolean;kind:ShareReply['kind']}):string[]{
 const missing:string[]=[];
 if(name.trim().length<2)missing.push('응답자 이름 또는 공종을 2자 이상 입력');
 if(replyKindGuide(kind).requiresPhoto&&!photo)missing.push('개선한 모습이 보이는 사진 첨부');
 if(note.trim().length<5)missing.push('회신 내용을 5자 이상 작성');
 if(!consent)missing.push('회신·사진 보관 안내 확인');
 return missing;
}
export function reinspectionStage(action:Pick<InspectorAction,'status'>):0|1|2{
 return action.status==='verified'?2:action.status==='review-requested'?1:0;
}
export type ReportPhotoLoadState='ready'|'failed'|'loading';
export function reportPrintState(expected:number,states:ReportPhotoLoadState[]):ReportPhotoLoadState{
 if(expected<1||states.length!==expected||states.includes('loading'))return 'loading';
 return states.includes('failed')?'failed':'ready';
}

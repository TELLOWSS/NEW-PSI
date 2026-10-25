import type {Evidence} from './types.js';

export type EvidenceAuditCode='missing-before'|'missing-after'|'missing-file'|'same-evidence'|'prepared'|'linked';
export type ActionPhotoAudit={code:EvidenceAuditCode;title:string;description:string;canSubmit:boolean};
type Input={
    beforeIds:readonly string[];afterId:string;registeredIds:readonly string[];
    evidence:readonly Evidence[];preparedSha?:string;
};
/**
 * Metadata-only preflight: a different hash proves file distinction, NOT the same work
 * location, hazard resolution, safe work resumption, or a human's verification.
 * Server validation remains the authority for persisted actions.
 */
export function auditActionPhotoPair({beforeIds,afterId,registeredIds,evidence,preparedSha}:Input):ActionPhotoAudit{
    const sources=[...new Set(beforeIds.filter(Boolean))];
    if(!sources.length)return {code:'missing-before',title:'조치 전 사진 미지정',description:'원래 위치의 사진을 직접 선택하세요.',canSubmit:false};
    const registered=new Set(registeredIds),files=new Map(evidence.map(file=>[file.id,file]));
    if(sources.some(id=>!registered.has(id)||!files.has(id)))
        return {code:'missing-file',title:'조치 전 사진 기록 확인 필요',description:'연결된 원본사진이 저장 문서와 증거 보관목록에 모두 존재하는지 확인하세요.',canSubmit:false};
    if(!afterId)return {code:'missing-after',title:'개선 후 사진 미선택',description:'개선 후 사진을 선택하거나 촬영하세요.',canSubmit:false};
    const afterSha=preparedSha||files.get(afterId)?.sha256;
    if(!afterSha||(!preparedSha&&!files.has(afterId)))
        return {code:'missing-file',title:'개선 후 사진 기록 확인 필요',description:'선택한 개선사진의 실제 보관 여부를 먼저 확인하세요.',canSubmit:false};
    if(sources.some(id=>id===afterId||files.get(id)?.sha256===afterSha))
        return {code:'same-evidence',title:'전후 동일 파일',description:'같은 사진이나 내용이 동일한 파일은 개선 후 근거로 사용할 수 없습니다.',canSubmit:false};
    if(preparedSha)return {code:'prepared',title:'새 개선사진 · 보관 전',description:'다른 파일의 최적화 사본을 선택했습니다. 저장 완료 여부와 실제 위치를 확인하세요.',canSubmit:true};
    return {code:'linked',title:'전후 사진 연결 확인',description:'서로 다른 사진 파일의 저장 기록이 연결돼 있습니다. 개선 여부는 별도의 현장 대조가 필요합니다.',canSubmit:true};
}

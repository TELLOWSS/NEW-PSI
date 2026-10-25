
declare const __PSI_RELEASE_COMMIT__: string;
const SHAFULL=/^[a-f0-9]{40}$/i;
export function validReleaseSha(value:unknown):string|null{
    return typeof value==='string'&&SHAFULL.test(value)?value.toLowerCase():null;
}
/** Build source identity, NOT proof that a deployment is currently serving production. */
export const currentReleaseSha=():string|null=>{
    try{return validReleaseSha(typeof __PSI_RELEASE_COMMIT__==='string'?__PSI_RELEASE_COMMIT__:null);}
    catch{return null;}
};
export const currentReleaseLabel=():string=>
    currentReleaseSha()?'빌드 코드 '+currentReleaseSha()!.slice(0,8):'빌드 코드 미확인 · 최신 적용을 단정하지 않습니다';
export type ReleaseEvidence={
    candidateSha?:string|null;ciPassed?:boolean;ciSha?:string|null;
    previewReady?:boolean;previewSha?:string|null;
    productionSha?:string|null;
    affectsStoredRecords?:boolean;restoreTrialVerified?:boolean;
};
export type ReleaseAssessment={stage:'blocked'|'ready-for-operator-review'|'production-sha-matches';blockers:string[];notes:string[]};
/** Evidence is provided by independent provider checks; never invent or fetch it here. */
export function evaluateReleaseEvidence(input:ReleaseEvidence):ReleaseAssessment{
    const candidate=validReleaseSha(input.candidateSha),blockers:string[]=[];
    if(!candidate)blockers.push('검증 대상 커밋 SHA 40자리를 확인하세요.');
    if(!input.ciPassed||!candidate||validReleaseSha(input.ciSha)!==candidate)blockers.push('GitHub 자동검증 PASS와 동일 커밋 SHA를 확인하세요.');
    if(!input.previewReady||!candidate||validReleaseSha(input.previewSha)!==candidate)blockers.push('동일 SHA Vercel 미리보기 READY를 확인하세요.');
    if(input.affectsStoredRecords&&!input.restoreTrialVerified)blockers.push('저장자료 변경 전 실제 복원 검증 근거가 필요합니다.');
    const notes=[
        'PASS는 브라우저/실기기 전체 품질 또는 사람의 안전 확인을 대신하지 않습니다.',
        'PC 월별 암호화 보관함의 파일 무결성 검증은 운영 Supabase DB·Inspector 사진 재해복구가 아닙니다.',
        '이 도구는 실제 Vercel·GitHub 상태를 자동 조회하거나 배포를 실행하지 않습니다.',
    ];
    if(blockers.length)return {stage:'blocked',blockers,notes};
    if(validReleaseSha(input.productionSha)===candidate)return {stage:'production-sha-matches',blockers,notes:[
        ...notes,'운영 SHA가 일치해도 별칭이 실제 도메인을 가리키는지 별도 확인해야 합니다.',
    ]};
    return {stage:'ready-for-operator-review',blockers,notes:[
        ...notes,'GitHub 병합 및 운영 배포는 아직 별도 승인·확인이 필요합니다.',
    ]};
}

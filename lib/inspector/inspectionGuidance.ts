export function inspectionStartGuidance({hasPhoto,consent,automatic,ready,allowed}:{hasPhoto:boolean;consent:boolean;automatic:boolean;ready:boolean|null;allowed:boolean}){
    if(!hasPhoto)return '사진을 먼저 찍거나 선택해 주세요. 위험 이름이나 설명을 몰라도 시작할 수 있습니다.';
    if(!consent)return '사진 사용 안내를 확인하고 보관 허용을 체크하면 진행할 수 있습니다.';
    if(automatic&&ready===null)return '자동 분석 연결을 확인하고 있습니다. 기다리거나 위 안내에서 직접 점검을 선택할 수 있습니다.';
    if(automatic&&ready&&!allowed)return '자동 분석은 잠시 중단됐습니다. 위 안내에서 직접 점검을 선택하면 사진을 저장하고 업무를 계속할 수 있습니다.';
    if(!automatic||!ready)return '사진과 설명을 저장합니다. 직접 확인한 내용으로 조치·보고서를 작성하며, 사진을 자동 판독한 결과는 만들지 않습니다.';
    return '사진 설명은 선택사항입니다. 분석 결과를 받은 뒤 사진·현장과 대조하고 조치·보고서로 이어가세요.';
}
/** Keep useful local validation, but never render upstream HTML, URLs or parser diagnostics in the work area. */
export function inspectionErrorMessage(cause:unknown){
    const fallback='요청을 완료하지 못했습니다. 이 화면의 입력은 유지했습니다. 저장 기록과 연결 상태를 확인한 뒤 다시 진행해 주세요.';
    if(!(cause instanceof Error))return fallback;
    const message=cause.message.replace(/^\d{3}\s*-\s*/, '').trim();
    if(!message||message.length>700||!/[가-힣]/.test(message)||/<[^>]*>|https?:\/\/|\b(?:JSON|SQL|PGRST|payload|token|authorization|api[_ -]?key)\b/i.test(message))return fallback;
    return message;
}

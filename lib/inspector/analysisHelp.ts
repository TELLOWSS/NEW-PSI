import {normalizeAiCost,type InspectorAiCost} from './aiCost';
export type AnalysisFailure={code?:string;retryable?:boolean;outcomeUnknown?:boolean};
export type AnalysisHelp={kind:'connection'|'limit'|'operator'|'stored'|'photo';title:string;description:string;canRetry:boolean;manualAllowed?:boolean};
/** Only structured error codes enter user guidance; provider text and credentials never do. */
export function analysisHelp(failure:AnalysisFailure):AnalysisHelp {
    const code=failure.code;
    if(code==='AI_RESULT_NOT_SAVED')return {kind:'stored',title:'저장된 분석 결과가 아직 없습니다',description:'아직 처리 중일 수 있습니다. 잠시 후 저장 결과를 다시 확인하거나 자동 분석 없이 직접 점검을 계속할 수 있습니다.',canRetry:false,manualAllowed:true};
    if(failure.outcomeUnknown||!code||['AI_REQUEST_BLOCKED','AI_CONTEXT_CHANGED'].includes(code))return {kind:'stored',title:'저장된 결과부터 확인해 주세요',description:'연결이 끊긴 뒤에도 분석이 완료됐을 수 있습니다. 사진을 다시 보내기 전에 저장된 결과를 확인합니다.',canRetry:false};
    if(['AI_QUOTA_REACHED','RATE_LIMIT','AI_CHECK_RATE_LIMIT'].includes(code))return {kind:'limit',title:'지금은 자동 분석 이용 한도에 도달했습니다',description:'다시 사용할 수 있는 시각은 확인되지 않았습니다. 잠시 후 다시 시도하거나 직접 점검을 계속할 수 있습니다.',canRetry:false};
    if(['AI_REFUSED','AI_PHOTO_UNAVAILABLE','AI_PHOTO_MISMATCH'].includes(code))return {kind:'photo',title:'이 사진의 자동 분석을 완료하지 못했습니다',description:'선택한 사진과 설명을 확인해 주세요. 자동 분석 없이 직접 확인한 내용으로 점검을 계속할 수 있습니다.',canRetry:false};
    if(failure.retryable)return {kind:'connection',title:'자동 분석 연결이 원활하지 않습니다',description:'잠시 후 다시 시도해 주세요. 반복되면 관리자에게 전달할 안내를 복사하거나 직접 점검을 계속할 수 있습니다.',canRetry:true};
    return {kind:'operator',title:'자동 분석에 관리자 확인이 필요합니다',description:'사용자가 설정을 바꿀 필요는 없습니다. 관리자에게 전달할 안내를 복사하고 직접 점검을 계속할 수 있습니다.',canRetry:false};
}
export function analysisAvailability(cost:InspectorAiCost|undefined,ready=true):AnalysisHelp {
    const value=normalizeAiCost(cost);
    if(!ready)return analysisHelp({code:'AI_NOT_CONFIGURED'});
    if(value.allowed)return {kind:'connection',title:'자동 분석을 사용할 수 있습니다',description:'사진을 분석한 뒤 현장에서 확인하고 조치·보고서로 이어가세요.',canRetry:false};
    if(value.state==='unavailable'&&value.billingCheck==='failed')return {kind:'operator',title:'자동 분석 연결 확인이 필요합니다',description:'관리자 확인이 필요한 상태입니다. 직접 점검은 계속할 수 있으며, 연결 확인 버튼으로 사용 가능 여부를 다시 볼 수 있습니다.',canRetry:false};
    return analysisHelp({code:'AI_COST_BLOCKED'});
}
export function analysisSupportText(code?:string,cost?:InspectorAiCost){
    // Allowlisted values only: no photo, notes, IDs, keys, provider messages, or current URL.
    const knownCodes=['AI_RESULT_NOT_SAVED','AI_REQUEST_BLOCKED','AI_CONTEXT_CHANGED','AI_QUOTA_REACHED','RATE_LIMIT','AI_CHECK_RATE_LIMIT','AI_REFUSED','AI_PHOTO_UNAVAILABLE','AI_PHOTO_MISMATCH','AI_AUTH_REJECTED','AI_PERMISSION_REJECTED','AI_MODEL_UNAVAILABLE','AI_NOT_CONFIGURED','AI_COST_BLOCKED','AI_OFF','AI_CONNECTION_FAILED','AI_INCOMPLETE','AI_INTERRUPTED','AI_RESPONSE_INVALID','AI_EMPTY_RESPONSE','AI_PROVIDER_REJECTED','AI_REQUEST_REJECTED'];
    const safeCode=typeof code==='string'&&knownCodes.includes(code)?code:'STATUS_CHECK';
    const value=normalizeAiCost(cost);
    return ['PSI 사진점검 · 자동 분석 확인 요청',`확인 시각: ${new Date().toISOString()}`,`문제 구분: ${safeCode}`,`분석 상태: ${value.state}`,`연결 확인: ${['not-configured','verified','failed','not-run'].includes(value.billingCheck||'')?value.billingCheck:'not-run'}`,'사진과 작성 내용은 포함하지 않았습니다. 자동 분석 연결 상태를 확인해 주세요.'].join('\n');
}

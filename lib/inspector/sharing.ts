export type InspectorSharePacket={title:string;text:string;files?:File[]};
export type ShareResult='handed-off'|'cancelled'|'unsupported'|'files-unsupported'|'failed';
type ShareTarget={share?:(data:ShareData)=>Promise<void>;canShare?:(data:ShareData)=>boolean};
export function sharePhotoFile(blob:Blob,photoNumber:number){
    const ext=blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg';
    return new File([blob],`현장점검-사진-${photoNumber}.${ext}`,{type:blob.type});
}
/** Invoke directly from a click, with files prepared before it to retain user activation. */
export async function shareInspectorPacket(packet:InspectorSharePacket,target:ShareTarget=navigator):Promise<ShareResult>{
    if(!target.share)return 'unsupported';
    try{
        if(packet.files?.length&&(!target.canShare||!target.canShare({files:packet.files})))return 'files-unsupported';
        await target.share({...packet,...(!packet.files?.length?{files:undefined}:{})});
        return 'handed-off';
    }catch(error){return error instanceof Error&&error.name==='AbortError'?'cancelled':'failed';}
}
export const shareResultMessage:Record<ShareResult,string>={
    'handed-off':'공유 앱에 전달했습니다. 상대방과 실제 전송 여부는 선택한 앱에서 확인해 주세요.',
    cancelled:'공유가 취소되었거나 사용할 앱을 찾지 못했습니다. 전송 완료로 기록하지 않았습니다.',
    unsupported:'이 브라우저는 공유창을 지원하지 않습니다. 문구 복사와 사진 다운로드를 이용해 주세요.',
    'files-unsupported':'이 기기에서는 선택한 사진을 함께 공유할 수 없습니다. 문구만 공유하거나 사진을 다운로드해 첨부하세요.',
    failed:'공유창을 열지 못했습니다. 다시 시도하거나 문구 복사·사진 다운로드를 이용해 주세요.'
};

/** Clipboard access can be missing or blocked on field devices; never throw into the UI. */
export type ShareCopyResult='copied'|'unsupported'|'failed';
type TextClipboard={writeText:(text:string)=>Promise<void>};
export async function copyInspectorShareText(text:string,clipboard?:TextClipboard|null):Promise<ShareCopyResult>{
    if(!text.trim())return 'failed';
    const target=clipboard===undefined?(typeof navigator==='undefined'?null:navigator.clipboard):clipboard;
    if(!target||typeof target.writeText!=='function')return 'unsupported';
    try{await target.writeText(text);return 'copied';}catch{return 'failed';}
}
export const shareCopyResultMessage:Record<ShareCopyResult,string>={
    copied:'문구를 복사했습니다. 카카오톡 등에서 붙여넣고 실제 전송 여부를 확인해 주세요.',
    unsupported:'이 브라우저에서는 바로 복사할 수 없습니다. 위 문구를 길게 누르거나 선택해서 복사해 주세요.',
    failed:'브라우저에서 복사가 차단되었습니다. 위 문구를 길게 누르거나 선택해서 직접 복사해 주세요.',
};

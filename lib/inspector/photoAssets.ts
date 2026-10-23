import type { OptimizationReceipt } from './types.js';
export const assetHash = async (blob: Blob) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), b=>b.toString(16).padStart(2,'0')).join('');
export function fitPhoto(width:number,height:number,edge=2048) {
    const scale=Math.min(1,edge/Math.max(width,height));
    return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
const encode=(canvas:HTMLCanvasElement,type:string,quality?:number)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('사진 변환에 실패했습니다.')),type,quality));
export async function optimizePhoto(file:File, detail=false,ceiling=3*1024*1024):Promise<{file:File;receipt:OptimizationReceipt}> {
    if(!['image/jpeg','image/png','image/webp'].includes(file.type) || !file.size || file.size>40*1024*1024) throw new Error('40MB 이하 JPG·PNG·WebP 사진을 선택해 주세요.');
    const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
    const canvas=document.createElement('canvas');
    try {
        if(bitmap.width*bitmap.height>100_000_000) throw new Error('사진 해상도가 너무 큽니다. 기기에서 크기를 줄여 주세요.');
        const size=fitPhoto(bitmap.width,bitmap.height,ceiling<3*1024*1024?1280:detail?3072:2048);canvas.width=size.width;canvas.height=size.height;
        const context=canvas.getContext('2d');if(!context)throw new Error('이 브라우저에서는 사진 변환을 지원하지 않습니다.');
        context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
        let quality=.82,blob=await encode(canvas,'image/jpeg',quality);
        // Preserve detail at the normal target; only lower quality to meet the hard upload ceiling.
        while(blob.size>ceiling && quality>.58){quality=Math.round((quality-.08)*100)/100;blob=await encode(canvas,'image/jpeg',quality);}
        if(blob.size>ceiling)throw new Error(`최적화 후에도 ${ceiling/1048576}MB를 초과합니다. 사진 범위를 줄여 주세요.`);
        return {file:new File([blob],'inspection.jpg',{type:'image/jpeg'}),receipt:{version:'browser-jpeg-v2',source_kind:'optimized',source_bytes:file.size,source_width:bitmap.width,source_height:bitmap.height,uploaded_bytes:blob.size,uploaded_width:canvas.width,uploaded_height:canvas.height,quality,uploaded_asset_sha256:await assetHash(blob),created_at:new Date().toISOString()}};
    } finally {bitmap.close();canvas.width=0;canvas.height=0;}
}
export async function copyPhotoImage(url:string) {
    if(!navigator.clipboard?.write || typeof ClipboardItem==='undefined')throw new Error('이미지 복사를 지원하지 않습니다. 사진 저장 후 ChatGPT에 첨부해 주세요.');
    // Start Clipboard.write during the user gesture; conversion resolves inside ClipboardItem.
    const png=(async()=>{const response=await fetch(url);if(!response.ok)throw new Error('사진을 읽지 못했습니다.');const bitmap=await createImageBitmap(await response.blob());const canvas=document.createElement('canvas');try{canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d')!.drawImage(bitmap,0,0);return await encode(canvas,'image/png');}finally{bitmap.close();canvas.width=0;canvas.height=0;}})();
    await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);
}
export function pastedPhotos(data:DataTransfer):File[] {return Array.from(data.items).filter(i=>i.kind==='file' && /^image\/(jpeg|png|webp)$/.test(i.type)).map(i=>i.getAsFile()).filter((f):f is File=>!!f);}
